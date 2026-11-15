import assert from "node:assert/strict";
import test from "node:test";
import {
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
