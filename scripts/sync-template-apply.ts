// The commands that take template commits into the project.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERSION_FILE,
  fail,
  git,
  readVersionFile,
  writeVersionFile,
} from "./template-files.mjs";
import {
  CONFLICT_MARKER,
  LOCKFILE,
  MIGRATIONS_DIRECTORY,
  MIGRATION_LIST,
  MIGRATION_SCRIPT,
  RULE_FILES,
  SYNC_START,
  changedFiles,
  holds,
  list,
  read,
  readStopped,
  root,
  short,
  stoppedFile,
  unmergedFiles,
  withConflicts,
} from "./sync-template-common.ts";
import type { LeftOut, PlanCommit, Stopped } from "./sync-template-common.ts";
import { loadPlan } from "./sync-template-plan.ts";
import { mergePackageJson } from "./sync-template-package.ts";

/**
 * Give a file the content that it has in the project's last commit. When that
 * commit does not have the file, remove the file.
 */
function restoreFromHead(file: string) {
  if (holds("cat-file", "-e", `HEAD:${file}`)) {
    read("checkout", "HEAD", "--", file);
  } else {
    read("rm", "--force", "--quiet", "--ignore-unmatch", "--", file);
  }
}

/**
 * Bring the cherry-pick that is in the working tree to a commit. The rules
 * here resolve what needs no decision. Anything else stops the command, for a
 * person or an agent to resolve.
 */
async function settle({
  commit,
  leftOut,
  stopped,
}: {
  commit: PlanCommit;
  leftOut: LeftOut;
  stopped: Stopped;
}): Promise<string | undefined> {
  for (const file of commit.files.filter(leftOut)) {
    restoreFromHead(file);
  }

  const keyConflicts = [];
  for (const file of unmergedFiles()) {
    if (file === LOCKFILE || file === MIGRATION_LIST) {
      // A tool writes each of these files from other files. `verify install`
      // brings the lockfile up to date, and the migration script writes the
      // list below.
      restoreFromHead(file);
      if (file === LOCKFILE) {
        console.log(
          `      ${short(commit.commit)} changes ${LOCKFILE}, and the change does not apply to this project's lockfile. The project keeps its own lockfile, so its indirect dependencies do not change.`,
        );
      }
    } else if (path.basename(file) === "package.json") {
      for (const key of (await mergePackageJson(file)) ?? []) {
        keyConflicts.push(`${file}: ${key}`);
      }
    }
  }
  if (
    existsSync(path.join(root, MIGRATION_SCRIPT)) &&
    !leftOut(MIGRATION_LIST) &&
    commit.files.some(
      (file) =>
        file.startsWith(MIGRATIONS_DIRECTORY) || file === MIGRATION_LIST,
    )
  ) {
    const made = spawnSync(process.execPath, [MIGRATION_SCRIPT, "--sync"], {
      cwd: root,
      encoding: "utf8",
    });
    if (made.status !== 0) {
      fail(`Could not write ${MIGRATION_LIST} again:\n${made.stderr}`);
    }
    read("add", "--", MIGRATION_LIST);
  }

  const unmerged = unmergedFiles();
  const unstaged = list("diff", "--name-only").filter(
    (file) => !unmerged.includes(file) && file !== VERSION_FILE,
  );
  const withMarkers = stopped.conflicts.filter(
    (file) =>
      !unmerged.includes(file) &&
      CONFLICT_MARKER.test(
        git({ root, args: ["show", `:${file}`], allowFailure: true }).stdout,
      ),
  );
  if (unmerged.length + unstaged.length + withMarkers.length > 0) {
    writeFileSync(
      stoppedFile(),
      JSON.stringify({
        ...stopped,
        conflicts: [...new Set([...stopped.conflicts, ...unmerged])],
      }),
    );
    const section = (title: string, lines: string[]) =>
      lines.length > 0
        ? `\n${title}\n${lines.map((line) => `  ${line}`).join("\n")}\n`
        : "";
    fail(
      `Stopped at template commit ${short(commit.commit)}: ${commit.subject}\n` +
        section(
          "These files have a conflict that no rule resolves:",
          unmerged,
        ) +
        section(
          "Both sides changed these keys to different values:",
          keyConflicts,
        ) +
        section("These files still have conflict markers:", withMarkers) +
        section("These files have changes that are not staged:", unstaged) +
        `\nResolve each conflict in favor of the project's own code, and then apply\n` +
        `what the template commit intended. \`git show ${short(commit.commit)}\` shows the commit.\n` +
        `Stage each file with \`git add\`. Then run \`apply\` again.\n\n` +
        `To leave this commit out of the project:\n` +
        `  pnpm run template:sync skip ${short(commit.commit)} "<reason>"`,
    );
  }

  rmSync(stoppedFile(), { force: true });
  // `finish` reports these. Until then the version file keeps them, as it does
  // `unchanged`, so a `git reset` to before the sync also removes this record.
  const version = withConflicts({
    version:
      readVersionFile({ root }) ??
      fail(`This repository has no ${VERSION_FILE}.`),
    commit: commit.commit,
    files: stopped.conflicts,
  });
  if (holds("diff", "--cached", "--quiet", "HEAD")) {
    // No commit names this template commit, so the version file does, until
    // `finish` moves the version past it.
    await writeVersionFile({
      root,
      version: {
        ...version,
        unchanged: [...(version.unchanged ?? []), commit.commit],
      },
    });
    return undefined;
  }
  if (stopped.conflicts.length > 0) {
    await writeVersionFile({ root, version });
  }
  const [name, email, date] = read(
    "log",
    "-1",
    "--format=%an%x00%ae%x00%aI",
    commit.commit,
  ).split("\0");
  // `git cherry-pick` runs no pre-commit hook, so this commit runs none.
  git({
    root,
    args: [
      "commit",
      "--quiet",
      "--no-verify",
      `--author=${name} <${email}>`,
      `--date=${date}`,
      "--file=-",
    ],
    input: `${read("log", "-1", "--format=%B", commit.commit)}\n\n(cherry picked from commit ${commit.commit})\n`,
  });
  return read("rev-parse", "HEAD");
}

export async function apply() {
  const stopped = readStopped();
  // A run that stops and continues is one sync, with one commit to go back to.
  const before =
    stopped?.before ?? process.env[SYNC_START] ?? read("rev-parse", "HEAD");
  let plan = loadPlan({ fetch: false, before });
  if (!stopped && changedFiles().length > 0) {
    fail(
      `The working tree has changes. Commit them, or discard them, before \`apply\`:\n  ${changedFiles().join("\n  ")}`,
    );
  }
  const report = ({
    commit,
    made,
  }: {
    commit: PlanCommit;
    made: string | undefined;
  }) =>
    console.log(
      made
        ? `took  ${short(commit.commit)}  ${commit.subject}  (now ${short(made)})`
        : `have  ${short(commit.commit)}  ${commit.subject}  (it changed nothing)`,
    );

  if (stopped) {
    const commit = plan.commits.find(
      (entry) => entry.commit === stopped.commit,
    );
    if (!commit) {
      fail(
        `\`apply\` stopped at ${short(stopped.commit)}, which is not a new template commit. If that stop has no use now, delete ${path.relative(root, stoppedFile())}.`,
      );
    }
    report({
      commit,
      made: await settle({ commit, leftOut: plan.leftOut, stopped }),
    });
    plan = loadPlan({ fetch: false, before });
  }

  for (const commit of plan.commits.filter(({ action }) => action === "take")) {
    const progress = { commit: commit.commit, conflicts: [], before };
    // The script writes this file before the cherry-pick. If the command ends
    // at this point, the next run reads there which commit is in the working
    // tree.
    writeFileSync(stoppedFile(), JSON.stringify(progress));
    const picked = git({
      root,
      args: ["cherry-pick", "--no-commit", commit.commit],
      allowFailure: true,
    });
    if (picked.status !== 0 && unmergedFiles().length === 0) {
      rmSync(stoppedFile(), { force: true });
      fail(`Could not cherry-pick ${short(commit.commit)}:\n${picked.stderr}`);
    }
    const made = await settle({
      commit,
      leftOut: plan.leftOut,
      stopped: progress,
    });
    report({ commit, made });
    if (made && commit.files.some((file) => RULE_FILES.includes(file))) {
      // The plan of each later commit must come from the new rules.
      const { status } = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL("./sync-template.ts", import.meta.url)),
          "apply",
        ],
        {
          cwd: root,
          stdio: "inherit",
          env: { ...process.env, [SYNC_START]: before },
        },
      );
      process.exit(status ?? 1);
    }
  }

  console.log(
    before === read("rev-parse", "HEAD")
      ? "No template commit to take."
      : `To undo each commit of this sync: git reset --hard ${short(before)}`,
  );
}
