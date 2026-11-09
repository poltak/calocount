import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, rm, symlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  scriptsDirectory,
  repoRoot,
  GIT_ENVIRONMENT,
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

/**
 * Run the script in a real terminal, and type one line. `own` refuses a process
 * that has no terminal, and Node cannot make one without `script`.
 */
function syncInTerminal({ project, typed, args }) {
  const command = [
    process.execPath,
    path.join(project, "scripts/sync-template.mjs"),
    ...args,
  ];
  const quoted = command
    .map((part) => `'${part.replaceAll("'", "'\\''")}'`)
    .join(" ");
  const result = spawnSync(
    "script",
    process.platform === "darwin"
      ? ["-q", "/dev/null", ...command]
      : ["-q", "-e", "-c", quoted, "/dev/null"],
    {
      cwd: project,
      env: GIT_ENVIRONMENT,
      encoding: "utf8",
      // `script` waits a long time for a command that reads no typed line.
      input: typed ? `${typed}\n` : "",
    },
  );
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

/** Give the project a list of paths that it took over, in one commit. */
async function keepPaths({ project, paths }) {
  await write(project, {
    "template-version.json": json({
      ...(await readVersion(project)),
      ownPaths: paths.map((entry) => ({
        path: entry,
        reason: "The project has its own version.",
      })),
    }),
  });
  commit(project, "Keep paths in the project");
}

test("leaves each change to a kept path out of the project", async (context) => {
  const { template, project } = await createProject(context);
  await rm(path.join(project, "src"), { recursive: true });
  await write(project, { "package.json": json({ name: "project" }) });
  commit(project, "Remove the application, and replace the package file");
  await keepPaths({ project, paths: ["src/", "package.json"] });
  const change = await templateCommit({
    template,
    message: "Change kept paths",
    files: {
      "src/app.txt": "one\ntwo\nthree\nfour\n",
      "src/new.txt": "a new file\n",
      "package.json": json({ ...PACKAGE_JSON, name: "changed" }),
    },
  });

  const plan = sync(project, "plan");
  const result = sync(project, "apply");

  assert.match(
    plan.output,
    new RegExp(
      `leave out\\s+${short(change)}  Change kept paths\\n\\s+\\(it changes only package\\.json, src/app\\.txt, src/new\\.txt\\)`,
    ),
  );
  assert.equal(result.status, 0, result.output);
  await assert.rejects(readProjectFile(project, "src/app.txt"));
  await assert.rejects(readProjectFile(project, "src/new.txt"));
  assert.equal(
    await readProjectFile(project, "package.json"),
    json({ name: "project" }),
  );
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("takes the rest of a commit that changes a kept path, and names what the project does not get", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "src/app.txt": "the project's own file\n" });
  commit(project, "Replace a file");
  await keepPaths({ project, paths: ["src/app.txt"] });
  const mixed = await templateCommit({
    template,
    message: "Change two files",
    files: {
      "src/app.txt": "one\ntwo\nthree\nfour\n",
      "src/other.txt": "another file\n",
    },
  });

  const plan = sync(project, "plan");
  const result = sync(project, "apply");

  assert.match(
    plan.output,
    new RegExp(
      `take\\s+${short(mixed)}  Change two files\\n\\s+\\(the project does not get src/app\\.txt\\)`,
    ),
  );
  assert.equal(result.status, 0, result.output);
  assert.equal(
    await readProjectFile(project, "src/app.txt"),
    "the project's own file\n",
  );
  assert.equal(
    await readProjectFile(project, "src/other.txt"),
    "another file\n",
  );
  assert.equal(sync(project, "finish").status, 0);
  assert.deepEqual((await readVersion(project)).ownPaths, [
    { path: "src/app.txt", reason: "The project has its own version." },
  ]);
});

test("does not write a list of migrations that the project keeps", async (context) => {
  const { template, project } = await createProject(context);
  const database = "backend/src/features/core/database";
  const list = `${database}/migrations.ts`;
  const migration = (name) => `export const migration = { name: "${name}" };\n`;
  for (const directory of [template, project]) {
    await symlink(
      path.join(repoRoot, "node_modules"),
      path.join(directory, "node_modules"),
    );
  }
  const createMigration = () =>
    execFileSync(
      process.execPath,
      [path.join(template, "scripts/create-migration.mjs"), "--sync"],
      { cwd: template },
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
  createMigration();
  await templateCommit({ template, message: "Add a migration", files: {} });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);
  assert.equal(sync(project, "finish").status, 0);

  /** A mixed commit: one migration, its list, and one file of the application. */
  const addMigration = async ({ timestamp, name }) => {
    await write(template, {
      [`${database}/migrations/${timestamp}-create-${name}.ts`]:
        migration(name),
    });
    createMigration();
    await templateCommit({
      template,
      message: `Add the ${name} migration`,
      files: { [`src/${name}.txt`]: `${name}\n` },
    });
    sync(project, "plan");
  };

  // The project has its own list.
  await write(project, { [list]: "the project's list\n" });
  commit(project, "Write the list of the project");
  await keepPaths({ project, paths: [list] });
  await addMigration({ timestamp: 1000000002, name: "second" });

  const ownList = sync(project, "apply");

  assert.equal(ownList.status, 0, ownList.output);
  assert.equal(await readProjectFile(project, list), "the project's list\n");
  assert.equal(await readProjectFile(project, "src/second.txt"), "second\n");
  assert.equal(git(project, "status", "--porcelain"), "");
  assert.equal(sync(project, "finish").status, 0);

  // The project has no migrations at all.
  await rm(path.join(project, database), { recursive: true });
  commit(project, "Remove the migrations");
  await keepPaths({ project, paths: [`${database}/`] });
  await addMigration({ timestamp: 1000000003, name: "third" });

  const noList = sync(project, "apply");

  assert.equal(noList.status, 0, noList.output);
  await assert.rejects(readProjectFile(project, list));
  assert.equal(await readProjectFile(project, "src/third.txt"), "third\n");
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("refuses each command while the project keeps a gate of the template", async (context) => {
  const { project } = await createProject(context);

  for (const entry of [
    "scripts/sync-template.mjs",
    "scripts/",
    ".agents/hooks/guard-template-owned-files.mjs",
    ".agents/",
  ]) {
    await keepPaths({ project, paths: [entry] });

    for (const command of [["plan"], ["apply"], ["finish"]]) {
      const result = sync(project, ...command);
      assert.equal(result.status, 1);
      assert.match(result.output, /"ownPaths" in template-version\.json names/);
    }
  }
});

test("refuses a kept path that has no reason", async (context) => {
  const { project } = await createProject(context);
  await write(project, {
    "template-version.json": json({
      ...(await readVersion(project)),
      ownPaths: [{ path: "src/app.txt" }],
    }),
  });
  commit(project, "Keep a path with no reason");

  const result = sync(project, "plan");

  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /each of its entries must have a "path" and a "reason"/,
  );
});

test("refuses to take a path over in a process that has no terminal", async (context) => {
  const { project } = await createProject(context);
  const head = git(project, "rev-parse", "HEAD");

  const result = sync(project, "own", "src/app.txt", "The project owns it.");

  assert.equal(result.status, 1);
  assert.match(result.output, /only a person at a terminal can run it/);
  assert.equal(git(project, "rev-parse", "HEAD"), head);
  assert.equal((await readVersion(project)).ownPaths, undefined);
});

test("takes a path over when the person at a terminal confirms it", async (context) => {
  const { template, project } = await createProject(context);
  sync(project, "plan");

  const result = syncInTerminal({
    project,
    typed: "own",
    args: ["own", "src/", "The", "project", "has", "its", "own", "code."],
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /src\/ matches 1 file\./);
  assert.deepEqual((await readVersion(project)).ownPaths, [
    { path: "src/", reason: "The project has its own code." },
  ]);
  assert.equal(
    git(project, "log", "-1", "--format=%B"),
    "Take src/ over from the template\n\n- The reason: The project has its own code.\n- A sync now leaves out each template change to it.",
  );
  assert.equal(git(project, "status", "--porcelain"), "");

  await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  assert.match(sync(project, "plan").output, /leave out\s+\w{7}  Change the/);
});

test("changes nothing when the person at a terminal does not confirm", async (context) => {
  const { project } = await createProject(context);
  sync(project, "plan");
  const head = git(project, "rev-parse", "HEAD");

  const result = syncInTerminal({
    project,
    typed: "no",
    args: ["own", "src/app.txt", "A reason"],
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Nothing changed/);
  assert.equal(git(project, "rev-parse", "HEAD"), head);
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("refuses to take over a gate, a path with no file, or a path that the project keeps", async (context) => {
  const { project } = await createProject(context);
  await keepPaths({ project, paths: ["src/app.txt"] });
  sync(project, "plan");
  const own = (entry) =>
    syncInTerminal({ project, args: ["own", entry, "A reason"] });

  for (const entry of [
    "scripts/sync-template.mjs",
    "scripts/",
    ".agents/hooks/",
  ]) {
    const result = own(entry);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /each project must get the template's fixes/);
  }
  assert.match(own("src").output, /No file of the project or the template/);
  assert.match(own("../src/").output, /No file of the project or the template/);
  assert.match(own("src/app.txt").output, /already keeps src\/app\.txt/);
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("lets a person take over the file that stopped apply", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "src/app.txt": "one\ntwo of the project\nthree\n" });
  commit(project, "Change the second line");
  const tip = await templateCommit({
    template,
    message: "Change the second line",
    files: { "src/app.txt": "one\ntwo of the template\nthree\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 1);

  const taken = syncInTerminal({
    project,
    typed: "own",
    args: ["own", "src/app.txt", "The project has its own file."],
  });
  const continued = sync(project, "apply");
  const finished = sync(project, "finish");

  assert.equal(taken.status, 0, taken.output);
  assert.match(taken.output, /`finish` commits it/);
  assert.equal(continued.status, 0, continued.output);
  assert.equal(finished.status, 0, finished.output);
  assert.equal(
    await readProjectFile(project, "src/app.txt"),
    "one\ntwo of the project\nthree\n",
  );
  const version = await readVersion(project);
  assert.equal(version.commit, tip);
  assert.deepEqual(version.ownPaths, [
    { path: "src/app.txt", reason: "The project has its own file." },
  ]);
  assert.equal(git(project, "status", "--porcelain"), "");
});
