import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  NOTE_LIMIT,
  SENSITIVE_RULES,
  TOKEN_PATTERN,
  root,
} from "./agent-review-constants.ts";
import { decode, flatten, git } from "./agent-review-shared.ts";
import type {
  Finding,
  ModelResult,
  ModelStatus,
  Range,
} from "./agent-review-types.ts";

/** What `toJSON(needs.<job>)` has about one model job. */
interface JobResult {
  result?: string;
  outputs?: {
    status?: string;
    findings?: string;
    notes?: string;
    statuses?: string;
    usage?: string;
    message?: string;
  };
}

/** Reads the result of one model's job from `toJSON(needs.<job>)`. */
export function modelResult({
  name,
  model,
  job,
}: {
  name: string;
  model: string;
  job: string | undefined;
}): ModelResult {
  const { result, outputs = {} } = JSON.parse(job || "{}") as JobResult;
  const empty = { findings: [], notes: [], statuses: [] };
  if (outputs.status === "not-configured") {
    return { name, model, state: "not-configured", ...empty };
  }
  if (result === "success" && outputs.status === "ok") {
    const withModel = (item: Omit<Finding, "models">): Finding => ({
      ...item,
      models: [name],
    });
    return {
      name,
      model,
      state: "ok",
      findings: decode<Omit<Finding, "models">>(outputs.findings).map(
        withModel,
      ),
      notes: decode<Omit<Finding, "models">>(outputs.notes)
        .slice(0, NOTE_LIMIT)
        .map(withModel),
      statuses: decode<ModelStatus>(outputs.statuses),
      usage: outputs.usage,
    };
  }
  return {
    name,
    model,
    state: "failed",
    message:
      outputs.message || `The job ended with "${result ?? "no result"}".`,
    ...empty,
  };
}

/** A new document needs a person's request, which no model can see. */
export function newDocuments({ base, head }: Range): Finding[] {
  return git(
    "diff",
    "--name-only",
    "--diff-filter=A",
    base,
    head,
    "--",
    "docs/agents/",
    // `docs/agents/README.md` permits a project these files with no request.
    ":(exclude)docs/agents/project/",
  )
    .split("\n")
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      rule: "new-document",
      file,
      line: 1,
      quote:
        readFileSync(path.join(root, file), "utf8")
          .split("\n")
          .find((line) => line.trim()) ?? "",
      explanation:
        "The pull request adds a document in docs/agents/. docs/agents/README.md permits a new document only when a person asks for one, so a maintainer confirms that a person asked for it.",
      models: ["script"],
    }));
}

export const quoteIsInFile = ({
  file,
  quote,
}: {
  file: string;
  quote: string;
}): boolean => {
  const filePath = path.resolve(root, file);
  return (
    filePath.startsWith(root) &&
    existsSync(filePath) &&
    flatten(quote).length > 0 &&
    flatten(readFileSync(filePath, "utf8")).includes(flatten(quote))
  );
};

/**
 * Returns the oldest commit of the pull request that adds a line with the
 * quote to the file, or undefined. A value that one commit adds stays on
 * GitHub when a later commit deletes it, so the head is not enough. The quote
 * is only the text before the value, so a later commit that empties the value
 * can add the quote again. When the full file is the problem, the quote is
 * its path, and the result is the oldest commit that has the file.
 */
export function commitWithQuote(
  { file, quote }: { file: string; quote: string },
  { base, head }: Range,
): string | undefined {
  const text = flatten(quote);
  // The path comes from the model, so Git must not read it as a pattern, and
  // a path outside the repository must not stop the verdict.
  const log = spawnSync(
    "git",
    [
      "--literal-pathspecs",
      "log",
      "--reverse",
      "--format=%H",
      `${base}..${head}`,
      "--",
      file,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (!text || log.status !== 0) return undefined;
  return log.stdout
    .split("\n")
    .filter(Boolean)
    .find((commit) => {
      if (text === file) {
        return (
          spawnSync("git", ["cat-file", "-e", `${commit}:${file}`], {
            cwd: root,
          }).status === 0
        );
      }
      const shown = spawnSync(
        "git",
        [
          "--literal-pathspecs",
          "show",
          "--format=",
          "--no-color",
          "--no-ext-diff",
          "-U0",
          commit,
          "--",
          file,
        ],
        { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      );
      // The lines before the first hunk are the header, such as `+++ b/name`.
      let inHunk = false;
      const added: string[] = [];
      for (const line of shown.stdout.split("\n")) {
        if (line.startsWith("@@")) inHunk = true;
        else if (inHunk && line.startsWith("+")) added.push(line.slice(1));
      }
      return shown.status === 0 && flatten(added.join("\n")).includes(text);
    });
}

/**
 * Merges the findings that quote the same text, and keeps each model. The
 * comment shows no quote of a sensitive rule, and two models quote different
 * lines of one file, so it merges those findings by file.
 */
export function mergeFindings(findings: Finding[]): Finding[] {
  const merged: Finding[] = [];
  for (const finding of findings) {
    const quote = flatten(finding.quote);
    const same = merged.find(
      (other) =>
        other.file === finding.file &&
        (SENSITIVE_RULES.has(finding.rule) || SENSITIVE_RULES.has(other.rule)
          ? other.rule === finding.rule
          : flatten(other.quote).includes(quote) ||
            quote.includes(flatten(other.quote))),
    );
    if (same) {
      same.models = [...new Set([...same.models, ...finding.models])];
    } else {
      merged.push({
        ...finding,
        explanation: finding.explanation.replace(TOKEN_PATTERN, "[removed]"),
      });
    }
  }
  return merged;
}

export function sameFinding(
  one: Pick<Finding, "file" | "rule" | "quote">,
  other: Pick<Finding, "file" | "rule" | "quote">,
): boolean {
  if (one.file !== other.file) return false;
  const first = flatten(one.quote ?? "");
  const second = flatten(other.quote ?? "");
  // The comment stores no quote of a sensitive rule, or from its file.
  if (!first || !second || SENSITIVE_RULES.has(one.rule)) {
    return one.rule === other.rule;
  }
  return first.includes(second) || second.includes(first);
}

export function linesOfQuote({
  file,
  quote,
  line,
}: Pick<Finding, "file" | "quote" | "line">): { start: number; end: number } {
  const quoted = (quote ?? "")
    .trim()
    .split("\n")
    .map((text) => text.trim());
  const [first] = quoted;
  if (!first) return { start: line, end: line };
  const lines = readFileSync(path.resolve(root, file), "utf8").split("\n");
  // A short quote can be on more lines than one, so the line that the model
  // gave goes first.
  const index = lines[line - 1]?.includes(first)
    ? line - 1
    : lines.findIndex((text) => text.includes(first));
  return index === -1
    ? { start: line, end: line }
    : { start: index + 1, end: index + quoted.length };
}

/**
 * Returns the lines that the pull request adds to the file. GitHub refuses a
 * review with a comment on a line that is not in the diff.
 */
export function addedLines(file: string, { base, head }: Range): Set<number> {
  const diff = spawnSync(
    "git",
    [
      "--literal-pathspecs",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--unified=0",
      base,
      head,
      "--",
      file,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const hunks = (diff.stdout ?? "").matchAll(
    /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm,
  );
  return new Set(
    [...hunks].flatMap(([, start, length = "1"]) =>
      Array.from(
        { length: Number(length) },
        (_, offset) => Number(start) + offset,
      ),
    ),
  );
}
