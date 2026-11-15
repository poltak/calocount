import { fileURLToPath } from "node:url";

export const LABEL = "agent-review-accepted";
// A marker must not start with another one, because the script finds a
// comment by the start of its text.
export const MASTER_MARKER = "<!-- agent-review-master ";
export const SUMMARY_MARKER = "<!-- agent-review-summary ";
// Before the master comment, each review posted one comment with this marker.
export const OLD_MARKER = "<!-- agent-review head=";
// `reviewed` is the newest commit that each model read, and `base` is the
// merge base of that review. A comment from before they were stored has
// neither.
export const MARKER_FIELDS =
  /^<!-- agent-review(?:-master)? head=(\w+) blockers=(\d+)(?: reviewed=(\w+) base=(\w+))? -->/;
export const STATE_PATTERN = /^<!-- agent-review-state (\S+) -->$/m;
export const OLD_FINDINGS_PATTERN = /^<!-- agent-review-findings (\S+) -->$/m;
// The models read the open issues of the earlier review from this file. The
// checkout does not track it, so it is not a part of the pull request.
export const EARLIER_FILE = ".agent-review/earlier-issues.md";
// The box of an issue, with its ID, in the master comment or in a line
// comment.
export const BOX = /^- \[([ x])\] (?:<a id="[\w-]+"><\/a>)?\*\*([FN]\d+) ·/gm;
// GraphQL and REST give the login of the token of a workflow in two forms.
export const BOT_LOGINS = new Set<string | undefined>([
  "github-actions",
  "github-actions[bot]",
]);
// GitHub keeps each version of a comment, with the person who made it, so a
// review can see who checked a box. The query reads 100 conversations and 100
// versions of each comment, with no more pages. A box past that limit accepts
// nothing, so its finding stays open.
export const EDITS_QUERY = `query ($comment: ID!, $owner: String!, $name: String!, $number: Int!) {
  comment: node(id: $comment) {
    ... on IssueComment {
      userContentEdits(first: 100) { nodes { editedAt editor { login } diff } }
    }
  }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          comments(first: 1) {
            nodes {
              author { login }
              body
              userContentEdits(first: 100) { nodes { editedAt editor { login } diff } }
            }
          }
        }
      }
    }
  }
}`;
export const MINIMIZE_QUERY = `mutation ($id: ID!) {
  minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
    minimizedComment { isMinimized }
  }
}`;
// Each line comment has the ID of its issue, so that a later review can find
// the line comment of an issue that it addressed.
export const LINE_PATTERN = /<!-- agent-review-line ([FN]\d+) -->/;
export const ISSUE_ID = /\b[FN]\d+\b/g;
export const PROMPT_FILE = ".agents/review/prompt.md";
export const PROJECT_RULES_FILE = ".agents/review/project-rules.md";
export const SCHEMA_FILE = ".agents/review/findings.schema.json";
export const REVIEW_DIRECTORY = ".agents/review/";
export const RULE_HEADING = /^### +(.+?) *$/gm;
// A dependency update changes versions and the lockfile, and no text that the
// rules are about.
export const DEPENDENCY_BOTS = new Set(["renovate[bot]", "dependabot[bot]"]);
export const REVIEW_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
]);
// The reviewer reads the repository and the Git history, and nothing else.
// Without a tool for the web or for edits, a pull request cannot make it send
// or change data.
export const CLAUDE_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git grep:*)",
];
export const CLAUDE_DENIED_TOOLS = [
  "Agent",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
];
// A model can copy a token from its environment or from a file into an
// explanation, and the comment would show it to each reader of the pull
// request.
export const TOKEN_PATTERN =
  /\b(?:sk-ant-[\w-]{8,}|sk-[\w-]{20,}|github_pat_\w{20,}|gh[pousr]_\w{20,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+)/g;
// GitHub can send each comment by email, and the email stays after a person
// edits the comment. So the comment shows no quote from a file that has a
// finding of these rules.
export const SENSITIVE_RULES = new Set<string | undefined>([
  "secret",
  "private-data",
]);
export const SENSITIVE_TEXT =
  "The comments do not show a quote from a file that has a `secret` or `private-data` rule violation. A later commit that deletes the text does not delete it from GitHub, so revoke each secret that a pushed commit has, and make a new one. Only GitHub Support can remove the commits of a pull request.";
export const COMMENT_FINDING_LIMIT = 50;
// GitHub refuses a comment longer than 65,536 characters.
export const COMMENT_LENGTH_LIMIT = 65_000;
// Notes do not fail the check, so a long list of them is only noise.
export const NOTE_LIMIT = 3;
export const root = fileURLToPath(new URL("..", import.meta.url));
