import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = "scripts/check-pnpm-version.mjs";

const job = (version, index) => `  job-${index + 1}:
    steps:
      - name: Check out repository
        uses: actions/checkout@v7
        with:
          version: not-a-pnpm-version

      - name: Set up pnpm
        uses: pnpm/action-setup@v6
${version ? `        with:\n          version: ${version}\n` : ""}
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
`;

/** Run the check in a repository that has these CI jobs. */
async function check({ context, versions }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pnpm-version-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "scripts"));
  await mkdir(path.join(directory, ".github/workflows"), { recursive: true });
  await cp(
    path.join(scriptsDirectory, "check-pnpm-version.mjs"),
    path.join(directory, SCRIPT),
  );
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ packageManager: "pnpm@12.8.2" }),
  );
  await writeFile(
    path.join(directory, ".github/workflows/ci.yml"),
    `jobs:\n${versions.map(job).join("")}`,
  );
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: directory,
    encoding: "utf8",
  });
  return { status: result.status, output: result.stderr };
}

test("accepts CI jobs that have the pnpm version of package.json, or no version", async (context) => {
  const result = await check({
    context,
    versions: ["12.8.2", "12.8.2", undefined],
  });

  assert.equal(result.status, 0, result.output);
});

// A cherry-pick of a version update changed one job of three, with no
// conflict. Only CI found the two jobs that the update did not change.
test("names each CI job that has another pnpm version", async (context) => {
  const result = await check({
    context,
    versions: ["12.8.2", "12.6.0", "12.6.0"],
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.output,
    'Each pnpm version in a CI workflow must be 12.8.2, the version in "packageManager" of package.json:\n' +
      "  .github/workflows/ci.yml, line 26: 12.6.0\n" +
      "  .github/workflows/ci.yml, line 40: 12.6.0\n",
  );
});
