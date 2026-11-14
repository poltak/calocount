import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
  POSTED,
  PULL,
  REPOSITORY,
  REVIEW_POST,
  SUMMARY_POST,
  SUMMARY_URL,
  at,
  bot,
  commitAll,
  earlierOf,
  editsAnswer,
  finding,
  inputOf,
  issue,
  job,
  lineBody,
  masterComment,
  note,
  payloadOf,
  repository,
  run,
  stateIn,
} from "./agent-review-fixtures.ts";

test("verdict puts each new issue on lines of the diff in a review, links it in the master comment, and keeps the other issues only in the master comment", async (context) => {
  const repo = await repository(context);
  await mkdir(path.join(repo.directory, "src"));
  await writeFile(
    path.join(repo.directory, "src/notes.ts"),
    "// The count of notes.\n// It starts at zero.\nexport const count = 0;\n",
  );
  await mkdir(path.join(repo.directory, "samples"));
  await writeFile(
    path.join(repo.directory, "samples/people.json"),
    '{\n  "name": "A Person"\n}\n',
  );
  const head = commitAll(repo.directory, "Add the notes and a sample");
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    head,
    answers: {
      [`GET ${PULL}`]: { head: { sha: head } },
      [SUMMARY_POST]: {
        id: 123,
        html_url: "https://github.com/acme/project/pull/7#issuecomment-123",
      },
      [`GET ${LINE_COMMENTS}`]: [
        {
          id: 5,
          user: { login: "github-actions[bot]" },
          body: lineBody("F1", " "),
          html_url: "https://github.com/acme/project/pull/7#discussion_r5",
        },
      ],
    },
    env: {
      MODE: "review",
      CLAUDE_JOB: job(
        [
          finding({ quote: OVERRIDE }),
          finding({
            rule: "stale-document",
            file: "docs/agents/setup.md",
            quote: "Run `pnpm run db:reset`",
          }),
          finding({
            rule: "comment-restates-code",
            file: "src/notes.ts",
            quote: "// The count of notes.\n// It starts at zero.",
            explanation: "The name says it.",
          }),
          finding({
            rule: "private-data",
            file: "samples/people.json",
            quote: '"name":',
            explanation: "The name of a person.",
          }),
          finding({
            rule: "comment-restates-code",
            file: "samples/people.json",
            quote: '"name": "A Person"',
          }),
        ],
        [
          note({
            file: "src/notes.ts",
            quote: "export const count = 0;",
            explanation: "The count never changes.",
          }),
        ],
      ),
      CODEX_JOB: NOT_SET_UP,
    },
  });

  assert.equal(result.status, 1, result.output);
  const reviews = result.calls.filter(({ call }) => call === REVIEW_POST);
  assert.equal(reviews.length, 1);
  const review = payloadOf(at(reviews).input);
  assert.equal(review.commit_id, head);
  assert.equal(review.event, "COMMENT");
  assert.equal(
    review.body,
    "4 new issues of the agent review are on lines of this change. The [master comment](https://github.com/acme/project/pull/7#issuecomment-123) of the agent review has each issue, and the result of the check.",
  );
  assert.deepEqual(
    review.comments.map(({ body, ...place }) => place),
    [
      { path: "docs/agents/plan.md", side: "RIGHT", line: 3 },
      {
        path: "src/notes.ts",
        side: "RIGHT",
        line: 2,
        start_line: 1,
        start_side: "RIGHT",
      },
      { path: "docs/agents/plan.md", side: "RIGHT", line: 1 },
      { path: "src/notes.ts", side: "RIGHT", line: 3 },
    ],
  );
  assert.match(
    at(review.comments).body,
    new RegExp(
      `^<!-- agent-review-line F1 -->\n- \\*\\*F1 · \\[override\\]\\([^)]*#override\\)\\*\\* \\(Claude\\)\n\nA reason\\.\n\n\\[F1\\]\\(${ISSUE_URL}agent-review-f1\\) in the master comment of the agent review\\. This issue requires a fix\\. Checkboxes, labels, and replies cannot accept it\\.$`,
    ),
  );
  assert.match(at(review.comments, 1).body, /^<!-- agent-review-line F3 -->/);
  assert.match(at(review.comments, 2).body, /\*\*F6 · \[new-document\]/);
  assert.match(
    at(review.comments, 3).body,
    /^<!-- agent-review-line N1 -->\n- \[ \] \*\*N1 · other issue\*\* \(Claude\)\n\nThe count never changes\./,
  );
  assert.doesNotMatch(at(reviews).input, /people\.json|A Person/);

  const patched = inputOf(
    result,
    `PATCH repos/${REPOSITORY}/issues/comments/123`,
  ).body;
  assert.match(
    patched,
    /\*\*F1 · \[override\]\([^)]*\)\*\* in [^\n]* \(Claude\) · Fix required · found in review 1 · \[on its line\]\(https:\/\/github\.com\/acme\/project\/pull\/7#discussion_r5\)\n/,
  );
  assert.equal(
    stateIn(patched).issues.find(({ id }) => id === "F1")?.lineComment,
    "https://github.com/acme/project/pull/7#discussion_r5",
  );
});

test("verdict marks the line comment of each addressed issue, and a review that GitHub refuses does not stop the verdict", async (context) => {
  const repo = await repository(context);
  const first = await run({
    repo,
    command: "verdict",
    answers: { [`GET ${PULL}`]: { head: { sha: repo.head } } },
    env: {
      MODE: "review",
      CLAUDE_JOB: job([finding({ quote: OVERRIDE })]),
      CODEX_JOB: NOT_SET_UP,
    },
  });
  const posted = inputOf(first, SUMMARY_POST).body;
  const overrideLine = at(inputOf(first, REVIEW_POST).comments);
  await writeFile(
    path.join(repo.directory, "docs/agents/plan.md"),
    "# The plan\n\nAnother sentence.\n",
  );
  const newer = commitAll(repo.directory, "Delete the override");
  const master = {
    id: 99,
    node_id: "IC_99",
    created_at: POSTED,
    body: posted,
  };

  const second = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    head: newer,
    labels: ["agent-review-accepted"],
    answers: {
      [`GET ${PULL}`]: { head: { sha: newer } },
      [MASTER_GET]: master,
      "POST graphql": editsAnswer(),
      [SUMMARY_POST]: { id: 124, html_url: SUMMARY_URL },
      [REVIEW_POST]: { fail: "HTTP 422: Line could not be resolved" },
      [`GET ${LINE_COMMENTS}`]: [
        {
          id: 5,
          user: { login: "github-actions[bot]" },
          body: overrideLine.body,
        },
        { id: 6, user: { login: "contributor" }, body: overrideLine.body },
        {
          id: 8,
          user: { login: "github-actions[bot]" },
          body: overrideLine.body.replace("- [ ] ", "- [x] "),
        },
        {
          id: 7,
          user: { login: "github-actions[bot]" },
          body: overrideLine.body.replaceAll("F1", "F9"),
        },
      ],
    },
    env: {
      MODE: "review",
      EARLIER_REVIEW: earlierOf(master, { head: repo.head }),
      CLAUDE_JOB: job([
        finding({ rule: "stale-document", quote: "Another sentence." }),
      ]),
      CODEX_JOB: NOT_SET_UP,
    },
  });

  assert.equal(second.status, 1, second.output);
  assert.match(
    second.output,
    /::warning title=Agent review::GitHub refused a line comment: HTTP 422: Line could not be resolved/,
  );
  const marks = second.calls.filter(({ call }) =>
    call.startsWith(`PATCH repos/${REPOSITORY}/pulls/comments/`),
  );
  assert.deepEqual(
    marks.map(({ call }) => call),
    [
      `PATCH repos/${REPOSITORY}/pulls/comments/5`,
      `PATCH repos/${REPOSITORY}/pulls/comments/8`,
    ],
  );
  assert.equal(
    payloadOf(at(marks).input).body,
    `${overrideLine.body.replace("- [ ] ", "- ")}\n\nAddressed in [review 2](${SUMMARY_URL}): The quoted text is not in the file now.`,
  );
  assert.deepEqual(
    stateIn(inputOf(second, MASTER_PATCH).body).issues.map(({ id, status }) => [
      id,
      status,
    ]),
    [
      ["F1", "fixed"],
      ["F2", "open"],
      ["F3", "open"],
    ],
  );
  assert.ok(
    second.calls.some(
      ({ call }) =>
        call ===
        `DELETE repos/${REPOSITORY}/issues/7/labels/agent-review-accepted`,
    ),
  );
});

test("verdict hides the summary of the earlier review, and a refusal of GitHub does not stop the verdict", async (context) => {
  const repo = await repository(context);
  const master = masterComment({
    issues: [],
    reviews: [
      {
        number: 1,
        head: "abc1234def",
        added: 0,
        addressed: 0,
        open: 0,
        url: MASTER_URL,
      },
      {
        number: 2,
        head: "abc1234def",
        added: 0,
        addressed: 0,
        open: 0,
        url: "https://github.com/acme/project/pull/7#issuecomment-110",
        node: "IC_110",
      },
    ],
  });
  const verdict = (graphql: unknown) =>
    run({
      repo,
      command: "verdict",
      action: "synchronize",
      // The base adds no document, so the review has no issue.
      head: repo.base,
      answers: {
        [`GET ${PULL}`]: { head: { sha: repo.base } },
        [MASTER_GET]: master,
        "POST graphql": graphql,
      },
      env: {
        MODE: "review",
        EARLIER_REVIEW: earlierOf(master),
        CLAUDE_JOB: job([]),
        CODEX_JOB: NOT_SET_UP,
      },
    });

  const hidden = await verdict(editsAnswer());
  const refused = await verdict({
    fail: "Resource not accessible by integration",
  });

  const minimize = hidden.calls
    .filter(({ call }) => call === "POST graphql")
    .map(
      ({ input }) => JSON.parse(input) as { query: string; variables: unknown },
    )
    .find(({ query }) => query.includes("minimizeComment"));
  assert.deepEqual(minimize?.variables, { id: "IC_110" });
  assert.match(minimize?.query ?? "", /classifier: OUTDATED/);
  assert.match(
    inputOf(hidden, SUMMARY_POST).body,
    /^<!-- agent-review-summary head=\w+ review=3 -->/,
  );
  assert.equal(refused.status, 0, refused.output);
  assert.match(
    refused.output,
    /::warning title=Agent review::GitHub did not hide the summary of the earlier review: Resource not accessible by integration/,
  );
  assert.ok(refused.calls.some(({ call }) => call === MASTER_PATCH));
});

test("verdict leaves the oldest addressed issues out of a master comment that is too long, and keeps each issue in its data", async (context) => {
  const repo = await repository(context);
  const master = masterComment({
    issues: Array.from({ length: 400 }, (_, index) =>
      issue(`F${index + 1}`, {
        rule: "stale-document",
        file: "docs/agents/setup.md",
        quote: `Old text ${index + 1}.`,
        explanation:
          `The old text ${index + 1} was wrong, because the setup changed. `.repeat(
            4,
          ),
        status: "fixed",
        fixedIn: 1,
        reason: "The quoted text is not in the file now.",
      }),
    ),
  });
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    answers: {
      [`GET ${PULL}`]: { head: { sha: repo.head } },
      [MASTER_GET]: master,
    },
    env: {
      MODE: "review",
      EARLIER_REVIEW: earlierOf(master),
      CLAUDE_JOB: job([]),
      CODEX_JOB: NOT_SET_UP,
    },
  });

  const { body } = inputOf(result, MASTER_PATCH);
  assert.ok(body.length <= 65_000, String(body.length));
  assert.match(
    body,
    /\d+ older addressed issues are only in the summaries of their reviews\./,
  );
  assert.equal(stateIn(body).issues.length, 401);
});

test("verdict leaves the oldest addressed issues out of a master comment that is too long, also when no issue is open", async (context) => {
  const repo = await repository(context);
  // Without the new document, the script finds nothing, so no issue is open.
  await rm(path.join(repo.directory, "docs/agents/plan.md"));
  await writeFile(
    path.join(repo.directory, "docs/agents/setup.md"),
    "# Setup\n\nRun `pnpm run db:reset` for an empty database.\n",
  );
  const head = commitAll(repo.directory, "Change the setup");
  const master = masterComment({
    issues: Array.from({ length: 400 }, (_, index) =>
      issue(`F${index + 1}`, {
        rule: "stale-document",
        file: "docs/agents/setup.md",
        quote: `Old text ${index + 1}.`,
        explanation:
          `The old text ${index + 1} was wrong, because the setup changed. `.repeat(
            4,
          ),
        status: "fixed",
        fixedIn: 1,
        reason: "The quoted text is not in the file now.",
      }),
    ),
  });
  const result = await run({
    repo,
    command: "verdict",
    action: "synchronize",
    head,
    answers: {
      [`GET ${PULL}`]: { head: { sha: head } },
      [MASTER_GET]: master,
    },
    env: {
      MODE: "review",
      EARLIER_REVIEW: earlierOf(master),
      CLAUDE_JOB: job([]),
      CODEX_JOB: job([]),
    },
  });

  const { body } = inputOf(result, MASTER_PATCH);
  assert.match(body, /No issue is open\./);
  assert.ok(body.length <= 65_000, String(body.length));
  assert.match(
    body,
    /\d+ older addressed issues are only in the summaries of their reviews\./,
  );
  assert.equal(stateIn(body).issues.length, 400);
});
