import { existsSync } from "node:fs";
import path from "node:path";
import {
  COMMENT_LENGTH_LIMIT,
  LABEL,
  MASTER_MARKER,
  PROJECT_RULES_FILE,
  PROMPT_FILE,
  SENSITIVE_TEXT,
  root,
} from "./agent-review-constants.ts";
import {
  are,
  count,
  escapeHtml,
  escapeOutsideCode,
  flatten,
  kindOf,
  pack,
  quoteBlock,
} from "./agent-review-shared.ts";
import { permitsApproval } from "./agent-review-rules.ts";
import type {
  CommentLimits,
  Deleted,
  Issue,
  ModelResult,
  Read,
  ReviewRecord,
  View,
} from "./agent-review-types.ts";
import {
  anchorOf,
  generalRules,
  isOpen,
  isOpenFinding,
  issuePrefix,
  outcomeLines,
  voteLines,
} from "./agent-review-view.ts";

// A paragraph comes first, because Markdown joins two lists with only an
// empty line between them into one list.
export function modelLines({
  models,
  deleted,
  title,
}: {
  models: ModelResult[];
  deleted: Deleted;
  title: string;
}): string[] {
  const states = (model: ModelResult) =>
    ({
      ok: `${count(model.findings.length, "rule violation")}, ${count(model.notes.length, "other issue")}`,
      "not-configured": "not set up",
      failed: `failed. ${escapeHtml(model.message ?? "")}`,
    })[model.state];
  return [
    `**${title}**`,
    "",
    ...models.map(
      (model) => `- ${model.name} (${model.model}): ${states(model)}`,
    ),
    ...(deleted.quote > 0
      ? [
          `- Deleted: ${count(deleted.quote, "issue")} whose ${deleted.quote === 1 ? "quote" : "quotes"} ${are(deleted.quote)} not in the named file.`,
        ]
      : []),
    ...(deleted.rule > 0
      ? [
          `- Deleted: ${count(deleted.rule, "rule violation")} whose ${deleted.rule === 1 ? "rule" : "rules"} ${are(deleted.rule)} not a rule of the review.`,
        ]
      : []),
  ];
}

export function usageLines({
  models,
  title,
}: {
  models: ModelResult[];
  title: string;
}): string[] {
  const used = models.filter((model) => model.usage);
  if (used.length === 0) return [];
  return [
    "",
    "<details>",
    `<summary>${title}</summary>`,
    "",
    ...used.map((model) => `- ${model.name}: ${model.usage}`),
    "",
    "</details>",
  ];
}

function rulesText({
  view,
  repository,
  head,
}: {
  view: View;
  repository: string;
  head: string;
}): string {
  const general = generalRules({ server: view.server, repository, head });
  const generalText = general.fromTemplate
    ? `The general rules are in [\`${PROMPT_FILE}\` of ${general.repository}](${general.url}), the template that this project comes from.`
    : `The general rules are in [\`${PROMPT_FILE}\`](${general.url}).`;
  const projectText = existsSync(path.join(root, PROJECT_RULES_FILE))
    ? ` The rules of ${repository} only are in ${view.link({ file: PROJECT_RULES_FILE })}.`
    : "";
  return `${generalText}${projectText} The \`${LABEL}\` label accepts only findings whose rules permit maintainer approval, for this head. Findings that require a fix and failed review jobs still fail the check. A later review with open rule violations removes the label.`;
}

function openEntry({
  issue,
  view,
  review,
}: {
  issue: Issue;
  view: View;
  review: number;
}): string[] {
  const marks = [
    `found in review ${issue.found}`,
    ...(issue.reopened ? [`open again in review ${issue.reopened}`] : []),
    ...(issue.lineComment ? [`[on its line](${issue.lineComment})`] : []),
  ];
  return [
    `${issuePrefix(issue)} <a id="${anchorOf(issue.id)}"></a>**${view.title(issue)}** in ${view.link(issue)} (${issue.models.join(", ")}) · ${kindOf(issue) === "N" ? "Nonblocking note" : permitsApproval(issue) ? "Maintainer approval permitted" : "Fix required"} · ${marks.join(" · ")}`,
    "",
    ...(view.showsQuote(issue) ? [quoteBlock(issue.quote), ""] : []),
    escapeOutsideCode(flatten(issue.explanation).slice(0, 1000)),
    "",
    // In a quote, the list of the models does not join the list of the next
    // issue.
    ...(issue.found === review
      ? []
      : [
          ...outcomeLines({ text: "Not yet addressed", item: issue }).map(
            (line) => (line ? `> ${line}` : ">"),
          ),
          "",
        ]),
  ];
}

function addressedEntry({
  issue,
  view,
}: {
  issue: Issue;
  view: View;
}): string[] {
  const where = `<a id="${anchorOf(issue.id)}"></a>**${issue.id} · ${issue.rule ?? "other issue"}** in ${view.link({ file: issue.file, line: issue.line, commit: issue.commit ?? issue.head })}`;
  return issue.status === "accepted"
    ? [
        `- [x] ${where} · accepted by ${issue.acceptedBy} in ${view.reviewLink(issue.acceptedIn)}. To open it again, a maintainer clears its box.`,
      ]
    : [
        `- ${where} · addressed in ${view.reviewLink(issue.fixedIn)}: ${escapeOutsideCode(flatten(issue.reason ?? "").slice(0, 300))}`,
        ...voteLines(issue.votes).map((line) => `  ${line}`),
      ];
}

/**
 * Returns the master comment, which stores each issue for the next review.
 * `full` shows each issue, and `body` shows as many as fit in a comment:
 * first it leaves out the oldest addressed issues, then the last open ones.
 */
export function masterBody({
  view,
  repository,
  issues,
  reviews,
  head,
  read,
  blockers,
  models,
  deleted,
}: {
  view: View;
  repository: string;
  issues: Issue[];
  reviews: ReviewRecord[];
  head: string;
  read: Read;
  blockers: number;
  models: ModelResult[];
  deleted: Deleted;
}): { body: string; full: string } {
  const review = reviews.at(-1);
  if (!review) throw new Error("A master comment needs a review.");
  const open = [
    ...issues.filter((issue) => isOpenFinding(issue)),
    ...issues.filter((issue) => isOpen(issue) && kindOf(issue) === "N"),
  ];
  const addressed = issues
    .filter((issue) => !isOpen(issue))
    .sort(
      (one, other) =>
        (other.acceptedIn ?? other.fixedIn ?? NaN) -
        (one.acceptedIn ?? one.fixedIn ?? NaN),
    );
  const stored = issues.map((issue) => ({
    ...issue,
    quote: view.showsQuote(issue) ? issue.quote : "",
    explanation: flatten(issue.explanation).slice(
      0,
      issue.status === "fixed" ? 300 : 1000,
    ),
    votes: issue.votes?.map((vote) => ({
      ...vote,
      explanation: flatten(vote.explanation ?? "").slice(0, 300),
    })),
  }));
  const openFindings = open.filter((issue) => kindOf(issue) === "F").length;
  const render = (limits: CommentLimits) => {
    const lines: string[] = [
      `${MASTER_MARKER}head=${head} blockers=${blockers}${read.reviewed ? ` reviewed=${read.reviewed} base=${read.base}` : ""} -->`,
      `<!-- agent-review-state ${pack({ issues: stored, reviews })} -->`,
      "### Agent review",
      "",
      `After review ${review.number}, of [${head.slice(0, 7)}](${view.repositoryUrl}/commit/${head}): ${count(openFindings, "open rule violation")}, ${count(open.length - openFindings, "open other issue")}, and ${count(addressed.length, "addressed issue")}.${review.number > 1 && review.url ? ` The [summary of review ${review.number}](${review.url}) says what changed.` : ""}`,
      "",
      `#### Open issues: ${open.length}`,
      "",
      open.length > 0
        ? "Findings marked Fix required cannot be accepted. Only findings that permit maintainer approval and nonblocking notes have acceptance checkboxes. Replies are evidence, not approval. An open rule violation fails the check. An other issue does not."
        : "No issue is open.",
      "",
    ];
    open.slice(0, limits.open).forEach((issue, index) => {
      const previous = open[index - 1];
      if (!previous || kindOf(issue) !== kindOf(previous)) {
        lines.push(
          `**${kindOf(issue) === "F" ? "Rule violations" : "Other issues"}**`,
          "",
        );
      }
      lines.push(...openEntry({ issue, view, review: review.number }));
    });
    const hiddenOpen = open.length - limits.open;
    if (hiddenOpen > 0) {
      lines.push(
        `${count(hiddenOpen, "more open issue")} ${are(hiddenOpen)} in the log of the workflow.`,
        "",
      );
    }
    if (addressed.length > 0) {
      const hidden = addressed.length - limits.addressed;
      lines.push(
        "<details>",
        `<summary>Addressed issues: ${addressed.length}</summary>`,
        "",
        ...addressed
          .slice(0, limits.addressed)
          .flatMap((issue) => addressedEntry({ issue, view })),
        ...(hidden > 0
          ? [
              "",
              `${count(hidden, "older addressed issue")} ${are(hidden)} only in the summaries of their reviews.`,
            ]
          : []),
        "",
        "</details>",
        "",
      );
    }
    if (reviews.length > 1) {
      lines.push(
        "<details>",
        `<summary>Reviews: ${reviews.length}</summary>`,
        "",
        "| Review | Commit | The models read | New | Addressed | Open after |",
        "| --- | --- | --- | --- | --- | --- |",
        ...reviews
          .slice(-30)
          .map(
            (entry) =>
              `| ${view.reviewLink(entry.number)} | ${entry.head.slice(0, 7)} | ${entry.from ? `the changes after ${entry.from.slice(0, 7)}` : "each change"} | ${entry.added} | ${entry.addressed} | ${entry.open} |`,
          ),
        "",
        "</details>",
        "",
      );
    }
    if (view.sensitiveFiles.size > 0) {
      lines.push(SENSITIVE_TEXT, "");
    }
    lines.push(
      ...modelLines({
        models,
        deleted,
        title: `The models of review ${review.number}`,
      }),
    );
    if (blockers > 0) {
      lines.push("", rulesText({ view, repository, head }));
    }
    lines.push(
      ...usageLines({
        models,
        title: `Model usage in review ${review.number}`,
      }),
    );
    return lines.join("\n").trimEnd();
  };
  let limits: CommentLimits = {
    open: open.length,
    addressed: addressed.length,
  };
  const full = render(limits);
  let body = full;
  while (
    body.length > COMMENT_LENGTH_LIMIT &&
    (limits.open > 0 || limits.addressed > 0)
  ) {
    limits =
      limits.addressed > 0
        ? { ...limits, addressed: Math.max(0, limits.addressed - 10) }
        : { ...limits, open: Math.max(0, limits.open - 5) };
    body = render(limits);
  }
  return { body, full };
}
