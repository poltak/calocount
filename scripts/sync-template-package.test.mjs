import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, symlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  scriptsDirectory,
  repoRoot,
  PACKAGE_JSON,
  json,
  git,
  write,
  commit,
  templateCommit,
  sync,
  readVersion,
  readProjectFile,
  short,
  createProject,
} from "./sync-template-fixtures.mjs";

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

test("keeps a dependency out of a project that removed it when the template updates it", async (context) => {
  const { template, project } = await createProject(context);
  const { zod: removed, ...kept } = PACKAGE_JSON.dependencies;
  assert.equal(removed, "4.0.0");
  await write(project, {
    "package.json": json({ ...PACKAGE_JSON, dependencies: kept }),
  });
  commit(project, "Remove a dependency");
  await templateCommit({
    template,
    message: "Update the dependencies",
    files: {
      "package.json": json({
        ...PACKAGE_JSON,
        dependencies: { ...PACKAGE_JSON.dependencies, zod: "4.1.0" },
      }),
      "src/app.txt": "one\ntwo\nthree\nfour\n",
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.output,
    /package\.json: the template updates dependencies\.zod\. The project removed it/,
  );
  assert.deepEqual(
    JSON.parse(await readProjectFile(project, "package.json")).dependencies,
    kept,
  );
  assert.equal(
    await readProjectFile(project, "src/app.txt"),
    "one\ntwo\nthree\nfour\n",
  );
});

test("stops when the project removed a key that is not a dependency and the template changed it", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, {
    "package.json": json({ ...PACKAGE_JSON, scripts: { check: "node c.mjs" } }),
  });
  commit(project, "Remove a script");
  await templateCommit({
    template,
    message: "Change a script",
    files: {
      "package.json": json({
        ...PACKAGE_JSON,
        scripts: { ...PACKAGE_JSON.scripts, dev: "node dev.mjs --watch" },
      }),
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 1);
  assert.match(result.output, /package\.json: scripts\.dev/);
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
