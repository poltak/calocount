// Checks a pull request that changes a file that a project gets from the
// template. The "Template-owned files" workflow of CI runs it for each change
// to a pull request:
//
//   node scripts/check-template-owned-files.mjs
//
// It passes when the pull request changes no file in `templateOwned` of
// `scripts/template-paths.json`, when a maintainer opened it, or when a
// maintainer added the `template-change-approved` label. A later push that
// changes the pull request's own change to such a file removes the label, so
// an approval is for the version that the maintainer saw. A change that the
// push brings in from the base branch, such as a sync, does not count. In the
// template, every pull request passes.
//
// It reads the event from GITHUB_EVENT_PATH, and the GitHub logins of the
// maintainers from TEMPLATE_MAINTAINERS, with commas or spaces between them.
// It calls the GitHub API with `gh`, which reads its token from GH_TOKEN.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS_FILE, VERSION_FILE, matchesPath } from "./template-files.mjs";

const LABEL = "template-change-approved";
// GitHub lists at most 300 files in a compare, so the list of a longer compare
// can be without a file from the template.
const COMPARE_FILE_LIMIT = 300;
const HUNK_LINE_NUMBERS = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/gm;
const root = fileURLToPath(new URL("..", import.meta.url));

function readPages(route) {
  const output = execFileSync("gh", ["api", "--paginate", "--slurp", route], {
    encoding: "utf8",
  });
  return JSON.parse(output);
}

/** Each path in a list of changed files, also the old path of a move. */
const pathsOf = (files) =>
  files.flatMap((file) =>
    file.previous_filename
      ? [file.filename, file.previous_filename]
      : [file.filename],
  );

const listOf = (files) => files.map((file) => `  ${file}`).join("\n");

/**
 * The pull request's own change to each file from the template, at one head
 * commit: a map from the file to the text of its diff. The compare starts at
 * the commit where the branch left the base branch, so a change that came in
 * from the base branch is not in it. Null when GitHub cannot give each change.
 */
function ownChanges({ repository, base, head, isOwned }) {
  let files;
  try {
    files = readPages(`repos/${repository}/compare/${base}...${head}`).flatMap(
      (page) => page.files ?? [],
    );
  } catch {
    // After a force push, GitHub can be without the old commit.
    return null;
  }
  if (files.length >= COMPARE_FILE_LIMIT) {
    return null;
  }
  return new Map(
    files
      .filter((file) => pathsOf([file]).some(isOwned))
      .map((file) => [
        file.filename,
        [
          file.status,
          file.previous_filename ?? "",
          // A change from the base branch above the lines of the pull request
          // moves their line numbers, and does not change them. GitHub gives
          // no diff text for a binary or a very large file.
          file.patch?.replace(HUNK_LINE_NUMBERS, "@@") ?? `blob ${file.sha}`,
        ].join("\n"),
      ]),
  );
}

function check() {
  if (!existsSync(path.join(root, VERSION_FILE))) {
    console.log("This is the template, which can change each of its files.");
    return true;
  }

  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const maintainers = (process.env.TEMPLATE_MAINTAINERS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const isMaintainer = (login) =>
    maintainers.some((name) => name.toLowerCase() === login?.toLowerCase());
  const owned = JSON.parse(
    readFileSync(path.join(root, PATHS_FILE), "utf8"),
  ).templateOwned;
  const isOwned = (file) => owned.some((entry) => matchesPath({ entry, file }));

  const repository = event.repository.full_name;
  const pull = event.pull_request;
  const issueRoute = `repos/${repository}/issues/${pull.number}`;

  const changed = new Set(
    pathsOf(
      readPages(
        `repos/${repository}/pulls/${pull.number}/files?per_page=100`,
      ).flat(),
    ).filter(isOwned),
  );
  if (changed.size === 0) {
    console.log(
      "The pull request changes no file that comes from the template.",
    );
    return true;
  }
  console.log(
    `The pull request changes files that come from the template:\n${listOf([...changed])}`,
  );

  let approved = pull.labels.some((label) => label.name === LABEL);
  if (approved && event.action === "synchronize") {
    const changesAt = (head) =>
      ownChanges({ repository, base: pull.base.ref, head, isOwned });
    const before = changesAt(event.before);
    const after = before && changesAt(event.after);
    const changedAgain =
      after &&
      [...new Set([...before.keys(), ...after.keys()])].filter(
        (file) => before.get(file) !== after.get(file),
      );
    if (!changedAgain || changedAgain.length > 0) {
      execFileSync("gh", [
        "api",
        "--method",
        "DELETE",
        `${issueRoute}/labels/${LABEL}`,
      ]);
      approved = false;
      console.log(
        changedAgain
          ? `The last push changes the pull request's own change to these files, so the check removed the ${LABEL} label:\n${listOf(changedAgain)}`
          : `GitHub cannot give each change of the pull request before and after the last push, so the check removed the ${LABEL} label.`,
      );
      console.log(
        `The changes between the old and the new head commit: ${event.repository.html_url}/compare/${event.before}...${event.after}`,
      );
    }
  }

  if (isMaintainer(pull.user.login)) {
    console.log(
      `${pull.user.login} opened the pull request, and is a maintainer.`,
    );
    return true;
  }
  if (approved) {
    const adder = readPages(`${issueRoute}/events?per_page=100`)
      .flat()
      .filter(
        (entry) => entry.event === "labeled" && entry.label?.name === LABEL,
      )
      .at(-1)?.actor?.login;
    if (isMaintainer(adder)) {
      console.log(
        `${adder}, a maintainer, approved the change with the ${LABEL} label.`,
      );
      return true;
    }
    console.log(`${adder} added the ${LABEL} label, and is not a maintainer.`);
  }

  console.log(
    [
      "",
      "A project takes changes to these files only with a sync. Make the change",
      "in the template first. When the change must also be in this project now,",
      `a maintainer adds the ${LABEL} label to the pull request.`,
      maintainers.length > 0
        ? `Maintainers: ${maintainers.join(", ")}.`
        : "No maintainer is set. Set the TEMPLATE_MAINTAINERS variable of the repository, as docs/agents/setup.md describes.",
      `::error title=Template-owned files::A maintainer must approve this change with the ${LABEL} label.`,
    ].join("\n"),
  );
  return false;
}

process.exitCode = check() ? 0 : 1;
