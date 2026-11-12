// The fixture of the lint rule tests: each test file imports it.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const lintDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(lintDirectory, "..");
export const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

/** The repository's own rule options, so the tests cover the real configuration. */
async function projectRules() {
  const config = JSON.parse(
    await readFile(path.join(repoRoot, ".oxlintrc.json"), "utf8"),
  );
  return Object.fromEntries(
    Object.entries(config.rules).filter(([name]) =>
      /^(?:architecture|stack|testing)\//.test(name),
    ),
  );
}

/**
 * Lint fixture files with the project's architecture, stack, and testing rules.
 * Returns "<file>: <rule>" for every problem found.
 */
export async function lint(context, files, { plugins = lintDirectory } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-rules-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const configPath = path.join(directory, "oxlintrc.json");
  await writeFile(
    configPath,
    JSON.stringify({
      plugins: ["typescript"],
      categories: {},
      jsPlugins: [
        path.join(plugins, "architecture-plugin.mjs"),
        path.join(plugins, "stack-plugin.mjs"),
        path.join(plugins, "testing-plugin.mjs"),
      ],
      rules: await projectRules(),
    }),
  );

  let output;
  try {
    output = execFileSync(oxlint, ["-c", configPath, "-f", "json", "."], {
      cwd: directory,
      encoding: "utf8",
    });
  } catch (error) {
    output = error.stdout;
  }
  return JSON.parse(output)
    .diagnostics.filter((problem) =>
      /^(?:architecture|stack|testing)\(/.test(problem.code),
    )
    .map(
      (problem) =>
        `${path.relative(directory, path.resolve(directory, problem.filename))}: ${problem.code}`,
    )
    .sort();
}
