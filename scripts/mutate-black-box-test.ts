// Makes each check of a black box test fail one time, as step 7 of the
// write-black-box-test skill asks, because a check that cannot fail checks
// nothing:
//
//   pnpm run test:browser:mutate <spec> [--grep <text>]
//
// It writes a copy of the spec beside it, `<name>.mutated.spec.ts`, runs the
// copy one time, and deletes it. In the copy, each check with an expected
// value calls a custom matcher that changes the value, and each check is soft,
// so one run reports each check that fails. The rename keeps each check on its
// line, so the line of each error in the report names its check. TypeScript 7
// has no JavaScript API, so the script finds the checks in the text, with
// comments and strings masked.
import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "./template-files.ts";
// The shape of the parts of a Playwright JSON report that the script reads.
interface ReportNode {
  status?: string;
  line?: number;
  tests?: { results?: { status: string }[] }[];
  errors?: { message?: string; location?: { file: string; line: number } }[];
  [key: string]: unknown;
}

// The start of the message of a changed check that fails. Another error on the
// line of a check, such as a TypeError, does not show that the check works.
const MARKER = "Changed by the check:";
const changeable = new Set([
  "toHaveText",
  "toContainText",
  "toHaveValue",
  "toHaveValues",
  "toHaveCount",
  "toHaveURL",
  "toHaveTitle",
  "toHaveAttribute",
  "toHaveCSS",
  "toHaveClass",
  "toHaveId",
  "toHaveAccessibleName",
  "toHaveAccessibleDescription",
  "toHaveRole",
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toContain",
  "toMatch",
  "toMatchObject",
  "toContainEqual",
]);
const args = process.argv.slice(2);
const spec = args[0]?.startsWith("--")
  ? process.env.BLACK_BOX_SPEC
  : (args.shift() ?? process.env.BLACK_BOX_SPEC);
if (!spec || (args.length && (args.length !== 2 || args[0] !== "--grep"))) {
  fail("Give a spec path and optional --grep text.");
}
const root = process.cwd();
const original = path.resolve(
  root,
  spec.startsWith("frontend/") ? spec : `frontend/${spec}`,
);
const relative = path.relative(root, original).split(path.sep).join("/");
if (
  !/^frontend\/src\/features\/[^/]+\/black-box-tests\/.+\.spec\.ts$/.test(
    relative,
  ) ||
  !existsSync(original) ||
  !realpathSync(original).startsWith(
    realpathSync(path.join(root, "frontend/src/features")) + path.sep,
  )
) {
  fail(
    "The spec must exist under frontend/src/features/<feature>/black-box-tests/ and end in .spec.ts.",
  );
}
const copy = original.replace(/\.spec\.ts$/, ".mutated.spec.ts");
if (existsSync(copy)) {
  fail(`Delete the existing copy ${copy} first.`);
}
const source = readFileSync(original, "utf8");
function mask(text: string) {
  const out = text.split("");
  const blank = (start: number, end: number) => {
    for (let at = start; at < end; at++) {
      if (out[at] !== "\n" && out[at] !== "\r") {
        out[at] = " ";
      }
    }
  };
  for (let at = 0; at < text.length;) {
    const start = at;
    if (text.startsWith("//", at)) {
      at = text.indexOf("\n", at);
      if (at < 0) {
        at = text.length;
      }
    } else if (text.startsWith("/*", at)) {
      const end = text.indexOf("*/", at + 2);
      at = end < 0 ? text.length : end + 2;
    } else if (["'", '"', "`"].includes(text.charAt(at))) {
      const quote = text[at++];
      while (at < text.length) {
        if (text[at] === "\\") {
          at += 2;
        } else if (text[at++] === quote) {
          break;
        }
      }
    } else if (
      text[at] === "/" &&
      /(?:^|[=(:,!&|?;{}[])\s*$/.test(text.slice(0, at))
    ) {
      at++;
      let inClass = false;
      while (at < text.length) {
        const char = text[at++];
        if (char === "\\") {
          at++;
        } else if (char === "[") {
          inClass = true;
        } else if (char === "]") {
          inClass = false;
        } else if (char === "/" && !inClass) {
          break;
        } else if (char === "\n") {
          break;
        }
      }
      while (/[a-z]/i.test(text[at] ?? "") && at < text.length) {
        at++;
      }
    } else {
      at++;
      continue;
    }
    blank(start, at);
  }
  return out.join("");
}
const masked = mask(source);
interface Check {
  name: string;
  reason: string | null;
  offset: number;
  line: number;
}

const checks: Check[] = [];
for (const match of masked.matchAll(/\.\s*(to\w+)\s*\(/g)) {
  const name = match[1] ?? "";
  const before = masked.slice(0, match.index);
  // Ignore braces inside the poll callback while finding the statement start.
  let depth = 0,
    start = 0;
  for (let at = before.length - 1; at >= 0; at--) {
    const char = before.charAt(at);
    if (char === ")" || char === "]") {
      depth++;
    } else if (char === "(" || char === "[") {
      depth--;
    }
    if (depth === 0 && ";{}".includes(char)) {
      start = at + 1;
      break;
    }
  }
  // A method such as `toString()` is not a check, because no `expect` is in
  // its statement.
  if (!/\bexpect\b/.test(before.slice(start))) {
    continue;
  }
  let reason = changeable.has(name)
    ? null
    : /^to(?:Be|Have)/.test(name)
      ? "has no expected value; change its locator by hand"
      : "the script does not change this matcher; change it by hand";
  if (!reason && /\.\s*not\s*$/.test(before)) {
    reason = "a negated check; change it by hand";
  }
  if (!reason && /expect\s*\.\s*poll\s*\(/.test(before.slice(start))) {
    reason = "an expect.poll check; change it by hand";
  }
  if (!reason && name === "toHaveAttribute") {
    // With no value, or with only options, the check is that the attribute
    // exists. It has no expected value to change.
    let nesting = 0,
      at = match.index + match[0].length;
    for (; at < masked.length; at++) {
      const char = masked.charAt(at);
      if ("([{".includes(char)) {
        nesting++;
      } else if (")]}".includes(char) && nesting-- === 0) {
        break;
      } else if (char === "," && nesting === 0) {
        break;
      }
    }
    // The source and not the masked text, because the mask makes a string
    // look like blank space, as after a trailing comma.
    if (
      masked[at] !== "," ||
      /^(?:\s|\/\*(?:(?!\*\/)[\s\S])*\*\/|\/\/[^\n]*)*[{)]/.test(
        source.slice(at + 1),
      )
    ) {
      reason = "checks only that the attribute exists; change it by hand";
    }
  }
  checks.push({
    name,
    reason,
    offset: match.index + match[0].indexOf(name),
    line: source.slice(0, match.index).split("\n").length,
  });
}
// The lines of each test, so that a check in a test that did not run is not
// reported as a check that did not fail.
const testLines = [
  ...masked.matchAll(/(?<![\w.])test(?:\.(?:only|skip|fixme|fail))?\s*\(/g),
].map((match) => source.slice(0, match.index).split("\n").length);
let changed = source;
for (const check of checks.toReversed()) {
  if (!check.reason) {
    changed =
      changed.slice(0, check.offset) +
      "changed" +
      check.name.charAt(0).toUpperCase() +
      check.name.slice(1) +
      changed.slice(check.offset + check.name.length);
  }
}
const importPattern =
  /import\s*\{([^}]+)\}\s*from\s*(["'])@playwright\/test\2\s*;/;
const imported = changed.match(importPattern);
if (!imported || !/(?:^|,)\s*expect\s*(?:,|$)/.test(imported[1] ?? "")) {
  fail('The spec must import { expect } from "@playwright/test".');
}
changed = changed.replace(
  importPattern,
  (statement: string, names: string) =>
    statement.replace(
      names,
      names.replace(/\bexpect\b/, "expect as baseExpect"),
    ) +
    " const expect = baseExpect.extend(changedMatchers()).configure({ soft: true, timeout: 1500 });",
);
const names = [
  ...new Set(
    checks.filter((check) => !check.reason).map((check) => check.name),
  ),
];
changed += `\nfunction changedMatchers() {
  const names = ${JSON.stringify(names)};
  const change = (value) => {
    if (typeof value === "string") return value + " (changed by the check)";
    if (typeof value === "number") return value + 1;
    if (typeof value === "boolean") return !value;
    if (value instanceof RegExp) return /^changed by the check$/;
    if (Array.isArray(value)) return value.length ? [change(value[0]), ...value.slice(1)] : ["changed by the check"];
    if (value && Object.getPrototypeOf(value) === Object.prototype) return { ...value, changedByTheCheck: true };
    return "changed by the check";
  };
  return Object.fromEntries(names.map((name) => ["changed" + name[0].toUpperCase() + name.slice(1), async function(received, ...args) {
    const index = ["toHaveAttribute", "toHaveCSS"].includes(name) ? 1 : 0;
    if (name === "toHaveAttribute" && (args[1] === undefined || Object.getPrototypeOf(args[1]) === Object.prototype))
      throw new Error("toHaveAttribute with no value has no expected value. Change it by hand.");
    args[index] = name === "toHaveRole" ? (args[index] === "button" ? "link" : "button") : change(args[index]);
    if (name.startsWith("toHave") || ["toContainText"].includes(name)) args[index + 1] = { ...args[index + 1], timeout: 1500 };
    try {
      await baseExpect(received)[name](...args);
      return { pass: true, message: () => "The changed value passed." };
    } catch (error) {
      // Only a failed assertion shows that the check fails. A wrong argument
      // or another error goes to the report without the marker.
      if (!error?.matcherResult) throw error;
      return { pass: false, message: () => "${MARKER} " + String(error.message ?? error) };
    }
  }]));
}\n`;
let temporary: string | undefined;
let child: ChildProcess | undefined;
function runPnpm(
  pnpmArgs: string[],
  options: SpawnOptions,
): Promise<{ error?: Error; status?: number | null }> {
  return new Promise((resolve) => {
    child = spawn("pnpm", pnpmArgs, options);
    child.once("error", (error) => resolve({ error }));
    child.once("close", (status) => {
      child = undefined;
      resolve({ status });
    });
  });
}
const cleanup = () => {
  rmSync(copy, { force: true });
  if (temporary) {
    rmSync(temporary, { recursive: true, force: true });
  }
};
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    child?.kill(signal);
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
try {
  temporary = mkdtempSync(path.join(os.tmpdir(), "black-box-mutate-"));
  writeFileSync(copy, changed);
  const build = await runPnpm(["--filter", "backend...", "run", "build"], {
    stdio: "inherit",
  });
  if (build.error || build.status !== 0) {
    throw new Error("The backend build failed.");
  }
  const report = path.join(temporary, "report.json");
  const result = await runPnpm(
    [
      "--filter",
      "frontend",
      "exec",
      "playwright",
      "test",
      path.relative(path.join(root, "frontend"), copy),
      "--reporter=json",
      ...args,
    ],
    {
      stdio: "inherit",
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: report },
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (!existsSync(report)) {
    throw new Error("The browser run wrote no JSON report.");
  }
  const lines = new Set();
  const otherLines = new Set();
  const ranTests = new Set();
  let stopped = false;
  function visit(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }
    const value = node as ReportNode;
    if (
      value.status !== undefined &&
      ["timedOut", "interrupted"].includes(value.status)
    ) {
      stopped = true;
    }
    // A spec of the report has the line of its test and the results of its runs.
    if (
      typeof value.line === "number" &&
      Array.isArray(value.tests) &&
      value.tests.some((run) =>
        (run.results ?? []).some((outcome) => outcome.status !== "skipped"),
      )
    ) {
      ranTests.add(value.line);
    }
    for (const error of value.errors ?? []) {
      if (error.location && path.resolve(error.location.file) === copy) {
        (String(error.message).includes(MARKER) ? lines : otherLines).add(
          error.location.line,
        );
      }
    }
    for (const [key, nested] of Object.entries(value)) {
      if (key !== "errors") {
        if (Array.isArray(nested)) {
          nested.forEach(visit);
        } else if (nested && typeof nested === "object") {
          visit(nested);
        }
      }
    }
  }
  const json = JSON.parse(readFileSync(report, "utf8")) as ReportNode;
  // An error before the tests, such as a failed build of the frontend, has no
  // test. Then no check ran.
  if (json.errors?.length) {
    throw new Error(
      `The browser run failed before the tests:\n${json.errors.map((error) => error.message).join("\n")}`,
    );
  }
  visit(json);
  const allRan = testLines.every((line) => ranTests.has(line));
  const testOf = (line: number) =>
    testLines.filter((start) => start <= line).at(-1);
  const counts = { failed: 0, passed: 0, unknown: 0, manual: 0 };
  for (const check of checks) {
    let message;
    if (check.reason) {
      counts.manual++;
      message = `by hand: ${check.reason}`;
    } else if (lines.has(check.line)) {
      counts.failed++;
      message = "fails when changed";
    } else if (otherLines.has(check.line)) {
      counts.unknown++;
      message = "not known: another error stopped the test at this line";
    } else if (stopped) {
      counts.unknown++;
      message = "not known: the run stopped early; run again with --grep";
    } else if (!allRan && !ranTests.has(testOf(check.line))) {
      counts.unknown++;
      message = "not known: its test did not run";
    } else {
      counts.passed++;
      message = "DID NOT FAIL";
    }
    console.log(`${check.line}: ${check.name}  ${message}`);
  }
  console.log(
    `${counts.failed} fail when changed; ${counts.passed} did not fail; ${counts.unknown} not known; ${counts.manual} by hand.`,
  );
  if (counts.passed || counts.unknown) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  cleanup();
}
