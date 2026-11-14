// The plan of a sync: the new template commits, and what `apply` does to each.
import {
  PATHS_FILE,
  VERSION_FILE,
  fail,
  git,
  isGate,
  isProjectPath,
  matchesPath,
  readVersionFile,
  sameRepository,
} from "./template-files.ts";
import {
  TEMPLATE_BRANCH,
  holds,
  list,
  read,
  readStopped,
  root,
  short,
} from "./sync-template-common.ts";
import type {
  Plan,
  PlanCommit,
  TemplatePaths,
} from "./sync-template-common.ts";

/**
 * The template commits that are new for this project, oldest first, each with
 * what `apply` does to it:
 *
 * - `take`: cherry-pick it.
 * - `have`: the project has the change already.
 * - `leave out`: it changes only files that the project is without.
 * - `skipped`: a person left it out, with a reason in the version file.
 */
const entryFor = ({ entries, file }: { entries: string[]; file: string }) =>
  entries.find((entry) => matchesPath({ entry, file }));

export function loadPlan({
  fetch,
  before = readStopped()?.before ?? "HEAD",
}: {
  fetch: boolean;
  before?: string;
}): Plan {
  const version = readVersionFile({ root });
  if (!version) {
    fail(
      `This repository has no ${VERSION_FILE}, so it is not a project that started from the template.`,
    );
  }
  const gates = (version.ownPaths ?? [])
    .map((entry) => entry.path)
    .filter(isGate);
  if (gates.length > 0) {
    fail(
      `"ownPaths" in ${VERSION_FILE} names ${gates.join(", ")}. Each project must get the template's fixes to these paths, so remove the entries.`,
    );
  }

  let remote = read("remote")
    .split("\n")
    .filter(Boolean)
    .find((name) =>
      sameRepository({
        left: read("remote", "get-url", name),
        right: version.template,
      }),
    );
  if (!remote && fetch) {
    // Git does not copy remotes into a clone. A clone of the project has
    // `origin`, and no remote for the template.
    read("remote", "add", "template", version.template);
    remote = "template";
  }
  if (!remote) {
    fail("No remote has the template's URL. Run `plan` first.");
  }
  if (fetch) {
    read("fetch", "--quiet", remote);
  }

  const tipRef = `refs/remotes/${remote}/${TEMPLATE_BRANCH}`;
  if (!holds("rev-parse", "--verify", "--quiet", `${tipRef}^{commit}`)) {
    fail(
      `The remote "${remote}" has no "${TEMPLATE_BRANCH}" branch here. Run \`plan\` first.`,
    );
  }
  const tip = read("rev-parse", tipRef);
  if (!holds("merge-base", "--is-ancestor", version.commit, tip)) {
    fail(
      `${VERSION_FILE} names commit ${short(version.commit)}, which is not in the "${TEMPLATE_BRANCH}" branch of the template.`,
    );
  }

  // A cherry-pick with `-x` names its source in the message. The project's
  // commits name template commits, and a template commit names a project
  // commit when the change went the other way.
  const pickedAs = new Map<string, string>();
  for (const entry of read(
    "log",
    "--format=%H%n%B%x00",
    "--grep=cherry picked from commit",
    "HEAD",
  ).split("\0")) {
    const [commit = "", ...message] = entry.trim().split("\n");
    for (const [, source = ""] of message
      .join("\n")
      .matchAll(/^\(cherry picked from commit ([0-9a-f]{40})\)$/gm)) {
      pickedAs.set(source, commit);
    }
  }
  // `git cherry` marks a commit with `-` when the project has a commit with
  // the same patch. This finds a change that a person copied without `-x`.
  const samePatch = new Set(
    read("cherry", "HEAD", tip, version.commit)
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2)),
  );

  // The lists are the template's newest ones, not the project's. A template
  // commit can add a file and its entry in the list, and the project's own
  // list does not have that entry when `apply` takes the commit.
  const pathsFile = git({
    root,
    args: ["show", `${tip}:${PATHS_FILE}`],
    allowFailure: true,
  });
  if (pathsFile.status !== 0) {
    fail(`The template has no ${PATHS_FILE} at commit ${short(tip)}.`);
  }
  const paths = JSON.parse(pathsFile.stdout) as TemplatePaths;
  // The files at the start of the sync. After a stop, HEAD also has the files
  // that this sync gave the project, and a later commit must still reach them.
  const projectFiles = list("ls-tree", "-r", "--name-only", before);
  const lastTemplateFiles = list(
    "ls-tree",
    "-r",
    "--name-only",
    version.commit,
  );
  const projectHas = (entry: string) =>
    projectFiles.some((file) => matchesPath({ entry, file }));

  // The directories of the example show if the project has the example. The
  // file itself cannot show it. A file that the template adds for the
  // example, such as a new migration, is in no project before the sync.
  const hasExample = paths.example.some(projectHas);

  const leftOut = (file: string): boolean => {
    if (isProjectPath({ ownPaths: version.ownPaths, file })) {
      return true;
    }
    if (entryFor({ entries: paths.projectOwned, file })) {
      // A file that is new in the template reaches a project that is without
      // it, because an owned file can depend on it. A file that the template
      // had at the last sync, and the project is without, is one that the
      // project deleted.
      return projectFiles.includes(file) || lastTemplateFiles.includes(file);
    }
    const templateOnly = entryFor({ entries: paths.templateOnly, file });
    if (templateOnly) {
      return !projectHas(templateOnly);
    }
    return (
      !hasExample &&
      entryFor({
        entries: [...paths.example, ...paths.withExample],
        file,
      }) !== undefined
    );
  };

  const commits = read(
    "rev-list",
    "--reverse",
    "--topo-order",
    "--no-merges",
    `${version.commit}..${tip}`,
  )
    .split("\n")
    .filter(Boolean)
    .map((commit): PlanCommit => {
      const message = read("log", "-1", "--format=%B", commit);
      const subject = message.split("\n")[0] ?? "";
      const files = list(
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "--no-renames",
        "-r",
        commit,
      );
      const base = { commit, subject, files };

      const source = [
        ...message.matchAll(/^\(cherry picked from commit ([0-9a-f]{40})\)$/gm),
      ]
        .map((match) => match[1] ?? "")
        .find((name) => holds("merge-base", "--is-ancestor", name, "HEAD"));
      const pickedCommit = pickedAs.get(commit);
      if (pickedCommit !== undefined) {
        const taken = list(
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "--no-renames",
          "-r",
          pickedCommit,
        );
        return {
          ...base,
          action: "have",
          detail: `commit ${short(pickedCommit)} of this project`,
          leftOutFiles: files.filter((file) => !taken.includes(file)),
        };
      }
      if (source) {
        return {
          ...base,
          action: "have",
          detail: `it came from commit ${short(source)} of this project`,
        };
      }
      if (
        samePatch.has(commit) ||
        holds("merge-base", "--is-ancestor", commit, "HEAD")
      ) {
        return { ...base, action: "have", detail: "the same change" };
      }
      if (version.unchanged?.includes(commit)) {
        return {
          ...base,
          action: "have",
          detail: "it changes nothing in this project",
        };
      }
      const skipped = version.skipped.find((entry) => entry.commit === commit);
      if (skipped) {
        return { ...base, action: "skipped", detail: skipped.reason };
      }
      if (files.every(leftOut)) {
        return {
          ...base,
          action: "leave out",
          detail:
            files.length > 0
              ? `it changes only ${files.join(", ")}`
              : "it changes no file",
        };
      }
      // A commit that also changes other files gets no `leave out` line, so a
      // person needs this list to see what the project does not get.
      const leftOutFiles = files.filter(leftOut);
      return {
        ...base,
        action: "take",
        leftOutFiles,
        detail:
          leftOutFiles.length > 0
            ? `the project does not get ${leftOutFiles.join(", ")}`
            : undefined,
      };
    });

  return { version, remote, tip, commits, leftOut };
}

export function requireApplied({
  plan,
  command,
}: {
  plan: Plan;
  command: string;
}) {
  const stopped = readStopped();
  const next = plan.commits.find(({ action }) => action === "take");
  if (stopped || next) {
    fail(
      `\`${command}\` runs after \`apply\` took each commit. ${
        stopped
          ? `\`apply\` stopped at ${short(stopped.commit)}.`
          : `${short(next?.commit ?? "")} is not applied.`
      } Run \`apply\` first.`,
    );
  }
}

export function showPlan() {
  const plan = loadPlan({ fetch: true });
  console.log(
    `Template: ${plan.version.template} (remote "${plan.remote}", branch "${TEMPLATE_BRANCH}")`,
  );
  console.log(
    `Last template commit that this project has: ${short(plan.version.commit)} ${read("log", "-1", "--format=%s", plan.version.commit)}`,
  );
  if (plan.commits.length === 0 && plan.tip === plan.version.commit) {
    console.log("The project is up to date with the template.");
    return;
  }
  console.log(`\nNew template commits: ${plan.commits.length}\n`);
  for (const { commit, subject, action, detail } of plan.commits) {
    console.log(
      `  ${action.padEnd(9)}  ${short(commit)}  ${subject}${detail ? `\n${" ".repeat(22)}(${detail})` : ""}`,
    );
  }
  const stopped = readStopped();
  if (stopped) {
    console.log(
      `\n\`apply\` stopped at ${short(stopped.commit)}. Resolve its conflict, then run \`apply\` again.`,
    );
  }
  if (plan.commits.some(({ action }) => action === "take")) {
    console.log(
      '\nTo leave a "take" commit out: pnpm run template:sync skip <commit> "<reason>"',
    );
  }
}
