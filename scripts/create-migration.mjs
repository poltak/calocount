// Creates a database migration file and rewrites the list of all migrations.
//
//   pnpm run db:migration:create <name>   Create `<timestamp>-<name>.ts`.
//   pnpm run db:migration:create --sync   Only rewrite the list, for example
//                                         after a merge conflict in it.
//
// The name is lowercase words joined by hyphens, such as `create-note`. The
// timestamp is the current time in seconds, so new migrations sort last.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { branchMigrations } from "./migration-files.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const databaseDirectory = fileURLToPath(
  new URL("../backend/src/features/core/database/", import.meta.url),
);
const migrationsDirectory = path.join(databaseDirectory, "migrations");
const listFile = path.join(databaseDirectory, "migrations.ts");

const MIGRATION_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MIGRATION_FILE = /^(\d{10})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.ts$/;

const MIGRATION_TEMPLATE = `import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    // Run each statement in its own call. The database has snake_case names:
    // "table_name" ("column_name"). A new table needs the standard columns
    // and the "updated_at" trigger. Copy them from
    // docs/agents/database.md (Database schema).
    await sql\`\`.execute(db);
  },
});
`;

function listSource(files) {
  const entries = files.map((file) => {
    const [, timestamp, name] = file.match(MIGRATION_FILE);
    const camelCaseName = name.replace(/-([a-z0-9])/g, (_match, letter) =>
      letter.toUpperCase(),
    );
    return {
      identifier: `${camelCaseName}${timestamp}`,
      module: `./migrations/${file.replace(/\.ts$/, ".js")}`,
    };
  });
  return [
    "// `pnpm run db:migration:create` writes this file. Do not edit it by hand.",
    'import type { DatabaseMigration } from "./migration.js";',
    ...entries.map(
      ({ identifier, module }) =>
        `import { migration as ${identifier} } from "${module}";`,
    ),
    "",
    "/** Every migration in `migrations/`. They run in the order of their names. */",
    `export const migrations: DatabaseMigration[] = [${entries
      .map(({ identifier }) => identifier)
      .join(", ")}];`,
    "",
  ].join("\n");
}

async function writeFormatted(file, source) {
  const prettier = await import("prettier");
  const config = await prettier.resolveConfig(file);
  await writeFile(
    file,
    await prettier.format(source, { ...config, filepath: file }),
  );
}

const [argument] = process.argv.slice(2);
if (argument !== "--sync" && !MIGRATION_NAME.test(argument ?? "")) {
  console.error(
    "Usage: pnpm run db:migration:create <name>\nThe name is lowercase words joined by hyphens, such as create-note.",
  );
  process.exit(1);
}

await mkdir(migrationsDirectory, { recursive: true });
const files = (await readdir(migrationsDirectory))
  .filter((file) => MIGRATION_FILE.test(file))
  .sort();

if (argument !== "--sync") {
  // A new migration always sorts after every existing one, even when a clock
  // is wrong or two are created in the same second.
  const latest = Number(files.at(-1)?.match(MIGRATION_FILE)[1] ?? 0);
  const timestamp = Math.max(Math.floor(Date.now() / 1000), latest + 1);
  const file = `${timestamp}-${argument}.ts`;
  await writeFormatted(
    path.join(migrationsDirectory, file),
    MIGRATION_TEMPLATE,
  );
  files.push(file);
  console.log(
    `Created ${path.relative(process.cwd(), path.join(migrationsDirectory, file))}`,
  );
  console.log(
    "A data model change needs the person's approval before you continue (AGENTS.md).",
  );
  const earlier = (branchMigrations({ root })?.added ?? []).filter(
    (added) => path.basename(added) !== file,
  );
  if (earlier.length > 0) {
    console.log(
      [
        "This branch already adds these migrations:",
        ...earlier.map((added) => `  ${path.basename(added)}`),
        "A change to a table that one of them creates goes into that migration, and `pnpm run check` fails when a new migration has it. When the new migration has only such changes, delete it and run `pnpm run db:migration:create --sync`.",
      ].join("\n"),
    );
  }
}

await writeFormatted(listFile, listSource(files));
console.log(`Updated ${path.relative(process.cwd(), listFile)}`);
