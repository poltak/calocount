// Checks the migrations that a branch adds or changes. `pnpm run check` and CI
// run it:
//
//   node scripts/check-migrations.mjs
//
// - A migration of the branch must not change a table that another migration
//   of the branch creates. Until the merge, such a change goes into the
//   migration that creates the table. Without this rule, an agent writes a new
//   migration for each step of its work, and a pull request has migrations
//   that change their own tables again.
// - A migration on `main` must not change, move, or go away when
//   `hasDeployedDatabase` in `deployment.json` is true. A database that ran a
//   migration does not run it again, so it does not get the change. While it
//   is false, the check allows the change, and reminds each developer to make
//   a new development database.
//
// The branch is the working tree, with the files that are not committed, and
// it starts at the commit where it left `main`. The check reads the table
// names from the SQL, which is plain, as docs/agents/database.md requires.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPLOYMENT_FILE,
  branchMigrations,
  tablesOf,
} from "./migration-files.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const listOf = (lines) => lines.map((line) => `  ${line}`).join("\n");
const nameOf = (file) => path.posix.basename(file, ".ts");

/** A missing or unreadable file counts as a deployed database, the strict case. */
function hasDeployedDatabase() {
  const file = path.join(root, DEPLOYMENT_FILE);
  if (!existsSync(file)) {
    return true;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")).hasDeployedDatabase !== false;
  } catch {
    return true;
  }
}

function check() {
  const migrations = branchMigrations({ root });
  if (!migrations) {
    console.log(
      "The repository has no `main` branch to compare with, so the check found no migrations of a branch.",
    );
    return true;
  }
  let passed = true;

  const tables = new Map(
    migrations.added.map((file) => [
      file,
      tablesOf(readFileSync(path.join(root, file), "utf8")),
    ]),
  );
  const creators = new Map(
    [...tables].flatMap(([file, { creates }]) =>
      [...creates].map((table) => [table, file]),
    ),
  );
  const changesOfNewTables = [...tables].flatMap(([file, { changes }]) =>
    [...changes]
      .filter((table) => creators.has(table) && creators.get(table) !== file)
      .map(
        (table) =>
          `${nameOf(file)} changes "${table}", which ${nameOf(creators.get(table))} creates.`,
      ),
  );
  if (changesOfNewTables.length > 0) {
    passed = false;
    console.error(
      [
        "A migration of this branch changes a table that another migration of this branch creates:",
        listOf(changesOfNewTables),
        "Move each such statement into the migration that creates the table. Delete a migration that has no statement left, and run `pnpm run db:migration:create --sync`. Then run `pnpm run db:reset`, because your development database ran the old migrations.",
      ].join("\n"),
    );
  }

  const changedOnMain = [
    ...migrations.changed.map((file) => `${nameOf(file)} changes`),
    ...migrations.removed.map((file) => `${nameOf(file)} is deleted or moved`),
  ];
  if (changedOnMain.length > 0 && hasDeployedDatabase()) {
    passed = false;
    console.error(
      [
        "The branch changes migrations that are on `main`:",
        listOf(changedOnMain),
        `A database that ran a migration does not run it again, so it does not get the change. Restore each file as it is on \`main\`, and write a new migration for the change. \`hasDeployedDatabase\` in ${DEPLOYMENT_FILE} is true.`,
      ].join("\n"),
    );
  } else if (changedOnMain.length > 0) {
    console.log(
      [
        "The branch changes migrations that are on `main`:",
        listOf(changedOnMain),
        `\`hasDeployedDatabase\` in ${DEPLOYMENT_FILE} is false, so no database with data ran the migrations, and the check allows the change. After the merge, each developer runs \`pnpm run db:reset\`.`,
      ].join("\n"),
    );
  }
  return passed;
}

process.exitCode = check() ? 0 : 1;
