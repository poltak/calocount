// The last command of a sync: compare the owned files, and record the version.
import {
  PATHS_FILE,
  VERSION_FILE,
  fail,
  git,
  writeVersionFile,
} from "./template-files.mjs";
import {
  LOCKFILE,
  changedFiles,
  list,
  read,
  root,
  short,
} from "./sync-template-common.ts";
import type {
  Plan,
  PlanCommit,
  TemplatePaths,
} from "./sync-template-common.ts";
import { loadPlan, requireApplied } from "./sync-template-plan.ts";

/**
 * The template-owned files that differ from the template at the commit that
 * the sync reached. `apply` takes commits one by one, and the template merged
 * them in another order, so a file can end the sync with a text that no
 * conflict showed. The list is the project's `templateOwned`. `leftOut` is the
 * rule that `apply` uses, so a path in `ownPaths`, a file that only the
 * template needs, and a file of a removed example are not in the result.
 */
function differingOwnedFiles({
  plan,
}: {
  plan: Plan;
}): { file: string; problem: string }[] {
  const owned =
    (JSON.parse(read("show", `HEAD:${PATHS_FILE}`)) as TemplatePaths)
      .templateOwned ?? [];
  // With no path after `--`, `git diff` compares every file.
  if (owned.length === 0) {
    return [];
  }
  // HEAD is the old side of the diff, so `A` is a file that only the template
  // has. `--no-renames` gives a moved file as a `D` and an `A`, which the
  // messages below need.
  const problems: Record<string, string> = {
    A: "the project does not have it",
    D: "the template does not have it",
  };
  const fields = list(
    "diff",
    "--name-status",
    "--no-renames",
    "HEAD",
    plan.tip,
    "--",
    ...owned,
  );
  const differing: { file: string; problem: string }[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const [status = "", file = ""] = fields.slice(index, index + 2);
    if (!plan.leftOut(file)) {
      differing.push({ file, problem: problems[status] ?? "the file differs" });
    }
  }
  return differing;
}

export async function finish() {
  const plan = loadPlan({ fetch: false });
  requireApplied({ plan, command: "finish" });

  const changed = changedFiles();
  const other = changed.filter((file) => file !== LOCKFILE);
  if (other.length > 0) {
    fail(
      `Commit these changes, or discard them, before \`finish\`:\n  ${other.join("\n  ")}`,
    );
  }
  // A difference stops `finish`, as an unfinished `apply` and a change with no
  // commit do. A person who finds it after the push, as issue 96 reports, has
  // a project with a wrong file in its history. A person who accepts a
  // difference has a way to say so: `own` for the path, which the check then
  // leaves out. A warning would pass in the workflow, where no person reads it.
  const differing =
    plan.tip === plan.version.commit ? [] : differingOwnedFiles({ plan });
  if (differing.length > 0) {
    fail(
      `These template-owned files are not the same as the template at ${short(plan.tip)}:\n` +
        differing
          .map(({ file, problem }) => `  ${file} (${problem})`)
          .join("\n") +
        `\n\nThe cause can be the order of the template's merges, or a commit that the project skipped. ` +
        `\`git diff ${short(plan.tip)} -- <path>\` shows a difference. ` +
        `To take the template's file, run \`git checkout ${short(plan.tip)} -- <path>\` ` +
        `(\`git rm <path>\` for a file that the template does not have), commit it, and run \`finish\` again. ` +
        `To keep the project's file, ask the person to run \`pnpm run template:sync own <path> "<reason>"\`.`,
    );
  }
  if (changed.includes(LOCKFILE)) {
    read("add", "--", LOCKFILE);
    git({
      root,
      args: ["commit", "--quiet", "--file=-", "--", LOCKFILE],
      input:
        "Bring the lockfile up to date with the template\n\n- The template commits changed dependencies, and `pnpm install` wrote the lockfile again.\n",
    });
    console.log(`Committed ${LOCKFILE}.`);
  }

  if (plan.tip === plan.version.commit) {
    console.log("The project is up to date with the template.");
    return;
  }
  const labels: [PlanCommit["action"], string][] = [
    ["have", "New template commits in the project"],
    [
      "leave out",
      "Left out, because they change only files that the project is without",
    ],
    ["skipped", "Left out by a person"],
  ];
  const counts = labels
    .map(([wanted, label]) => ({
      label,
      count: plan.commits.filter(({ action }) => action === wanted).length,
    }))
    .filter(({ count }) => count > 0);
  const leftOutFiles = new Set(
    plan.commits.flatMap((commit) => commit.leftOutFiles ?? []),
  );
  if (leftOutFiles.size > 0) {
    counts.push({
      label: "Files left out of the commits that the project took",
      count: leftOutFiles.size,
    });
  }
  // The new version is past each commit in `unchanged` and `conflicts`, so
  // those lists end. A project's other fields stay, also a field that this
  // script does not know.
  const { unchanged, conflicts = [], ...version } = plan.version;
  await writeVersionFile({ root, version: { ...version, commit: plan.tip } });
  read("add", "--", VERSION_FILE);
  git({
    root,
    args: ["commit", "--quiet", "--file=-", "--", VERSION_FILE],
    input:
      `Record template version ${short(plan.tip)}\n\n` +
      `- The project has the template up to: ${read("log", "-1", "--format=%s", plan.tip)}\n` +
      counts.map(({ label, count }) => `- ${label}: ${count}\n`).join("") +
      conflicts
        .map(
          ({ commit, files }) =>
            `- Conflict at ${short(commit)}: ${files.join(", ")}\n`,
        )
        .join(""),
  });
  console.log(
    `The project has the template up to ${short(plan.tip)}. Push the branch when it is ready.`,
  );
}
