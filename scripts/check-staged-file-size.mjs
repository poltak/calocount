// Stops a commit that makes a file larger than 5,000 tokens. An agent often
// reads a file whole, so a large file fills its context, and an agent that
// edits a large file makes more errors. The check counts 4 bytes for each
// token. This is near the count of a real tokenizer for code and English, and
// needs no dependency.
//
// lint-staged runs it in the pre-commit hook. It reads the staged content, not
// the working tree. It stops a file over the limit only when the commit adds
// the file or makes it larger. So a file that was over the limit before this
// check can get smaller, or move, and the commit continues.
//
// The check skips files that agents do not write: binary files, and each file
// that `.gitattributes` marks as `linguist-generated`, such as a lockfile or
// generated code. It also skips the commit that completes a merge, a
// cherry-pick, or a revert, because each change in it comes from a commit
// that exists already.
import { spawnSync } from "node:child_process";

const MAX_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;
const MAX_BYTES = MAX_TOKENS * BYTES_PER_TOKEN;
const REGULAR_FILE = /^100(644|755)$/;
const NO_OBJECT = /^0+$/;
// Git looks for a NUL byte in the start of a file to find a binary file.
const BINARY_TEST_BYTES = 8000;

function git(args, { input, allowFailure = false, encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, {
    encoding,
    input,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFailure) {
    console.error(String(result.stderr) || result.error?.message);
    process.exit(2);
  }
  return result;
}

const operation = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"].find(
  (ref) =>
    git(["rev-parse", "--quiet", "--verify", ref], { allowFailure: true })
      .status === 0,
);
if (operation) process.exit(0);

// Each entry of `--raw -z` is `:<old mode> <new mode> <old object> <new
// object> <status>`, then the path. A rename has the old path and the new
// path.
const fields = git([
  "diff",
  "--cached",
  "--raw",
  "-z",
  "--no-abbrev",
  "--find-renames",
  "--diff-filter=ACMRT",
]).stdout.split("\0");
const changes = [];
for (let index = 0; index < fields.length - 1;) {
  const [oldMode, newMode, oldObject, newObject, status] = fields[index]
    .slice(1)
    .split(" ");
  const pathCount = /^[RC]/.test(status) ? 2 : 1;
  const name = fields[index + pathCount];
  index += 1 + pathCount;
  if (!REGULAR_FILE.test(newMode)) continue;
  changes.push({
    name,
    newObject,
    oldObject:
      REGULAR_FILE.test(oldMode) && !NO_OBJECT.test(oldObject)
        ? oldObject
        : undefined,
  });
}

const objects = changes.flatMap((change) =>
  [change.oldObject, change.newObject].filter(Boolean),
);
const sizes = new Map(
  git(["cat-file", "--batch-check=%(objectname) %(objectsize)"], {
    input: objects.join("\n") + "\n",
  })
    .stdout.trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [object, size] = line.split(" ");
      return [object, Number(size)];
    }),
);

const grown = changes
  .map((change) => ({
    ...change,
    newSize: sizes.get(change.newObject),
    oldSize: change.oldObject ? sizes.get(change.oldObject) : undefined,
  }))
  .filter(
    ({ newSize, oldSize }) => newSize > MAX_BYTES && newSize > (oldSize ?? 0),
  );

// `--cached` reads `.gitattributes` from the index, so a staged change to it
// counts.
const attributes = grown.length
  ? git(["check-attr", "--cached", "-z", "--stdin", "linguist-generated"], {
      input: grown.map(({ name }) => `${name}\0`).join(""),
    }).stdout.split("\0")
  : [];
const generated = new Set();
for (let index = 0; index + 2 < attributes.length; index += 3) {
  if (["set", "true"].includes(attributes[index + 2])) {
    generated.add(attributes[index]);
  }
}

const tooLarge = grown.filter(({ name, newObject }) => {
  if (generated.has(name)) return false;
  const content = git(["cat-file", "blob", newObject], {
    encoding: "buffer",
  }).stdout;
  return !content.subarray(0, BINARY_TEST_BYTES).includes(0);
});

if (tooLarge.length > 0) {
  const tokens = (bytes) =>
    Math.ceil(bytes / BYTES_PER_TOKEN).toLocaleString("en");
  console.error(
    [
      `Each of these staged files is over ${MAX_TOKENS.toLocaleString("en")} tokens, and the commit makes it`,
      "larger, so the commit stopped. The check counts a token for each 4 bytes.",
      "",
      ...tooLarge.map(({ name, newSize, oldSize }) =>
        oldSize === undefined
          ? `  ${name}: ${tokens(newSize)} tokens, a new file`
          : `  ${name}: ${tokens(newSize)} tokens, ${(newSize - oldSize).toLocaleString("en")} bytes more than before`,
      ),
      "",
      "Split each file into files that are smaller than the limit, then stage them",
      "and commit again:",
      "",
      "1. Find the parts of the file that do different jobs. Examples: a class and",
      "   the helper functions that it uses, two groups of routes, the tests of two",
      "   behaviors, or two topics of a document.",
      "2. Move each part to a new file beside the old file. Give the new file a name",
      "   that says what it does.",
      "   - Code: follow the feature layout in docs/agents/code-architecture.md.",
      "     Import each function from the module that defines it. Do not add an",
      "     index file that re-exports other modules, and do not add a function",
      "     that only passes a call to another function.",
      "   - Tests: name each test file for the behavior that it tests, such as",
      "     `auth-logic-sign-up.test.ts`. Move the fixtures that two of the files",
      "     share to a module beside them.",
      "   - Documents: move a section to a new document, and put a link to it where",
      "     the section was. Add a new document in docs/agents/ to its README.md.",
      "3. Make the split in a commit of its own, before the change that made the",
      "   file grow. Move the text without changes, so that the diff shows only a",
      "   move.",
      "4. Run the checks of the files that you moved.",
      "",
      "A file can stay over the limit while a commit makes it smaller or keeps its",
      "size. Mark a file that a tool writes, such as a lockfile or generated code,",
      "with `linguist-generated` in .gitattributes, and the check skips it. Do not",
      "use `git commit --no-verify` to go around the check.",
    ].join("\n"),
  );
  process.exit(1);
}
