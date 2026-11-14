import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PROJECT_RULES_FILE,
  PROMPT_FILE,
  RULE_HEADING,
  root,
} from "./agent-review-constants.ts";
import { kindOf } from "./agent-review-shared.ts";
import type { Issue } from "./agent-review-types.ts";

/** Returns the project file from its first rule heading to its end. */
export function projectRules(): string {
  const file = path.join(root, PROJECT_RULES_FILE);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const start = text.search(/^### /m);
  return start === -1 ? "" : text.slice(start).trim();
}

function rulePolicies(): Map<string, string> {
  const rules = new Map<string, string>();
  for (const text of [
    readFileSync(path.join(root, PROMPT_FILE), "utf8"),
    projectRules(),
  ]) {
    const headings = [...text.matchAll(RULE_HEADING)];
    for (const [index, heading] of headings.entries()) {
      const name = heading[1];
      if (name === undefined || rules.has(name)) continue;
      const body = text.slice(
        (heading.index ?? 0) + heading[0].length,
        headings[index + 1]?.index,
      );
      const policy = body.match(
        /^\s*Resolution: (fix-required|maintainer-approval)\s*\n/,
      );
      rules.set(name, policy?.[1] ?? "fix-required");
    }
  }
  return rules;
}

export const policies = rulePolicies();

/** Returns the name of each rule, which is the text of its heading. */
export function ruleNames(): Set<string | undefined> {
  return new Set<string | undefined>(policies.keys());
}

export const permitsApproval = (issue: Issue): boolean =>
  kindOf(issue) === "N" ||
  (issue.rule !== undefined &&
    policies.get(issue.rule) === "maintainer-approval");

// The fields of an issue that stay the same while its status changes.
export const factsOf = ({
  id,
  rule,
  file,
  line,
  quote,
  explanation,
  models,
  commit,
  found,
  reopened,
  lineComment,
  head,
}: Issue) => ({
  id,
  rule,
  file,
  line,
  quote,
  explanation,
  models,
  commit,
  found,
  reopened,
  lineComment,
  head,
});

export const reviewIssues = (issues: Issue[]): Issue[] =>
  issues.map((issue) =>
    issue.status === "accepted" && !permitsApproval(issue)
      ? {
          ...factsOf(issue),
          status: "open",
          reason: "This rule requires a fix and does not permit acceptance.",
        }
      : issue,
  );
