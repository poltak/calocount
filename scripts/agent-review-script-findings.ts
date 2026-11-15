import { readFileSync } from "node:fs";
import path from "node:path";
import { root } from "./agent-review-constants.ts";
import { git } from "./agent-review-shared.ts";
import type { Finding, Range } from "./agent-review-types.ts";

const CHECKLIST_ITEM = /^\s*[-*+] \[[ xX]\] /;
const PLAN_HEADING =
  /^#{1,6}\s+(?:.*\bphase \d+\b|(?:phases|next steps|to ?dos?|roadmap)\b)/i;
const DATED_STATUS = /\bas built on \d{4}-\d{2}-\d{2}\b/i;

const DECISION_FILES: Record<string, string> = {
  "lint.project.json":
    "The pull request changes lint.project.json, which can loosen a lint rule. A maintainer confirms the change.",
  "docs/agents/project/reversals.md":
    "The pull request changes docs/agents/project/reversals.md, where the project reverses a decision of the template. A maintainer confirms the change.",
};

const PLAN_EXPLANATION =
  "The pull request adds a plan or the status of work to a document in docs/agents/. AGENTS.md (Project documentation) puts steps to do, phases, checklists, and the status of work in beads.";

interface AddedLine {
  line: number;
  text: string;
}

const script = (finding: Omit<Finding, "models">): Finding => ({
  ...finding,
  models: ["script"],
});

/** Returns the lines that the diff adds, with their line numbers at head. */
function addedIn({ base, head }: Range, file: string): AddedLine[] {
  const diff = git(
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-renames",
    "-U0",
    base,
    head,
    "--",
    file,
  );
  const added: AddedLine[] = [];
  let next = 0;
  let inHunk = false;
  for (const text of diff.split("\n")) {
    const header = /^@@ -\S+ \+(\d+)/.exec(text);
    if (header) {
      inHunk = true;
      next = Number(header[1]);
    } else if (inHunk && text.startsWith("+")) {
      added.push({ line: next, text: text.slice(1) });
      next += 1;
    }
  }
  return added;
}

/** Returns the numbers of the lines in fenced code blocks, fences included. */
function fencedLines(text: string): Set<number> {
  const fenced = new Set<number>();
  let open: { char: string; length: number } | undefined;
  text.split("\n").forEach((content, index) => {
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(content);
    if (open) {
      fenced.add(index + 1);
      if (
        fence?.[1]?.[0] === open.char &&
        fence[1].length >= open.length &&
        !fence[2]?.trim()
      ) {
        open = undefined;
      }
    } else if (fence?.[1]) {
      fenced.add(index + 1);
      open = { char: fence[1][0] ?? "`", length: fence[1].length };
    }
  });
  return fenced;
}

const changedFiles = (
  { base, head }: Range,
  filter: string,
  ...paths: string[]
): string[] =>
  git(
    "diff",
    "--name-only",
    "--no-renames",
    `--diff-filter=${filter}`,
    base,
    head,
    "--",
    ...paths,
  )
    .split("\n")
    .filter(Boolean);

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
    .map((file) =>
      script({
        rule: "new-document",
        file,
        line: 1,
        quote:
          readFileSync(path.join(root, file), "utf8")
            .split("\n")
            .find((line) => line.trim()) ?? "",
        explanation:
          "The pull request adds a document in docs/agents/. docs/agents/README.md permits a new document only when a person asks for one, so a maintainer confirms that a person asked for it.",
      }),
    );
}

/** No model can know if the team agreed to a change of these two files. */
export function decisionFiles(range: Range): Finding[] {
  return changedFiles(range, "AM", ...Object.keys(DECISION_FILES)).map(
    (file) => {
      const lines = git("show", `${range.head}:${file}`).split("\n");
      const added = addedIn(range, file).find(({ text }) =>
        /[\p{L}\p{N}]/u.test(text),
      );
      const first = lines.findIndex((text) => text.trim());
      return script({
        rule: "decision-change",
        file,
        line: added?.line ?? first + 1,
        quote: (added?.text ?? lines[first] ?? "").trim(),
        explanation: added
          ? (DECISION_FILES[file] ?? "")
          : `${DECISION_FILES[file]} The change only removes lines.`,
      });
    },
  );
}

/** Finds the plan lines that the pull request adds in `docs/agents/`. */
export function planLines(range: Range): Finding[] {
  const found: Finding[] = [];
  for (const file of changedFiles(range, "AM", "docs/agents/")) {
    if (!file.endsWith(".md")) {
      continue;
    }
    const fenced = fencedLines(git("show", `${range.head}:${file}`));
    let previous = -2;
    for (const { line, text } of addedIn(range, file)) {
      const trimmed = text.trim();
      const make = () =>
        script({
          rule: "plan-in-docs",
          file,
          line,
          quote: trimmed,
          explanation: PLAN_EXPLANATION,
        });
      if (fenced.has(line)) {
        previous = -2;
      } else if (CHECKLIST_ITEM.test(text)) {
        if (previous !== line - 1) {
          found.push(make());
        }
        previous = line;
      } else {
        previous = -2;
        if (PLAN_HEADING.test(trimmed) || DATED_STATUS.test(text)) {
          found.push(make());
        }
      }
    }
  }
  return found;
}

/** Findings of the rules that need no judgment. */
export const scriptFindings = (range: Range): Finding[] => [
  ...newDocuments(range),
  ...decisionFiles(range),
  ...planLines(range),
];
