// The checks before a pull request, as AGENTS.md ("Checks") requires them:
//
//   pnpm run pr:ready [merge|check|browser|report|all]
//
// With no step, it runs all four in order. `swamp workflow run pr-ready` runs
// the same steps. `merge` merges origin/main, `check` runs `pnpm run check`,
// `browser` runs `pnpm run test:browser` when a changed file matches
// `browserRules`, and `report` prints the results for the PR description.
// The results are kept for one commit only, in the Git directory, so a new
// commit makes `report` fail until the checks run again.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fail, git } from "./template-files.ts";

const root = process.cwd();
const command = (...args: string[]) => git({ root, args });
interface BrowserResult {
  status: "passed" | "not-needed";
  files: string[];
}

interface CheckRecord {
  head: string;
  checks: {
    check?: { status: "passed" } | null;
    browser?: BrowserResult | null;
  };
}

export const browserRules: {
  reason: string;
  test: (file: string) => boolean;
}[] = [
  {
    reason: "the entry point",
    test: (file: string) => file === "frontend/src/main.tsx",
  },
  {
    reason: "the build and the test setup",
    test: (file: string) =>
      [
        "frontend/vite.config.ts",
        "frontend/playwright.config.ts",
        "frontend/package.json",
      ].includes(file),
  },
  {
    reason: "routing",
    test: (file: string) => file === "frontend/src/features/core/ui/routes.tsx",
  },
  {
    reason: "an error boundary",
    test: (file: string) =>
      path.posix.basename(file).includes("error-boundary"),
  },
  {
    reason: "a feature with black box tests",
    test: (file: string) => {
      const feature = file.match(/^frontend\/src\/features\/([^/]+)\//)?.[1];
      return Boolean(
        feature &&
        !/\.test\.tsx?$/.test(file) &&
        existsSync(
          path.join(root, "frontend/src/features", feature, "black-box-tests"),
        ),
      );
    },
  },
  {
    reason: "browser tests",
    test: (file: string) =>
      file.startsWith("frontend/src/features/core/tests/browser/"),
  },
  {
    reason: "styles",
    test: (file: string) =>
      file.startsWith("frontend/src/") && file.endsWith(".css"),
  },
];
const clean = () => {
  if (command("status", "--porcelain").stdout) {
    fail("Commit the changes first. The working tree is not clean.");
  }
};
const head = () => command("rev-parse", "HEAD").stdout;
const containsMain = () =>
  git({
    root,
    args: ["merge-base", "--is-ancestor", "origin/main", "HEAD"],
    allowFailure: true,
  }).status === 0;
const resolveMessage =
  "Resolve the files, run git add on them, then git commit --no-edit. Run the merge step again.";
function record<Name extends keyof CheckRecord["checks"]>(
  name: Name,
  result: CheckRecord["checks"][Name],
) {
  const file = command("rev-parse", "--git-path", "pr-ready.json").stdout;
  let value: CheckRecord = { head: head(), checks: {} };
  if (existsSync(file)) {
    const previous = JSON.parse(readFileSync(file, "utf8")) as CheckRecord;
    if (previous.head === value.head) {
      value = previous;
    }
  }
  value.checks[name] = result;
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
function run(args: string[]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    fail(`pnpm ${args.join(" ")} failed.`);
  }
}
function merge() {
  const branch = command("branch", "--show-current").stdout;
  if (!branch || branch === "main") {
    fail("Use a feature branch. HEAD must not be detached or on main.");
  }
  if (
    git({
      root,
      args: ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
      allowFailure: true,
    }).status === 0
  ) {
    fail(resolveMessage);
  }
  clean();
  command("fetch", "origin", "main");
  if (containsMain()) {
    console.log("The branch has origin/main already.");
    return;
  }
  const result = git({
    root,
    args: ["merge", "--no-edit", "origin/main"],
    allowFailure: true,
  });
  if (result.status !== 0) {
    fail(
      `${result.stderr}\n${command("diff", "--name-only", "--diff-filter=U").stdout}\n${resolveMessage}`,
    );
  }
  console.log(result.stdout);
}
function check() {
  clean();
  // A failed run must not leave the pass of an earlier run in the record.
  record("check", null);
  run(["run", "check"]);
  record("check", { status: "passed" });
}
function browser() {
  clean();
  record("browser", null);
  const files = command("diff", "--name-only", "origin/main...HEAD")
    .stdout.split("\n")
    .filter(Boolean);
  const matched = new Set<string>();
  for (const rule of browserRules) {
    const matches = files.filter(rule.test);
    if (matches.length) {
      console.log(`${rule.reason}: ${matches.slice(0, 5).join(", ")}`);
      matches.forEach((file) => matched.add(file));
    }
  }
  if (!matched.size) {
    console.log("No change matches the browser test rules.");
  } else {
    run(["run", "test:browser"]);
  }
  record("browser", {
    status: matched.size ? "passed" : "not-needed",
    files: [...matched],
  });
}
function report() {
  clean();
  if (!containsMain()) {
    fail("Run the merge step first. The branch does not contain origin/main.");
  }
  const file = command("rev-parse", "--git-path", "pr-ready.json").stdout;
  if (!existsSync(file)) {
    fail("Run check and browser first. No check record exists.");
  }
  const value = JSON.parse(readFileSync(file, "utf8")) as CheckRecord;
  if (value.head !== head()) {
    fail("HEAD changed. Run check and browser again.");
  }
  if (!value.checks.check || !value.checks.browser) {
    fail("Run check and browser first.");
  }
  const result = value.checks.browser;
  const files =
    result.files.slice(0, 5).join(", ") +
    (result.files.length > 5 ? ` and ${result.files.length - 5} more` : "");
  console.log(
    `Checks at ${head().slice(0, 12)}, after a merge of origin/main (${command("rev-parse", "origin/main").stdout.slice(0, 12)}):\n- \`pnpm run check\`: passed\n- \`pnpm run test:browser\`: ${result.status === "passed" ? `passed (${files})` : "not needed (no change matches the rules in scripts/pr-ready.ts)"}`,
  );
}
const steps: Record<string, () => void> = { merge, check, browser, report };
const step = process.argv[2] ?? "all";
if (step === "all") {
  Object.values(steps).forEach((runStep) => runStep());
} else if (steps[step]) {
  steps[step]?.();
} else {
  fail("Use merge, check, browser, report, or all.");
}
