import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = "backend/src/features/core/database/migrations";
const DEPLOYMENT = "backend/src/features/core/database/deployment.json";

const migration = (...statements) => `import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
${statements.map((statement) => `    await sql\`${statement}\`.execute(db);`).join("\n")}
  },
});
`;

/**
 * A repository whose `main` has one migration, which creates `note`, and a
 * branch `feature` from it. Files that a test writes are not committed. A
 * `deployment` of `null` leaves out the deployment file.
 */
async function createRepository(context, { deployment = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "migrations-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" });
  const write = async (file, text) => {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), text);
  };
  git("init", "--quiet", "--initial-branch=main");
  for (const script of [
    "check-migrations.mjs",
    "migration-files.mjs",
    "template-files.mjs",
  ]) {
    await cp(
      path.join(scriptsDirectory, script),
      path.join(directory, "scripts", script),
    );
  }
  if (deployment !== null) {
    await write(
      DEPLOYMENT,
      JSON.stringify({ hasDeployedDatabase: deployment }),
    );
  }
  await write(
    `${MIGRATIONS}/1791000000-create-note.ts`,
    migration('create table "note" ("id" uuid primary key)'),
  );
  git("add", ".");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "--quiet",
    "-m",
    "Start",
  );
  git("switch", "--quiet", "-c", "feature");
  return { directory, git, write };
}

function check(directory) {
  const result = spawnSync(process.execPath, ["scripts/check-migrations.mjs"], {
    cwd: directory,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

test("accepts new migrations that each change only their own tables or tables of main", async (context) => {
  const { directory, write } = await createRepository(context);
  await write(
    `${MIGRATIONS}/1792000000-create-profile.ts`,
    migration(
      'create table "profile" ("id" uuid primary key, "name" text)',
      'create index "profile_name_index" on "profile" ("name")',
    ),
  );
  await write(
    `${MIGRATIONS}/1792000001-add-note-title.ts`,
    migration(
      // An SQL comment that names the other new table changes nothing.
      '-- alter table "profile" comes later\n      alter table "note" add column "title" text',
    ),
  );

  const result = check(directory);

  assert.equal(result.status, 0, result.output);
  assert.equal(result.output, "");
});

test("rejects a new migration that changes a table that another new migration creates", async (context) => {
  const { directory, git, write } = await createRepository(context);
  await write(
    `${MIGRATIONS}/1792000000-create-profile-tables.ts`,
    migration(
      'create table "profile" ("id" uuid primary key)',
      "create table change_set (id uuid primary key)",
      'create table "marker" ("id" uuid primary key)',
      'create table "flag" ("id" uuid primary key)',
      'create table "source" ("id" uuid primary key)',
    ),
  );
  // Committed, so the check reads a committed migration and a new file both.
  git("add", ".");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "--quiet",
    "-m",
    "Profile",
  );
  await write(
    `${MIGRATIONS}/1792000001-change-profile-tables.ts`,
    migration(
      'alter table only public."profile" add column "name" text',
      'alter table "change_set" add column "confirmed_at" timestamptz',
      'create unique index on "marker" ("id")',
      'create trigger "flag_set_updated_at_trigger"\n        before update of "id" on "flag"\n        for each row execute function "set_updated_at"()',
      'comment on column "source"."id" is \'The ID\'',
      'alter table "note" add column "profile_id" uuid',
    ),
  );

  const result = check(directory);

  assert.equal(result.status, 1);
  for (const table of ["profile", "change_set", "marker", "flag", "source"]) {
    assert.match(
      result.output,
      new RegExp(
        `1792000001-change-profile-tables changes "${table}", which 1792000000-create-profile-tables creates\\.`,
      ),
    );
  }
  assert.doesNotMatch(result.output, /changes "note"/);
  assert.match(result.output, /run `pnpm run db:reset`/);
});

/**
 * The branch of `createRepository` after a merge of the template, which has no
 * commit in common with `main`. The second template migration changes the
 * table of the first, as `set-note-updated-at-with-a-trigger` does.
 */
async function adoptTemplate({ git, write }) {
  const person = ["-c", "user.name=Test", "-c", "user.email=test@example.test"];
  git("switch", "--quiet", "--orphan", "template");
  await write(
    `${MIGRATIONS}/1790000000-create-activity.ts`,
    migration('create table "activity" ("id" uuid primary key)'),
  );
  await write(
    `${MIGRATIONS}/1790000001-add-activity-time.ts`,
    migration('alter table "activity" add column "at" timestamptz'),
  );
  git("add", ".");
  git(...person, "commit", "--quiet", "-m", "Start the template");
  const templateCommit = git("rev-parse", "HEAD").trim();
  git("switch", "--quiet", "feature");
  git(
    ...person,
    "merge",
    "--quiet",
    "--no-edit",
    "--allow-unrelated-histories",
    "template",
  );
  return templateCommit;
}

const versionFile = (commit) =>
  JSON.stringify({ template: "template-url", commit, skipped: [] });

test("leaves out the template's migrations on the branch that adopts the template", async (context) => {
  const { directory, git, write } = await createRepository(context);
  const templateCommit = await adoptTemplate({ git, write });

  const withoutRecord = check(directory);

  assert.equal(withoutRecord.status, 1);
  assert.match(
    withoutRecord.output,
    /1790000001-add-activity-time changes "activity"/,
  );

  await write("template-version.json", versionFile(templateCommit));

  const adopted = check(directory);

  assert.equal(adopted.status, 0, adopted.output);
  assert.equal(adopted.output, "");
});

test("still checks the project's own migrations on the branch that adopts the template", async (context) => {
  const { directory, git, write } = await createRepository(context);
  const templateCommit = await adoptTemplate({ git, write });
  await write("template-version.json", versionFile(templateCommit));
  await write(
    `${MIGRATIONS}/1792000000-create-profile.ts`,
    migration('create table "profile" ("id" uuid primary key)'),
  );
  await write(
    `${MIGRATIONS}/1792000001-add-profile-name.ts`,
    migration('alter table "profile" add column "name" text'),
  );

  const result = check(directory);

  assert.equal(result.status, 1);
  assert.match(result.output, /1792000001-add-profile-name changes "profile"/);
  assert.doesNotMatch(result.output, /activity/);
});

test("reads no template migrations when this clone is without the recorded commit", async (context) => {
  const { directory, git, write } = await createRepository(context);
  await adoptTemplate({ git, write });
  await write("template-version.json", versionFile("0".repeat(40)));

  const result = check(directory);

  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /1790000001-add-activity-time changes "activity"/,
  );
});

test("allows a change to a migration of main while no database with data is deployed", async (context) => {
  const { directory, write } = await createRepository(context);
  await write(
    `${MIGRATIONS}/1791000000-create-note.ts`,
    migration('create table "note" ("id" uuid primary key, "title" text)'),
  );

  const result = check(directory);

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /1791000000-create-note changes/);
  assert.match(result.output, /each developer runs `pnpm run db:reset`/);
});

test("rejects a change, a move, or a deletion of a migration of main after a deploy", async (context) => {
  for (const deployment of [true, null]) {
    const { directory, git, write } = await createRepository(context, {
      deployment,
    });
    await write(
      `${MIGRATIONS}/1791000000-create-note.ts`,
      migration('create table "note" ("id" uuid primary key, "title" text)'),
    );

    const changed = check(directory);

    assert.equal(changed.status, 1);
    assert.match(changed.output, /1791000000-create-note changes/);
    assert.match(changed.output, /write a new migration for the change/);

    git("checkout", "--", MIGRATIONS);
    git(
      "mv",
      `${MIGRATIONS}/1791000000-create-note.ts`,
      `${MIGRATIONS}/1791000001-create-note.ts`,
    );

    const moved = check(directory);

    assert.equal(moved.status, 1);
    assert.match(moved.output, /1791000000-create-note is deleted or moved/);
  }
});

test("passes in a repository with no main branch", async (context) => {
  const { directory, git } = await createRepository(context);
  git("branch", "--quiet", "-D", "main");

  const result = check(directory);

  assert.equal(result.status, 0);
  assert.match(result.output, /no `main` branch to compare with/);
});
