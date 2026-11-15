import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
const GIT_ENVIRONMENT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Project Person",
  GIT_AUTHOR_EMAIL: "person@project.test",
  GIT_COMMITTER_NAME: "Project Person",
  GIT_COMMITTER_EMAIL: "person@project.test",
};
const START_COMMIT = "1".repeat(40);

// Stands in for `pnpm exec bd init`, and does what `docs/agents/setup.md`
// records of the real command: it writes `.beads/`, and commits it.
const FAKE_PNPM = `#!/bin/sh
printf '%s\\n' "$*" > "$FAKE_CALLS"
[ -n "$FAKE_FAILS" ] && exit 3
mkdir .beads
echo "issue-prefix: x" > .beads/config.yaml
echo "# Beads" > .beads/README.md
git add .beads
git commit --quiet --message "bd init"
[ -n "$FAKE_SETS_HOOKS" ] && git config core.hooksPath .beads/hooks
exit 0
`;

const git = (directory, ...args) =>
  execFileSync("git", args, {
    cwd: directory,
    env: GIT_ENVIRONMENT,
    encoding: "utf8",
  }).trimEnd();

async function createProject(context, { version = true } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "issues-init-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const project = path.join(directory, "project");
  await mkdir(path.join(project, "scripts"), { recursive: true });
  await mkdir(path.join(directory, "bin"));
  for (const script of ["issues-init.mjs", "template-files.mjs"]) {
    await cp(
      path.join(scriptsDirectory, script),
      path.join(project, "scripts", script),
    );
  }
  await writeFile(
    path.join(project, "package.json"),
    '{ "name": "trial-project" }\n',
  );
  if (version) {
    await writeFile(
      path.join(project, "template-version.json"),
      JSON.stringify({
        template: "git@example.test:company/template.git",
        commit: START_COMMIT,
        skipped: [],
      }),
    );
  }
  git(project, "init", "--quiet", "--initial-branch=main");
  git(project, "add", "--all");
  git(project, "commit", "--quiet", "--message", "Start the project");
  await writeFile(path.join(directory, "bin", "pnpm"), FAKE_PNPM);
  await chmod(path.join(directory, "bin", "pnpm"), 0o755);
  return { directory, project };
}

function run({ directory, project, args = [], environment = {} }) {
  const result = spawnSync(
    process.execPath,
    [path.join(project, "scripts/issues-init.mjs"), ...args],
    {
      cwd: project,
      encoding: "utf8",
      env: {
        ...GIT_ENVIRONMENT,
        PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`,
        FAKE_CALLS: path.join(directory, "calls.txt"),
        ...environment,
      },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const callOf = (directory) =>
  readFile(path.join(directory, "calls.txt"), "utf8");
const called = (directory) => existsSync(path.join(directory, "calls.txt"));

test("turns on beads with the flags that keep the hooks and the agents' files", async (context) => {
  const { directory, project } = await createProject(context);

  const result = run({ directory, project });

  assert.equal(result.status, 0, result.output);
  assert.equal(
    await callOf(directory),
    "exec bd init --skip-hooks --skip-agents --prefix trial-project\n",
  );
  assert.match(result.output, /bd dolt push/);
});

test("replaces the commit of bd init, and leaves out its README", async (context) => {
  const { directory, project } = await createProject(context);

  run({ directory, project });

  assert.equal(
    git(project, "log", "--format=%s"),
    "Turn on the beads issue tracker\nStart the project",
  );
  assert.equal(
    git(project, "show", "--name-only", "--format=", "HEAD"),
    ".beads/config.yaml",
  );
  assert.equal(existsSync(path.join(project, ".beads/README.md")), false);
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("takes the prefix from the command line", async (context) => {
  const { directory, project } = await createProject(context);

  const result = run({ directory, project, args: ["--prefix=other"] });

  assert.equal(result.status, 0, result.output);
  assert.match(await callOf(directory), /--prefix other\n$/);
});

test("fails when core.hooksPath is set, because the secret check then stops", async (context) => {
  const { directory, project } = await createProject(context);

  const result = run({
    directory,
    project,
    environment: { FAKE_SETS_HOOKS: "1" },
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /does not run the secret check/);
});

test("leaves the commits as they are when bd init fails", async (context) => {
  const { directory, project } = await createProject(context);

  const result = run({ directory, project, environment: { FAKE_FAILS: "1" } });

  assert.equal(result.status, 1);
  assert.match(result.output, /`bd init` failed/);
  assert.equal(git(project, "log", "--format=%s"), "Start the project");
});

test("refuses the template, a project that has beads, and a tree with changes", async (context) => {
  const inTemplate = await createProject(context, { version: false });
  const withBeads = await createProject(context);
  await mkdir(path.join(withBeads.project, ".beads"));
  const withChanges = await createProject(context);
  await writeFile(path.join(withChanges.project, "new.txt"), "new\n");

  const results = [inTemplate, withBeads, withChanges].map((project) =>
    run(project),
  );

  assert.deepEqual(
    results.map(({ status }) => status),
    [1, 1, 1],
  );
  assert.match(results[0].output, /has no template-version\.json/);
  assert.match(results[1].output, /Join a project that uses beads/);
  assert.match(results[2].output, /has changes/);
  for (const { directory } of [inTemplate, withBeads, withChanges]) {
    assert.equal(called(directory), false);
  }
});

test("refuses a worktree, because the issues are in the main checkout", async (context) => {
  const { directory, project } = await createProject(context);
  const worktree = path.join(directory, "worktree");
  git(project, "worktree", "add", "--quiet", "-b", "other", worktree);

  const result = run({ directory, project: worktree });

  assert.equal(result.status, 1);
  assert.match(result.output, /main checkout/);
  assert.equal(called(directory), false);
});
