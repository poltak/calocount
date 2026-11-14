import {
  COMMENT_FINDING_LIMIT,
  LINE_PATTERN,
} from "./agent-review-constants.ts";
import { addedLines, linesOfQuote } from "./agent-review-findings.ts";
import {
  callApi,
  escapeOutsideCode,
  flatten,
  readPages,
} from "./agent-review-shared.ts";
import type {
  GithubComment,
  Issue,
  Range,
  View,
} from "./agent-review-types.ts";
import {
  acceptanceText,
  issuePrefix,
  outcomeLines,
} from "./agent-review-view.ts";

interface LineComment {
  path: string;
  side: "RIGHT";
  line: number;
  start_line?: number;
  start_side?: "RIGHT";
  body: string;
}

/**
 * Returns a line comment for each new issue on lines that the pull request
 * adds. The other issues are only in the master comment. GitHub sends the
 * lines around a line comment by email, so an issue in a file with a secret
 * or private data gets none.
 */
export function lineComments({
  added,
  range,
  view,
}: {
  added: Issue[];
  range: Range;
  view: View;
}): LineComment[] {
  return added
    .slice(0, COMMENT_FINDING_LIMIT)
    .filter((issue) => !view.sensitiveFiles.has(issue.file))
    .flatMap((issue): LineComment[] => {
      const { start, end } = linesOfQuote(issue);
      const diffLines = addedLines(issue.file, range);
      const inDiff = Array.from(
        { length: end - start + 1 },
        (_, offset) => start + offset,
      ).filter((line) => diffLines.has(line));
      if (inDiff.length === 0) return [];
      const each = end > start && inDiff.length === end - start + 1;
      return [
        {
          path: issue.file,
          side: "RIGHT",
          line: each ? end : (inDiff[0] ?? end),
          ...(each && { start_line: start, start_side: "RIGHT" as const }),
          body: [
            `<!-- agent-review-line ${issue.id} -->`,
            `${issuePrefix(issue)} **${view.title(issue)}** (${issue.models.join(", ")})`,
            "",
            escapeOutsideCode(flatten(issue.explanation).slice(0, 1000)),
            "",
            `${view.issueLink(issue)} in the master comment of the agent review. ${acceptanceText(issue)}`,
          ].join("\n"),
        },
      ];
    });
}

/**
 * Records verified fixes and maintainer acceptance on line comments. A person
 * resolves the conversation, because GitHub can refuse `resolveReviewThread`
 * to the token of a workflow, also with `pull-requests: write`.
 */
export function markLines({
  repository,
  number,
  issues,
  fixed,
  accepted,
  link,
}: {
  repository: string;
  number: number;
  issues: Issue[];
  fixed: Issue[];
  accepted: Issue[];
  link: string;
}): Map<string, string | undefined> {
  const marks = new Map<string, string[]>([
    ...fixed.map((issue): [string, string[]] => [
      issue.id,
      outcomeLines({ text: `Addressed in ${link}`, item: issue }),
    ]),
    ...accepted.map((issue): [string, string[]] => [
      issue.id,
      [`${issue.acceptedBy} accepted this issue. See ${link}.`],
    ]),
  ]);
  const addresses = new Map<string, string | undefined>();
  const comments = readPages<GithubComment[]>(
    `repos/${repository}/pulls/${number}/comments?per_page=100`,
  ).flat();
  for (const comment of comments) {
    const id = comment.body?.match(LINE_PATTERN)?.[1];
    if (!id || comment.user?.login !== "github-actions[bot]") continue;
    if (!addresses.has(id)) addresses.set(id, comment.html_url);
    const issue = issues.find((issue) => issue.id === id);
    if (!issue) continue;
    const lines = marks.get(id);
    let body = comment.body.replace(
      /^-(?: \[[ x]\])? (?=\*\*[FN]\d+ ·)/m,
      `${issuePrefix(issue)} `,
    );
    body = body.replace(
      "A maintainer accepts the issue as it is with its box, and the next review moves it to the addressed issues.",
      acceptanceText(issue),
    );
    body = body.replace(
      "A configured maintainer can accept this issue with its checkbox. Replies do not grant approval.",
      acceptanceText(issue),
    );
    if (lines && !lines.every((line) => body.includes(line)))
      body = [body, "", ...lines].join("\n");
    if (body === comment.body) continue;
    callApi({
      method: "PATCH",
      route: `repos/${repository}/pulls/comments/${comment.id}`,
      body: { body },
    });
  }
  return addresses;
}
