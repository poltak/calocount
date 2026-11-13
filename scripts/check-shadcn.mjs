import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { root: { type: "string" } } });
const root = path.resolve(
  values.root ?? fileURLToPath(new URL("..", import.meta.url)),
);
const uiDirectory = "src/features/core/ui/shadcn";
const repair =
  "Run pnpm exec shadcn add --cwd frontend --yes --overwrite <component>. Put a fork in core/ui/registry/, not shadcn/.";
const json = async (filename) => JSON.parse(await readFile(filename, "utf8"));

async function componentList(filename, optional = false) {
  const components = await json(path.join(root, filename)).catch((error) => {
    if (optional && error.code === "ENOENT") return [];
    throw error;
  });
  if (
    !Array.isArray(components) ||
    !components.every(
      (component) => typeof component === "string" && component.trim() !== "",
    )
  )
    throw new Error(`${filename} must be an array of registry names.`);
  return components;
}

async function files(directory, prefix = "") {
  const result = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      for (const [filename, content] of await files(
        path.join(directory, entry.name),
        relative,
      ))
        result.set(filename, content);
    } else if (entry.isFile()) {
      result.set(relative, await readFile(path.join(directory, entry.name)));
    } else {
      throw new Error(`Not a generated file: ${relative}`);
    }
  }
  return result;
}

async function check() {
  const project = await json(path.join(root, "package.json"));
  const pin = project.devDependencies?.shadcn;
  if (!/^\d+\.\d+\.\d+$/.test(pin ?? ""))
    throw new Error("Pin shadcn to an exact dev dependency in package.json.");
  const require = createRequire(path.join(root, "package.json"));
  const cli = require.resolve("shadcn");
  const installed = await json(
    path.resolve(path.dirname(cli), "../package.json"),
  );
  if (installed.version !== pin)
    throw new Error(
      `shadcn ${installed.version} does not match the pin ${pin}. Run pnpm install.`,
    );
  const frontend = path.join(root, "frontend");
  const config = await json(path.join(frontend, "components.json"));
  const components = [
    ...new Set([
      ...(await componentList("scripts/shadcn-components.json")),
      ...(await componentList("scripts/shadcn-components.project.json", true)),
    ]),
  ];
  const temporary = await mkdtemp(path.join(os.tmpdir(), "shadcn-check-"));
  try {
    const packageJson = await json(path.join(frontend, "package.json"));
    await writeFile(
      path.join(temporary, "package.json"),
      JSON.stringify(packageJson),
    );
    await writeFile(
      path.join(temporary, "components.json"),
      JSON.stringify(config),
    );
    await writeFile(
      path.join(temporary, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
    await symlink(
      path.join(frontend, "node_modules"),
      path.join(temporary, "node_modules"),
      "dir",
    );
    const css = path.join(temporary, config.tailwind.css);
    await mkdir(path.dirname(css), { recursive: true });
    await writeFile(
      css,
      await readFile(path.join(frontend, config.tailwind.css)),
    );
    const generation = spawnSync(
      process.execPath,
      [cli, "add", "--cwd", temporary, "--yes", "--overwrite", ...components],
      {
        cwd: temporary,
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (generation.status !== 0)
      throw new Error(
        `The pinned CLI failed.\n${generation.stderr || generation.stdout || generation.error?.message}`,
      );
    const generated = await files(path.join(temporary, uiDirectory));
    const actual = await files(path.join(frontend, uiDirectory));
    const differences = [...new Set([...generated.keys(), ...actual.keys()])]
      .filter(
        (filename) =>
          !generated
            .get(filename)
            ?.equals(actual.get(filename) ?? Buffer.alloc(0)),
      )
      .sort();
    if (differences.length)
      throw new Error(
        `Generated shadcn files differ:\n${differences.map((filename) => `  ${filename}`).join("\n")}\n${repair}`,
      );
    console.log(`Checked ${generated.size} shadcn files with CLI ${pin}.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

try {
  await check();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
