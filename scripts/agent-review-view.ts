import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PROJECT_RULES_FILE,
  PROMPT_FILE,
  RULE_HEADING,
  SENSITIVE_RULES,
  root,
} from "./agent-review-constants.ts";
import { permitsApproval } from "./agent-review-rules.ts";
import { escapeOutsideCode, flatten, kindOf } from "./agent-review-shared.ts";
import type {
  Issue,
  LinkInput,
  ReviewRecord,
  View,
  Vote,
} from "./agent-review-types.ts";
import { VERSION_FILE, type VersionFile } from "./template-files.ts";

// GitHub gives the ID of an anchor in a comment the prefix `user-content-`.
export const anchorOf = (id: string): string =>
  `agent-review-${id.toLowerCase()}`;
export const isOpen = (issue: Issue): boolean => issue.status === "open";
export const isOpenFinding = (issue: Issue): boolean =>
  isOpen(issue) && kindOf(issue) === "F";
export const issuePrefix = (issue: Issue): string =>
  permitsApproval(issue) && issue.status !== "fixed"
    ? `- [${issue.status === "accepted" ? "x" : " "}]`
    : "-";
export const acceptanceText = (issue: Issue): string =>
  permitsApproval(issue)
    ? "A configured maintainer can accept this issue with its checkbox. Replies do not grant approval."
    : "This issue requires a fix. Checkboxes, labels, and replies cannot accept it.";
export const firstSentence = (text: string): string =>
  (flatten(text).split(/(?<=[.!?])\s/)[0] ?? "").slice(0, 300);

/**
 * The status that each model gave an issue, with its reason, as the lines of
 * a Markdown list. With no status from any model, the reason of the outcome
 * says it, so the list is empty.
 */
export function voteLines(votes: Vote[] = []): string[] {
  if (!votes.some((vote) => vote.status)) {
    return [];
  }
  return votes.map(({ model, status, explanation }) =>
    status
      ? `- ${model}: ${status}. ${escapeOutsideCode(flatten(explanation ?? "").slice(0, 300))}`
      : `- ${model} gave no status.`,
  );
}

export function outcomeLines({
  text,
  item,
}: {
  text: string;
  item: Issue;
}): string[] {
  return [
    `${text}${item.reason ? `: ${escapeOutsideCode(flatten(item.reason).slice(0, 300))}` : "."}`,
    ...(voteLines(item.votes).length > 0 ? ["", ...voteLines(item.votes)] : []),
  ];
}

interface GeneralRules {
  repository: string;
  url: string;
  fromTemplate: boolean;
}

/**
 * Returns where the general rules are. In a project, that is the template, at
 * the template commit that the project has, because a person changes the
 * rules there. In the template, it is the reviewed commit.
 */
export function generalRules({
  server,
  repository,
  head,
}: {
  server: string;
  repository: string;
  head: string;
}): GeneralRules {
  const versionFile = path.join(root, VERSION_FILE);
  const version = existsSync(versionFile)
    ? (JSON.parse(readFileSync(versionFile, "utf8")) as Partial<VersionFile>)
    : undefined;
  // `git@github.com:owner/name.git` and `https://github.com/owner/name.git`
  const template = version?.template?.match(
    /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/,
  )?.[1];
  return template
    ? {
        repository: template,
        url: `https://github.com/${template}/blob/${version?.commit}/${PROMPT_FILE}`,
        fromTemplate: true,
      }
    : {
        repository,
        url: `${server}/${repository}/blob/${head}/${PROMPT_FILE}`,
        fromTemplate: false,
      };
}

// An issue of another rule, or a note, can quote the line with the secret.
const sensitiveFilesOf = (issues: Issue[]): Set<string> =>
  new Set(
    issues
      .filter((issue) => SENSITIVE_RULES.has(issue.rule))
      .map((issue) => issue.file),
  );

/**
 * Returns a function that links the name of a rule to its text. GitHub gives
 * each heading of a Markdown file an anchor.
 */
function ruleLinkOf({
  server,
  repository,
  head,
}: {
  server: string;
  repository: string;
  head: string;
}): (rule: string) => string {
  const general = generalRules({ server, repository, head });
  const generalNames = new Set(
    [
      ...readFileSync(path.join(root, PROMPT_FILE), "utf8").matchAll(
        RULE_HEADING,
      ),
    ].map(([, name]) => name),
  );
  const fileUrl = (file: string) =>
    `${server}/${repository}/blob/${head}/${encodeURI(file)}`;
  return (rule) => {
    if (generalNames.has(rule)) {
      return `[${rule}](${general.url}#${rule})`;
    }
    return `[${rule}](${fileUrl(PROJECT_RULES_FILE)}#${rule})`;
  };
}

/**
 * Returns the functions that write the links and the titles of the issues in
 * a comment about the reviewed head. `reviews` gets the address of the
 * comment of each review after the comment is posted.
 */
export function viewOf({
  repository,
  number,
  head,
  issues,
  reviews,
}: {
  repository: string;
  number: number;
  head: string;
  issues: Issue[];
  reviews: ReviewRecord[];
}): View {
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repositoryUrl = `${server}/${repository}`;
  const pullUrl = `${repositoryUrl}/pull/${number}`;
  const ruleLink = ruleLinkOf({ server, repository, head });
  const sensitiveFiles = sensitiveFilesOf(issues);
  return {
    server,
    repositoryUrl,
    pullUrl,
    ruleLink,
    sensitiveFiles,
    link: ({ file, line, commit }: LinkInput) =>
      `[\`${file}${line ? `:${line}` : ""}\`](${repositoryUrl}/blob/${commit ?? head}/${encodeURI(file)}${line ? `#L${line}` : ""})${commit && commit !== head ? ` at commit ${commit.slice(0, 7)}` : ""}`,
    title: (issue) =>
      issue.rule
        ? `${issue.id} · ${ruleLink(issue.rule)}`
        : `${issue.id} · other issue`,
    issueLink: (issue) =>
      `[${issue.id}](${pullUrl}#user-content-${anchorOf(issue.id)})`,
    reviewLink: (review) => {
      const url = review === undefined ? undefined : reviews[review - 1]?.url;
      return url ? `[review ${review}](${url})` : `review ${review}`;
    },
    // A pull request can be public, so the master comment stores no quote
    // that it does not show.
    showsQuote: (issue) =>
      !SENSITIVE_RULES.has(issue.rule) && !sensitiveFiles.has(issue.file),
  };
}
