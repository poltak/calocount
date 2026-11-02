// What the scripts for the template share: the lists of its files that a
// project is without, and the file that records where a project is in the
// template's history.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VERSION_FILE = "template-version.json";

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
 * - `projectOwned`: files that a project writes for itself. A new file here
 *   reaches an existing project one time, and the project then owns it.
 * - `templateOwned`: files that a project takes from the template and does
 *   not change. `.agents/hooks/guard-template-owned-files.mjs` and
 *   `check-template-owned-files.mjs` read this list from the project. A sync
 *   does not read it.
 *
 * A sync leaves out each template change to a `templateOnly` path that the
 * project is without, and each change to a `projectOwned` path, except a file
 * that is new since the project's last sync and that the project is without.
 * When the project is without the example, a sync also leaves out each change
 * to an `example` or `withExample` path.
 *
 * A sync reads the lists from the newest template commit, not from the
 * project. A template commit that adds a file and its entry here therefore
 * keeps that file out of each project. Add the entry in the commit that adds
 * the file, and do not remove an entry of the four lists that a sync reads.
 */
export const PATHS_FILE = "scripts/template-paths.json";

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function matchesPath({ entry, file }) {
  return entry.endsWith("/") ? file.startsWith(entry) : file === entry;
}

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
    !Array.isArray(version.unchanged ?? [])
  ) {
    fail(
      `${VERSION_FILE} must have "template" (a URL), "commit" (a full commit ID), and "skipped" (a list).`,
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
