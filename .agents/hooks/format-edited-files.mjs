import { execFileSync } from "node:child_process";
import { access, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EDIT_TOOLS = new Set(["Edit", "Write"]);

export function extractTargetPaths(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  const toolInput = event.tool_input;
  if (!toolInput || typeof toolInput !== "object") {
    return [];
  }

  if (
    EDIT_TOOLS.has(event.tool_name) &&
    typeof toolInput.file_path === "string"
  ) {
    return [toolInput.file_path];
  }

  if (
    event.tool_name === "apply_patch" &&
    typeof toolInput.command === "string"
  ) {
    return parsePatchTargetPaths(toolInput.command);
  }

  return [];
}

export function parsePatchTargetPaths(patchText) {
  const paths = [];
  let currentFile;

  const addCurrentFile = () => {
    if (currentFile && currentFile.operation !== "Delete") {
      paths.push(currentFile.moveTo ?? currentFile.path);
    }
    currentFile = undefined;
  };

  for (const line of patchText.split(/\r?\n/)) {
    const fileHeader = line.match(/^\*\*\* (Add|Update|Delete) File: (.*)$/);
    if (fileHeader) {
      addCurrentFile();
      currentFile = {
        operation: fileHeader[1],
        path: fileHeader[2],
      };
      continue;
    }

    if (line === "*** End Patch") {
      addCurrentFile();
      break;
    }

    const moveHeader = line.match(/^\*\*\* Move to: (.*)$/);
    if (currentFile && moveHeader) {
      currentFile.moveTo = moveHeader[1];
    }
  }

  addCurrentFile();
  return [...new Set(paths.filter((filePath) => filePath.length > 0))];
}

export async function resolveGitRoot(startPath) {
  if (typeof startPath !== "string" || startPath.length === 0) {
    throw new Error("A repository path is required to run the format hook.");
  }

  const output = execFileSync(
    "git",
    ["-C", path.resolve(startPath), "rev-parse", "--show-toplevel"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const gitRoot = output.replace(/[\r\n]+$/, "");
  return realpath(gitRoot);
}

function isWithinRoot(root, candidate) {
  const relativePath = path.relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

export async function resolveSafeFiles(
  candidatePaths,
  { repoRoot, cwd = repoRoot },
) {
  const root = await realpath(repoRoot);
  const workingDirectory = path.resolve(cwd);
  const safeFiles = [];

  for (const candidatePath of candidatePaths) {
    if (typeof candidatePath !== "string" || candidatePath.length === 0) {
      continue;
    }

    try {
      const targetPath = await realpath(
        path.resolve(workingDirectory, candidatePath),
      );
      if (
        !isWithinRoot(root, targetPath) ||
        !(await stat(targetPath)).isFile()
      ) {
        continue;
      }
      safeFiles.push(targetPath);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        continue;
      }
      throw error;
    }
  }

  return [...new Set(safeFiles)];
}

async function existingIgnoreFiles(repoRoot) {
  const ignoreFiles = [".gitignore", ".prettierignore"];
  const existingFiles = [];

  for (const fileName of ignoreFiles) {
    const filePath = path.join(repoRoot, fileName);
    try {
      await access(filePath);
      existingFiles.push(filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return existingFiles;
}

export async function formatChangedFiles(
  candidatePaths,
  { repoRoot, cwd = repoRoot },
) {
  if (candidatePaths.length === 0) {
    return [];
  }

  const root = await resolveGitRoot(repoRoot);
  const files = await resolveSafeFiles(candidatePaths, {
    repoRoot: root,
    cwd,
  });
  if (files.length === 0) {
    return [];
  }

  const prettier = await import("prettier");
  const ignorePath = await existingIgnoreFiles(root);
  const formattedFiles = [];
  const errors = [];

  for (const filePath of files) {
    try {
      const fileInfo = await prettier.getFileInfo(filePath, {
        ignorePath,
        withNodeModules: false,
      });
      if (fileInfo.ignored || fileInfo.inferredParser === null) {
        continue;
      }

      const originalText = await readFile(filePath, "utf8");
      const config = await prettier.resolveConfig(filePath);
      const formattedText = await prettier.format(originalText, {
        ...config,
        filepath: filePath,
      });

      if (formattedText !== originalText) {
        await writeFile(filePath, formattedText, "utf8");
        formattedFiles.push(filePath);
      }
    } catch (error) {
      errors.push(`${filePath}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Prettier could not format changed file(s):\n${errors.join("\n")}`,
    );
  }

  return formattedFiles;
}

async function readHookInput() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

async function main() {
  const input = await readHookInput();
  if (!input) {
    return;
  }

  const event = JSON.parse(input);
  const candidatePaths = extractTargetPaths(event);
  if (candidatePaths.length === 0) {
    return;
  }

  const repoRoot = process.argv[2];
  if (!repoRoot) {
    throw new Error("The format hook did not receive the repository root.");
  }

  await formatChangedFiles(candidatePaths, {
    repoRoot,
    cwd: typeof event.cwd === "string" ? event.cwd : repoRoot,
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(`[format-hook] ${error.message}`);
    process.exitCode = 1;
  });
}
