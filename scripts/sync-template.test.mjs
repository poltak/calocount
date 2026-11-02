import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDirectory, "..");

// Each test makes a template repository and a project that started from it,
// with real Git. The settings of the person who runs the tests have no effect.
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
const TEMPLATE_AUTHOR = {
  GIT_AUTHOR_NAME: "Template Person",
  GIT_AUTHOR_EMAIL: "person@template.test",
  GIT_AUTHOR_DATE: "2026-03-04T05:06:07+02:00",
};

const PACKAGE_JSON = {
  name: "template",
  scripts: { check: "node check.mjs", dev: "node dev.mjs" },
  dependencies: { hono: "4.0.0", react: "19.0.0", zod: "4.0.0" },
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
// The lists of the template in these tests. The tests do not read the lists
// of this repository, so a change to those lists does not change a result.
const TEMPLATE_PATHS = {
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
  projectOwned: ["README.md"],
};

function git(directory, ...args) {
  return execFileSync("git", args, {
    cwd: directory,
    env: GIT_ENVIRONMENT,
    encoding: "utf8",
  }).trimEnd();
}

async function write(directory, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/** Commit every change in a repository, and return the commit's ID. */
function commit(directory, message, environment = {}) {
  git(directory, "add", "--all");
  execFileSync("git", ["commit", "--quiet", "--message", message], {
    cwd: directory,
    env: { ...GIT_ENVIRONMENT, ...environment },
  });
  return git(directory, "rev-parse", "HEAD");
}

/** Make one template commit that writes these files. */
async function templateCommit({ template, message, files }) {
  await write(template, files);
  return commit(template, message, TEMPLATE_AUTHOR);
}

function sync(project, ...args) {
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

const readVersion = async (project) =>
  JSON.parse(await readFile(path.join(project, "template-version.json")));
const readProjectFile = (project, file) =>
  readFile(path.join(project, file), "utf8");
const short = (commitId) => commitId.slice(0, 7);

/**
 * A template, and a project in the state that `start-project` leaves. The
 * project is without the files that only the template needs, and it has a
 * version file.
 */
async function createProject(context) {
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

test("refuses a repository that is not a project", async (context) => {
  const { template } = await createProject(context);

  const result = sync(template, "plan");

  assert.equal(result.status, 1);
  assert.match(result.output, /has no template-version\.json/);
});

test("lists each new template commit with what apply does to it", async (context) => {
  const { template, project } = await createProject(context);
  const code = await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  const renovate = await templateCommit({
    template,
    message: "Change the update schedule",
    files: { "renovate.json": json({ schedule: ["friday"] }) },
  });
  const earlier = await templateCommit({
    template,
    message: "Add a file that the project took earlier",
    files: { "src/earlier.txt": "earlier\n" },
  });
  const unwanted = await templateCommit({
    template,
    message: "Add a file that the project does not want",
    files: { "src/unwanted.txt": "unwanted\n" },
  });
  git(project, "fetch", "--quiet", "template");
  git(project, "cherry-pick", "-x", earlier);
  assert.equal(
    sync(project, "skip", short(unwanted), "The project", "has its own").status,
    0,
  );

  const result = sync(project, "plan");

  assert.equal(result.status, 0);
  assert.match(result.output, /New template commits: 4/);
  assert.match(
    result.output,
    new RegExp(`take\\s+${short(code)}  Change the application`),
  );
  assert.match(
    result.output,
    new RegExp(
      `leave out\\s+${short(renovate)}  Change the update schedule\\n\\s+\\(it changes only renovate\\.json\\)`,
    ),
  );
  assert.match(
    result.output,
    new RegExp(
      `have\\s+${short(earlier)}  Add a file that the project took earlier\\n\\s+\\(commit ${short(git(project, "rev-parse", "HEAD~1"))} of this project\\)`,
    ),
  );
  assert.match(
    result.output,
    new RegExp(
      `skipped\\s+${short(unwanted)}  Add a file that the project does not want\\n\\s+\\(The project has its own\\)`,
    ),
  );
});

test("adds the template as a remote in a clone that has none", async (context) => {
  const { template, project } = await createProject(context);
  git(project, "remote", "remove", "template");
  await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "changed\n" },
  });

  const result = sync(project, "plan");

  assert.equal(result.status, 0);
  assert.equal(git(project, "remote", "get-url", "template"), template);
  assert.match(result.output, /take\s+\w{7}  Change the application/);
});

test("takes a commit with its author, its date, and the name of its source", async (context) => {
  const { template, project } = await createProject(context);
  const source = await templateCommit({
    template,
    message: "Change the application\n\n- Add a fourth line.",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  const before = git(project, "rev-parse", "HEAD");
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /took  \w{7}  Change the application/);
  assert.match(result.output, new RegExp(`git reset --hard ${short(before)}`));
  assert.equal(
    await readProjectFile(project, "src/app.txt"),
    "one\ntwo\nthree\nfour\n",
  );
  assert.equal(
    git(project, "log", "-1", "--format=%an <%ae> %aI%n%cn%n%B"),
    `Template Person <person@template.test> 2026-03-04T05:06:07+02:00\nProject Person\nChange the application\n\n- Add a fourth line.\n\n(cherry picked from commit ${source})`,
  );
  assert.equal(git(project, "status", "--porcelain"), "");

  // A second run finds the source's name in the project, and takes nothing.
  const again = sync(project, "apply");
  assert.equal(again.status, 0);
  assert.match(again.output, /No template commit to take/);
});

test("leaves out the files that the project is without, in a commit that changes other files too", async (context) => {
  const { template, project } = await createProject(context);
  await rm(path.join(project, "backend"), { recursive: true });
  commit(project, "Remove the example");
  await templateCommit({
    template,
    message: "Change many files",
    files: {
      "README.md": "# The template, with more text\n",
      "renovate.json": json({ schedule: ["friday"] }),
      "docs/agents/template.md": "# The template, changed\n",
      ".agents/skills/start-project/SKILL.md": "A new template file\n",
      "backend/src/features/notes/note.txt": "the example, changed\n",
      "backend/src/features/notes/new.txt": "a new example file\n",
      ".agents/skills/remove-example/SKILL.md": "A new part of the example\n",
      "src/app.txt": "one\ntwo\nthree\nfour\n",
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.equal(
    git(project, "show", "--name-only", "--format=", "HEAD"),
    "src/app.txt",
  );
  assert.equal(await readProjectFile(project, "README.md"), "# The project\n");
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("names the files that a commit loses in the plan, and counts them in finish", async (context) => {
  const { template, project } = await createProject(context);
  const mixed = await templateCommit({
    template,
    message: "Change the update schedule and the application",
    files: {
      "renovate.json": json({ schedule: ["friday"] }),
      "src/app.txt": "one\ntwo\nthree\nfour\n",
    },
  });

  const plan = sync(project, "plan");

  assert.match(
    plan.output,
    new RegExp(
      `take\\s+${short(mixed)}  Change the update schedule and the application\\n\\s+\\(the project does not get renovate\\.json\\)`,
    ),
  );
  assert.equal(sync(project, "apply").status, 0);
  assert.equal(sync(project, "finish").status, 0);
  assert.match(
    git(project, "log", "-1", "--format=%b"),
    /^- Files left out of the commits that the project took: 1$/m,
  );
});

/** One template commit that adds a migration of the example, with its entry. */
async function addExampleMigration({ template, files }) {
  const pathsFile = "scripts/template-paths.json";
  const migration =
    "backend/src/features/core/database/migrations/1800000000-add-note-color.ts";
  const paths = JSON.parse(await readProjectFile(template, pathsFile));
  await templateCommit({
    template,
    message: "Give a note a color",
    files: {
      ...files,
      [migration]: "a new migration of the example\n",
      [pathsFile]: json({
        ...paths,
        withExample: [...paths.withExample, migration],
      }),
    },
  });
  return { pathsFile, migration };
}

test("gives a project that has the example each new part of the example", async (context) => {
  const { template, project } = await createProject(context);
  const { pathsFile, migration } = await addExampleMigration({
    template,
    files: {
      ".agents/skills/remove-example/SKILL.md": "The steps\n",
      "backend/src/features/notes/new.txt": "a new example file\n",
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(
    git(project, "show", "--name-only", "--format=", "HEAD").split("\n"),
    [
      ".agents/skills/remove-example/SKILL.md",
      migration,
      "backend/src/features/notes/new.txt",
      pathsFile,
    ],
  );
});

test("counts a project as without the example when only a migration of the example is left", async (context) => {
  const { template, project } = await createProject(context);
  // A project with real data keeps the migrations that its database ran.
  await rm(path.join(project, "backend/src/features/notes"), {
    recursive: true,
  });
  await write(project, {
    "backend/src/features/core/database/migrations/1791009406-create-note.ts":
      "the first migration of the example\n",
  });
  commit(project, "Remove the example, and keep its migration");
  const { pathsFile } = await addExampleMigration({
    template,
    files: {
      ".agents/skills/remove-example/SKILL.md": "The steps\n",
      "backend/src/features/notes/note.txt": "the example, changed\n",
      "src/app.txt": "one\ntwo\nthree\nfour\n",
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(
    git(project, "show", "--name-only", "--format=", "HEAD").split("\n"),
    [pathsFile, "src/app.txt"],
  );
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("leaves out a new file that the template adds with its entry in the list", async (context) => {
  const { template, project } = await createProject(context);
  const pathsFile = "scripts/template-paths.json";
  const paths = JSON.parse(await readProjectFile(template, pathsFile));
  await templateCommit({
    template,
    message: "Add a tool that only the template needs",
    files: {
      "tools/release.txt": "for the template\n",
      [pathsFile]: json({
        ...paths,
        templateOnly: [...paths.templateOnly, "tools/"],
      }),
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  // The project took the new list, and did not get the new file.
  assert.equal(result.status, 0, result.output);
  assert.equal(
    git(project, "show", "--name-only", "--format=", "HEAD"),
    pathsFile,
  );
  await assert.rejects(readProjectFile(project, "tools/release.txt"));
});

test("takes a change to a file that only some projects keep", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "renovate.json": json({ schedule: ["monday"] }) });
  commit(project, "Run Renovate in the project");
  await templateCommit({
    template,
    message: "Change the update schedule",
    files: { "renovate.json": json({ schedule: ["friday"] }) },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.equal(
    await readProjectFile(project, "renovate.json"),
    json({ schedule: ["friday"] }),
  );
});

test("merges package.json by its keys when Git finds a conflict in its lines", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, {
    "package.json": json({
      ...PACKAGE_JSON,
      name: "project",
      scripts: { ...PACKAGE_JSON.scripts, seed: "node seed.mjs" },
      dependencies: {
        hono: "4.0.0",
        "hono-of-the-project": "1.0.0",
        react: "19.0.0",
        zod: "4.0.0",
      },
    }),
  });
  commit(project, "Add a dependency and a script");
  await templateCommit({
    template,
    message: "Update the dependencies",
    files: {
      "package.json": json({
        name: "template",
        scripts: {
          check: "node check.mjs --all",
          dev: "node dev.mjs",
          lint: "node lint.mjs",
        },
        dependencies: { hono: "4.1.0", kysely: "1.0.0", react: "19.1.0" },
      }),
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.equal(
    await readProjectFile(project, "package.json"),
    json({
      name: "project",
      scripts: {
        check: "node check.mjs --all",
        dev: "node dev.mjs",
        lint: "node lint.mjs",
        seed: "node seed.mjs",
      },
      dependencies: {
        hono: "4.1.0",
        "hono-of-the-project": "1.0.0",
        kysely: "1.0.0",
        react: "19.1.0",
      },
    }),
  );
  assert.match(
    git(project, "log", "-1", "--format=%s"),
    /^Update the dependencies$/,
  );
});

test("stops when both sides changed one dependency to different versions, and continues after a person selects one", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, {
    "package.json": json({
      ...PACKAGE_JSON,
      dependencies: { ...PACKAGE_JSON.dependencies, hono: "5.0.0-project" },
    }),
  });
  commit(project, "Use another version of one dependency");
  const source = await templateCommit({
    template,
    message: "Update the dependencies",
    files: {
      "package.json": json({
        ...PACKAGE_JSON,
        dependencies: { ...PACKAGE_JSON.dependencies, hono: "4.1.0" },
      }),
    },
  });
  sync(project, "plan");

  const stopped = sync(project, "apply");

  assert.equal(stopped.status, 1);
  assert.match(
    stopped.output,
    new RegExp(
      `Stopped at template commit ${short(source)}: Update the dependencies`,
    ),
  );
  assert.match(stopped.output, /package\.json: dependencies\.hono/);

  await write(project, {
    "package.json": json({
      ...PACKAGE_JSON,
      dependencies: { ...PACKAGE_JSON.dependencies, hono: "5.0.0-project" },
    }),
  });
  git(project, "add", "package.json");
  const continued = sync(project, "apply");

  // The project's version is the result, so no commit names the template
  // commit. The version file names it, until `finish`.
  assert.equal(continued.status, 0, continued.output);
  assert.match(continued.output, /have  \w{7}  Update the dependencies/);
  assert.equal(
    git(project, "status", "--porcelain"),
    " M template-version.json",
  );
  assert.deepEqual((await readVersion(project)).unchanged, [source]);
  assert.match(
    sync(project, "plan").output,
    /have\s+\w{7}  Update the dependencies\n\s+\(it changes nothing in this project\)/,
  );

  assert.equal(sync(project, "finish").status, 0);
  assert.deepEqual(await readVersion(project), {
    template,
    commit: source,
    skipped: [],
  });
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("keeps the project's lockfile when the template's change does not apply to it", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, {
    "pnpm-lock.yaml": "lockfileVersion: 1\nproject: true\n",
  });
  commit(project, "Add a dependency");
  await templateCommit({
    template,
    message: "Update the dependencies",
    files: {
      "pnpm-lock.yaml": "lockfileVersion: 1\ntemplate: true\n",
      "src/app.txt": "one\ntwo\nthree\nfour\n",
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.equal(
    await readProjectFile(project, "pnpm-lock.yaml"),
    "lockfileVersion: 1\nproject: true\n",
  );
  assert.equal(
    await readProjectFile(project, "src/app.txt"),
    "one\ntwo\nthree\nfour\n",
  );
});

test("writes the list of migrations again when a template commit adds a migration", async (context) => {
  const { template, project } = await createProject(context);
  const database = "backend/src/features/core/database";
  const migration = (name) => `export const migration = { name: "${name}" };\n`;
  const listOf = async (directory) =>
    (await readProjectFile(directory, `${database}/migrations.ts`))
      .split("\n")
      .filter((line) => line.startsWith("import { migration as "))
      .map((line) => line.match(/as (\w+) /)[1]);
  // The real script writes the list. It needs Prettier, from the repository
  // of these tests.
  for (const directory of [template, project]) {
    await symlink(
      path.join(repoRoot, "node_modules"),
      path.join(directory, "node_modules"),
    );
  }
  const createMigration = (directory) =>
    execFileSync(
      process.execPath,
      [path.join(directory, "scripts/create-migration.mjs"), "--sync"],
      { cwd: directory },
    );

  for (const script of ["create-migration.mjs", "migration-files.mjs"]) {
    await cp(
      path.join(scriptsDirectory, script),
      path.join(template, "scripts", script),
    );
  }
  await write(template, {
    [`${database}/migrations/1000000001-create-first.ts`]: migration("first"),
  });
  createMigration(template);
  await templateCommit({
    template,
    message: "Add the first migration",
    files: {},
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);

  await write(project, {
    [`${database}/migrations/1000000005-create-project-table.ts`]:
      migration("project"),
  });
  createMigration(project);
  commit(project, "Add a migration of the project");
  await write(template, {
    [`${database}/migrations/1000000003-create-second.ts`]: migration("second"),
  });
  createMigration(template);
  await templateCommit({
    template,
    message: "Add the second migration",
    files: {},
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(await listOf(project), [
    "createFirst1000000001",
    "createSecond1000000003",
    "createProjectTable1000000005",
  ]);
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("stops at a conflict that no rule resolves, and continues after a person resolves it", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "src/app.txt": "one\ntwo of the project\nthree\n" });
  commit(project, "Change the second line");
  const before = git(project, "rev-parse", "HEAD");
  await templateCommit({
    template,
    message: "Add a file",
    files: { "src/first.txt": "first\n" },
  });
  const conflict = await templateCommit({
    template,
    message: "Change the second line",
    files: { "src/app.txt": "one\ntwo of the template\nthree\n" },
  });
  await templateCommit({
    template,
    message: "Add another file",
    files: { "src/last.txt": "last\n" },
  });
  sync(project, "plan");

  const stopped = sync(project, "apply");

  assert.equal(stopped.status, 1);
  assert.match(stopped.output, /took  \w{7}  Add a file/);
  assert.match(
    stopped.output,
    new RegExp(
      `Stopped at template commit ${short(conflict)}: Change the second line\\n\\nThese files have a conflict that no rule resolves:\\n  src/app\\.txt\\n`,
    ),
  );
  assert.match(
    sync(project, "plan").output,
    new RegExp(`\`apply\` stopped at ${short(conflict)}`),
  );
  for (const command of [["verify", "check"], ["finish"]]) {
    const refused = sync(project, ...command);
    assert.equal(refused.status, 1);
    assert.match(refused.output, /Run `apply` first/);
  }

  // The file is staged, and still has the markers that Git wrote.
  git(project, "add", "src/app.txt");
  const withMarkers = sync(project, "apply");
  assert.equal(withMarkers.status, 1);
  assert.match(
    withMarkers.output,
    /These files still have conflict markers:\n  src\/app\.txt/,
  );

  // A person resolved the file, and did not stage it.
  await write(project, { "src/app.txt": "one\ntwo of both\nthree\n" });
  const unstaged = sync(project, "apply");
  assert.equal(unstaged.status, 1);
  assert.match(
    unstaged.output,
    /These files have changes that are not staged:\n  src\/app\.txt/,
  );

  git(project, "add", "src/app.txt");
  const continued = sync(project, "apply");

  assert.equal(continued.status, 0, continued.output);
  assert.match(continued.output, /took  \w{7}  Change the second line/);
  assert.match(continued.output, /took  \w{7}  Add another file/);
  assert.match(
    continued.output,
    new RegExp(`git reset --hard ${short(before)}`),
  );
  assert.equal(
    await readProjectFile(project, "src/app.txt"),
    "one\ntwo of both\nthree\n",
  );
  assert.equal(
    git(project, "log", "-3", "--format=%s"),
    "Add another file\nChange the second line\nAdd a file",
  );
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("leaves out the commit that apply stopped at, with the reason in the version file", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "src/app.txt": "one\ntwo of the project\nthree\n" });
  commit(project, "Change the second line");
  const conflict = await templateCommit({
    template,
    message: "Change the second line",
    files: {
      "src/app.txt": "one\ntwo of the template\nthree\n",
      "src/added.txt": "added\n",
    },
  });
  await templateCommit({
    template,
    message: "Add another file",
    files: { "src/last.txt": "last\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 1);

  const skipped = sync(
    project,
    "skip",
    short(conflict),
    "The project has its own second line.",
  );

  assert.equal(skipped.status, 0, skipped.output);
  assert.equal(git(project, "status", "--porcelain"), "");
  assert.equal(
    await readProjectFile(project, "src/app.txt"),
    "one\ntwo of the project\nthree\n",
  );
  assert.deepEqual((await readVersion(project)).skipped, [
    {
      commit: conflict,
      subject: "Change the second line",
      reason: "The project has its own second line.",
    },
  ]);
  assert.equal(
    git(project, "log", "-1", "--format=%B"),
    `Leave template commit ${short(conflict)} out of the project\n\n- The template commit: Change the second line\n- The reason: The project has its own second line.`,
  );

  const continued = sync(project, "apply");
  assert.equal(continued.status, 0, continued.output);
  assert.match(continued.output, /took  \w{7}  Add another file/);
});

test("refuses to leave out a commit that is not one that apply takes", async (context) => {
  const { template, project, start } = await createProject(context);
  await templateCommit({
    template,
    message: "Change the update schedule",
    files: { "renovate.json": json({ schedule: ["friday"] }) },
  });
  sync(project, "plan");

  for (const commitId of [start, "template/main", "no-such-commit"]) {
    const result = sync(project, "skip", commitId, "A reason");
    assert.equal(result.status, 1);
    assert.match(result.output, /is not a template commit that `apply` takes/);
  }
  assert.deepEqual((await readVersion(project)).skipped, []);
});

test("finds a change that the template took from the project", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "src/from-project.txt": "from the project\n" });
  const original = commit(project, "Add a file in the project");
  await templateCommit({
    template,
    message: `Add a file in the project\n\n(cherry picked from commit ${original})`,
    files: { "src/from-project.txt": "from the project, for a template\n" },
  });
  await write(project, { "src/same.txt": "the same change\n" });
  commit(project, "Add a file by hand");
  await templateCommit({
    template,
    message: "Add a file",
    files: { "src/same.txt": "the same change\n" },
  });

  const result = sync(project, "plan");

  assert.match(
    result.output,
    new RegExp(
      `have\\s+\\w{7}  Add a file in the project\\n\\s+\\(it came from commit ${short(original)} of this project\\)`,
    ),
  );
  assert.match(
    result.output,
    /have\s+\w{7}  Add a file\n\s+\(the same change\)/,
  );
  assert.equal(sync(project, "apply").status, 0);
  assert.equal(
    await readProjectFile(project, "src/from-project.txt"),
    "from the project\n",
  );
});

test("commits the lockfile and the new template version, one time", async (context) => {
  const { template, project } = await createProject(context);
  await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  const tip = await templateCommit({
    template,
    message: "Change the update schedule",
    files: { "renovate.json": json({ schedule: ["friday"] }) },
  });
  sync(project, "plan");
  sync(project, "apply");
  await write(project, { "pnpm-lock.yaml": "lockfileVersion: 1\nnew: true\n" });

  const result = sync(project, "finish");

  assert.equal(result.status, 0, result.output);
  assert.equal((await readVersion(project)).commit, tip);
  assert.equal(
    git(project, "log", "-2", "--format=%s"),
    `Record template version ${short(tip)}\nBring the lockfile up to date with the template`,
  );
  assert.equal(
    git(project, "log", "-1", "--format=%b"),
    "- The project has the template up to: Change the update schedule\n- New template commits in the project: 1\n- Left out, because they change only files that the project is without: 1",
  );
  assert.equal(
    git(project, "show", "--name-only", "--format=", "HEAD~1"),
    "pnpm-lock.yaml",
  );
  assert.equal(git(project, "status", "--porcelain"), "");

  const head = git(project, "rev-parse", "HEAD");
  assert.match(sync(project, "plan").output, /up to date with the template/);
  assert.equal(sync(project, "apply").status, 0);
  assert.equal(sync(project, "finish").status, 0);
  assert.equal(git(project, "rev-parse", "HEAD"), head);
});

test("keeps each field of the version file, and ends the list of unchanged commits", async (context) => {
  const { template, project, start } = await createProject(context);
  await write(project, {
    "template-version.json": json({
      template,
      commit: start,
      skipped: [],
      note: "a field of the project",
    }),
    "src/app.txt": "one\ntwo of the project\nthree\n",
  });
  commit(project, "Add a field, and change the second line");
  const tip = await templateCommit({
    template,
    message: "Change the second line",
    files: { "src/app.txt": "one\ntwo of the template\nthree\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 1);
  await write(project, { "src/app.txt": "one\ntwo of the project\nthree\n" });
  git(project, "add", "src/app.txt");
  assert.equal(sync(project, "apply").status, 0);
  assert.deepEqual((await readVersion(project)).unchanged, [tip]);

  const result = sync(project, "finish");

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(await readVersion(project), {
    template,
    commit: tip,
    skipped: [],
    note: "a field of the project",
  });
});

test("refuses to finish while other changes have no commit", async (context) => {
  const { template, project, start } = await createProject(context);
  await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  sync(project, "plan");
  sync(project, "apply");
  await write(project, { "src/app.txt": "a correction with no commit\n" });

  const result = sync(project, "finish");

  assert.equal(result.status, 1);
  assert.match(result.output, /Commit these changes.*\n  src\/app\.txt/);
  assert.equal((await readVersion(project)).commit, start);
  assert.equal(
    git(project, "log", "-1", "--format=%s"),
    "Change the application",
  );
});

test("runs a check only when the project took a template commit", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, {
    "check.mjs":
      'import { writeFileSync } from "node:fs";\nwriteFileSync("check-ran", "");\n',
  });
  commit(project, "Add the check");
  await templateCommit({
    template,
    message: "Change the update schedule",
    files: { "renovate.json": json({ schedule: ["friday"] }) },
  });
  sync(project, "plan");
  sync(project, "apply");

  const nothingTaken = sync(project, "verify", "check");

  assert.equal(nothingTaken.status, 0);
  assert.match(nothingTaken.output, /took no template commit/);
  await assert.rejects(readProjectFile(project, "check-ran"));

  await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  sync(project, "plan");
  sync(project, "apply");

  const taken = sync(project, "verify", "check");

  assert.equal(taken.status, 0, taken.output);
  assert.equal(await readProjectFile(project, "check-ran"), "");
});
