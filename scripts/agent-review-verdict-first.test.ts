import assert from "node:assert/strict";
import test from "node:test";
import {
  NOT_SET_UP,
  OVERRIDE,
  PULL,
  REPOSITORY,
  SUMMARY_POST,
  at,
  finding,
  inputOf,
  issue,
  job,
  note,
  pack,
  payloadOf,
  repository,
  run,
  stateIn,
  type RunResult,
} from "./agent-review-fixtures.ts";

test("verdict posts the master comment of the first review, merges the findings, deletes one with a wrong quote, adds a new document, and fails", async (context) => {
  const repo = await repository(context);
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    labels: ["agent-review-accepted"],
    answers: { [`GET ${PULL}`]: { head: { sha: repo.head } } },
    env: {
      MODE: "review",
      CLAUDE_JOB: job([
        finding({ quote: OVERRIDE }),
        finding({
          rule: "stale-document",
          file: "docs/agents/setup.md",
          quote: "Run `pnpm run db:reset`",
          explanation: "See sk-ant-oat01-abcdefghijklmnop for the reason.",
        }),
      ]),
      CODEX_JOB: job([
        finding({
          rule: "decision-change",
          quote: "Where this document and the setup disagree,",
        }),
        finding({ rule: "stale-document", quote: "Text that is in no file." }),
      ]),
    },
  });

  assert.equal(result.status, 1, result.output);
  const posts = result.calls.filter(({ call }) => call === SUMMARY_POST);
  assert.equal(posts.length, 1);
  const { body } = payloadOf(at(posts).input);
  assert.match(
    body,
    new RegExp(
      `^<!-- agent-review-master head=${repo.head} blockers=3 reviewed=${repo.head} base=${repo.base} -->\n<!-- agent-review-state \\S+ -->\n### Agent review\n\nAfter review 1, of \\[${repo.head.slice(0, 7)}\\]\\(https://github\\.com/acme/project/commit/${repo.head}\\): 3 open rule violations, 0 open other issues, and 0 addressed issues\\.\n\n#### Open issues: 3\n\nFindings marked Fix required cannot be accepted`,
    ),
  );
  assert.match(
    body,
    /^- <a id="agent-review-f1"><\/a>\*\*F1 · \[override\]\([^)]*#override\)\*\* in \[`docs\/agents\/plan\.md:3`\]\(https:\/\/github\.com\/acme\/project\/blob\/\w+\/docs\/agents\/plan\.md#L3\) \(Claude, Codex\) · Fix required · found in review 1$/m,
  );
  assert.match(
    body,
    /\*\*F2 · \[stale-document\]\([^)]*#stale-document\)\*\* in \[`docs\/agents\/setup\.md:3`\]\(https:\/\/github\.com\/acme\/project\/blob\/\w+\/docs\/agents\/setup\.md#L3\) \(Claude\)/,
  );
  assert.match(
    body,
    /\*\*F3 · \[new-document\]\([^)]*\/\.agents\/review\/prompt\.md#new-document\)\*\* in \[`docs\/agents\/plan\.md:1`\]\(https:\/\/github\.com\/acme\/project\/blob\/\w+\/docs\/agents\/plan\.md#L1\) \(script\)/,
  );
  assert.doesNotMatch(body, /Not yet addressed|<summary>Reviews/);
  assert.match(body, /\[removed\]/);
  assert.doesNotMatch(body, /sk-ant/);
  assert.match(
    body,
    /- Deleted: 1 issue whose quote is not in the named file\./,
  );
  assert.deepEqual(
    stateIn(body).issues.map(({ id, status, found }) => [id, status, found]),
    [
      ["F1", "open", 1],
      ["F2", "open", 1],
      ["F3", "open", 1],
    ],
  );
  assert.ok(
    result.calls.some(
      ({ call }) =>
        call ===
        `DELETE repos/${REPOSITORY}/issues/7/labels/agent-review-accepted`,
    ),
  );
});

const bodyOf = (result: RunResult) => inputOf(result, SUMMARY_POST).body;

test("verdict shows other issues with their IDs, and other issues do not fail the check", async (context) => {
  const repo = await repository(context);
  const verdict = (env?: Record<string, string | undefined>) =>
    run({
      repo,
      command: "verdict",
      head: repo.base,
      answers: { [`GET ${PULL}`]: { head: { sha: repo.base } } },
      env: { MODE: "review", ...env },
    });

  const withFinding = await verdict({
    CLAUDE_JOB: job(
      [finding({ quote: OVERRIDE })],
      [
        note({
          file: "docs/agents/plan.md",
          quote: "# The plan",
          explanation: "When `first < second`, it returns <b>first</b>.",
        }),
        note({ quote: "Text that is in no file." }),
      ],
    ),
    CODEX_JOB: job(
      [],
      [
        note({ quote: "# Setup" }),
        note({ quote: "Run `pnpm" }),
        note({ quote: "a new database." }),
        note({ quote: "for a" }),
      ],
    ),
  });
  const notesOnly = await verdict({
    CLAUDE_JOB: job([], [note({ quote: "# Setup" })]),
    CODEX_JOB: NOT_SET_UP,
  });

  assert.equal(withFinding.status, 1, withFinding.output);
  const body = bodyOf(withFinding);
  assert.match(body, /blockers=1 reviewed=\w+ base=\w+ -->/);
  assert.deepEqual(
    body.match(
      /^(\*\*(Rule violations|Other issues)\*\*|- (?:\[ \] )?.*?\*\* in)/gm,
    ),
    [
      "**Rule violations**",
      '- <a id="agent-review-f1"></a>**F1 · [override](https://github.com/acme/project/blob/' +
        body.match(/blob\/(\w+)\//)?.[1] +
        "/.agents/review/prompt.md#override)** in",
      "**Other issues**",
      '- [ ] <a id="agent-review-n1"></a>**N1 · other issue** in',
      '- [ ] <a id="agent-review-n2"></a>**N2 · other issue** in',
      '- [ ] <a id="agent-review-n3"></a>**N3 · other issue** in',
      '- [ ] <a id="agent-review-n4"></a>**N4 · other issue** in',
    ],
  );
  assert.match(
    body,
    /When `first < second`, it returns &lt;b&gt;first&lt;\/b&gt;\./,
  );
  assert.match(body, /```text\n# The plan\n```/);
  assert.match(body, /```text\nRun `pnpm\n```/);
  assert.doesNotMatch(body, /for a`/);
  assert.match(
    body,
    /- Claude \(opus, high\): 1 rule violation, 2 other issues/,
  );
  assert.match(
    body,
    /- Codex \(gpt-test, high\): 0 rule violations, 3 other issues/,
  );
  assert.match(body, /- Deleted: 1 issue whose quote is not in the named file/);
  assert.match(
    body,
    /The general rules are in \[`\.agents\/review\/prompt\.md`\]\(https:\/\/github\.com\/acme\/project\/blob\/\w+\/\.agents\/review\/prompt\.md\)\. The `agent-review-accepted` label accepts only findings whose rules permit maintainer approval, for this head\./,
  );
  assert.equal(notesOnly.status, 0, notesOnly.output);
  assert.match(
    bodyOf(notesOnly),
    /blockers=0 reviewed=\w+ base=\w+ -->\n<!-- agent-review-state \S+ -->\n### Agent review\n\nAfter review 1, of \[\w{7}\]\([^)]*\): 0 open rule violations, 1 open other issue, and 0 addressed issues\./,
  );
});

test("verdict passes with no issues, and posts the master comment", async (context) => {
  const repo = await repository(context);
  const result = await run({
    repo,
    command: "verdict",
    head: repo.base,
    answers: { [`GET ${PULL}`]: { head: { sha: repo.base } } },
    env: { MODE: "review", CLAUDE_JOB: job([]), CODEX_JOB: NOT_SET_UP },
  });

  assert.equal(result.status, 0, result.output);
  assert.ok(result.calls.every(({ call }) => !call.startsWith("PATCH ")));
  const { body } = inputOf(result, SUMMARY_POST);
  assert.match(
    body,
    /^<!-- agent-review-master head=\w+ blockers=0 reviewed=\w+ base=\w+ -->\n<!-- agent-review-state \S+ -->\n### Agent review\n/,
  );
  assert.match(body, /#### Open issues: 0\n\nNo issue is open\./);
  assert.match(body, /- Codex \(gpt-test, high\): not set up/);
  assert.doesNotMatch(body, /The general rules/);
});

test("verdict posts a master comment after a comment from before the master comment, and keeps its findings", async (context) => {
  const repo = await repository(context);
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    answers: { [`GET ${PULL}`]: { head: { sha: repo.head } } },
    env: {
      MODE: "review",
      EARLIER_REVIEW: pack({
        head: "abc1234def",
        comment: 97,
        master: false,
        issues: [
          issue("F1", {
            rule: "override",
            file: "docs/agents/plan.md",
            quote: OVERRIDE,
          }),
          issue("F2", {
            rule: "stale-document",
            file: "docs/agents/setup.md",
            quote: "Run `pnpm run db:reset`",
            status: "accepted",
            acceptedBy: "Owner",
            acceptedIn: 1,
          }),
        ],
      }),
      CLAUDE_JOB: job(
        [],
        [],
        [{ id: "F1", status: "open", explanation: "It is still there." }],
      ),
      CODEX_JOB: NOT_SET_UP,
    },
  });

  assert.equal(result.status, 1, result.output);
  assert.ok(result.calls.every(({ call }) => !call.startsWith("PATCH ")));
  const { body } = inputOf(result, SUMMARY_POST);
  assert.match(body, /^<!-- agent-review-master head=/);
  assert.deepEqual(
    stateIn(body).issues.map(({ id, status }) => [id, status]),
    [
      ["F1", "open"],
      ["F2", "open"],
      ["F3", "open"],
    ],
  );
  assert.equal(
    stateIn(body).issues.find(({ id }) => id === "F2")?.reason,
    "This rule requires a fix and does not permit acceptance.",
  );
  assert.doesNotMatch(body, /accepted by Owner/);
});

test("verdict does nothing for a head that a newer push replaced", async (context) => {
  const repo = await repository(context);
  const result = await run({
    repo,
    command: "verdict",
    answers: { [`GET ${PULL}`]: { head: { sha: "newer" } } },
    env: { MODE: "review", CLAUDE_JOB: job([finding({ quote: OVERRIDE })]) },
  });

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(
    result.calls.map(({ call }) => call),
    [`GET ${PULL}`],
  );
});

test("verdict posts nothing and fails when something cancelled the Claude job", async (context) => {
  const repo = await repository(context);
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    answers: { [`GET ${PULL}`]: { head: { sha: repo.head } } },
    env: {
      MODE: "review",
      CLAUDE_JOB: JSON.stringify({ result: "cancelled", outputs: {} }),
      CODEX_JOB: job([finding({ quote: OVERRIDE })]),
    },
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Something cancelled the Claude job/);
  assert.deepEqual(
    result.calls.map(({ call }) => call),
    [`GET ${PULL}`],
  );
});

test("verdict counts a failed or cancelled model as an open item", async (context) => {
  const repo = await repository(context);
  const result = await run({
    repo,
    command: "verdict",
    head: repo.base,
    answers: { [`GET ${PULL}`]: { head: { sha: repo.base } } },
    env: {
      MODE: "review",
      CLAUDE_JOB: job([]),
      CODEX_JOB: JSON.stringify({ result: "cancelled", outputs: {} }),
    },
  });

  assert.equal(result.status, 1, result.output);
  const { body } = inputOf(result, SUMMARY_POST);
  assert.match(body, /blockers=1 -->/);
  assert.match(
    body,
    /- Codex \(gpt-test, high\): failed\. The job ended with "cancelled"\./,
  );
});

test("verdict passes with no comment when no model is set up", async (context) => {
  const repo = await repository(context);
  const result = await run({
    repo,
    command: "verdict",
    answers: { [`GET ${PULL}`]: { head: { sha: repo.head } } },
    env: { MODE: "review", CLAUDE_JOB: NOT_SET_UP, CODEX_JOB: NOT_SET_UP },
  });

  assert.equal(result.status, 0, result.output);
  assert.ok(result.calls.every(({ call }) => call.startsWith("GET ")));
});
