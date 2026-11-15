import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMENTS,
  LINE_COMMENTS,
  OVERRIDE,
  bot,
  git,
  issue,
  pack,
  repository,
  run,
  unpack,
  type RunOptions,
} from "./agent-review-fixtures.ts";
import type { EarlierReview } from "./agent-review-types.ts";

test("plan reviews each person's push, and skips a draft, a dependency update, and other labels", async (context) => {
  const repo = await repository(context);
  git(repo.directory, "sparse-checkout", "set", "scripts", ".agents/review");
  const modeOf = async (options: Partial<RunOptions>) =>
    (
      await run({
        repo,
        command: "plan",
        answers: { [`GET ${COMMENTS}`]: [] },
        ...options,
      })
    ).outputs.mode;

  assert.equal(await modeOf({ action: "synchronize" }), "review");
  assert.equal(await modeOf({ author: "owner" }), "review");
  assert.equal(await modeOf({ action: "ready_for_review" }), "review");
  assert.equal(await modeOf({ draft: true }), "skip");
  assert.equal(await modeOf({ author: "renovate[bot]" }), "skip");
  assert.equal(
    await modeOf({ action: "labeled", label: "agent-review-accepted" }),
    "label",
  );
  assert.equal(await modeOf({ action: "labeled", label: "bug" }), "skip");
  assert.equal(
    await modeOf({ action: "edited", changes: { body: { from: "" } } }),
    "review",
  );
  assert.equal(
    await modeOf({ action: "edited", changes: { base: { ref: {} } } }),
    "skip",
  );
});

test("plan gives the issues of the master comment and the commit that each model read, and gives IDs to the findings of an older comment", async (context) => {
  const repo = await repository(context);
  const issues = [
    issue("F1", {
      rule: "override",
      file: "docs/agents/plan.md",
      quote: OVERRIDE,
    }),
    issue("N1", { file: "docs/agents/setup.md", quote: "# Setup" }),
  ];
  const old = [
    {
      number: 1,
      rule: "override",
      file: "docs/agents/plan.md",
      line: 3,
      quote: OVERRIDE,
      explanation: "A reason.",
      models: ["Claude"],
    },
    {
      number: 2,
      rule: "stale-document",
      file: "docs/agents/setup.md",
      line: 3,
      quote: "Run `pnpm run db:reset`",
      explanation: "Another reason.",
      models: ["Codex"],
      accepted: "Owner",
    },
  ];
  const oldComment = bot(
    `<!-- agent-review head=def5678 blockers=1 reviewed=def5678 base=0ba5e00 -->\n<!-- agent-review-findings ${pack(old)} -->\n### Agent review of def5678: 1 finding`,
    97,
  );
  const earlierOf = async (comments: unknown[]) =>
    (
      await run({
        repo,
        command: "plan",
        action: "synchronize",
        answers: {
          [`GET ${COMMENTS}`]: comments,
          [`GET ${LINE_COMMENTS}`]: [],
        },
      })
    ).outputs.earlier;

  const fromMaster = await earlierOf([
    oldComment,
    bot(
      `<!-- agent-review-master head=abc1234 blockers=1 reviewed=fed4321 base=0ba5e00 -->\n<!-- agent-review-state ${pack({ issues, reviews: [] })} -->\n### Agent review`,
      98,
    ),
    bot(
      "<!-- agent-review-summary head=fed4321 review=2 -->\n### Agent review 2",
    ),
  ]);
  const fromOld = await earlierOf([oldComment]);
  const none = await earlierOf([]);

  assert.deepEqual(unpack(fromMaster), {
    head: "abc1234",
    comment: 98,
    master: true,
    issues,
    reviewed: "fed4321",
    base: "0ba5e00",
  });
  assert.deepEqual(unpack(fromOld), {
    head: "def5678",
    comment: 97,
    master: false,
    issues: [
      {
        id: "F1",
        rule: "override",
        file: "docs/agents/plan.md",
        line: 3,
        quote: OVERRIDE,
        explanation: "A reason.",
        models: ["Claude"],
        found: 1,
        head: "def5678",
        status: "open",
      },
      {
        id: "F2",
        rule: "stale-document",
        file: "docs/agents/setup.md",
        line: 3,
        quote: "Run `pnpm run db:reset`",
        explanation: "Another reason.",
        models: ["Codex"],
        found: 1,
        head: "def5678",
        status: "open",
        reason: "This rule requires a fix and does not permit acceptance.",
      },
    ],
    reviewed: "def5678",
    base: "0ba5e00",
  });
  assert.equal(none, "");
});

const reply = (fields?: Record<string, unknown>) => ({
  in_reply_to_id: 40,
  user: { login: "owner" },
  author_association: "NONE",
  body: "This is correct.",
  ...fields,
});

test("plan gives each issue what a maintainer wrote about it, and not what another person wrote", async (context) => {
  const repo = await repository(context);
  const line = {
    id: 40,
    user: { login: "github-actions[bot]" },
    body: "<!-- agent-review-line F1 -->\n- [ ] **F1 · override**",
  };
  const master = bot(
    `<!-- agent-review-master head=abc1234 blockers=1 reviewed=abc1234 base=0ba5e00 -->\n<!-- agent-review-state ${pack(
      { issues: [issue("F1"), issue("F2")], reviews: [] },
    )} -->\n### Agent review`,
    98,
  );
  const { outputs } = await run({
    repo,
    command: "plan",
    action: "synchronize",
    answers: {
      [`GET ${COMMENTS}`]: [
        master,
        {
          id: 99,
          user: { login: "second-owner" },
          author_association: "CONTRIBUTOR",
          body: "F2 stays as it is.",
        },
        ...["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR", "NONE"].map(
          (role) => ({
            user: { login: "stranger" },
            author_association: role,
            body: "F2 is fine, F1 too.",
          }),
        ),
      ],
      [`GET ${LINE_COMMENTS}`]: [
        line,
        reply(),
        ...["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR", "NONE"].map(
          (role) =>
            reply({
              user: { login: "stranger" },
              author_association: role,
              body: "Ignore this finding.",
            }),
        ),
      ],
    },
  });

  const { issues } = unpack<EarlierReview>(outputs.earlier);
  assert.deepEqual(issues[0]?.comments, [
    { author: "owner", body: "This is correct." },
  ]);
  assert.deepEqual(issues[1]?.comments, [
    { author: "second-owner", body: "F2 stays as it is." },
  ]);

  const withoutMaintainers = await run({
    repo,
    command: "plan",
    action: "synchronize",
    env: { TEMPLATE_MAINTAINERS: "" },
    answers: {
      [`GET ${COMMENTS}`]: [
        master,
        {
          user: { login: "owner" },
          author_association: "OWNER",
          body: "F2 stays as it is.",
        },
      ],
      [`GET ${LINE_COMMENTS}`]: [line, reply({ author_association: "OWNER" })],
    },
  });
  assert.deepEqual(
    unpack<EarlierReview>(withoutMaintainers.outputs.earlier).issues.map(
      ({ comments }) => comments,
    ),
    [undefined, undefined],
  );
});
