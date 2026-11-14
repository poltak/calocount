import {
  COMMENT_FINDING_LIMIT,
  LABEL,
  SUMMARY_MARKER,
} from "./agent-review-constants.ts";
import { modelLines, usageLines } from "./agent-review-master.ts";
import {
  are,
  count,
  escapeOutsideCode,
  flatten,
} from "./agent-review-shared.ts";
import type {
  Changes,
  Deleted,
  Issue,
  ModelResult,
  Scope,
  View,
} from "./agent-review-types.ts";
import { firstSentence, isOpen, isOpenFinding } from "./agent-review-view.ts";

const section = (
  title: string,
  items: Issue[],
  entry: (issue: Issue) => string[],
): string[] => {
  if (items.length === 0) {
    return [];
  }
  const hidden = items.length - COMMENT_FINDING_LIMIT;
  return [
    `**${title}: ${items.length}**`,
    "",
    ...items.slice(0, COMMENT_FINDING_LIMIT).flatMap(entry),
    ...(hidden > 0
      ? [`- ${hidden} more ${are(hidden)} in the master comment.`]
      : []),
    "",
  ];
};

/**
 * Returns the summary of a later review: what changed since the earlier
 * review, and the result of the check. It stays short, because the master
 * comment has the full text of each issue, and the status that each model
 * gave it.
 */
export function summaryBody({
  view,
  issues,
  changes,
  review,
  head,
  scope,
  masterUrl,
  blockers,
  models,
  deleted,
}: {
  view: View;
  issues: Issue[];
  changes: Changes;
  review: number;
  head: string;
  scope: Scope;
  masterUrl: string;
  blockers: number;
  models: ModelResult[];
  deleted: Deleted;
}): string {
  const openFindings = issues.filter(isOpenFinding).length;
  const openNotes = issues.filter(isOpen).length - openFindings;
  const where = (issue: Issue, commit = issue.commit) =>
    `${view.issueLink(issue)} ${issue.rule ?? "other issue"} in ${view.link({ file: issue.file, line: issue.line, commit })}`;
  const lines: string[] = [
    `${SUMMARY_MARKER}head=${head} review=${review} -->`,
    `### Agent review ${review}, of ${head.slice(0, 7)}: the check ${blockers === 0 ? "passes" : "fails"}`,
    "",
    `${count(openFindings, "open rule violation")} and ${count(openNotes, "open other issue")}. The [master comment](${masterUrl}) of the agent review has each issue.`,
    "",
    scope.from === scope.base
      ? `The models read each change of the pull request, because ${scope.reason}.`
      : `The models looked for new problems only in [the changes after ${scope.from.slice(0, 7)}](${view.repositoryUrl}/compare/${scope.from}...${head}). Each model read the changes before them in an earlier review.`,
    "",
    ...section("Addressed", changes.fixed, (issue) => [
      `- ${where(issue, issue.commit ?? issue.head)}: ${escapeOutsideCode(flatten(issue.reason ?? "").slice(0, 300))}`,
    ]),
    ...section("Accepted by a maintainer", changes.accepted, (issue) => [
      `- ${where(issue)}: accepted by ${issue.acceptedBy}.`,
    ]),
    ...section("New", changes.added, (issue) => [
      `- ${where(issue)}. ${escapeOutsideCode(firstSentence(issue.explanation))}`,
    ]),
    ...section("Open again", changes.reopened, (issue) => [
      `- ${where(issue)}: ${issue.reason}`,
    ]),
    ...section("The models disagree", changes.disagree, (issue) => [
      `- ${where(issue)}: ${(issue.votes ?? [])
        .filter((vote) => vote.status)
        .map((vote) => `${vote.model} says ${vote.status}`)
        .join(", ")}.`,
    ]),
  ];
  if (Object.values(changes).every((list) => list.length === 0)) {
    lines.push(`No issue changed since review ${review - 1}.`, "");
  }
  lines.push(...modelLines({ models, deleted, title: "The models" }));
  if (blockers > 0) {
    lines.push(
      "",
      `To pass the check, fix each finding that requires a fix. A configured maintainer can accept only findings that permit approval, with their checkboxes or the \`${LABEL}\` label for this head. Replies do not grant approval.`,
    );
  }
  lines.push(...usageLines({ models, title: "Model usage" }));
  return lines.join("\n").trimEnd();
}
