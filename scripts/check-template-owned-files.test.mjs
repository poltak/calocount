import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = "scripts/check-template-owned-files.mjs";
const REPOSITORY = "acme/project";
const PULLS = `repos/${REPOSITORY}/pulls/7`;
const ISSUES = `repos/${REPOSITORY}/issues/7`;

// A `gh` that answers each API route from a file, and writes down each call.
const FAKE_GH = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
const route = args[args.length - 1];
fs.appendFileSync(process.env.FAKE_GH_CALLS, method + " " + route + "\\n");
const answers = JSON.parse(fs.readFileSync(process.env.FAKE_GH_ANSWERS, "utf8"));
const answer = answers[method + " " + route];
if (answer === undefined) {
  console.error("No answer for " + method + " " + route);
  process.exit(1);
}
if (method === "GET") {
  process.stdout.write(JSON.stringify([answer]));
}
`;

const files = (...names) => names.map((filename) => ({ filename }));
const labelled = (login) => ({
  event: "labeled",
  label: { name: "template-change-approved" },
  actor: { login },
});

/**
 * Run the check in a project, or in the template without `version`, for one
 * pull request event. Returns the exit status, the output, and the API calls.
 */
async function check({
  context,
  version = true,
  action = "opened",
  author = "contributor",
  labels = [],
  answers = {},
  maintainers = "Owner, second-owner",
}) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "template-owned-check-"),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "scripts"));
  await mkdir(path.join(directory, "bin"));
  for (const file of ["check-template-owned-files.mjs", "template-files.mjs"]) {
    await cp(
      path.join(scriptsDirectory, file),
      path.join(directory, "scripts", file),
    );
  }
  await writeFile(
    path.join(directory, "scripts/template-paths.json"),
    JSON.stringify({ templateOwned: ["AGENTS.md", "lint/"] }),
  );
  if (version) {
    await writeFile(path.join(directory, "template-version.json"), "{}\n");
  }
  await writeFile(path.join(directory, "bin/gh"), FAKE_GH);
  await chmod(path.join(directory, "bin/gh"), 0o755);
  await writeFile(
    path.join(directory, "answers.json"),
    JSON.stringify(answers),
  );
  await writeFile(path.join(directory, "calls.txt"), "");
  await writeFile(
    path.join(directory, "event.json"),
    JSON.stringify({
      action,
      before: "1111111",
      after: "2222222",
      repository: { full_name: REPOSITORY },
      pull_request: {
        number: 7,
        user: { login: author },
        labels: labels.map((name) => ({ name })),
      },
    }),
  );

  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`,
      GITHUB_EVENT_PATH: path.join(directory, "event.json"),
      TEMPLATE_MAINTAINERS: maintainers,
      FAKE_GH_ANSWERS: path.join(directory, "answers.json"),
      FAKE_GH_CALLS: path.join(directory, "calls.txt"),
    },
  });
  const calls = (await readFile(path.join(directory, "calls.txt"), "utf8"))
    .split("\n")
    .filter(Boolean);
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    calls,
  };
}

test("passes each pull request in the template, with no API call", async (context) => {
  const result = await check({ context, version: false });

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.calls, []);
});

test("passes a pull request that changes no file from the template", async (context) => {
  const result = await check({
    context,
    answers: {
      [`GET ${PULLS}/files?per_page=100`]: files("docs/agents/decisions.md"),
    },
  });

  assert.equal(result.status, 0, result.output);
});

test("fails a change from a person who is not a maintainer, and names the files", async (context) => {
  const result = await check({
    context,
    answers: {
      [`GET ${PULLS}/files?per_page=100`]: [
        { filename: "AGENTS.md" },
        { filename: "docs/old-rule.mjs", previous_filename: "lint/rule.mjs" },
        { filename: "README.md" },
      ],
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /^ {2}AGENTS\.md$/m);
  assert.match(result.output, /^ {2}lint\/rule\.mjs$/m);
  assert.doesNotMatch(result.output, /README\.md/);
  assert.match(result.output, /Maintainers: Owner, second-owner\./);
  assert.match(result.output, /::error title=Template-owned files::/);
});

test("passes the change when a maintainer opened the pull request", async (context) => {
  const result = await check({
    context,
    author: "owner",
    answers: { [`GET ${PULLS}/files?per_page=100`]: files("AGENTS.md") },
  });

  assert.equal(result.status, 0, result.output);
});

test("counts the approval label only when a maintainer added it last", async (context) => {
  const approvedBy = (...logins) =>
    check({
      context,
      action: "labeled",
      labels: ["template-change-approved"],
      answers: {
        [`GET ${PULLS}/files?per_page=100`]: files("AGENTS.md"),
        [`GET ${ISSUES}/events?per_page=100`]: logins.map(labelled),
      },
    });

  const byMaintainer = await approvedBy("contributor", "second-owner");
  const byContributor = await approvedBy("second-owner", "contributor");

  assert.equal(byMaintainer.status, 0, byMaintainer.output);
  assert.equal(byContributor.status, 1);
  assert.match(
    byContributor.output,
    /contributor added the template-change-approved label, and is not a maintainer/,
  );
});

test("removes the approval when a later push changes a file from the template again", async (context) => {
  const afterPush = (pushedFiles) =>
    check({
      context,
      action: "synchronize",
      labels: ["template-change-approved"],
      answers: {
        [`GET ${PULLS}/files?per_page=100`]: files("AGENTS.md", "README.md"),
        [`GET repos/${REPOSITORY}/compare/1111111...2222222`]: {
          files: pushedFiles,
        },
        [`DELETE ${ISSUES}/labels/template-change-approved`]: null,
        [`GET ${ISSUES}/events?per_page=100`]: [labelled("owner")],
      },
    });

  const ownedAgain = await afterPush(files("AGENTS.md"));
  const otherFile = await afterPush(files("README.md"));

  assert.equal(ownedAgain.status, 1);
  assert.ok(
    ownedAgain.calls.includes(
      `DELETE ${ISSUES}/labels/template-change-approved`,
    ),
  );
  assert.equal(otherFile.status, 0, otherFile.output);
  assert.ok(!otherFile.calls.some((call) => call.startsWith("DELETE")));
});

test("tells the person to set the maintainers when none is set", async (context) => {
  const result = await check({
    context,
    maintainers: "",
    answers: { [`GET ${PULLS}/files?per_page=100`]: files("lint/rule.mjs") },
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Set the TEMPLATE_MAINTAINERS variable/);
});
