import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  PROJECT_RULES,
  PULL,
  SUMMARY_POST,
  at,
  commitAll,
  finding,
  git,
  inputOf,
  job,
  note,
  repository,
  run,
  stateIn,
} from "./agent-review-fixtures.ts";

test("verdict keeps a finding of a project rule, deletes one of a rule that the review does not have, and links both files of rules", async (context) => {
  const repo = await repository(context);
  await writeFile(
    path.join(repo.directory, ".agents/review/project-rules.md"),
    PROJECT_RULES,
  );
  await writeFile(
    path.join(repo.directory, "template-version.json"),
    JSON.stringify({
      template: "git@github.com:acme/template.git",
      commit: "abc123",
      skipped: [],
    }),
  );
  const result = await run({
    repo,
    command: "verdict",
    head: repo.base,
    answers: { [`GET ${PULL}`]: { head: { sha: repo.base } } },
    env: {
      MODE: "review",
      CLAUDE_JOB: job([
        finding({
          rule: "patient-data",
          file: "docs/agents/setup.md",
          quote: "for a new database",
        }),
      ]),
      CODEX_JOB: job([
        finding({
          rule: "style",
          file: "docs/agents/setup.md",
          quote: "# Setup",
        }),
      ]),
    },
  });

  assert.equal(result.status, 1, result.output);
  const { body } = inputOf(result, SUMMARY_POST);
  assert.match(body, /blockers=1 reviewed=\w+ base=\w+ -->/);
  assert.match(
    body,
    /\*\*F1 · \[patient-data\]\([^)]*#patient-data\)\*\* in \[`docs\/agents\/setup\.md:3`\]\(https:\/\/github\.com\/acme\/project\/blob\/\w+\/docs\/agents\/setup\.md#L3\) \(Claude\)/,
  );
  assert.doesNotMatch(body, /style/);
  assert.match(
    body,
    /- Deleted: 1 rule violation whose rule is not a rule of the review\./,
  );
  assert.match(result.output, /"style" is not a rule of the review/);
  assert.match(
    body,
    /The general rules are in \[`\.agents\/review\/prompt\.md` of acme\/template\]\(https:\/\/github\.com\/acme\/template\/blob\/abc123\/\.agents\/review\/prompt\.md\), the template that this project comes from\. The rules of acme\/project only are in \[`\.agents\/review\/project-rules\.md`\]\(https:\/\/github\.com\/acme\/project\/blob\/\w+\/\.agents\/review\/project-rules\.md\)\./,
  );
});

test("verdict finds a secret that a later commit deletes, merges by file, and shows no quote from a file with a secret or private data", async (context) => {
  const repo = await repository(context);
  await writeFile(
    path.join(repo.directory, ".env.production"),
    "LOG_LEVEL=info\nPAYMENT_API_KEY=a-made-up-key-for-this-test\n",
  );
  await mkdir(path.join(repo.directory, "src"));
  await writeFile(
    path.join(repo.directory, "src/settings.ts"),
    'export const token = "a-made-up-token";\n',
  );
  const added = commitAll(repo.directory, "Add the production settings");
  await writeFile(
    path.join(repo.directory, "src/settings.ts"),
    "export const token = process.env.TOKEN;\n",
  );
  await rm(path.join(repo.directory, ".env.production"));
  await mkdir(path.join(repo.directory, "scans"));
  await writeFile(
    path.join(repo.directory, "scans/report.pdf"),
    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]),
  );
  await mkdir(path.join(repo.directory, "samples"));
  await writeFile(
    path.join(repo.directory, "samples/people.json"),
    '{\n  "name": "A Person",\n  "dateOfBirth": "1961-07-23"\n}\n',
  );
  const head = commitAll(
    repo.directory,
    "Delete the production settings, and add samples",
  );

  const result = await run({
    repo,
    command: "verdict",
    head,
    answers: { [`GET ${PULL}`]: { head: { sha: head } } },
    env: {
      MODE: "review",
      CLAUDE_JOB: job(
        [
          finding({
            rule: "secret",
            file: ".env.production",
            quote: "PAYMENT_API_KEY=",
            explanation: "A live payment key.",
          }),
          finding({
            rule: "secret",
            file: "docs/agents/setup.md",
            quote: "Run `pnpm run db:reset`",
          }),
          finding({
            rule: "private-data",
            file: "samples/people.json",
            quote: '"name":',
            explanation: "The name and the date of birth of a person.",
          }),
          finding({
            rule: "secret",
            file: "src/settings.ts",
            quote: "export const token =",
            explanation: "A token.",
          }),
        ],
        [
          note({
            file: "samples/people.json",
            quote: '"name": "A Person",',
            explanation: "A note.",
          }),
        ],
      ),
      CODEX_JOB: job([
        finding({
          rule: "private-data",
          file: "scans/report.pdf",
          quote: "scans/report.pdf",
          explanation: "A scan of a lab report.",
        }),
        finding({
          rule: "secret",
          file: ".env.production",
          quote: "PAYMENT_API_KEY=a-wrong-key",
        }),
        finding({
          rule: "secret",
          file: "../outside.env",
          quote: "../outside.env",
        }),
        finding({
          rule: "private-data",
          file: "samples/people.json",
          quote: '"dateOfBirth":',
        }),
        finding({
          rule: "comment-restates-code",
          file: "samples/people.json",
          quote: '"name": "A Person",',
          explanation: "Another rule.",
        }),
      ]),
    },
  });

  assert.equal(result.status, 1, result.output);
  const { body } = inputOf(result, SUMMARY_POST);
  assert.match(body, /blockers=6 reviewed=\w+ base=\w+ -->/);
  const entry = (link: string, models: string, explanation: string) =>
    `in [\`${link} (${models}) · ${explanation === "A note." ? "Nonblocking note" : explanation === "Another rule." ? "Maintainer approval permitted" : "Fix required"} · found in review 1\n\n${explanation}`;
  for (const text of [
    entry(
      `src/settings.ts:3\`](https://github.com/acme/project/blob/${added}/src/settings.ts#L3) at commit ${added.slice(0, 7)}`,
      "Claude",
      "A token.",
    ),
    entry(
      `.env.production:3\`](https://github.com/acme/project/blob/${added}/.env.production#L3) at commit ${added.slice(0, 7)}`,
      "Claude",
      "A live payment key.",
    ),
    entry(
      `scans/report.pdf:3\`](https://github.com/acme/project/blob/${head}/scans/report.pdf#L3)`,
      "Codex",
      "A scan of a lab report.",
    ),
    entry(
      `samples/people.json:3\`](https://github.com/acme/project/blob/${head}/samples/people.json#L3)`,
      "Claude, Codex",
      "The name and the date of birth of a person.",
    ),
    entry(
      `samples/people.json:3\`](https://github.com/acme/project/blob/${head}/samples/people.json#L3)`,
      "Codex",
      "Another rule.",
    ),
    entry(
      `samples/people.json:1\`](https://github.com/acme/project/blob/${head}/samples/people.json#L1)`,
      "Claude",
      "A note.",
    ),
  ]) {
    assert.ok(body.includes(text), `${text}\n\n${body}`);
  }
  assert.doesNotMatch(body, /A Person/);
  const state = stateIn(body);
  assert.doesNotMatch(JSON.stringify(state), /A Person|PAYMENT_API_KEY/);
  assert.equal(
    state.issues.find(({ file }) => file === "src/settings.ts")?.commit,
    added,
  );
  assert.match(body, /```text\n# The plan\n```/);
  assert.match(
    body,
    /The comments do not show a quote from a file that has a `secret` or `private-data` rule violation\./,
  );
  assert.match(
    body,
    /- Deleted: 3 issues whose quotes are not in the named file\./,
  );
  assert.doesNotMatch(result.output, /PAYMENT_API_KEY|pnpm run db:reset/);
  assert.match(
    result.output,
    /because its quote is not in docs\/agents\/setup\.md\.\n/,
  );
});

test("verdict reports no new document for a project's own file", async (context) => {
  const repo = await repository(context);
  await mkdir(path.join(repo.directory, "docs/agents/project"));
  await writeFile(
    path.join(repo.directory, "docs/agents/project/rules.md"),
    "# Rules of the project\n",
  );
  git(repo.directory, "add", ".");
  git(
    repo.directory,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "-m",
    "Add the rules of the project",
  );
  const head = git(repo.directory, "rev-parse", "HEAD");

  const result = await run({
    repo: { ...repo, head },
    command: "verdict",
    action: "synchronize",
    answers: { [`GET ${PULL}`]: { head: { sha: head } } },
    env: { MODE: "review", CLAUDE_JOB: job([]), CODEX_JOB: job([]) },
  });

  const { body } = inputOf(result, SUMMARY_POST);
  assert.match(body, /\[new-document\]/);
  assert.match(body, /docs\/agents\/plan\.md/);
  assert.doesNotMatch(body, /project\/rules\.md/);
});
