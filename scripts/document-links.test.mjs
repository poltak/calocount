import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** The text of a document without code, which can show a link as an example. */
const withoutCode = (text) =>
  text.replace(/^```[\s\S]*?^```$/gm, "").replace(/`[^`\n]*`/g, "");

/** The anchors of a document, in the way that GitHub makes them. */
const anchorsOf = (text) =>
  [...text.replace(/^```[\s\S]*?^```$/gm, "").matchAll(/^#+ +(.+)$/gm)].map(
    ([, heading]) =>
      heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .replaceAll(" ", "-"),
  );

test("each relative link in a document names a file and a heading that exist", () => {
  const documents = execFileSync("git", ["ls-files", "*.md"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  assert.ok(documents.includes("docs/agents/README.md"));

  const broken = [];
  for (const document of documents) {
    const file = path.join(repoRoot, document);
    const text = readFileSync(file, "utf8");
    for (const [, link] of withoutCode(text).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/.test(link)) {
        continue;
      }
      const [target, anchor] = link.split("#");
      const targetFile = target
        ? path.resolve(path.dirname(file), target)
        : file;
      if (!existsSync(targetFile)) {
        broken.push(`${document}: ${link}`);
      } else if (
        anchor &&
        targetFile.endsWith(".md") &&
        !anchorsOf(readFileSync(targetFile, "utf8")).includes(anchor)
      ) {
        broken.push(`${document}: ${link}`);
      }
    }
  }

  assert.deepEqual(broken, []);
});
