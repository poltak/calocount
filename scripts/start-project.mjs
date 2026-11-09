// Turns a new clone of the template into a project.
//
//   pnpm exec node scripts/start-project.mjs prepare \
//       --project-name <name> --product-name <name> --origin-url <url> \
//       [--account-mode single-owner|open-sign-up] [--renovate delete|keep]
//     Set the remotes, the three names, and the account mode. Remove the
//     files that only the template needs. Write `template-version.json`.
//   pnpm exec node scripts/start-project.mjs finish
//     Commit the result, and remove this script.
//
// Each option also has an environment variable: PROJECT_NAME, PRODUCT_NAME,
// ORIGIN_URL, ACCOUNT_MODE, and RENOVATE. The `start-project` workflow sets
// those. Run `pnpm install` first, because `prepare` formats with Prettier.
//
// `prepare` checks everything before its first change. When it fails, the
// clone is as it was.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  PATHS_FILE,
  VERSION_FILE,
  fail,
  formatted,
  git,
  readVersionFile,
  sameRepository,
  writeVersionFile,
} from "./template-files.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATE_BRANCH = "main";
const TEMPLATE_DOCUMENT = "docs/agents/template.md";
const SWAMP_MARKER = ".swamp.yaml";
// A step of the workflow runs this script, and a run needs its workflow
// file. Both stay until `finish`, which removes them last.
const KEPT_UNTIL_FINISH = [
  "scripts/start-project.mjs",
  "workflows/workflow-start-project.yaml",
];

const USAGE = `Usage: pnpm exec node scripts/start-project.mjs prepare
         --project-name <name>   For the package and the database: lowercase
                                 letters, digits, and hyphens.
         --product-name <name>   The name that users read.
         --origin-url <url>      The project's new, empty repository.
         [--account-mode single-owner|open-sign-up]   Default: single-owner.
         [--renovate delete|keep]                     Default: delete.
       pnpm exec node scripts/start-project.mjs finish`;

const read = (...args) => git({ root, args }).stdout;
const holds = (...args) => git({ root, args, allowFailure: true }).status === 0;
const readText = (file) => readFileSync(path.join(root, file), "utf8");

function readOptions() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(3),
      options: {
        "project-name": { type: "string" },
        "product-name": { type: "string" },
        "origin-url": { type: "string" },
        "account-mode": { type: "string" },
        renovate: { type: "string" },
      },
    }));
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`);
  }
  const options = {
    projectName: values["project-name"] ?? process.env.PROJECT_NAME ?? "",
    productName: (
      values["product-name"] ??
      process.env.PRODUCT_NAME ??
      ""
    ).trim(),
    originUrl: (values["origin-url"] ?? process.env.ORIGIN_URL ?? "").trim(),
    accountMode:
      values["account-mode"] ?? process.env.ACCOUNT_MODE ?? "single-owner",
    renovate: values.renovate ?? process.env.RENOVATE ?? "delete",
  };

  const problems = [];
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(options.projectName)) {
    problems.push(
      "--project-name must start with a lowercase letter, and have only lowercase letters, digits, and hyphens.",
    );
  }
  // The name goes into one line of code and one line of Markdown.
  if (!options.productName || /[\p{Cc}"\\`]/u.test(options.productName)) {
    problems.push(
      '--product-name must be one line of text, without ", \\, or `.',
    );
  }
  if (!options.originUrl || /\s/.test(options.originUrl)) {
    problems.push("--origin-url must be the URL of the project's repository.");
  }
  if (!["single-owner", "open-sign-up"].includes(options.accountMode)) {
    problems.push("--account-mode must be single-owner or open-sign-up.");
  }
  if (!["delete", "keep"].includes(options.renovate)) {
    problems.push("--renovate must be delete or keep.");
  }
  return { options, problems };
}

function projectReadme({ productName, accountMode }) {
  const start =
    accountMode === "single-owner"
      ? `Put a secret and your email address in \`.env\`, as
[setup](docs/agents/setup.md) describes. Then:

\`\`\`sh
pnpm run auth:setup-owner
pnpm run dev
\`\`\`

Open \`http://localhost:5173\` and sign in.`
      : `Put a secret in \`.env\`, as [setup](docs/agents/setup.md) describes. Then:

\`\`\`sh
pnpm run dev
\`\`\`

Open \`http://localhost:5173\` and make the first account.`;
  return `# ${productName}

A web application with a Hono backend, a React frontend, and code that both
share, in one pnpm workspace.

## Run it

You need pnpm. It downloads the Node version that the repository pins.

\`\`\`sh
pnpm install
cp .env.example .env
\`\`\`

${start}

## Documents

The documents are in [\`docs/agents/\`](docs/agents/README.md). They are written
for coding agents and for people. \`AGENTS.md\` has the rules for every change.

## The template

This project started from a template, and can take the template's later
changes. [\`${VERSION_FILE}\`](${VERSION_FILE}) names the template and the last
template commit that the project has. The \`sync-template\` workflow takes the
new commits, and [setup](docs/agents/setup.md#changes-from-the-template) has
its commands.
`;
}

/**
 * The changes inside files. Each one must match its place exactly one time.
 * A change to the template that moves a place makes `prepare` fail, and the
 * `start-project` workflow of CI then fails too.
 */
function fileEdits({ projectName, productName, accountMode }) {
  const edits = [
    {
      file: "package.json",
      find: /^ {2}"name": "[^"]*",$/gm,
      replace: () => `  "name": ${JSON.stringify(projectName)},`,
    },
    {
      file: "common/src/features/core/utils/app-name.ts",
      find: /^export const APP_NAME = "[^"]*";$/gm,
      replace: () => `export const APP_NAME = ${JSON.stringify(productName)};`,
    },
    {
      file: ".env.example",
      find: /^(DATABASE_URL=\S+\/)[^/\s]+$/gm,
      replace: (_line, start) => `${start}${projectName}`,
    },
  ];
  if (existsSync(path.join(root, SWAMP_MARKER))) {
    // A project is a repository of its own for Swamp, with its own ID. Swamp
    // writes a new ID into a marker that has none, and that write would be a
    // change with no commit in each clone. So this script writes the new ID.
    edits.push({
      file: SWAMP_MARKER,
      find: /^repoId: .*$/gm,
      replace: () => `repoId: ${randomUUID()}`,
    });
  }
  if (accountMode === "open-sign-up") {
    edits.push(
      {
        file: ".env.example",
        find: /^APP_ACCOUNT_MODE=single-owner$/gm,
        replace: () => "APP_ACCOUNT_MODE=open-sign-up",
      },
      // The browser tests must run in the mode that the project runs in.
      {
        file: "frontend/src/features/core/tests/browser/built-app.spec.ts",
        find: /^( *)trustedOrigins: \[FRONTEND_ORIGIN\],$/gm,
        replace: (line, indent) =>
          `${line}\n${indent}accountMode: "openSignUp",`,
      },
      {
        file: "frontend/src/features/core/black-box-tests/black-box-test.ts",
        find: /^( *)accountMode: \["singleOwner", \{ option: true \}\],$/gm,
        replace: (_line, indent) =>
          `${indent}accountMode: ["openSignUp", { option: true }],`,
      },
    );
  }
  return edits;
}

async function prepare() {
  const { options, problems } = readOptions();

  if (readVersionFile({ root })) {
    fail(`This repository has ${VERSION_FILE}, so it is a project already.`);
  }
  if (!existsSync(path.join(root, TEMPLATE_DOCUMENT))) {
    problems.push(
      `This repository has no ${TEMPLATE_DOCUMENT}, so it is not the template.`,
    );
  }
  if (read("status", "--porcelain", "--untracked-files=no") !== "") {
    problems.push(
      "The working tree has changes. Use a new clone of the template.",
    );
  }

  // A new clone has one remote, `origin`, which is the template.
  const remotes = read("remote").split("\n").filter(Boolean);
  const templateRemote = remotes.includes("template") ? "template" : "origin";
  if (
    !remotes.includes(templateRemote) ||
    remotes.some((name) => name !== "template" && name !== "origin")
  ) {
    problems.push(
      `The remotes are "${remotes.join('", "')}". Use a new clone of the template, which has only "origin".`,
    );
    fail(problems.join("\n"));
  }
  const templateUrl = read("remote", "get-url", templateRemote);
  if (sameRepository({ left: templateUrl, right: options.originUrl })) {
    problems.push(
      "--origin-url is the template. Give the project's own repository.",
    );
  }

  // The project has the template up to the last template commit in this
  // clone, also when the clone has commits of its own after that one.
  const templateTip = `refs/remotes/${templateRemote}/${TEMPLATE_BRANCH}`;
  const base = git({
    root,
    args: ["merge-base", "HEAD", templateTip],
    allowFailure: true,
  });
  if (base.status !== 0) {
    problems.push(
      `This clone does not have the "${TEMPLATE_BRANCH}" branch of the template. Fetch it first.`,
    );
  }

  const edits = fileEdits(options);
  const files = [...new Set(edits.map(({ file }) => file))];
  for (const { file, find } of edits) {
    const count = existsSync(path.join(root, file))
      ? [...readText(file).matchAll(find)].length
      : 0;
    if (count !== 1) {
      problems.push(
        `${file} must have the text for ${find} one time, and has it ${count} times. Change the edit in scripts/start-project.mjs.`,
      );
    }
  }

  // Without Prettier the new files fail the format check.
  if (!(await import("prettier").catch(() => undefined))) {
    problems.push("Prettier is not installed. Run `pnpm install` first.");
  }
  if (problems.length > 0) {
    fail(problems.join("\n"));
  }

  if (templateRemote === "origin") {
    read("remote", "rename", "origin", "template");
  }
  if (remotes.includes("template") && remotes.includes("origin")) {
    read("remote", "set-url", "origin", options.originUrl);
  } else {
    read("remote", "add", "origin", options.originUrl);
  }

  const texts = new Map(files.map((file) => [file, readText(file)]));
  for (const { file, find, replace } of edits) {
    texts.set(file, texts.get(file).replace(find, replace));
  }
  texts.set("README.md", projectReadme(options));
  for (const [file, text] of texts) {
    const target = path.join(root, file);
    writeFileSync(target, await formatted({ file: target, text }));
  }

  for (const entry of JSON.parse(readText(PATHS_FILE)).templateOnly) {
    const kept =
      KEPT_UNTIL_FINISH.includes(entry) ||
      (entry === "renovate.json" && options.renovate === "keep");
    if (!kept) {
      rmSync(path.join(root, entry), { recursive: true, force: true });
    }
  }
  await writeVersionFile({
    root,
    version: { template: templateUrl, commit: base.stdout, skipped: [] },
  });

  console.log(
    `This clone is now the project "${options.projectName}".\n` +
      `  template  ${templateUrl}\n` +
      `  origin    ${options.originUrl}\n` +
      `The project has the template up to ${base.stdout.slice(0, 7)}.\n` +
      "Run the checks, and then `finish`.",
  );
}

function finish() {
  const version = readVersionFile({ root });
  if (!version || holds("cat-file", "-e", `HEAD:${VERSION_FILE}`)) {
    fail("`finish` runs one time, after `prepare`.");
  }
  const { name } = JSON.parse(readText("package.json"));

  read("add", "--update");
  read("add", "--", VERSION_FILE);
  // The commit removes the two files. They stay on the disk until the end.
  read(
    "rm",
    "--cached",
    "--quiet",
    "--ignore-unmatch",
    "--",
    ...KEPT_UNTIL_FINISH,
  );
  git({
    root,
    args: ["commit", "--quiet", "--file=-"],
    input:
      `Start ${name} from the template\n\n` +
      "- Set the package name, the product name, and the database name.\n" +
      "- Remove the files that only the template needs.\n" +
      `- Record the template commit ${version.commit.slice(0, 7)} in ${VERSION_FILE}.\n`,
  });
  for (const file of KEPT_UNTIL_FINISH) {
    rmSync(path.join(root, file), { force: true });
  }

  const branch = read("rev-parse", "--abbrev-ref", "HEAD");
  console.log(
    `Committed the start of "${name}". Next:\n` +
      "  1. Create `.env`, as docs/agents/setup.md describes.\n" +
      `  2. Push the project: git push --set-upstream origin ${branch}\n` +
      "  3. Set the maintainers and the label for the check of the files from\n" +
      "     the template, as docs/agents/setup.md describes.",
  );
}

const command = process.argv[2];
if (command === "prepare") {
  await prepare();
} else if (command === "finish" && process.argv.length === 3) {
  finish();
} else {
  fail(USAGE);
}
