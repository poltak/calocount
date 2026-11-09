// Tells the agent and the person, at the start of a session, when the branch
// is behind `main` on its remote. Claude Code and Codex run it when a session
// starts:
//
//   node .agents/hooks/check-branch-is-current.mjs
//
// A branch that starts from an old `main` does not have the fixes that `main`
// got after that, and its pull request can conflict with them or undo them.
// The remote is the one that the branch tracks, else `origin`. A template
// branch in a project's repository tracks the template's remote, and must not
// compare with the project's `main`. The hook fetches `main` from the remote
// first. When the fetch fails, as it does with no network or with no such
// remote, the hook says nothing.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// A slow network must not hold up the start of the session.
const FETCH_TIMEOUT_MS = 15_000;

function readGit({ directory, args, env, timeout }) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env,
      timeout,
    }).trimEnd();
  } catch {
    return undefined;
  }
}

function readEvent() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

const event = readEvent();
const directory = typeof event.cwd === "string" ? event.cwd : process.cwd();
const branch = readGit({ directory, args: ["branch", "--show-current"] });
// "." is a branch that tracks another local branch.
const tracked =
  branch && readGit({ directory, args: ["config", `branch.${branch}.remote`] });
const remote = tracked && tracked !== "." ? tracked : "origin";

// A prompt for a password or a passphrase would wait in the agent's terminal
// until the timeout. Git and SSH fail at once instead. A person's own SSH
// command stays as it is.
const fetchEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
if (
  !fetchEnv.GIT_SSH_COMMAND &&
  !readGit({ directory, args: ["config", "core.sshCommand"] })
) {
  fetchEnv.GIT_SSH_COMMAND = "ssh -o BatchMode=yes";
}
const fetched = readGit({
  directory,
  args: ["fetch", "--quiet", remote, "main"],
  env: fetchEnv,
  timeout: FETCH_TIMEOUT_MS,
});
const behind = Number(
  fetched === undefined
    ? 0
    : readGit({
        directory,
        args: ["rev-list", "--count", `HEAD..${remote}/main`],
      }),
);

if (behind > 0) {
  const commits = behind === 1 ? "1 commit" : `${behind} commits`;
  const main = `\`${remote}/main\``;
  const message =
    branch === "main"
      ? `The local \`main\` is ${commits} behind ${main}. Run \`git pull --ff-only\` before you start the task, and start each new branch from ${main}.`
      : `The branch ${branch ? `\`${branch}\`` : "of this checkout"} is ${commits} behind ${main}. Merge ${main} into it before you open a pull request, and start each new branch from ${main}.`;
  console.log(
    JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: message,
      },
    }),
  );
}
