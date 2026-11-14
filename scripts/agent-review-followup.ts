import {
  BOT_LOGINS,
  BOX,
  EDITS_QUERY,
  LINE_PATTERN,
  SENSITIVE_RULES,
} from "./agent-review-constants.ts";
import {
  linesOfQuote,
  quoteIsInFile,
  sameFinding,
} from "./agent-review-findings.ts";
import { factsOf, permitsApproval } from "./agent-review-rules.ts";
import {
  callApi,
  errorMessage,
  flatten,
  isMaintainer,
  kindOf,
} from "./agent-review-shared.ts";
import type {
  Changes,
  Finding,
  GithubComment,
  Issue,
  ModelResult,
  Vote,
} from "./agent-review-types.ts";

/**
 * Returns each issue after this review, and the changes since the earlier
 * review. An issue keeps the status that each model gave it, with the reason,
 * so that the comments can show where the models disagree.
 *
 * An open issue is addressed when its quote is not in its file now, or when
 * each model that gave it a status says it is addressed. A finding of the
 * script is addressed when the script does not report it again. Otherwise an
 * issue that a maintainer accepted is accepted. An addressed issue that a
 * model reports again is open again. A finding or a note that no issue covers
 * gets the next ID of its kind. `head` is the newest commit at which the
 * issue was open, for the link of an addressed issue.
 */
export function followUp({
  issues,
  findings,
  notes,
  models,
  accepted,
  review,
  head,
}: {
  issues: Issue[];
  findings: Finding[];
  notes: Finding[];
  models: ModelResult[];
  accepted: Map<string, string | undefined>;
  review: number;
  head: string;
}): { issues: Issue[]; changes: Changes } {
  const answered = models.filter((model) => model.state === "ok");
  // The models that report each issue again, by its ID.
  const reported = new Map<string, string[]>();
  const unmatched: (Finding & { kind: "F" | "N" })[] = [];
  const groups: ["F" | "N", Finding[]][] = [
    ["F", findings],
    ["N", notes],
  ];
  for (const [kind, items] of groups) {
    for (const item of items) {
      const match = issues.find(
        (issue) => kindOf(issue) === kind && sameFinding(issue, item),
      );
      if (match) {
        reported.set(match.id, [
          ...(reported.get(match.id) ?? []),
          ...item.models,
        ]);
      } else {
        unmatched.push({ ...item, kind });
      }
    }
  }
  const changes: Changes = {
    fixed: [],
    accepted: [],
    added: [],
    reopened: [],
    disagree: [],
  };
  const next = issues.map((issue): Issue => {
    const again = reported.has(issue.id);
    const checkable = issue.quote && !SENSITIVE_RULES.has(issue.rule);
    // Only after the check of the quote, because a later commit can have
    // deleted the file.
    const now = () => ({
      ...factsOf(issue),
      models: [
        ...new Set([...issue.models, ...(reported.get(issue.id) ?? [])]),
      ],
      head,
      line: checkable ? linesOfQuote(issue).start : issue.line,
    });
    if (issue.status === "fixed") {
      if (!again) return issue;
      const reopened: Issue = {
        ...now(),
        status: "open",
        reopened: review,
        reason: "A model reports it again.",
      };
      changes.reopened.push(reopened);
      return reopened;
    }
    const votes = answered.map((model): Vote => {
      const status = model.statuses.find(({ id }) => id === issue.id);
      return { model: model.name, ...status };
    });
    const statuses = votes.filter((vote) => vote.status);
    const fix = (reason: string): Issue => {
      const fixed: Issue = {
        ...factsOf(issue),
        status: "fixed",
        fixedIn: review,
        reason,
        votes,
      };
      changes.fixed.push(fixed);
      return fixed;
    };
    if (issue.models.includes("script") && !again) {
      return fix("The script does not report it now.");
    }
    if (checkable && !quoteIsInFile(issue)) {
      return fix("The quoted text is not in the file now.");
    }
    if (
      !again &&
      statuses.length > 0 &&
      statuses.every((status) => status.status === "addressed")
    ) {
      return fix("Each model that checked it says that it is addressed.");
    }
    if (permitsApproval(issue) && accepted.has(issue.id)) {
      const item: Issue = {
        ...now(),
        status: "accepted",
        acceptedBy: accepted.get(issue.id),
        acceptedIn: issue.status === "accepted" ? issue.acceptedIn : review,
      };
      if (issue.status !== "accepted") changes.accepted.push(item);
      return item;
    }
    if (issue.status === "accepted") {
      const item: Issue = {
        ...now(),
        status: "open",
        reopened: review,
        reason: permitsApproval(issue)
          ? "A maintainer cleared its box."
          : "This rule requires a fix and does not permit acceptance.",
      };
      changes.reopened.push(item);
      return item;
    }
    const item: Issue = {
      ...now(),
      status: "open",
      votes,
      ...(again
        ? { reason: "A model reported it again." }
        : statuses.length === 0 && {
            reason: "No model gave a status for it.",
          }),
    };
    if (new Set(statuses.map((status) => status.status)).size > 1) {
      changes.disagree.push(item);
    }
    return item;
  });
  const highest = (kind: "F" | "N") =>
    Math.max(
      0,
      ...issues
        .filter((issue) => kindOf(issue) === kind)
        .map((issue) => Number(issue.id.slice(1))),
    );
  const numbers = { F: highest("F"), N: highest("N") };
  for (const { kind, ...item } of unmatched) {
    numbers[kind] += 1;
    changes.added.push({
      ...item,
      id: `${kind}${numbers[kind]}`,
      status: "open",
      found: review,
      head,
    });
  }
  return { issues: [...next, ...changes.added], changes };
}

interface BoxChange {
  key: string;
  checked: boolean;
  login: string | undefined;
  at: string;
}

interface Version {
  at: string;
  editor: string | undefined;
  body: string;
}

/**
 * Returns each check or clear of a box that a maintainer made, from the
 * versions of a comment, oldest first. The key of a box is the ID of its
 * issue.
 */
function boxChanges(versions: Version[]): BoxChange[] {
  const boxesOf = (body: string) =>
    new Map(
      [...body.matchAll(BOX)].map(([, mark, id]): [string, boolean] => [
        id ?? "",
        mark === "x",
      ]),
    );
  return versions.flatMap(({ editor, at, body }, index) => {
    const earlier = versions[index - 1];
    if (index === 0 || !earlier || !isMaintainer(editor)) return [];
    const before = boxesOf(earlier.body);
    return [...boxesOf(body)]
      .filter(
        ([key, checked]) => before.has(key) && before.get(key) !== checked,
      )
      .map(([key, checked]) => ({ key, checked, login: editor, at }));
  });
}

interface UserContentEdits {
  userContentEdits?: {
    nodes?: {
      editedAt: string;
      editor?: { login: string } | null;
      diff?: string | null;
    }[];
  };
}

interface EditsAnswer {
  data?: {
    comment?: UserContentEdits | null;
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes?: {
            comments: {
              nodes: (UserContentEdits & {
                author?: { login: string } | null;
                body: string;
              })[];
            };
          }[];
        };
      };
    };
  };
}

/**
 * Returns the maintainer who accepted each issue, by its ID. A maintainer
 * accepts an issue with its box in the master comment or in its line
 * comment, and clears the box to take the acceptance back. Each review edits
 * the master comment, and stores each acceptance from before its edit, so
 * only the changes after the newest edit of the bot count, and the newest
 * change wins. A box that another person checks accepts nothing.
 */
export function acceptances({
  repository,
  number,
  issues,
  master,
}: {
  repository: string;
  number: number;
  issues: Issue[];
  master: GithubComment | undefined;
}): Map<string, string | undefined> {
  const accepted = new Map(
    issues
      .filter((issue) => issue.status === "accepted" && permitsApproval(issue))
      .map((issue): [string, string | undefined] => [
        issue.id,
        issue.acceptedBy,
      ]),
  );
  if (!master) return accepted;
  const [owner, name] = repository.split("/");
  let data: EditsAnswer["data"];
  try {
    data = callApi<EditsAnswer>({
      method: "POST",
      route: "graphql",
      body: {
        query: EDITS_QUERY,
        variables: { comment: master.node_id, owner, name, number },
      },
    })?.data;
  } catch (error) {
    console.log(
      `::warning title=Agent review::GitHub did not give the versions of the comments, so the review sees no new acceptance: ${flatten(errorMessage(error)).slice(0, 300)}`,
    );
    return accepted;
  }
  // GitHub gives the newest version first, and the oldest is the comment as
  // it was posted.
  const versionsOf = (node: UserContentEdits | null | undefined): Version[] =>
    (node?.userContentEdits?.nodes ?? [])
      .map(({ editedAt, editor, diff }) => ({
        at: editedAt,
        editor: editor?.login,
        body: diff ?? "",
      }))
      .reverse();
  const masterVersions = versionsOf(data?.comment);
  const since =
    masterVersions.filter(({ editor }) => BOT_LOGINS.has(editor)).at(-1)?.at ??
    master.created_at;
  const lineChanges = (
    data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
  ).flatMap((thread) => {
    const line = thread.comments.nodes[0];
    const id = line?.body.match(LINE_PATTERN)?.[1];
    if (!line || !id || !BOT_LOGINS.has(line.author?.login)) return [];
    return boxChanges(versionsOf(line)).filter(({ key }) => key === id);
  });
  const ids = new Set(
    issues
      .filter((issue) => issue.status !== "fixed" && permitsApproval(issue))
      .map(({ id }) => id),
  );
  const changes = [...boxChanges(masterVersions), ...lineChanges]
    .filter(({ key, at }) => ids.has(key) && since !== undefined && at > since)
    .sort((one, other) => one.at.localeCompare(other.at));
  for (const { key, checked, login, at } of changes) {
    console.log(
      `${login} ${checked ? "checked" : "cleared"} the box of ${key} at ${at}.`,
    );
    if (checked) accepted.set(key, login);
    else accepted.delete(key);
  }
  return accepted;
}
