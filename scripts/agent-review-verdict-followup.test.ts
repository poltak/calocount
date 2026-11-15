import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  ISSUE_URL,
  LINE_COMMENTS,
  MASTER_GET,
  MASTER_PATCH,
  MASTER_URL,
  NOT_SET_UP,
  OVERRIDE,
  PULL,
  SUMMARY_POST,
  SUMMARY_URL,
  commitAll,
  earlierOf,
  editsAnswer,
  finding,
  inputOf,
  issue,
  job,
  masterComment,
  note,
  payloadOf,
  repository,
  run,
  stateIn,
} from "./agent-review-fixtures.ts";

const link = (id: string) =>
  `\\[${id}\\]\\(${ISSUE_URL}agent-review-${id.toLowerCase()}\\)`;

test("verdict follows up the issues of the master comment, posts a summary, and edits the master comment", async (context) => {
  const repo = await repository(context);
  const master = masterComment({
    issues: [
      issue("F1", {
        rule: "override",
        file: "docs/agents/plan.md",
        quote: OVERRIDE,
      }),
      issue("F2", {
        rule: "stale-document",
        file: "docs/agents/setup.md",
        quote: "Text that a later commit deleted.",
      }),
      issue("F3", {
        rule: "stale-document",
        file: "docs/agents/setup.md",
        quote: "Run `pnpm run db:reset`",
      }),
      issue("F4", {
        rule: "new-document",
        file: "docs/agents/plan.md",
        line: 1,
        quote: "# The plan",
        models: ["script"],
      }),
      issue("N1", { file: "docs/agents/setup.md", line: 1, quote: "# Setup" }),
      issue("N2", {
        file: "docs/agents/setup.md",
        quote: "for a new database.",
        status: "fixed",
        fixedIn: 1,
        reason: "The quoted text is not in the file now.",
      }),
    ],
  });
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    answers: {
      [`GET ${PULL}`]: { head: { sha: repo.head } },
      [MASTER_GET]: master,
      "POST graphql": editsAnswer(),
      [SUMMARY_POST]: { id: 124, html_url: SUMMARY_URL, node_id: "IC_124" },
      [`GET ${LINE_COMMENTS}`]: [],
    },
    env: {
      MODE: "review",
      EARLIER_REVIEW: earlierOf(master),
      CLAUDE_JOB: job(
        [],
        [
          note({
            file: "docs/agents/plan.md",
            quote: "# The plan",
            explanation: "A new note. It has two sentences.",
          }),
        ],
        [
          { id: "F1", status: "open", explanation: "The sentence is there." },
          { id: "F3", status: "addressed", explanation: "The setup changed." },
          { id: "N1", status: "open", explanation: "It is still wrong." },
        ],
        "4 turns, $0.40 at API prices",
      ),
      CODEX_JOB: job(
        [
          finding({
            rule: "decision-change",
            file: "docs/agents/setup.md",
            quote: "for a new database.",
          }),
        ],
        [note({ quote: "a new database." })],
        [
          { id: "F3", status: "addressed", explanation: "It is correct now." },
          { id: "N1", status: "addressed", explanation: "It is fixed." },
        ],
      ),
    },
  });

  assert.equal(result.status, 1, result.output);
  const summary = inputOf(result, SUMMARY_POST).body;
  const head7 = repo.head.slice(0, 7);
  assert.match(
    summary,
    new RegExp(
      `^<!-- agent-review-summary head=${repo.head} review=2 -->\n### Agent review 2, of ${head7}: the check fails\n\n3 open rule violations and 3 open other issues\\. The \\[master comment\\]\\(${MASTER_URL}\\) of the agent review has each issue\\.\n\nThe models read each change of the pull request, because no earlier review has a commit that each model read\\.\n\n`,
    ),
  );
  assert.match(
    summary,
    new RegExp(
      [
        "\\*\\*Addressed: 2\\*\\*",
        "",
        `- ${link("F2")} stale-document in \\[\`docs/agents/setup\\.md:3\`\\]\\(https://github\\.com/acme/project/blob/abc1234def/docs/agents/setup\\.md#L3\\) at commit abc1234: The quoted text is not in the file now\\.`,
        `- ${link("F3")} stale-document in [^\n]*: Each model that checked it says that it is addressed\\.`,
        "",
        "\\*\\*New: 2\\*\\*",
        "",
        `- ${link("F5")} decision-change in \\[\`docs/agents/setup\\.md:3\`\\]\\([^)]*/blob/${repo.head}/[^)]*\\)\\. A reason\\.`,
        `- ${link("N3")} other issue in \\[\`docs/agents/plan\\.md:1\`\\]\\([^)]*\\)\\. A new note\\.`,
        "",
        "\\*\\*Open again: 1\\*\\*",
        "",
        `- ${link("N2")} other issue in [^\n]*: A model reports it again\\.`,
        "",
        "\\*\\*The models disagree: 1\\*\\*",
        "",
        `- ${link("N1")} other issue in [^\n]*: Claude says open, Codex says addressed\\.`,
      ].join("\n"),
    ),
  );
  assert.match(
    summary,
    /To pass the check, fix each finding that requires a fix\./,
  );
  assert.doesNotMatch(summary, /The setup changed|It is correct now/);
  assert.match(
    summary,
    /<summary>Model usage<\/summary>\n\n- Claude: 4 turns, \$0\.40 at API prices\n\n<\/details>$/,
  );

  const patched = inputOf(result, MASTER_PATCH).body;
  assert.match(
    patched,
    new RegExp(
      `^<!-- agent-review-master head=${repo.head} blockers=3 reviewed=${repo.head} base=${repo.base} -->`,
    ),
  );
  assert.ok(
    patched.includes(
      `After review 2, of [${head7}](https://github.com/acme/project/commit/${repo.head}): 3 open rule violations, 3 open other issues, and 2 addressed issues. The [summary of review 2](${SUMMARY_URL}) says what changed.`,
    ),
    patched,
  );
  assert.deepEqual(
    (
      patched
        .split("<details>")[0]
        ?.match(
          /^(\*\*(Rule violations|Other issues)\*\*|- (?:\[ \] )?<a id="[\w-]+"><\/a>\*\*\w+)/gm,
        ) ?? []
    ).map((line) => line.replace(/^- (?:\[ \] )?<a id="[\w-]+"><\/a>\*\*/, "")),
    [
      "**Rule violations**",
      "F1",
      "F4",
      "F5",
      "**Other issues**",
      "N1",
      "N2",
      "N3",
    ],
  );
  assert.match(
    patched,
    /> Not yet addressed\.\n>\n> - Claude: open\. The sentence is there\.\n> - Codex gave no status\.\n\n- \[ \] /,
  );
  assert.match(patched, /> Not yet addressed: A model reported it again\./);
  assert.match(
    patched,
    /\*\*N2 · other issue\*\* in [^\n]* · Nonblocking note · found in review 1 · open again in review 2\n/,
  );
  assert.match(
    patched,
    new RegExp(
      `<summary>Addressed issues: 2</summary>\n\n- <a id="agent-review-f2"></a>\\*\\*F2 · stale-document\\*\\* in [^\n]* at commit abc1234 · addressed in \\[review 2\\]\\(${SUMMARY_URL}\\): The quoted text is not in the file now\\.\n- <a id="agent-review-f3"></a>[^\n]*: Each model that checked it says that it is addressed\\.\n  - Claude: addressed\\. The setup changed\\.\n  - Codex: addressed\\. It is correct now\\.\n`,
    ),
  );
  assert.match(
    patched,
    new RegExp(
      `<summary>Reviews: 2</summary>\n\n\\| Review \\| Commit \\| The models read \\| New \\| Addressed \\| Open after \\|\n\\| --- \\| --- \\| --- \\| --- \\| --- \\| --- \\|\n\\| \\[review 1\\]\\(${MASTER_URL}\\) \\| abc1234 \\| each change \\| 6 \\| 0 \\| 6 \\|\n\\| \\[review 2\\]\\(${SUMMARY_URL}\\) \\| ${head7} \\| each change \\| 2 \\| 2 \\| 6 \\|`,
    ),
  );
  const state = stateIn(patched);
  assert.deepEqual(
    state.issues.map(({ id, status, found, reopened, fixedIn }) => [
      id,
      status,
      found,
      reopened,
      fixedIn,
    ]),
    [
      ["F1", "open", 1, undefined, undefined],
      ["F2", "fixed", 1, undefined, 2],
      ["F3", "fixed", 1, undefined, 2],
      ["F4", "open", 1, undefined, undefined],
      ["N1", "open", 1, undefined, undefined],
      ["N2", "open", 1, 2, undefined],
      ["F5", "open", 2, undefined, undefined],
      ["N3", "open", 2, undefined, undefined],
    ],
  );
  assert.equal(state.issues[1]?.head, "abc1234def");
  // Codex reported N2 again.
  assert.deepEqual(state.issues[5]?.models, ["Claude", "Codex"]);
  assert.equal(state.issues[0]?.head, repo.head);
  assert.deepEqual(state.reviews.at(-1), {
    number: 2,
    head: repo.head,
    added: 2,
    addressed: 2,
    open: 6,
    url: SUMMARY_URL,
    node: "IC_124",
  });
  // Review 1 is the master comment, which the review never hides.
  assert.ok(
    result.calls.every(
      ({ call, input }) =>
        call !== "POST graphql" || !input.includes("minimize"),
    ),
  );
});

test("verdict stores the commit that each model read, keeps the earlier one when a model failed, and links the changes that the models read", async (context) => {
  const repo = await repository(context);
  await writeFile(
    path.join(repo.directory, "docs/agents/plan.md"),
    `# The plan\n\n${OVERRIDE}\n\nA new step.\n`,
  );
  const newer = commitAll(repo.directory, "Add a step");
  const master = masterComment({ issues: [] });
  const verdict = async ({
    earlier,
    codex = job([]),
  }: {
    earlier?: Record<string, unknown>;
    codex?: string;
  }) => {
    const result = await run({
      repo,
      command: "verdict",
      action: "synchronize",
      head: newer,
      answers: {
        [`GET ${PULL}`]: { head: { sha: newer } },
        [MASTER_GET]: master,
        [SUMMARY_POST]: { id: 124, html_url: SUMMARY_URL },
      },
      env: {
        MODE: "review",
        ...(earlier && {
          EARLIER_REVIEW: earlierOf(master, { head: repo.head, ...earlier }),
        }),
        CLAUDE_JOB: job([]),
        CODEX_JOB: codex,
      },
    });
    const patch = result.calls.find(({ call }) => call === MASTER_PATCH);
    return {
      posted: inputOf(result, SUMMARY_POST).body,
      master: patch && payloadOf(patch.input).body,
    };
  };
  const read = { reviewed: repo.head, base: repo.base };

  const partial = await verdict({ earlier: read });
  const failed = await verdict({
    earlier: read,
    codex: JSON.stringify({ result: "cancelled", outputs: {} }),
  });
  const first = await verdict({});
  const firstFailed = await verdict({
    codex: JSON.stringify({ result: "failure", outputs: {} }),
  });

  assert.match(
    partial.master ?? "",
    new RegExp(
      `^<!-- agent-review-master head=${newer} blockers=1 reviewed=${newer} base=${repo.base} -->`,
    ),
  );
  assert.ok(
    partial.posted.includes(
      `The models looked for new problems only in [the changes after ${repo.head.slice(0, 7)}](https://github.com/acme/project/compare/${repo.head}...${newer}).`,
    ),
    partial.posted,
  );
  assert.match(
    partial.master ?? "",
    new RegExp(
      `\\| \\[review 2\\]\\([^)]*\\) \\| ${newer.slice(0, 7)} \\| the changes after ${repo.head.slice(0, 7)} \\|`,
    ),
  );
  assert.match(
    failed.master ?? "",
    new RegExp(
      `^<!-- agent-review-master head=${newer} blockers=2 reviewed=${repo.head} base=${repo.base} -->`,
    ),
  );
  assert.match(
    first.posted,
    new RegExp(
      `^<!-- agent-review-master head=${newer} blockers=1 reviewed=${newer} base=${repo.base} -->`,
    ),
  );
  assert.equal(first.master, undefined);
  assert.match(
    firstFailed.posted,
    new RegExp(`^<!-- agent-review-master head=${newer} blockers=2 -->`),
  );
});

test("verdict marks an issue in a file that the head does not have as addressed", async (context) => {
  const repo = await repository(context);
  const master = masterComment({
    issues: [
      issue("F1", {
        rule: "stale-document",
        file: "docs/agents/deleted.md",
        quote: "Text of a deleted document.",
      }),
    ],
  });
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    answers: {
      [`GET ${PULL}`]: { head: { sha: repo.head } },
      [MASTER_GET]: master,
      [`GET ${LINE_COMMENTS}`]: [],
    },
    env: {
      MODE: "review",
      EARLIER_REVIEW: earlierOf(master),
      CLAUDE_JOB: job(
        [],
        [],
        [{ id: "F1", status: "open", explanation: "It is still there." }],
      ),
      CODEX_JOB: NOT_SET_UP,
    },
  });

  const post = result.calls.find(({ call }) => call === SUMMARY_POST);
  assert.ok(post, result.output);
  assert.match(
    payloadOf(post.input).body,
    /- \[F1\]\([^)]*\) stale-document in [^\n]*: The quoted text is not in the file now\./,
  );
});
