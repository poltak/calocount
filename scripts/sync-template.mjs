// Takes the later commits of the template into a project that started from it.
//
//   pnpm run template:sync plan
//       Fetch the template. List each new commit, and what `apply` does to it.
//   pnpm run template:sync apply
//       Cherry-pick the new commits, oldest first. It stops at a conflict that
//       no rule resolves. Resolve the conflict, then run it again.
//   pnpm run template:sync skip <commit> <reason>
//       Leave one new commit out of the project, and record the reason.
//   pnpm run template:sync verify <install|check|browser|live-start>
//       Run one check. It does nothing when the project took no commit.
//   pnpm run template:sync finish
//       Commit the lockfile and the new template version.
//
// Each command reads the state from Git and from `template-version.json`, so
// a command that stopped can run again. The `sync-template` workflow runs
// them in this order.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  PATHS_FILE,
  VERSION_FILE,
  fail,
  formatted,
  git,
  matchesPath,
  readVersionFile,
  sameRepository,
  writeVersionFile,
} from "./template-files.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATE_BRANCH = "main";
const LOCKFILE = "pnpm-lock.yaml";
const MIGRATIONS_DIRECTORY = "backend/src/features/core/database/migrations/";
const MIGRATION_LIST = "backend/src/features/core/database/migrations.ts";
const MIGRATION_SCRIPT = "scripts/create-migration.mjs";
const CONFLICT_MARKER = /^(?:<{7}|>{7}) /m;

const CHECKS = {
  // A template commit can change dependencies, so the lockfile can change.
  install: [["pnpm", "install", "--no-frozen-lockfile"]],
  check: [["pnpm", "run", "check"]],
  browser: [
    ["pnpm", "run", "test:browser:install"],
    ["pnpm", "run", "test:browser"],
  ],
  "live-start": [["pnpm", "run", "test:live-start"]],
};

const USAGE = `Usage: pnpm run template:sync <command>
  plan                      List the new template commits.
  apply                     Cherry-pick them. Run it again after a conflict.
  skip <commit> <reason>    Leave one new commit out of the project.
  verify <${Object.keys(CHECKS).join("|")}>
  finish                    Commit the lockfile and the template version.`;

/** The output of a Git command that must succeed. */
const read = (...args) => git({ root, args }).stdout;
/** True when a Git command that tests a condition succeeds. */
const holds = (...args) => git({ root, args, allowFailure: true }).status === 0;
/** The file names that a Git command prints. `-z` keeps a name as it is. */
const list = (subcommand, ...args) =>
  read(subcommand, "-z", ...args)
    .split("\0")
    .filter(Boolean);
const short = (commit) => commit.slice(0, 7);

/** Where `apply` records the commit that it stopped at, in the Git directory. */
const stoppedFile = () =>
  path.resolve(root, read("rev-parse", "--git-path", "template-sync-stopped"));

function readStopped() {
  const file = stoppedFile();
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

/**
 * Tracked files that differ from the last commit. The version file is not in
 * this list, because `apply` writes its progress there, and `finish` commits
 * it.
 */
const changedFiles = () =>
  list("diff", "--name-only", "HEAD").filter((file) => file !== VERSION_FILE);
const unmergedFiles = () => list("diff", "--name-only", "--diff-filter=U");

/**
 * The template commits that are new for this project, oldest first, each with
 * what `apply` does to it:
 *
 * - `take`: cherry-pick it.
 * - `have`: the project has the change already.
 * - `leave out`: it changes only files that the project is without.
 * - `skipped`: a person left it out, with a reason in the version file.
 */
function loadPlan({ fetch }) {
  const version = readVersionFile({ root });
  if (!version) {
    fail(
      `This repository has no ${VERSION_FILE}, so it is not a project that started from the template.`,
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
  const pickedAs = new Map();
  for (const entry of read(
    "log",
    "--format=%H%n%B%x00",
    "--grep=cherry picked from commit",
    "HEAD",
  ).split("\0")) {
    const [commit, ...message] = entry.trim().split("\n");
    for (const [, source] of message
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
  const paths = JSON.parse(pathsFile.stdout);
  const projectFiles = list("ls-tree", "-r", "--name-only", "HEAD");
  const projectHas = (entry) =>
    projectFiles.some((file) => matchesPath({ entry, file }));
  const entryFor = ({ entries, file }) =>
    entries.find((entry) => matchesPath({ entry, file }));

  // The directories of the example show if the project has the example. The
  // file itself cannot show it. A file that the template adds for the
  // example, such as a new migration, is in no project before the sync.
  const hasExample = paths.example.some(projectHas);

  const leftOut = (file) => {
    if (entryFor({ entries: paths.projectOwned, file })) {
      return true;
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
    .map((commit) => {
      const message = read("log", "-1", "--format=%B", commit);
      const subject = message.split("\n")[0];
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
        .map(([, name]) => name)
        .find((name) => holds("merge-base", "--is-ancestor", name, "HEAD"));
      if (pickedAs.has(commit)) {
        return {
          ...base,
          action: "have",
          detail: `commit ${short(pickedAs.get(commit))} of this project`,
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
      return { ...base, action: "take" };
    });

  return { version, remote, tip, commits, leftOut };
}

function requireApplied({ plan, command }) {
  const stopped = readStopped();
  const next = plan.commits.find(({ action }) => action === "take");
  if (stopped || next) {
    fail(
      `\`${command}\` runs after \`apply\` took each commit. ${
        stopped
          ? `\`apply\` stopped at ${short(stopped.commit)}.`
          : `${short(next.commit)} is not applied.`
      } Run \`apply\` first.`,
    );
  }
}

function showPlan() {
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

/**
 * Give a file the content that it has in the project's last commit. When that
 * commit does not have the file, remove the file.
 */
function restoreFromHead(file) {
  if (holds("cat-file", "-e", `HEAD:${file}`)) {
    read("checkout", "HEAD", "--", file);
  } else {
    read("rm", "--force", "--quiet", "--ignore-unmatch", "--", file);
  }
}

/**
 * Merge two changed versions of a JSON object, key by key. Git merges a
 * `package.json` by its lines. A template commit that changes a version, and
 * a project that added a dependency on the next line, then conflict. By keys,
 * the two changes are to different keys, and they do not conflict.
 *
 * Returns the paths of the keys that both sides changed to different values.
 */
function mergeJson({ base, ours, theirs, at = [] }) {
  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const keys = Object.keys(ours);
  for (const key of Object.keys(theirs)) {
    if (keys.includes(key)) {
      continue;
    }
    // A new key goes after the key that it follows in the template's file.
    const before = Object.keys(theirs)
      .slice(0, Object.keys(theirs).indexOf(key))
      .findLast((candidate) => keys.includes(candidate));
    keys.splice(before === undefined ? 0 : keys.indexOf(before) + 1, 0, key);
  }

  const merged = {};
  const conflicts = [];
  for (const key of keys) {
    const sides = { base, ours, theirs };
    const same = (left, right) =>
      Object.hasOwn(sides[left] ?? {}, key) ===
        Object.hasOwn(sides[right] ?? {}, key) &&
      isDeepStrictEqual(sides[left]?.[key], sides[right]?.[key]);

    let from = "ours";
    if (!same("ours", "theirs")) {
      if (same("base", "ours")) {
        from = "theirs";
      } else if (!same("base", "theirs")) {
        if (isObject(ours[key]) && isObject(theirs[key])) {
          const inner = mergeJson({
            base: isObject(base?.[key]) ? base[key] : {},
            ours: ours[key],
            theirs: theirs[key],
            at: [...at, key],
          });
          merged[key] = inner.merged;
          conflicts.push(...inner.conflicts);
          continue;
        }
        conflicts.push([...at, key].join("."));
      }
    }
    if (Object.hasOwn(sides[from], key)) {
      merged[key] = sides[from][key];
    }
  }

  // pnpm keeps each list of dependencies in order. An object whose keys were
  // in order stays in order.
  const isOrdered = (names) =>
    names.every((name, index) => index === 0 || names[index - 1] < name);
  if (isOrdered(Object.keys(ours)) && !isOrdered(Object.keys(merged))) {
    return {
      merged: Object.fromEntries(
        Object.entries(merged).sort(([left], [right]) =>
          left < right ? -1 : 1,
        ),
      ),
      conflicts,
    };
  }
  return { merged, conflicts };
}

/**
 * Resolve a `package.json` that Git could not merge. Returns the keys that
 * need a person, or `undefined` when a merge by keys is not possible.
 */
async function mergePackageJson(file) {
  const versions = [1, 2, 3].map((stage) => {
    const { status, stdout } = git({
      root,
      args: ["show", `:${stage}:${file}`],
      allowFailure: true,
    });
    try {
      return status === 0 ? JSON.parse(stdout) : undefined;
    } catch {
      return undefined;
    }
  });
  if (versions.includes(undefined)) {
    // One side deleted the file, or one version is not JSON.
    return undefined;
  }
  const [base, ours, theirs] = versions;
  const { merged, conflicts } = mergeJson({ base, ours, theirs });
  if (conflicts.length > 0) {
    return conflicts;
  }

  const target = path.join(root, file);
  writeFileSync(
    target,
    await formatted({
      file: target,
      text: `${JSON.stringify(merged, null, 2)}\n`,
    }),
  );
  read("add", "--", file);
  return [];
}

/**
 * Bring the cherry-pick that is in the working tree to a commit. The rules
 * here resolve what needs no decision. Anything else stops the command, for a
 * person or an agent to resolve.
 */
async function settle({ commit, leftOut, stopped }) {
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
    const section = (title, lines) =>
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
  if (holds("diff", "--cached", "--quiet", "HEAD")) {
    // No commit names this template commit, so the version file does, until
    // `finish` moves the version past it. A `git reset` that goes back to
    // before the sync also removes this record.
    const version = readVersionFile({ root });
    await writeVersionFile({
      root,
      version: {
        ...version,
        unchanged: [...(version.unchanged ?? []), commit.commit],
      },
    });
    return undefined;
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

async function apply() {
  let plan = loadPlan({ fetch: false });
  const stopped = readStopped();
  if (!stopped && changedFiles().length > 0) {
    fail(
      `The working tree has changes. Commit them, or discard them, before \`apply\`:\n  ${changedFiles().join("\n  ")}`,
    );
  }
  // A run that stops and continues is one sync, with one commit to go back to.
  const before = stopped?.before ?? read("rev-parse", "HEAD");
  const report = ({ commit, made }) =>
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
    plan = loadPlan({ fetch: false });
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
    report({
      commit,
      made: await settle({ commit, leftOut: plan.leftOut, stopped: progress }),
    });
  }

  console.log(
    before === read("rev-parse", "HEAD")
      ? "No template commit to take."
      : `To undo each commit of this sync: git reset --hard ${short(before)}`,
  );
}

async function skip({ commitArgument, reason }) {
  if (!commitArgument || !reason) {
    fail(USAGE);
  }
  const plan = loadPlan({ fetch: false });
  const resolved = git({
    root,
    args: ["rev-parse", "--verify", "--quiet", `${commitArgument}^{commit}`],
    allowFailure: true,
  }).stdout;
  const commit = plan.commits.find((entry) => entry.commit === resolved);
  if (commit?.action !== "take") {
    fail(
      `${commitArgument} is not a template commit that \`apply\` takes. \`plan\` lists them.`,
    );
  }

  const stopped = readStopped();
  if (stopped && stopped.commit !== commit.commit) {
    fail(
      `\`apply\` stopped at ${short(stopped.commit)}. Resolve that commit, or skip it, first.`,
    );
  }
  if (stopped) {
    // Each change in the working tree is from the cherry-pick of this commit.
    read("reset", "--quiet", "--hard", "HEAD");
    rmSync(stoppedFile(), { force: true });
  } else if (changedFiles().length > 0) {
    fail("The working tree has changes. Commit them, or discard them, first.");
  }

  await writeVersionFile({
    root,
    version: {
      ...plan.version,
      skipped: [
        ...plan.version.skipped,
        { commit: commit.commit, subject: commit.subject, reason },
      ],
    },
  });
  read("add", "--", VERSION_FILE);
  git({
    root,
    args: ["commit", "--quiet", "--file=-", "--", VERSION_FILE],
    input: `Leave template commit ${short(commit.commit)} out of the project\n\n- The template commit: ${commit.subject}\n- The reason: ${reason}\n`,
  });
  console.log(`Left out ${short(commit.commit)}  ${commit.subject}`);
}

function verify(name) {
  if (!Object.hasOwn(CHECKS, name ?? "")) {
    fail(USAGE);
  }
  const plan = loadPlan({ fetch: false });
  requireApplied({ plan, command: "verify" });
  if (!plan.commits.some(({ action }) => action === "have")) {
    console.log(
      "The project took no template commit, so this check does not run.",
    );
    return;
  }
  for (const [command, ...args] of CHECKS[name]) {
    console.log(`$ ${command} ${args.join(" ")}`);
    const { status, error } = spawnSync(command, args, {
      cwd: root,
      stdio: "inherit",
    });
    if (error) {
      fail(`Could not run ${command}: ${error.message}`);
    }
    if (status !== 0) {
      process.exit(status ?? 1);
    }
  }
}

async function finish() {
  const plan = loadPlan({ fetch: false });
  requireApplied({ plan, command: "finish" });

  const changed = changedFiles();
  const other = changed.filter((file) => file !== LOCKFILE);
  if (other.length > 0) {
    fail(
      `Commit these changes, or discard them, before \`finish\`:\n  ${other.join("\n  ")}`,
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
  const counts = [
    ["have", "New template commits in the project"],
    [
      "leave out",
      "Left out, because they change only files that the project is without",
    ],
    ["skipped", "Left out by a person"],
  ]
    .map(([wanted, label]) => ({
      label,
      count: plan.commits.filter(({ action }) => action === wanted).length,
    }))
    .filter(({ count }) => count > 0);
  // The new version is past each commit in `unchanged`, so that list ends. A
  // project's other fields stay, also a field that this script does not know.
  const { unchanged, ...version } = plan.version;
  await writeVersionFile({ root, version: { ...version, commit: plan.tip } });
  read("add", "--", VERSION_FILE);
  git({
    root,
    args: ["commit", "--quiet", "--file=-", "--", VERSION_FILE],
    input:
      `Record template version ${short(plan.tip)}\n\n` +
      `- The project has the template up to: ${read("log", "-1", "--format=%s", plan.tip)}\n` +
      counts.map(({ label, count }) => `- ${label}: ${count}\n`).join(""),
  });
  console.log(
    `The project has the template up to ${short(plan.tip)}. Push the branch when it is ready.`,
  );
}

const [command, ...rest] = process.argv.slice(2);
if (command === "plan") {
  showPlan();
} else if (command === "apply") {
  await apply();
} else if (command === "skip") {
  await skip({
    commitArgument: rest[0],
    reason: rest.slice(1).join(" ").trim(),
  });
} else if (command === "verify") {
  verify(rest[0]);
} else if (command === "finish") {
  await finish();
} else {
  fail(USAGE);
}
