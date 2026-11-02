import assert from "node:assert/strict";
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
  // The version file keeps the record of the stop for `finish`.
  assert.equal(
    git(project, "status", "--porcelain"),
    " M template-version.json",
  );
});

test("names each file that stopped apply in the commit of finish", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, {
    "src/app.txt": "one\ntwo of the project\nthree\n",
    "src/other.txt": "of the project\n",
  });
  commit(project, "Change two files");
  const resolved = await templateCommit({
    template,
    message: "Change the second line",
    files: { "src/app.txt": "one\ntwo of the template\nthree\n" },
  });
  const skipped = await templateCommit({
    template,
    message: "Add another file",
    files: { "src/other.txt": "of the template\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 1);
  await write(project, { "src/app.txt": "one\ntwo of both\nthree\n" });
  git(project, "add", "src/app.txt");
  assert.equal(sync(project, "apply").status, 1);
  assert.equal(
    sync(project, "skip", short(skipped), "The project has its own file.")
      .status,
    0,
  );

  const result = sync(project, "finish");

  assert.equal(result.status, 0, result.output);
  assert.equal(
    git(project, "log", "-1", "--format=%b"),
    `- The project has the template up to: Add another file\n- New template commits in the project: 1\n- Left out by a person: 1\n- Conflict at ${short(resolved)}: src/app.txt\n- Conflict at ${short(skipped)}: src/other.txt`,
  );
  assert.deepEqual(await readVersion(project), {
    template,
    commit: skipped,
    skipped: [
      {
        commit: skipped,
        subject: "Add another file",
        reason: "The project has its own file.",
      },
    ],
  });
  assert.equal(git(project, "status", "--porcelain"), "");
});

/** One template commit that changes the word that `apply` prints for a commit. */
async function changeTheSyncScript({ template }) {
  const script = "scripts/sync-template.mjs";
  const text = await readProjectFile(template, script);
  const changed = text.replace("`took  ${short", "`taken  ${short");
  assert.notEqual(changed, text);
  await templateCommit({
    template,
    message: "Change the sync script",
    files: { [script]: changed },
  });
}

test("takes each commit after a change to the sync script with the new script", async (context) => {
  const { template, project } = await createProject(context);
  const before = git(project, "rev-parse", "HEAD");
  await changeTheSyncScript({ template });
  await templateCommit({
    template,
    message: "Change the application",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /took  \w{7}  Change the sync script/);
  assert.match(result.output, /taken  \w{7}  Change the application/);
  assert.match(result.output, new RegExp(`git reset --hard ${short(before)}`));
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("keeps one commit to go back to when a stop comes after a change to the sync script", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "src/app.txt": "one\ntwo of the project\nthree\n" });
  commit(project, "Change the second line");
  const before = git(project, "rev-parse", "HEAD");
  await changeTheSyncScript({ template });
  await templateCommit({
    template,
    message: "Change the second line",
    files: { "src/app.txt": "one\ntwo of the template\nthree\n" },
  });
  sync(project, "plan");

  const stopped = sync(project, "apply");

  assert.equal(stopped.status, 1);
  assert.match(stopped.output, /Stopped at template commit/);
  await write(project, { "src/app.txt": "one\ntwo of both\nthree\n" });
  git(project, "add", "src/app.txt");
  const continued = sync(project, "apply");
  assert.equal(continued.status, 0, continued.output);
  assert.match(
    continued.output,
    new RegExp(`git reset --hard ${short(before)}`),
  );
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

test("finds a change that the template took with the commands of template.md", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, { "src/from-project.txt": "from the project\n" });
  const original = commit(project, "Add a file in the project");
  const worktree = path.join(path.dirname(project), "template-change");

  git(project, "fetch", "--quiet", "template");
  git(
    project,
    "worktree",
    "add",
    "--quiet",
    "-b",
    "feature/from-project",
    worktree,
    "template/main",
  );
  git(worktree, "cherry-pick", "-x", original);
  git(template, "fetch", "--quiet", project, "feature/from-project");
  git(template, "merge", "--quiet", "--ff-only", "FETCH_HEAD");

  const result = sync(project, "plan");

  assert.match(
    result.output,
    new RegExp(
      `have\\s+\\w{7}  Add a file in the project\\n\\s+\\(it came from commit ${short(original)} of this project\\)`,
    ),
  );
});
