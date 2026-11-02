// What the scripts for the template share: the lists of its files that a
// project is without, and the file that records where a project is in the
// template's history.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VERSION_FILE = "template-version.json";
// `ownPaths` turns off the two checks for a file, so the checks also cover this
// list of files. In a project, an agent or a pull request changes them only
// with a person's approval.
export const GUARDED_FILES = [VERSION_FILE];

/**
 * The file with five lists of paths. A path that ends with `/` is a
 * directory.
 *
 * - `templateOnly`: files that only the template needs. `start-project`
 *   removes them from a new project.
 * - `example`: the directories of the notes example. A project has the
 *   example while it has a file in one of them.
 * - `withExample`: other files that a project needs only while it has the
 *   example. These are the migrations of the example, and the skill that
 *   removes the example.
 * - `projectOwned`: files that a project writes for itself.
 * - `templateOwned`: files that a project takes from the template and does
 *   not change, unless the project's `ownPaths` names them.
 *   `.agents/hooks/guard-template-owned-files.mjs` and
 *   `check-template-owned-files.mjs` read this list from the project. A sync
 *   does not read it.
 *
 * A sync leaves out each template change to a `templateOnly` path that the
 * project is without, and each change to a `projectOwned` path. When the
 * project is without the example, a sync also leaves out each change to an
 * `example` or `withExample` path. It also leaves out each change to a path
 * in `ownPaths` of the project's version file.
 *
 * A sync reads the lists from the newest template commit, not from the
 * project. A template commit that adds a file and its entry here therefore
 * keeps that file out of each project. Add the entry in the commit that adds
 * the file, and do not remove an entry of the four lists that a sync reads.
 */
export const PATHS_FILE = "scripts/template-paths.json";

// The checks that keep a project on the template. A fix to one of them must
// reach each project, so `ownPaths` cannot name them.
const GATE_PATHS = [
  "scripts/sync-template.mjs",
  "scripts/template-files.mjs",
  PATHS_FILE,
  "scripts/check-staged-secrets.mjs",
  "scripts/check-template-owned-files.mjs",
  ".github/workflows/template-owned-files.yml",
  ".agents/hooks/",
];

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function matchesPath({ entry, file }) {
  return entry.endsWith("/") ? file.startsWith(entry) : file === entry;
}

/** True for a gate, and for a directory that has a gate in it. */
export const isGate = (entry) =>
  GATE_PATHS.some(
    (gate) =>
      matchesPath({ entry: gate, file: entry }) ||
      matchesPath({ entry, file: gate }),
  );

/** True for a file that the project took over from the template. */
export const isProjectPath = ({ ownPaths = [], file }) =>
  !isGate(file) &&
  ownPaths.some(({ path: entry }) => matchesPath({ entry, file }));

/**
 * Run Git in the repository. A command that fails stops the script, unless
 * the caller reads the status itself with `allowFailure`.
 */
export function git({ root, args, input, allowFailure = false }) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) {
    fail(`Could not run git: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    fail(`git ${args.join(" ")} failed:\n${result.stderr.trim()}`);
  }
  return {
    status: result.status,
    stdout: result.stdout.trimEnd(),
    stderr: result.stderr.trimEnd(),
  };
}

/** `git@host:owner/name.git` and `https://host/owner/name` are one repository. */
export function sameRepository({ left, right }) {
  const normalize = (url) =>
    url
      .trim()
      .replace(/^[a-z+]+:\/\//i, "")
      .replace(/^[^@/]+@/, "")
      .replace(":", "/")
      .replace(/\/+$/, "")
      .replace(/\.git$/, "")
      .toLowerCase();
  return normalize(left) === normalize(right);
}

/**
 * The version file of a project. Returns `undefined` in a repository that is
 * not a project, such as the template.
 *
 * - `template`: the URL of the template repository.
 * - `commit`: the project has each template commit up to this one, or left
 *   it out.
 * - `skipped`: the commits that a person left out, each with a reason. An
 *   entry stays after `commit` moves past it, as a record of the decision.
 * - `unchanged`: later commits that changed nothing in the project. Only a
 *   sync that is not finished has this list.
 * - `ownPaths`: the paths that the project took over from the template, each
 *   with a `path` and a `reason`. A path that ends with `/` is a directory.
 */
export function readVersionFile({ root }) {
  const file = path.join(root, VERSION_FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  const version = JSON.parse(readFileSync(file, "utf8"));
  if (
    typeof version.template !== "string" ||
    !/^[0-9a-f]{40}$/.test(version.commit ?? "") ||
    !Array.isArray(version.skipped) ||
    !Array.isArray(version.unchanged ?? []) ||
    !Array.isArray(version.ownPaths ?? []) ||
    !(version.ownPaths ?? []).every(
      (entry) =>
        typeof entry?.path === "string" &&
        typeof entry.reason === "string" &&
        entry.reason.trim() !== "",
    )
  ) {
    fail(
      `${VERSION_FILE} must have "template" (a URL), "commit" (a full commit ID), and "skipped" (a list). "ownPaths" is optional, and each of its entries must have a "path" and a "reason".`,
    );
  }
  return version;
}

export async function writeVersionFile({ root, version }) {
  const file = path.join(root, VERSION_FILE);
  writeFileSync(
    file,
    await formatted({ file, text: `${JSON.stringify(version, null, 2)}\n` }),
  );
}

/**
 * A text in the format that the format check requires. The text stays as it
 * is for a file that Prettier does not format, and when Prettier is absent,
 * as it is before the first `pnpm install`.
 */
export async function formatted({ file, text }) {
  const prettier = await import("prettier").catch(() => undefined);
  if (!prettier || !(await prettier.getFileInfo(file)).inferredParser) {
    return text;
  }
  return prettier.format(text, {
    ...(await prettier.resolveConfig(file)),
    filepath: file,
  });
}
