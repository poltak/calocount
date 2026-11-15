// The steps of the "Agent review" workflow of CI. A model reads each pull
// request and reports text that breaks a rule that no lint rule or test can
// check. The general rules are in `.agents/review/prompt.md`, which comes from
// the template. A project adds its own rules in
// `.agents/review/project-rules.md`, which a sync never changes. The workflow
// runs one command in each job:
//
//   node scripts/agent-review.ts plan              review, label, or skip
//   node scripts/agent-review.ts claude            the review with Claude Code
//   node scripts/agent-review.ts codex             the review with Codex
//   node scripts/agent-review.ts save-codex-login  keep Codex's new login
//   node scripts/agent-review.ts verdict           the comments and the result
//
// The models report two kinds of issue. A finding breaks a rule, and the
// comments call it a rule violation. Its ID is such as F3, and it fails the
// check while it is open. A note is about a problem that no rule covers, and
// the comments call it an other issue. Its ID is such as N2, and it does not
// fail the check. The ID of an issue does not change in later reviews.
//
// The first review posts the master comment of the pull request. It shows
// each issue as open or addressed, and it stores the issues. Each later review
// gives the open issues to the models, which say which ones the new commits
// addressed. Then it edits the master comment, and posts a summary comment, so
// that GitHub sends a notification. The summary says what changed, and links
// each issue to its entry in the master comment.
//
// A maintainer accepts only findings whose rules permit approval. The
// `agent-review-accepted` label accepts those findings for one head. Findings
// that require a fix and failed review jobs still block it. A later review
// removes the label, so it is for the findings that the maintainer saw. A draft gets its
// review when it is ready, and a dependency update gets none.
//
// The master comment also stores the newest commit that each model read. When
// the pull request only added commits after it, the next review looks for new
// problems only in those commits, so a small push costs a small review.
//
// Each new issue on lines that the pull request adds also gets a comment on
// those lines, in a review. When a later review finds that it is addressed, it
// records the verified fix without an acceptance box.
//
// Each command reads the event from GITHUB_EVENT_PATH, and writes its outputs
// to GITHUB_OUTPUT. The maintainers are in TEMPLATE_MAINTAINERS, with commas or
// spaces between them. `gh` reads its token from GH_TOKEN.

import { claude, codex, saveCodexLogin } from "./agent-review-models.ts";
import { plan } from "./agent-review-plan.ts";
import { verdict } from "./agent-review-verdict.ts";

const commands: Record<string, () => boolean | void> = {
  plan,
  claude,
  codex,
  "save-codex-login": saveCodexLogin,
  verdict,
};
const command = commands[process.argv[2] ?? ""];
if (!command) {
  console.error(
    `Usage: node scripts/agent-review.ts <${Object.keys(commands).join("|")}>`,
  );
  process.exit(2);
}
process.exitCode = command() === false ? 1 : 0;
