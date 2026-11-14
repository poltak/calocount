import assert from "node:assert/strict";
import test from "node:test";
import {
  LINE_COMMENTS,
  MASTER_GET,
  MASTER_PATCH,
  NOT_SET_UP,
  OVERRIDE,
  POSTED,
  PULL,
  REPOSITORY,
  SUMMARY_POST,
  SUMMARY_URL,
  at,
  boxes,
  earlierOf,
  editsAnswer,
  finding,
  inputOf,
  issue,
  job,
  lineBody,
  masterComment,
  payloadOf,
  repository,
  run,
  stateIn,
  versions,
} from "./agent-review-fixtures.ts";

const thread = (id: string, ...list: [string, string, string][]) => ({
  comments: {
    nodes: [
      {
        author: { login: "github-actions" },
        body: lineBody(id, list.at(-1)?.[2] ?? ""),
        ...versions(
          ...list.map(
            ([time, login, mark]) =>
              [time, login, lineBody(id, mark)] as [string, string, string],
          ),
        ),
      },
    ],
  },
});

test("verdict moves each issue that a maintainer accepted with its box to the addressed issues, opens one with a cleared box again, and counts only the boxes of maintainers after the newest review", async (context) => {
  const repo = await repository(context);
  const master = masterComment({
    issues: [
      issue("F1", {
        rule: "decision-change",
        file: "docs/agents/plan.md",
        quote: OVERRIDE,
      }),
      issue("F2", {
        rule: "stale-document",
        file: "docs/agents/setup.md",
        quote: "Run `pnpm run db:reset`",
      }),
      issue("F3", {
        rule: "decision-change",
        file: "docs/agents/setup.md",
        quote: "for a new database.",
        status: "accepted",
        acceptedBy: "second-owner",
        acceptedIn: 1,
      }),
      issue("F4", {
        rule: "comment-restates-code",
        file: "docs/agents/setup.md",
        quote: "# Setup",
        status: "accepted",
        acceptedBy: "Owner",
        acceptedIn: 1,
      }),
      issue("F5", {
        rule: "override",
        file: "docs/agents/plan.md",
        quote: "# The plan",
      }),
      issue("N1", { file: "docs/agents/setup.md", quote: "a new database." }),
    ],
    text: boxes({ F1: "x", F2: "x", F3: "x", F4: " ", F5: " ", N1: " " }),
  });
  const posted = { F1: " ", F2: " ", F3: "x", F4: "x", F5: " ", N1: " " };
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    answers: {
      [`GET ${PULL}`]: { head: { sha: repo.head } },
      [MASTER_GET]: master,
      "POST graphql": editsAnswer({
        comment: versions(
          ["2026-10-25T09:00:00Z", "github-actions", boxes(posted)],
          // Before the newest edit of the bot, so the review of that edit
          // counted it.
          ["2026-10-25T09:30:00Z", "Owner", boxes({ ...posted, F2: "x" })],
          [POSTED, "github-actions", boxes(posted)],
          ["2026-10-25T10:01:00Z", "Owner", boxes({ ...posted, F1: "x" })],
          [
            "2026-10-25T10:02:00Z",
            "contributor",
            boxes({ ...posted, F1: "x", F2: "x" }),
          ],
          [
            "2026-10-25T10:03:00Z",
            "Owner",
            boxes({ ...posted, F1: "x", F2: "x", F4: " " }),
          ],
        ),
        threads: [
          thread(
            "N1",
            ["2026-10-25T09:00:00Z", "github-actions", " "],
            ["2026-10-25T10:04:00Z", "second-owner", "x"],
          ),
          thread(
            "F5",
            ["2026-10-25T09:00:00Z", "github-actions", " "],
            ["2026-10-25T09:30:00Z", "Owner", "x"],
          ),
        ],
      }),
      [SUMMARY_POST]: { id: 124, html_url: SUMMARY_URL },
      [`GET ${LINE_COMMENTS}`]: [
        {
          id: 11,
          user: { login: "github-actions[bot]" },
          body: lineBody("F1", " "),
        },
        {
          id: 15,
          user: { login: "github-actions[bot]" },
          body: lineBody("N1", "x"),
        },
      ],
    },
    env: {
      MODE: "review",
      EARLIER_REVIEW: earlierOf(master),
      CLAUDE_JOB: job(
        [
          finding({
            rule: "decision-change",
            file: "docs/agents/setup.md",
            quote: "for a new database.",
          }),
        ],
        [],
        ["F1", "F2", "F5", "N1"].map((id) => ({
          id,
          status: "open",
          explanation: "It is still there.",
        })),
      ),
      CODEX_JOB: NOT_SET_UP,
    },
  });

  assert.equal(result.status, 1, result.output);
  assert.deepEqual(result.output.match(/^.* the box of .*$/gm), [
    "Owner checked the box of F1 at 2026-10-25T10:01:00Z.",
    "Owner cleared the box of F4 at 2026-10-25T10:03:00Z.",
    "second-owner checked the box of N1 at 2026-10-25T10:04:00Z.",
  ]);
  const graphql = result.calls.find(({ call }) => call === "POST graphql");
  assert.deepEqual(payloadOf(graphql?.input ?? "").variables, {
    comment: "IC_99",
    owner: "acme",
    name: "project",
    number: 7,
  });
  const summary = inputOf(result, SUMMARY_POST).body;
  assert.match(
    summary,
    new RegExp(
      `\\*\\*Accepted by a maintainer: 2\\*\\*\n\n- \\[F1\\]\\([^)]*\\) decision-change in [^\n]*: accepted by Owner\\.\n- \\[N1\\]\\([^)]*\\) other issue in [^\n]*: accepted by second-owner\\.\n\n\\*\\*Open again: 1\\*\\*\n\n- \\[F4\\]\\([^)]*\\) comment-restates-code in [^\n]*: A maintainer cleared its box\\.`,
    ),
  );
  const patched = inputOf(result, MASTER_PATCH).body;
  assert.match(patched, /blockers=3 /);
  assert.deepEqual(
    (
      patched.match(/^- (?:\[[ x]\] )?<a id="[\w-]+"><\/a>\*\*\w+ · .*$/gm) ??
      []
    ).map((line) =>
      line
        .replace(/<a id="[\w-]+"><\/a>/, "")
        .replace(/\]\([^)]*\)/g, "]")
        .replace(/ in \[`[^`]*`\]( at commit \w+)? \([\w, ]+\)/, ""),
    ),
    [
      "- **F2 · [stale-document]** · Fix required · found in review 1",
      "- [ ] **F4 · [comment-restates-code]** · Maintainer approval permitted · found in review 1 · open again in review 2",
      "- **F5 · [override]** · Fix required · found in review 1",
      "- [x] **F1 · decision-change** in [`docs/agents/plan.md:3`] · accepted by Owner in [review 2]. To open it again, a maintainer clears its box.",
      "- [x] **N1 · other issue** in [`docs/agents/setup.md:3`] · accepted by second-owner in [review 2]. To open it again, a maintainer clears its box.",
      "- [x] **F3 · decision-change** in [`docs/agents/setup.md:3`] · accepted by second-owner in [review 1]. To open it again, a maintainer clears its box.",
    ],
  );
  assert.deepEqual(
    stateIn(patched).issues.map(({ id, status, acceptedBy, acceptedIn }) => [
      id,
      status,
      acceptedBy,
      acceptedIn,
    ]),
    [
      ["F1", "accepted", "Owner", 2],
      ["F2", "open", undefined, undefined],
      ["F3", "accepted", "second-owner", 1],
      ["F4", "open", undefined, undefined],
      ["F5", "open", undefined, undefined],
      ["N1", "accepted", "second-owner", 2],
    ],
  );
  const lineMarks = result.calls.filter(({ call }) =>
    call.startsWith(`PATCH repos/${REPOSITORY}/pulls/comments/`),
  );
  assert.deepEqual(
    lineMarks.map(({ call }) => call),
    [
      `PATCH repos/${REPOSITORY}/pulls/comments/11`,
      `PATCH repos/${REPOSITORY}/pulls/comments/15`,
    ],
  );
  assert.equal(
    payloadOf(at(lineMarks).input).body,
    `${lineBody("F1", "x")}\n\nOwner accepted this issue. See [review 2](${SUMMARY_URL}).`,
  );
});

test("verdict passes when a maintainer accepted each open rule violation, also one that the script reports again", async (context) => {
  const repo = await repository(context);
  const master = masterComment({
    issues: [
      issue("F1", {
        rule: "decision-change",
        file: "docs/agents/plan.md",
        quote: OVERRIDE,
      }),
      issue("F2", {
        rule: "new-document",
        file: "docs/agents/plan.md",
        line: 1,
        quote: "# The plan",
        models: ["script"],
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
      "POST graphql": editsAnswer({
        comment: versions(
          [POSTED, "github-actions", boxes({ F1: " ", F2: " " })],
          ["2026-10-25T10:01:00Z", "owner", boxes({ F1: "x", F2: " " })],
          ["2026-10-25T10:02:00Z", "Owner", boxes({ F1: "x", F2: "x" })],
        ),
      }),
      [`GET ${LINE_COMMENTS}`]: [],
    },
    env: {
      MODE: "review",
      EARLIER_REVIEW: earlierOf(master),
      CLAUDE_JOB: job([]),
      CODEX_JOB: NOT_SET_UP,
    },
  });

  assert.equal(result.status, 0, result.output);
  assert.match(
    inputOf(result, SUMMARY_POST).body,
    /### Agent review 2, of \w+: the check passes\n\n0 open rule violations and 0 open other issues\./,
  );
  assert.match(inputOf(result, MASTER_PATCH).body, /blockers=0 /);
});
