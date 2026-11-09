import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
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
  TEMPLATE_PATHS,
} from "./sync-template-fixtures.mjs";

const GUIDE = "docs/agents/guide.md";
const OWNED = [GUIDE, "docs/agents/tests/", "backend/src/features/notes/"];

/**
 * A project that has finished a first sync. The template lists three owned
 * paths: a file, a directory, and a directory of the example.
 */
async function createSyncedProject(context) {
  const created = await createProject(context);
  const { template, project } = created;
  const first = await templateCommit({
    template,
    message: "Add the owned files",
    files: {
      "scripts/template-paths.json": json({
        ...TEMPLATE_PATHS,
        templateOwned: OWNED,
      }),
      [GUIDE]: "one\ntwo\nthree\nfour\n",
      "docs/agents/tests/a.md": "test a\n",
    },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);
  assert.equal(sync(project, "finish").status, 0);
  assert.equal((await readVersion(project)).commit, first);
  return created;
}

test("stops finish at an owned file that differs from the template, and goes on after the fix", async (context) => {
  const { template, project } = await createSyncedProject(context);
  const before = (await readVersion(project)).commit;
  await write(project, { [GUIDE]: "one of the project\ntwo\nthree\nfour\n" });
  commit(project, "Change the guide");
  const tip = await templateCommit({
    template,
    message: "Change the last line",
    files: { [GUIDE]: "one\ntwo\nthree\nfour of the template\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);
  const head = git(project, "rev-parse", "HEAD");

  const result = sync(project, "finish");

  assert.equal(result.status, 1);
  assert.match(result.output, new RegExp(`at ${short(tip)}`));
  assert.match(result.output, /docs\/agents\/guide\.md \(the text differs\)/);
  assert.match(result.output, new RegExp(`git diff ${short(tip)} -- <path>`));
  assert.match(result.output, /template:sync own <path>/);
  assert.equal((await readVersion(project)).commit, before);
  assert.equal(git(project, "rev-parse", "HEAD"), head);

  git(project, "checkout", short(tip), "--", GUIDE);
  commit(project, "Take the guide from the template");
  assert.equal(sync(project, "finish").status, 0);
  assert.equal((await readVersion(project)).commit, tip);
});

test("finishes when each owned file is the same as the template", async (context) => {
  const { template, project } = await createSyncedProject(context);
  const tip = await templateCommit({
    template,
    message: "Change the guide and add a test",
    files: {
      [GUIDE]: "one\ntwo\nthree\nfour\nfive\n",
      "docs/agents/tests/b.md": "test b\n",
    },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);

  const result = sync(project, "finish");

  assert.equal(result.status, 0, result.output);
  assert.equal((await readVersion(project)).commit, tip);
});

test("reports a file that only one side has in an owned directory", async (context) => {
  const { template, project } = await createSyncedProject(context);
  await write(project, { "docs/agents/tests/extra.md": "the project\n" });
  commit(project, "Add a test");
  await templateCommit({
    template,
    message: "Change the guide",
    files: { [GUIDE]: "one\ntwo\nthree\nfour\nfive\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);
  await rm(path.join(project, "docs/agents/tests/a.md"));
  commit(project, "Delete a test");

  const result = sync(project, "finish");

  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /docs\/agents\/tests\/a\.md \(the project does not have it\)/,
  );
  assert.match(
    result.output,
    /docs\/agents\/tests\/extra\.md \(the template does not have it\)/,
  );
  assert.doesNotMatch(result.output, /guide\.md/);
});

test("does not report a path in ownPaths", async (context) => {
  const { template, project } = await createSyncedProject(context);
  await write(project, {
    [GUIDE]: "the guide of the project\n",
    "template-version.json": json({
      ...(await readVersion(project)),
      ownPaths: [
        { path: GUIDE, reason: "a guide of its own" },
        { path: "docs/agents/tests/", reason: "tests of its own" },
      ],
    }),
    "docs/agents/tests/mine.md": "the project\n",
  });
  commit(project, "Take the owned paths over");
  const tip = await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);

  const result = sync(project, "finish");

  assert.equal(result.status, 0, result.output);
  assert.equal((await readVersion(project)).commit, tip);
});

test("does not report an owned example file after the project removed the example", async (context) => {
  const { template, project } = await createSyncedProject(context);
  await rm(path.join(project, "backend"), { recursive: true });
  commit(project, "Remove the example");
  const tip = await templateCommit({
    template,
    message: "Add a file to the example, and change the guide",
    files: {
      "backend/src/features/notes/owned.txt": "the example\n",
      [GUIDE]: "one\ntwo\nthree\nfour\nfive\n",
    },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 0);

  const result = sync(project, "finish");

  assert.equal(result.status, 0, result.output);
  assert.equal((await readVersion(project)).commit, tip);
  await assert.rejects(
    readProjectFile(project, "backend/src/features/notes/owned.txt"),
  );
});
