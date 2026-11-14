// What the parts of `sync-template.ts` share: the constants, the Git helpers,
// and the types of a plan.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION_FILE, git } from "./template-files.mjs";
import type { VersionFile } from "./template-files.mjs";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const TEMPLATE_BRANCH = "main";
export const LOCKFILE = "pnpm-lock.yaml";
export const DEPENDENCY_LISTS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
export const MIGRATIONS_DIRECTORY =
  "backend/src/features/core/database/migrations/";
export const MIGRATION_LIST =
  "backend/src/features/core/database/migrations.ts";
export const MIGRATION_SCRIPT = "scripts/create-migration.ts";
export const CONFLICT_MARKER = /^(?:<{7}|>{7}) /m;
// The rules of a sync are in these files, and a running script does not read
// its own new version. The `.mjs` entry is a shim for the old sync of a
// project, which starts itself again at that path.
export const RULE_FILES = [
  "scripts/sync-template.ts",
  "scripts/sync-template-common.ts",
  "scripts/sync-template-plan.ts",
  "scripts/sync-template-package.ts",
  "scripts/sync-template-apply.ts",
  "scripts/sync-template-finish.ts",
  "scripts/sync-template.mjs",
  "scripts/template-files.mjs",
];
// The commit to go back to, for an `apply` that an `apply` started.
export const SYNC_START = "TEMPLATE_SYNC_START";

export const CHECKS: Record<string, string[][]> = {
  // A template commit can change dependencies, so the lockfile can change.
  install: [["pnpm", "install", "--no-frozen-lockfile"]],
  check: [["pnpm", "run", "check"]],
  browser: [
    ["pnpm", "run", "test:browser:install"],
    ["pnpm", "run", "test:browser"],
  ],
  "live-start": [["pnpm", "run", "test:live-start"]],
};

export const USAGE = `Usage: pnpm run template:sync <command>
  plan                      List the new template commits.
  apply                     Cherry-pick them. Run it again after a conflict.
  skip <commit> <reason>    Leave one new commit out of the project.
  own <path> <reason>       Take a path over from the template, in a terminal.
  verify <${Object.keys(CHECKS).join("|")}>
  finish                    Check the owned files, then commit the lockfile and
                            the template version.`;

/** The lists of `scripts/template-paths.json` that a sync reads. */
export interface TemplatePaths {
  templateOnly: string[];
  example: string[];
  withExample: string[];
  projectOwned: string[];
  templateOwned?: string[];
}

/** What `apply` stopped at: the commit, its conflicts, and the start. */
export interface Stopped {
  commit: string;
  conflicts: string[];
  before?: string;
}

export interface PlanCommit {
  commit: string;
  subject: string;
  files: string[];
  action: "take" | "have" | "leave out" | "skipped";
  detail?: string | undefined;
  leftOutFiles?: string[];
}

export type LeftOut = (file: string) => boolean;

export interface Plan {
  version: VersionFile;
  remote: string;
  tip: string;
  commits: PlanCommit[];
  leftOut: LeftOut;
}

/** The output of a Git command that must succeed. */
export const read = (...args: string[]): string => git({ root, args }).stdout;
/** True when a Git command that tests a condition succeeds. */
export const holds = (...args: string[]): boolean =>
  git({ root, args, allowFailure: true }).status === 0;
/** The file names that a Git command prints. `-z` keeps a name as it is. */
export const list = (subcommand: string, ...args: string[]): string[] =>
  read(subcommand, "-z", ...args)
    .split("\0")
    .filter(Boolean);
export const short = (commit: string): string => commit.slice(0, 7);

/** Where `apply` records the commit that it stopped at, in the Git directory. */
export const stoppedFile = (): string =>
  path.resolve(root, read("rev-parse", "--git-path", "template-sync-stopped"));

export function readStopped(): Stopped | undefined {
  const file = stoppedFile();
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Stopped)
    : undefined;
}

/**
 * Tracked files that differ from the last commit. The version file is not in
 * this list, because `apply` writes its progress there, and `finish` commits
 * it.
 */
export const changedFiles = (): string[] =>
  list("diff", "--name-only", "HEAD").filter((file) => file !== VERSION_FILE);
export const unmergedFiles = (): string[] =>
  list("diff", "--name-only", "--diff-filter=U");

/** A version with the files that stopped `apply` at this commit, if any. */
export const withConflicts = ({
  version,
  commit,
  files,
}: {
  version: VersionFile;
  commit: string;
  files: string[];
}): VersionFile =>
  files.length > 0
    ? {
        ...version,
        conflicts: [...(version.conflicts ?? []), { commit, files }],
      }
    : version;
