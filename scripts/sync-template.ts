// Takes the later commits of the template into a project that started from it.
//
//   pnpm run template:sync plan
//       Fetch the template. List each new commit, and what `apply` does to it.
//   pnpm run template:sync apply
//       Cherry-pick the new commits, oldest first. It stops at a conflict that
//       no rule resolves. Resolve the conflict, then run it again.
//   pnpm run template:sync skip <commit> <reason>
//       Leave one new commit out of the project, and record the reason.
//   pnpm run template:sync own <path> <reason>
//       Take a path over from the template. Each later sync leaves out each
//       template change to it. Only a person at a terminal can run this.
//   pnpm run template:sync verify <install|check|browser|live-start>
//       Run one check. It does nothing when the project took no commit.
//   pnpm run template:sync finish
//       Compare the template-owned files with the template, then commit the
//       lockfile and the new template version. It stops at a difference.
//
// Each command reads the state from Git and from `template-version.json`, so
// a command that stopped can run again. The `sync-template` workflow runs
// them in this order.
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import {
  VERSION_FILE,
  fail,
  git,
  isGate,
  matchesPath,
  writeVersionFile,
} from "./template-files.ts";
import {
  CHECKS,
  USAGE,
  changedFiles,
  list,
  read,
  readStopped,
  root,
  short,
  stoppedFile,
  withConflicts,
} from "./sync-template-common.ts";
import { loadPlan, requireApplied, showPlan } from "./sync-template-plan.ts";
import { apply } from "./sync-template-apply.ts";
import { finish } from "./sync-template-finish.ts";

async function skip({
  commitArgument,
  reason,
}: {
  commitArgument: string | undefined;
  reason: string;
}) {
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
      ...withConflicts({
        version: plan.version,
        commit: commit.commit,
        files: stopped?.conflicts ?? [],
      }),
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

async function own({
  entry,
  reason,
}: {
  entry: string | undefined;
  reason: string;
}) {
  if (!entry || !reason) {
    fail(USAGE);
  }
  // The edit guard does not see a shell command, so an agent that the guard
  // stopped could run this command to widen the list.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail(
      "`own` ends each later template change to a path, so only a person at a terminal can run it. An agent gives the person the command and the reason.",
    );
  }
  const plan = loadPlan({ fetch: false });
  const ownPaths = plan.version.ownPaths ?? [];
  if (isGate(entry)) {
    fail(
      `A project cannot take over ${entry}, because each project must get the template's fixes to its checks.`,
    );
  }
  if (ownPaths.some(({ path: kept }) => kept === entry)) {
    fail(`The project already keeps ${entry}.`);
  }
  const matching = new Set(
    [plan.tip, "HEAD"]
      .flatMap((commit) => list("ls-tree", "-r", "--name-only", commit))
      .filter((file) => matchesPath({ entry, file })),
  );
  if (matching.size === 0) {
    fail(
      `No file of the project or the template matches ${entry}. A directory ends with "/".`,
    );
  }

  console.log(
    `${entry} matches ${matching.size} ${matching.size === 1 ? "file" : "files"}. The project then gets no later template change to ${matching.size === 1 ? "it" : "them"}.`,
  );
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise<string>((resolve) => {
    prompt.once("close", () => resolve(""));
    prompt.question('Type "own" to continue: ', resolve);
  });
  prompt.close();
  if (answer.trim() !== "own") {
    fail("Nothing changed.");
  }

  await writeVersionFile({
    root,
    version: {
      ...plan.version,
      ownPaths: [...ownPaths, { path: entry, reason }],
    },
  });
  // A commit during a stop loses the state of each file that has a conflict.
  if (readStopped()) {
    console.log(
      "The version file has the new entry, and `finish` commits it. Run `apply` again.",
    );
    return;
  }
  read("add", "--", VERSION_FILE);
  git({
    root,
    args: ["commit", "--quiet", "--file=-", "--", VERSION_FILE],
    input: `Take ${entry} over from the template\n\n- The reason: ${reason}\n- A sync now leaves out each template change to it.\n`,
  });
  console.log(`The project now keeps ${entry}.`);
}

function verify(name: string | undefined) {
  const checks = name === undefined ? undefined : CHECKS[name];
  if (!checks || !Object.hasOwn(CHECKS, name ?? "")) {
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
  for (const [command = "", ...args] of checks) {
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
} else if (command === "own") {
  await own({ entry: rest[0], reason: rest.slice(1).join(" ").trim() });
} else if (command === "verify") {
  verify(rest[0]);
} else if (command === "finish") {
  await finish();
} else {
  fail(USAGE);
}
