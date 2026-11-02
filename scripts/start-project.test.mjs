import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ORIGIN_URL = "git@example.test:company/trial-project.git";

// The settings of the person who runs the tests have no effect.
const GIT_ENVIRONMENT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  // After a commit or a fetch, Git starts maintenance in the background. It
  // can still write in `.git/objects` when a test deletes its directory, and
  // the delete then fails with ENOTEMPTY.
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "maintenance.auto",
  GIT_CONFIG_VALUE_0: "false",
  GIT_AUTHOR_NAME: "Project Person",
  GIT_AUTHOR_EMAIL: "person@project.test",
  GIT_COMMITTER_NAME: "Project Person",
  GIT_COMMITTER_EMAIL: "person@project.test",
};

function git(directory, ...args) {
  return execFileSync("git", args, {
    cwd: directory,
    env: GIT_ENVIRONMENT,
    encoding: "utf8",
  }).trimEnd();
}

function run({ clone, script = "start-project.mjs", args, environment = {} }) {
  const result = spawnSync(
    process.execPath,
    [path.join(clone, "scripts", script), ...args],
    {
      cwd: clone,
      env: { ...GIT_ENVIRONMENT, ...environment },
      encoding: "utf8",
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const PREPARE = [
  "prepare",
  "--project-name=trial-project",
  "--product-name=Trial Project",
  `--origin-url=${ORIGIN_URL}`,
];
const readClone = (clone, file) => readFile(path.join(clone, file), "utf8");
/** The changes in a clone. The link to the installed packages is not one. */
const changes = (clone) =>
  git(clone, "status", "--porcelain")
    .split("\n")
    .filter((line) => line !== "?? node_modules")
    .join("\n");
const TEMPLATE_ONLY_FILES = [
  "docs/agents/template.md",
  "renovate.json",
  ".agents/skills/start-project/SKILL.md",
  ".claude/skills/start-project",
  ".github/workflows/start-project.yml",
  "scripts/start-project.test.mjs",
];

/**
 * A repository with the files of this repository as they are now, and a new
 * clone of it. The scripts under test are the files in the clone.
 */
async function cloneTemplate(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "start-project-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const template = path.join(directory, "template");
  const clone = path.join(directory, "clone");

  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => file && existsSync(path.join(repoRoot, file)));
  for (const file of files) {
    await mkdir(path.dirname(path.join(template, file)), { recursive: true });
    await cp(path.join(repoRoot, file), path.join(template, file), {
      verbatimSymlinks: true,
    });
  }
  git(template, "init", "--quiet", "--initial-branch=main");
  git(template, "add", "--all");
  git(template, "commit", "--quiet", "--message", "The template");

  git(directory, "clone", "--quiet", template, clone);
  // `prepare` formats with Prettier, from the repository of these tests.
  await symlink(
    path.join(repoRoot, "node_modules"),
    path.join(clone, "node_modules"),
  );
  return { template, clone };
}

test("turns a new clone of the template into a project", async (context) => {
  const { template, clone } = await cloneTemplate(context);
  const start = git(clone, "rev-parse", "HEAD");

  const prepared = run({ clone, args: PREPARE });

  assert.equal(prepared.status, 0, prepared.output);
  assert.equal(git(clone, "remote", "get-url", "template"), template);
  assert.equal(git(clone, "remote", "get-url", "origin"), ORIGIN_URL);
  assert.equal(
    JSON.parse(await readClone(clone, "package.json")).name,
    "trial-project",
  );
  assert.match(
    await readClone(clone, "common/src/features/core/utils/app-name.ts"),
    /^export const APP_NAME = "Trial Project";$/m,
  );
  assert.match(
    await readClone(clone, ".env.example"),
    /^DATABASE_URL=postgresql:\/\/postgres:postgres@127\.0\.0\.1:54320\/trial-project$/m,
  );
  assert.match(
    await readClone(clone, ".env.example"),
    /^APP_ACCOUNT_MODE=single-owner$/m,
  );
  assert.match(await readClone(clone, "README.md"), /^# Trial Project\n/);
  // The project has its own ID for Swamp, and the rest of the marker stays.
  const repoId = /^repoId: [0-9a-f-]{36}$/m;
  const [templateMarker, projectMarker] = [
    await readClone(template, ".swamp.yaml"),
    await readClone(clone, ".swamp.yaml"),
  ];
  assert.match(projectMarker, repoId);
  assert.notEqual(projectMarker, templateMarker);
  assert.equal(
    projectMarker.replace(repoId, ""),
    templateMarker.replace(repoId, ""),
  );
  assert.match(
    await readClone(clone, "README.md"),
    /pnpm run auth:setup-owner/,
  );
  // A document from the template has no link to a file that a project is
  // without, so the script does not need to change it.
  assert.doesNotMatch(
    await readClone(clone, "docs/agents/README.md"),
    /\]\(template\.md\)/,
  );
  assert.equal(
    git(clone, "diff", "--name-only", "HEAD", "--", "docs/agents/README.md"),
    "",
  );
  assert.deepEqual(
    JSON.parse(await readClone(clone, "template-version.json")),
    { template, commit: start, skipped: [] },
  );
  for (const file of TEMPLATE_ONLY_FILES) {
    assert.equal(existsSync(path.join(clone, file)), false, file);
  }
  // Each file that the script wrote has the format that the check requires.
  execFileSync(
    path.join(repoRoot, "node_modules/.bin/prettier"),
    [
      "--check",
      "package.json",
      "README.md",
      "template-version.json",
      "common/src/features/core/utils/app-name.ts",
    ],
    { cwd: clone },
  );

  const finished = run({ clone, args: ["finish"] });

  assert.equal(finished.status, 0, finished.output);
  assert.equal(
    git(clone, "log", "-1", "--format=%B"),
    `Start trial-project from the template\n\n- Set the package name, the product name, and the database name.\n- Remove the files that only the template needs.\n- Record the template commit ${start.slice(0, 7)} in template-version.json.`,
  );
  assert.equal(changes(clone), "");
  for (const file of [
    ...TEMPLATE_ONLY_FILES,
    "scripts/start-project.mjs",
    "workflows/workflow-start-project.yaml",
  ]) {
    assert.equal(git(clone, "ls-files", "--", file), "", file);
    assert.equal(existsSync(path.join(clone, file)), false, file);
  }
  assert.match(finished.output, /git push --set-upstream origin main/);

  // The new project is a project for the sync script, and it is up to date.
  const plan = run({ clone, script: "sync-template.mjs", args: ["plan"] });
  assert.equal(plan.status, 0, plan.output);
  assert.match(plan.output, /up to date with the template/);
});

test("leaves out a later template change to a file that the project is without", async (context) => {
  const { template, clone } = await cloneTemplate(context);
  assert.equal(run({ clone, args: PREPARE }).status, 0);
  assert.equal(run({ clone, args: ["finish"] }).status, 0);
  await writeFile(path.join(template, "renovate.json"), "{}\n");
  await writeFile(path.join(template, "scripts/start-project.mjs"), "\n");
  await writeFile(path.join(template, "AGENTS.md"), "# A new rule\n");
  git(template, "commit", "--quiet", "--all", "--message", "Change files");

  const plan = run({ clone, script: "sync-template.mjs", args: ["plan"] });
  const applied = run({ clone, script: "sync-template.mjs", args: ["apply"] });

  assert.match(plan.output, /take\s+\w{7}  Change files/);
  assert.equal(applied.status, 0, applied.output);
  assert.equal(
    git(clone, "show", "--name-only", "--format=", "HEAD"),
    "AGENTS.md",
  );
});

test("sets the open sign-up mode for the server and for the browser tests", async (context) => {
  const { clone } = await cloneTemplate(context);

  const prepared = run({
    clone,
    args: [...PREPARE, "--account-mode=open-sign-up"],
  });

  assert.equal(prepared.status, 0, prepared.output);
  assert.match(
    await readClone(clone, ".env.example"),
    /^APP_ACCOUNT_MODE=open-sign-up$/m,
  );
  assert.match(
    await readClone(
      clone,
      "frontend/src/features/core/tests/browser/built-app.spec.ts",
    ),
    /\n {4}trustedOrigins: \[FRONTEND_ORIGIN\],\n {4}accountMode: "openSignUp",\n/,
  );
  assert.match(
    await readClone(
      clone,
      "frontend/src/features/core/black-box-tests/black-box-test.ts",
    ),
    /\n {2}accountMode: \["openSignUp", \{ option: true \}\],\n/,
  );
  assert.match(await readClone(clone, "README.md"), /make the first account/);
  assert.doesNotMatch(await readClone(clone, "README.md"), /setup-owner/);
});

test("takes the options from the environment, and keeps Renovate when asked", async (context) => {
  const { clone } = await cloneTemplate(context);

  const prepared = run({
    clone,
    args: ["prepare"],
    environment: {
      PROJECT_NAME: "from-environment",
      PRODUCT_NAME: "From the Environment",
      ORIGIN_URL,
      ACCOUNT_MODE: "single-owner",
      RENOVATE: "keep",
    },
  });

  assert.equal(prepared.status, 0, prepared.output);
  assert.equal(
    JSON.parse(await readClone(clone, "package.json")).name,
    "from-environment",
  );
  assert.equal(existsSync(path.join(clone, "renovate.json")), true);
});

test("changes nothing when an option is not valid", async (context) => {
  const { template, clone } = await cloneTemplate(context);
  const cases = [
    [["prepare"], /--project-name must start/],
    [
      ["prepare", "--project-name=Trial", "--product-name=T", "--origin-url=u"],
      /--project-name must start/,
    ],
    [
      [
        "prepare",
        "--project-name=trial",
        '--product-name=The "Trial"',
        "--origin-url=u",
      ],
      /--product-name must be one line/,
    ],
    [
      [
        "prepare",
        "--project-name=trial",
        "--product-name=Trial",
        `--origin-url=${template}`,
      ],
      /--origin-url is the template/,
    ],
    [[...PREPARE, "--account-mode=invite-only"], /--account-mode must be/],
    [[...PREPARE, "--renovate=maybe"], /--renovate must be/],
    [[...PREPARE, "--unknown"], /Unknown option/],
  ];

  for (const [args, message] of cases) {
    const result = run({ clone, args });
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.output, message);
  }
  assert.equal(changes(clone), "");
  assert.equal(git(clone, "remote"), "origin");
});

test("refuses a clone that is not new", async (context) => {
  const { clone } = await cloneTemplate(context);

  await writeFile(path.join(clone, "AGENTS.md"), "A change with no commit\n");
  const withChanges = run({ clone, args: PREPARE });
  assert.equal(withChanges.status, 1);
  assert.match(withChanges.output, /The working tree has changes/);
  git(clone, "checkout", "--", "AGENTS.md");

  git(clone, "remote", "add", "other", "git@example.test:company/other.git");
  const withRemotes = run({ clone, args: PREPARE });
  assert.equal(withRemotes.status, 1);
  assert.match(withRemotes.output, /Use a new clone of the template/);
  git(clone, "remote", "remove", "other");

  assert.equal(run({ clone, args: PREPARE }).status, 0);
  const again = run({ clone, args: PREPARE });
  assert.equal(again.status, 1);
  assert.match(again.output, /it is a project already/);
});
