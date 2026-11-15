import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workflowsDirectory = path.join(repoRoot, "workflows");

// CI does not run Swamp, because each Swamp command needs an account. This
// test finds a workflow step whose command no longer exists.
test("each command of a Swamp workflow names a script that exists", async () => {
  const { scripts } = JSON.parse(
    await readFile(path.join(repoRoot, "package.json"), "utf8"),
  );
  const files = (await readdir(workflowsDirectory)).filter((file) =>
    /^workflow-.+\.yaml$/.test(file),
  );
  assert.ok(files.length > 0);

  for (const file of files) {
    const commands = [
      ...(await readFile(path.join(workflowsDirectory, file), "utf8")).matchAll(
        /^ +run: (.+)$/gm,
      ),
    ].map(([, command]) => command.split(" "));
    assert.ok(commands.length > 0, `${file} has no command`);

    for (const [tool, verb, ...rest] of commands) {
      const command = [tool, verb, ...rest].join(" ");
      assert.equal(tool, "pnpm", `${file}: ${command}`);
      if (verb === "run") {
        assert.ok(Object.hasOwn(scripts, rest[0]), `${file}: ${command}`);
      } else if (verb === "exec") {
        assert.equal(rest[0], "node", `${file}: ${command}`);
        assert.ok(
          existsSync(path.join(repoRoot, rest[1])),
          `${file}: ${command}`,
        );
      } else {
        assert.equal(verb, "install", `${file}: ${command}`);
      }
    }
  }
});
