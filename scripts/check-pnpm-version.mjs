// Checks that the repository has the same pnpm version in each location.
//
// - `packageManager` in `package.json` is the version that the
//   `pnpm/action-setup` step reads.
// - `devEngines.packageManager` is the version that pnpm downloads and runs.
//   When it differs, people and CI run another version than the first field
//   names, and nothing reports it.
// - The `pnpm/action-setup` step of a CI workflow fails when its `version`
//   input differs from `packageManager`. No other check reads the workflow
//   files, so without this check only CI finds that difference.
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const WORKFLOWS = ".github/workflows";

const { packageManager, devEngines } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
// Without `packageManager`, the step uses its own input, and no version can
// differ.
const expected = packageManager?.match(/^pnpm@([^+]+)/)?.[1];

const different = [];
const engine = [devEngines?.packageManager]
  .flat()
  .find((entry) => entry?.name === "pnpm");
if (expected && engine?.version && engine.version !== expected) {
  different.push(
    `  package.json, devEngines.packageManager: ${engine.version}`,
  );
}
const files =
  expected && existsSync(path.join(root, WORKFLOWS))
    ? (await readdir(path.join(root, WORKFLOWS))).filter((file) =>
        /\.ya?ml$/.test(file),
      )
    : [];
for (const file of files.sort()) {
  const lines = (
    await readFile(path.join(root, WORKFLOWS, file), "utf8")
  ).split("\n");
  let inSetupStep = false;
  for (const [index, line] of lines.entries()) {
    if (/^\s*- /.test(line)) {
      inSetupStep = false;
    }
    if (/\buses:\s*pnpm\/action-setup@/.test(line)) {
      inSetupStep = true;
    }
    const version = line.match(/^\s*version:\s*["']?([^"'\s#]+)/)?.[1];
    if (inSetupStep && version && version !== expected) {
      different.push(`  ${WORKFLOWS}/${file}, line ${index + 1}: ${version}`);
    }
  }
}

if (different.length > 0) {
  console.error(
    `Each pnpm version must be ${expected}, the version in "packageManager" of package.json:\n${different.join("\n")}`,
  );
  process.exit(1);
}
