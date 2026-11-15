import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
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
} from "./sync-template-fixtures.mjs";

/**
 * A repository with its own history that took the template later. A merge
 * brings in the template's history. A copy brings in only its files. In both,
 * the project keeps its own README, and has no commit from before the template.
 */
async function adoptTemplate({ context, bringFiles }) {
  const { template, start } = await createProject(context);
  const project = `${template}-adopted`;
  await mkdir(project);
  git(project, "init", "--quiet", "--initial-branch=main");
  await write(project, {
    "README.md": "# The old app\n",
    "old/app.txt": "the old app\n",
  });
  commit(project, "Start the old app");
  git(project, "remote", "add", "template", template);
  git(project, "fetch", "--quiet", "template");

  bringFiles(project);
  await rm(path.join(project, "renovate.json"));
  await rm(path.join(project, "docs/agents/template.md"));
  await write(project, {
    "template-version.json": json({ template, commit: start, skipped: [] }),
  });
  commit(project, "Adopt the template");
  return { template, project };
}

const ADOPTIONS = {
  "a merge of unrelated histories": (project) =>
    git(
      project,
      "merge",
      "--quiet",
      "--no-edit",
      "--allow-unrelated-histories",
      "--strategy-option=ours",
      "template/main",
    ),
  "a copy with no template history": (project) => {
    git(project, "checkout", "template/main", "--", ".");
    git(project, "checkout", "HEAD", "--", "README.md");
  },
};

for (const [name, bringFiles] of Object.entries(ADOPTIONS)) {
  test(`takes later template commits after ${name}`, async (context) => {
    const { template, project } = await adoptTemplate({ context, bringFiles });
    const code = await templateCommit({
      template,
      message: "Change the application",
      files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
    });
    const readme = await templateCommit({
      template,
      message: "Change the README",
      files: { "README.md": "# The new template\n" },
    });

    const plan = sync(project, "plan");

    assert.equal(plan.status, 0, plan.output);
    assert.match(
      plan.output,
      new RegExp(`take\\s+${short(code)}  Change the application`),
    );
    assert.match(
      plan.output,
      new RegExp(`leave out\\s+${short(readme)}  Change the README`),
    );

    const applied = sync(project, "apply");
    assert.equal(applied.status, 0, applied.output);
    const finished = sync(project, "finish");
    assert.equal(finished.status, 0, finished.output);

    assert.equal(
      await readProjectFile(project, "src/app.txt"),
      "one\ntwo\nthree\nfour\n",
    );
    assert.equal(
      await readProjectFile(project, "old/app.txt"),
      "the old app\n",
    );
    assert.equal(
      await readProjectFile(project, "README.md"),
      "# The old app\n",
    );
    assert.equal((await readVersion(project)).commit, readme);
    assert.match(sync(project, "plan").output, /up to date/);
  });
}
