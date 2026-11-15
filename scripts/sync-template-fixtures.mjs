import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptsDirectory, "..");

// Each test makes a template repository and a project that started from it,
// with real Git. The settings of the person who runs the tests have no effect.
export const GIT_ENVIRONMENT = {
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
export const TEMPLATE_AUTHOR = {
  GIT_AUTHOR_NAME: "Template Person",
  GIT_AUTHOR_EMAIL: "person@template.test",
  GIT_AUTHOR_DATE: "2026-03-04T05:06:07+02:00",
};

export const PACKAGE_JSON = {
  name: "template",
  scripts: { check: "node check.mjs", dev: "node dev.mjs" },
  dependencies: { hono: "4.0.0", react: "19.0.0", zod: "4.0.0" },
};
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
// The lists of the template in these tests. The tests do not read the lists
// of this repository, so a change to those lists does not change a result.
export const TEMPLATE_PATHS = {
  templateOnly: [
    "docs/agents/template.md",
    "renovate.json",
    ".agents/skills/start-project/",
  ],
  example: ["backend/src/features/notes/"],
  withExample: [
    "backend/src/features/core/database/migrations/1791009406-create-note.ts",
    ".agents/skills/remove-example/",
  ],
  projectOwned: ["README.md", "docs/agents/project/"],
};

export function git(directory, ...args) {
  return execFileSync("git", args, {
    cwd: directory,
    env: GIT_ENVIRONMENT,
    encoding: "utf8",
  }).trimEnd();
}

export async function write(directory, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/** Commit every change in a repository, and return the commit's ID. */
export function commit(directory, message, environment = {}) {
  git(directory, "add", "--all");
  execFileSync("git", ["commit", "--quiet", "--message", message], {
    cwd: directory,
    env: { ...GIT_ENVIRONMENT, ...environment },
  });
  return git(directory, "rev-parse", "HEAD");
}

/** Make one template commit that writes these files. */
export async function templateCommit({ template, message, files }) {
  await write(template, files);
  return commit(template, message, TEMPLATE_AUTHOR);
}

export function sync(project, ...args) {
  const result = spawnSync(
    process.execPath,
    [path.join(project, "scripts/sync-template.mjs"), ...args],
    { cwd: project, env: GIT_ENVIRONMENT, encoding: "utf8" },
  );
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

export const readVersion = async (project) =>
  JSON.parse(await readFile(path.join(project, "template-version.json")));
export const readProjectFile = (project, file) =>
  readFile(path.join(project, file), "utf8");
export const short = (commitId) => commitId.slice(0, 7);

/**
 * A template, and a project in the state that `start-project` leaves. The
 * project is without the files that only the template needs, and it has a
 * version file.
 */
export async function createProject(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sync-template-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const template = path.join(directory, "template");
  const project = path.join(directory, "project");

  await mkdir(template);
  git(template, "init", "--quiet", "--initial-branch=main");
  await write(template, {
    ".gitignore": "node_modules\n",
    "README.md": "# The template\n",
    "renovate.json": json({ schedule: ["monday"] }),
    "docs/agents/template.md": "# The template\n",
    "package.json": json(PACKAGE_JSON),
    "pnpm-lock.yaml": "lockfileVersion: 1\n",
    "src/app.txt": "one\ntwo\nthree\n",
    "backend/src/features/notes/note.txt": "the example\n",
    "scripts/template-paths.json": json(TEMPLATE_PATHS),
  });
  for (const script of ["sync-template.mjs", "template-files.mjs"]) {
    await cp(
      path.join(scriptsDirectory, script),
      path.join(template, "scripts", script),
    );
  }
  const start = commit(template, "Start the template", TEMPLATE_AUTHOR);

  git(directory, "clone", "--quiet", template, project);
  git(project, "remote", "rename", "origin", "template");
  await rm(path.join(project, "renovate.json"));
  await rm(path.join(project, "docs/agents/template.md"));
  await write(project, {
    "README.md": "# The project\n",
    "template-version.json": json({
      template,
      commit: start,
      skipped: [],
    }),
  });
  commit(project, "Start the project");
  return { template, project, start };
}
