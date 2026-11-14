// Takes the screenshots and measurements that the `ui-review` skill reads.
//
//   pnpm run ui:screens [--name <name>] [--route <route>]... [--ref <commit>]
//
// - Each `*.screens.ts` file in `frontend/src/features` lists the screens of
//   its feature, and seeds fake rows in the test backend first. The app runs
//   on the browser-test harness, so no real database is read.
// - `--route` takes only the screens of that route pattern, such as
//   `/notes/:noteId`. With no `--route`, it takes each screen.
// - `--ref` takes the screens of another commit, such as a baseline, in a
//   temporary worktree. That commit must have this script.
// - The files go to `frontend/.browser-test/screens/<name>/`. Git ignores
//   that directory. The default name is `current`, or the `--ref` with each
//   "/" as "-".
// - `--dry-run` prints the plan as JSON and runs nothing.
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkScreenCoverage } from "./ui-screens-coverage.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = "frontend/.browser-test/screens";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    route: { type: "string", multiple: true, default: [] },
    ref: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const name = values.name ?? values.ref?.replaceAll("/", "-") ?? "current";
if (!/^\w[\w.-]*$/.test(name)) {
  console.error(
    `The name "${name}" must start with a letter or a digit, and have only letters, digits, ".", "_", and "-".`,
  );
  process.exit(1);
}

const outputDirectory = path.join(root, SCREENS, name);
const request = { outputDirectory, routes: values.route };
const captureCommands = [
  ["pnpm", "--filter", "backend...", "run", "build"],
  [
    "pnpm",
    "--filter",
    "frontend",
    "exec",
    "playwright",
    "test",
    "-c",
    "playwright.screens.config.ts",
  ],
];

if (values["dry-run"]) {
  console.log(
    JSON.stringify(
      { request, ref: values.ref ?? null, capture: captureCommands },
      null,
      2,
    ),
  );
  process.exit(0);
}

// Throws, not exits, so that `finally` removes the temporary worktree.
function run(command: string[], cwd: string): void {
  const [program = ""] = command;
  const result = spawnSync(program, command.slice(1), {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Failed: ${command.join(" ")}`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });

try {
  await capture();
  await checkScreenCoverage(outputDirectory, values.route);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(`The screens are in ${path.relative(root, outputDirectory)}/`);

async function capture(): Promise<void> {
  if (values.ref) {
    const worktree = await mkdtemp(path.join(os.tmpdir(), "ui-screens-"));
    try {
      run(["git", "worktree", "add", "--detach", worktree, values.ref], root);
      run(["pnpm", "install", "--frozen-lockfile"], worktree);
      run(
        [
          "pnpm",
          "run",
          "ui:screens",
          "--name",
          name,
          ...values.route.flatMap((route) => ["--route", route]),
        ],
        worktree,
      );
      await mkdir(path.dirname(outputDirectory), { recursive: true });
      await cp(path.join(worktree, SCREENS, name), outputDirectory, {
        recursive: true,
      });
    } finally {
      spawnSync("git", ["worktree", "remove", "--force", worktree], {
        cwd: root,
      });
      await rm(worktree, { recursive: true, force: true });
    }
  } else {
    // `frontend/src/features/core/tests/browser/screens.ts` reads this file.
    await mkdir(path.join(root, SCREENS), { recursive: true });
    await writeFile(
      path.join(root, SCREENS, "request.json"),
      `${JSON.stringify(request, null, 2)}\n`,
    );
    for (const command of captureCommands) {
      run(command, root);
    }
  }
}
