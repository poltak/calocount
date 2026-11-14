import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  COMMENTS,
  EVENTS,
  LINE_COMMENTS,
  MASTER_GET,
  MASTER_PATCH,
  NOT_SET_UP,
  POSTED,
  PULL,
  bot,
  boxes,
  earlierOf,
  editsAnswer,
  inputOf,
  issue,
  job,
  masterComment,
  pack,
  repository,
  run,
  stateIn,
  versions,
} from "./agent-review-fixtures.ts";

test("a label accepts the open rule violations only when a maintainer added it for the reviewed head", async (context) => {
  const repo = await repository(context);
  const accepted = ({
    comments,
    labels = ["agent-review-accepted"],
    adders = ["owner"],
  }: {
    comments: unknown[];
    labels?: string[];
    adders?: string[];
  }) =>
    run({
      repo,
      command: "verdict",
      action: "labeled",
      label: "agent-review-accepted",
      labels,
      answers: {
        [`GET ${COMMENTS}`]: comments,
        [`GET ${EVENTS}`]: adders.map((login) => ({
          event: "labeled",
          label: { name: "agent-review-accepted" },
          actor: { login },
        })),
      },
      env: { MODE: "label" },
    });
  const reviewed = [
    bot(
      `<!-- agent-review-master head=${repo.head} blockers=2 reviewed=${repo.head} base=${repo.base} -->\n<!-- agent-review-state ${pack({ issues: [issue("F1", { rule: "decision-change" }), issue("F2", { rule: "comment-restates-code" })], reviews: [] })} -->`,
    ),
    bot(`<!-- agent-review-summary head=0ld review=2 -->`, 100),
  ];

  const byMaintainer = await accepted({
    comments: reviewed,
    adders: ["contributor", "Owner"],
  });
  const byContributor = await accepted({
    comments: reviewed,
    adders: ["owner", "contributor"],
  });
  const removed = await accepted({ comments: reviewed, labels: [] });
  const olderHead = await accepted({
    comments: [bot("<!-- agent-review-master head=0ld blockers=2 -->")],
  });
  const beforeMaster = await accepted({
    comments: [bot(`<!-- agent-review head=${repo.head} blockers=1 -->`)],
  });
  const clean = await accepted({
    comments: [
      bot(`<!-- agent-review-master head=${repo.head} blockers=0 -->`),
    ],
    labels: [],
  });

  for (const rule of [
    "code-architecture",
    "secret",
    "private-data",
    "unknown-rule",
  ]) {
    const mixed = await accepted({
      comments: [
        bot(
          `<!-- agent-review-master head=${repo.head} blockers=2 -->\n<!-- agent-review-state ${pack(
            {
              issues: [
                issue("F1", { rule: "decision-change" }),
                issue("F2", { rule }),
              ],
              reviews: [],
            },
          )} -->`,
        ),
      ],
    });
    assert.equal(mixed.status, 1, mixed.output);
    assert.match(mixed.output, /accepted 1 approval-permitted finding/);
    assert.match(mixed.output, /cannot be accepted/);
  }
  const failedModel = await accepted({
    comments: [
      bot(
        `<!-- agent-review-master head=${repo.head} blockers=3 -->\n<!-- agent-review-state ${pack(
          {
            issues: [
              issue("F1", { rule: "decision-change" }),
              issue("F2", { rule: "comment-restates-code" }),
            ],
            reviews: [],
          },
        )} -->`,
      ),
    ],
  });
  assert.equal(failedModel.status, 1, failedModel.output);
  const oldAcceptance = await accepted({
    comments: [
      bot(
        `<!-- agent-review-master head=${repo.head} blockers=0 -->\n<!-- agent-review-state ${pack(
          {
            issues: [
              issue("F1", {
                rule: "code-architecture",
                status: "accepted",
                acceptedBy: "owner",
              }),
            ],
            reviews: [],
          },
        )} -->`,
      ),
    ],
  });
  assert.equal(oldAcceptance.status, 1, oldAcceptance.output);

  assert.equal(byMaintainer.status, 0, byMaintainer.output);
  assert.equal(byContributor.status, 1);
  assert.match(
    byContributor.output,
    /contributor added the agent-review-accepted label, and is not a maintainer/,
  );
  assert.equal(removed.status, 1);
  assert.equal(olderHead.status, 1);
  assert.match(olderHead.output, /has not finished/);
  assert.equal(beforeMaster.status, 1, beforeMaster.output);
  assert.equal(clean.status, 0, clean.output);
});

test("checkboxes follow rule policies and cannot accept fix-required or unclassified findings", async (context) => {
  const repo = await repository(context);
  await writeFile(
    path.join(repo.directory, ".agents/review/project-rules.md"),
    `### project-required

A rule without a policy requires a fix.

### project-invalid

Resolution: allow

An invalid policy also requires a fix.

### project-optional

Resolution: maintainer-approval

A maintainer can approve this project choice.

### code-architecture

Resolution: maintainer-approval

A project cannot replace the general policy.
`,
  );
  const allowed = new Set([
    "decision-change",
    "comment-restates-code",
    "new-document",
    "project-optional",
  ]);
  for (const rule of [
    "override",
    "stale-document",
    "decision-change",
    "comment-restates-code",
    "code-architecture",
    "plan-in-docs",
    "secret",
    "private-data",
    "new-document",
    "project-required",
    "project-invalid",
    "project-optional",
    "unknown-rule",
  ]) {
    const master = masterComment({
      issues: [
        issue("F1", {
          rule,
          file: "docs/agents/setup.md",
          quote: "# Setup",
          status: "accepted",
          acceptedBy: "owner",
          acceptedIn: 1,
          resolution: "maintainer-approval",
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
            [POSTED, "github-actions", boxes({ F1: " " })],
            ["2026-10-25T10:01:00Z", "owner", boxes({ F1: "x" })],
          ),
        }),
        [`GET ${LINE_COMMENTS}`]: [],
      },
      env: {
        MODE: "review",
        EARLIER_REVIEW: earlierOf(master),
        CLAUDE_JOB: job(
          [],
          [],
          [
            {
              id: "F1",
              status: "open",
              explanation: "The violation is still present.",
            },
          ],
        ),
        CODEX_JOB: NOT_SET_UP,
      },
    });
    const body = inputOf(result, MASTER_PATCH).body;
    const finding = stateIn(body).issues.find(({ id }) => id === "F1");
    assert.equal(
      finding?.status,
      allowed.has(rule) ? "accepted" : "open",
      rule,
    );
    if (!allowed.has(rule)) {
      assert.equal(result.status, 1, result.output);
      assert.doesNotMatch(body, /- \[x\] <a id="agent-review-f1"/, rule);
      assert.doesNotMatch(body, /- \[ \] <a id="agent-review-f1"/, rule);
      assert.match(
        body,
        /This rule requires a fix and does not permit acceptance/,
        rule,
      );
    }
  }
});
