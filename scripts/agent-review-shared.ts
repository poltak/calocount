import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { root, STATE_PATTERN } from "./agent-review-constants.ts";
import type {
  Issue,
  Range,
  ReviewEvent,
  ReviewState,
} from "./agent-review-types.ts";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is not set.`);
  return value;
}

export const readEvent = (): ReviewEvent =>
  JSON.parse(
    readFileSync(requireEnv("GITHUB_EVENT_PATH"), "utf8"),
  ) as ReviewEvent;

export function writeOutputs(outputs: Record<string, string>): void {
  const lines = Object.entries(outputs).map(
    ([key, value]) => `${key}=${value}`,
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
}

export function isMaintainer(login: string | undefined): boolean {
  return (process.env.TEMPLATE_MAINTAINERS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((name) => name.toLowerCase() === login?.toLowerCase());
}

export const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

/** Returns the commit where the branch left its base, and the head commit. */
export function rangeOf(event: ReviewEvent): Range {
  const head = event.pull_request.head.sha;
  return { base: git("merge-base", event.pull_request.base.sha, head), head };
}

export function readPages<T>(route: string): T[] {
  return JSON.parse(
    execFileSync("gh", ["api", "--paginate", "--slurp", route], {
      encoding: "utf8",
    }),
  ) as T[];
}

export function readOne<T>(route: string): T {
  const [item] = readPages<T>(route);
  if (item === undefined) throw new Error(`${route} gave no answer.`);
  return item;
}

export function callApi<T = unknown>({
  method,
  route,
  body,
}: {
  method: string;
  route: string;
  body?: unknown;
}): T | undefined {
  const output = execFileSync(
    "gh",
    ["api", "--method", method, route, "--input", "-"],
    { encoding: "utf8", input: JSON.stringify(body ?? {}) },
  );
  return output.trim() ? (JSON.parse(output) as T) : undefined;
}

export const encode = (findings: unknown): string =>
  Buffer.from(JSON.stringify(findings)).toString("base64");
export const flatten = (text: string): string =>
  text.replace(/\s+/g, " ").trim();
export const count = (number: number, word: string): string =>
  `${number} ${word}${number === 1 ? "" : "s"}`;
export const decode = <T>(text: string | undefined): T[] =>
  text ? (JSON.parse(Buffer.from(text, "base64").toString("utf8")) as T[]) : [];
// The master comment stores the issues, and gzip keeps them inside its limit.
export const pack = (value: unknown): string =>
  gzipSync(JSON.stringify(value)).toString("base64");
export const unpack = <T>(text: string | undefined): T | undefined =>
  text
    ? (JSON.parse(
        gunzipSync(Buffer.from(text, "base64")).toString("utf8"),
      ) as T)
    : undefined;
export const stateOf = (body: string): ReviewState | undefined =>
  unpack<ReviewState>(body.match(STATE_PATTERN)?.[1]);
// "F" for a finding, and "N" for a note.
export const kindOf = (issue: Issue): string => issue.id[0] ?? "";
export const are = (number: number): string => (number === 1 ? "is" : "are");

export const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
// Markdown shows a code span as it is, so an escape in it would show as text.
export const escapeOutsideCode = (text: string): string =>
  text
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : escapeHtml(part)))
    .join("");

export function errorMessage(error: unknown): string {
  const { stderr, message } = error as { stderr?: unknown; message?: unknown };
  return String(stderr || message);
}

/**
 * Puts the quote in a code block, so that Markdown in it, such as a heading,
 * shows as text. The fence is longer than each run of backticks in the quote.
 */
export function quoteBlock(quote: string): string {
  const longest = Math.max(
    0,
    ...(quote.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${quote.trim()}\n${fence}`;
}
