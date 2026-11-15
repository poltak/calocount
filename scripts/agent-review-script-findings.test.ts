import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { commitAll, repository } from "./agent-review-fixtures.ts";
import type { Finding } from "./agent-review-types.ts";

async function findingsOf(
  context: TestContext,
  {
    before = {},
    after,
  }: { before?: Record<string, string>; after: Record<string, string> },
): Promise<Finding[]> {
  const repo = await repository(context);
  const write = async (files: Record<string, string>) => {
    for (const [file, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(repo.directory, file)), {
        recursive: true,
      });
      await writeFile(path.join(repo.directory, file), text);
    }
  };
  await write(before);
  const base = commitAll(repo.directory, "Before");
  await write(after);
  const head = commitAll(repo.directory, "After");
  await writeFile(
    path.join(repo.directory, "run.ts"),
    `import { scriptFindings } from "./scripts/agent-review-script-findings.ts";
console.log(JSON.stringify(scriptFindings({ base: "${base}", head: "${head}" })));
`,
  );
  const result = spawnSync(process.execPath, ["run.ts"], {
    cwd: repo.directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return (JSON.parse(result.stdout) as Finding[]).filter(
    (finding) => finding.rule !== "new-document",
  );
}

const doc = "docs/agents/notes.md";
const lines = (...text: string[]) => `${text.join("\n")}\n`;

test("a changed decision file gives one finding at its first added line", async (context) => {
  const found = await findingsOf(context, {
    before: { "lint.project.json": '{\n  "a": 1\n}\n' },
    after: { "lint.project.json": '{\n  "a": 1,\n  "b": 2\n}\n' },
  });
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, "decision-change");
  assert.equal(found[0]?.file, "lint.project.json");
  assert.equal(found[0]?.line, 2);
  assert.equal(found[0]?.quote, '"a": 1,');
  assert.deepEqual(found[0]?.models, ["script"]);
  assert.doesNotMatch(found[0]?.explanation ?? "", /only removes/);
});

test("a change of reversals.md that only deletes lines quotes the first line", async (context) => {
  const file = "docs/agents/project/reversals.md";
  const found = await findingsOf(context, {
    before: { [file]: lines("# Reversals", "", "- One", "- Two") },
    after: { [file]: lines("# Reversals", "", "- One") },
  });
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, "decision-change");
  assert.equal(found[0]?.line, 1);
  assert.equal(found[0]?.quote, "# Reversals");
  assert.match(found[0]?.explanation ?? "", /where the project reverses/);
  assert.match(found[0]?.explanation ?? "", /The change only removes lines\.$/);
});

test("a run of checklist items gives one finding", async (context) => {
  const found = await findingsOf(context, {
    before: { [doc]: lines("# Notes") },
    after: {
      [doc]: lines(
        "# Notes",
        "",
        "- [ ] Add the table",
        "- [x] Move it",
        "",
        "* [ ] Later",
      ),
    },
  });
  assert.deepEqual(
    found.map(({ rule, line, quote }) => ({ rule, line, quote })),
    [
      { rule: "plan-in-docs", line: 3, quote: "- [ ] Add the table" },
      { rule: "plan-in-docs", line: 6, quote: "* [ ] Later" },
    ],
  );
});

test("headings that name a plan and a dated status give findings", async (context) => {
  const found = await findingsOf(context, {
    before: { [doc]: lines("# Notes") },
    after: {
      [doc]: lines(
        "# Notes",
        "## Phase 2",
        "## Next steps",
        "## The phases of the work",
        "## Phases",
        "## TODO",
        "## Roadmap",
        "As built on 2026-10-20 the table exists.",
      ),
    },
  });
  assert.deepEqual(
    found.map(({ quote }) => quote),
    [
      "## Phase 2",
      "## Next steps",
      "## Phases",
      "## TODO",
      "## Roadmap",
      "As built on 2026-10-20 the table exists.",
    ],
  );
});

test("a plan line in a fenced code block gives no finding", async (context) => {
  const found = await findingsOf(context, {
    before: { [doc]: lines("# Notes") },
    after: {
      [doc]: lines(
        "# Notes",
        "```md",
        "- [ ] Add the table",
        "## Next steps",
        "```",
        "~~~",
        "As built on 2026-10-20",
        "~~~",
      ),
    },
  });
  assert.deepEqual(found, []);
});

test("a plan line that the file had before the pull request gives no finding", async (context) => {
  const found = await findingsOf(context, {
    before: { [doc]: lines("# Notes", "- [ ] Add the table", "## Next steps") },
    after: {
      [doc]: lines(
        "# Notes",
        "- [ ] Add the table",
        "## Next steps",
        "More text.",
      ),
    },
  });
  assert.deepEqual(found, []);
});
