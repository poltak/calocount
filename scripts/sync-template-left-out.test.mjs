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
  readProjectFile,
  short,
  createProject,
} from "./sync-template-fixtures.mjs";

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

test("keeps the project's file in a project-owned directory, and gives it a new file there one time", async (context) => {
  const { template, project } = await createProject(context);
  await write(project, {
    "docs/agents/project/rules.md": "# Rules of the project\n",
  });
  commit(project, "Add the rules of the project");
  await templateCommit({
    template,
    message: "Change a file and add a document for projects",
    files: {
      "src/app.txt": "one\ntwo\nthree\nfour\n",
      "docs/agents/project/rules.md": "# Rules of the template\n",
      "docs/agents/project/decisions.md": "# Decisions of the template\n",
    },
  });

  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.equal(
    git(project, "show", "--name-only", "--format=", "HEAD"),
    "docs/agents/project/decisions.md\nsrc/app.txt",
  );
  assert.equal(
    await readProjectFile(project, "docs/agents/project/rules.md"),
    "# Rules of the project\n",
  );
  assert.equal(
    await readProjectFile(project, "docs/agents/project/decisions.md"),
    "# Decisions of the template\n",
  );
  assert.equal(git(project, "status", "--porcelain"), "");
});

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

/** One template commit that adds a project-owned file, with its entry. */
async function addProjectOwnedFile({ template, file, text, files = {} }) {
  const pathsFile = "scripts/template-paths.json";
  const paths = JSON.parse(await readProjectFile(template, pathsFile));
  return templateCommit({
    template,
    message: "Add a file that each project owns",
    files: {
      ...files,
      [file]: text,
      [pathsFile]: json({
        ...paths,
        projectOwned: [...paths.projectOwned, file],
      }),
    },
  });
}

test("gives an existing project a new project-owned file, and leaves later changes to the file out", async (context) => {
  const { template, project } = await createProject(context);
  const file = "src/rules.txt";
  await addProjectOwnedFile({
    template,
    file,
    text: "the first rules\n",
    files: { "src/app.txt": "one\ntwo\nthree\nfour\n" },
  });
  sync(project, "plan");

  const taken = sync(project, "apply");

  assert.equal(taken.status, 0, taken.output);
  assert.equal(await readProjectFile(project, file), "the first rules\n");
  assert.equal(sync(project, "finish").status, 0);

  await write(project, { [file]: "the rules of the project\n" });
  commit(project, "Write the rules of the project");
  const later = await templateCommit({
    template,
    message: "Change the rules",
    files: { [file]: "the second rules\n" },
  });

  assert.match(
    sync(project, "plan").output,
    new RegExp(
      `leave out\\s+${short(later)}  Change the rules\\n\\s+\\(it changes only src/rules\\.txt\\)`,
    ),
  );
  assert.equal(sync(project, "apply").status, 0);
  assert.equal(
    await readProjectFile(project, file),
    "the rules of the project\n",
  );
});

test("takes each change to a new project-owned file in one sync, also after a stop", async (context) => {
  const { template, project } = await createProject(context);
  const file = "src/rules.txt";
  await write(project, { "src/app.txt": "one\ntwo of the project\nthree\n" });
  commit(project, "Change the second line");
  await addProjectOwnedFile({ template, file, text: "the first rules\n" });
  await templateCommit({
    template,
    message: "Change the second line",
    files: { "src/app.txt": "one\ntwo of the template\nthree\n" },
  });
  await templateCommit({
    template,
    message: "Correct the rules",
    files: { [file]: "the corrected rules\n" },
  });
  sync(project, "plan");
  assert.equal(sync(project, "apply").status, 1);
  await write(project, { "src/app.txt": "one\ntwo of both\nthree\n" });
  git(project, "add", "src/app.txt");

  const continued = sync(project, "apply");

  assert.equal(continued.status, 0, continued.output);
  assert.match(continued.output, /took  \w{7}  Correct the rules/);
  assert.equal(await readProjectFile(project, file), "the corrected rules\n");
});

test("keeps a project-owned file out of a project that deleted it", async (context) => {
  const { template, project } = await createProject(context);
  await rm(path.join(project, "README.md"));
  commit(project, "Remove the README");
  await templateCommit({
    template,
    message: "Change the README and the application",
    files: {
      "README.md": "# The template, with more text\n",
      "src/app.txt": "one\ntwo\nthree\nfour\n",
    },
  });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  await assert.rejects(readProjectFile(project, "README.md"));
  assert.equal(git(project, "status", "--porcelain"), "");
});

test("keeps the project's own file when the template adds a project-owned file at that path", async (context) => {
  const { template, project } = await createProject(context);
  const file = "src/rules.txt";
  await write(project, { [file]: "the rules of the project\n" });
  commit(project, "Write the rules of the project");
  await addProjectOwnedFile({ template, file, text: "the first rules\n" });
  sync(project, "plan");

  const result = sync(project, "apply");

  assert.equal(result.status, 0, result.output);
  assert.equal(
    await readProjectFile(project, file),
    "the rules of the project\n",
  );
  assert.equal(git(project, "status", "--porcelain"), "");
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
