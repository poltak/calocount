// What `check-migrations.mjs` and `create-migration.mjs` share: the
// migrations that a branch adds or changes, and the tables that a migration
// creates or changes.
import path from "node:path";
import { git, readVersionFile } from "./template-files.mjs";

export const MIGRATIONS_DIRECTORY =
  "backend/src/features/core/database/migrations";

/**
 * `hasDeployedDatabase` is false until a database with data runs the
 * migrations. Until then, the check allows a change to a migration on `main`,
 * and each developer makes a new development database after it.
 */
export const DEPLOYMENT_FILE =
  "backend/src/features/core/database/deployment.json";

const MIGRATION_FILE = /^\d{10}-[a-z0-9-]+\.ts$/;

// A table name, with or without quotes and a schema: `note`, `"note"`, or
// `public."note"`.
const NAME = String.raw`(?:"[^"]+"|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|[\w$]+))?`;
const CREATE_TABLE = new RegExp(
  String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(${NAME})`,
  "gi",
);
// The statements that change a table that already exists.
const CHANGE_TABLE = [
  String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NAME})`,
  String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?(${NAME})`,
  String.raw`\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:${NAME}\s+)?on\s+(?:only\s+)?(${NAME})`,
  String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+${NAME}\s+(?:before|after|instead\s+of)\s[\s\S]*?\son\s+(${NAME})`,
  String.raw`\bcomment\s+on\s+table\s+(${NAME})`,
  String.raw`\bcomment\s+on\s+column\s+(${NAME})\s*\.\s*(?:"[^"]+"|[\w$]+)`,
].map((pattern) => new RegExp(pattern, "gi"));

/** PostgreSQL keeps a quoted name as it is, and lowercases one without quotes. */
function tableName(name) {
  const last = name.split(/\s*\.\s*(?=(?:"[^"]+"|[\w$]+)$)/).at(-1);
  return last.startsWith('"') ? last.slice(1, -1) : last.toLowerCase();
}

/** The tables that the SQL of one migration file creates, and those it changes. */
export function tablesOf(source) {
  const statements = [...source.matchAll(/\bsql`([^`]*)`/g)]
    .map(([, text]) =>
      text.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""),
    )
    .join(";\n");
  const names = (pattern) =>
    [...statements.matchAll(pattern)].map((match) => tableName(match[1]));
  return {
    creates: new Set(names(CREATE_TABLE)),
    changes: new Set(CHANGE_TABLE.flatMap(names)),
  };
}

/**
 * The migrations of the template at the commit that the project records. A
 * merge of unrelated histories makes each one a new file of the branch, but
 * the template wrote them, and each can change a table that an earlier one
 * creates. A clone without that commit gets an empty list.
 */
function templateMigrations({ root }) {
  const commit = readVersionFile({ root })?.commit;
  if (!commit) {
    return new Set();
  }
  const { status, stdout } = git({
    root,
    args: [
      "ls-tree",
      "-r",
      "--name-only",
      commit,
      "--",
      `${MIGRATIONS_DIRECTORY}/`,
    ],
    allowFailure: true,
  });
  return new Set(status === 0 ? stdout.split("\n") : []);
}

/**
 * The migrations of the working tree that differ from the commit where the
 * branch left `main`: the new ones, the changed ones, and the deleted ones.
 * The working tree has the files that are not committed too, so an agent
 * sees a problem before it commits. A moved file is a deleted one and a new
 * one. A new file that the template has at its recorded commit is not a
 * migration of the branch. Returns `null` when the repository has no `main`
 * to compare with.
 */
export function branchMigrations({ root }) {
  const base = ["origin/main", "main"]
    .map((ref) =>
      git({ root, args: ["merge-base", "HEAD", ref], allowFailure: true }),
    )
    .find((result) => result.status === 0)?.stdout;
  if (!base) {
    return null;
  }
  const migrationsOf = (output) =>
    output
      .split("\n")
      .filter((file) => MIGRATION_FILE.test(path.posix.basename(file)));
  const byStatus = (status) =>
    migrationsOf(
      git({
        root,
        args: [
          "diff",
          "--name-only",
          "--no-renames",
          `--diff-filter=${status}`,
          base,
          "--",
          `${MIGRATIONS_DIRECTORY}/`,
        ],
      }).stdout,
    );
  const untracked = migrationsOf(
    git({
      root,
      args: [
        "ls-files",
        "--others",
        "--exclude-standard",
        "--",
        `${MIGRATIONS_DIRECTORY}/`,
      ],
    }).stdout,
  );
  const fromTemplate = templateMigrations({ root });
  return {
    added: [...byStatus("A"), ...untracked]
      .filter((file) => !fromTemplate.has(file))
      .sort(),
    changed: byStatus("M"),
    removed: byStatus("D"),
  };
}
