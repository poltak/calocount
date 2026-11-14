import {
  BOT_LOGINS,
  DEPENDENCY_BOTS,
  ISSUE_ID,
  LABEL,
  LINE_PATTERN,
  MARKER_FIELDS,
  MASTER_MARKER,
  OLD_FINDINGS_PATTERN,
  OLD_MARKER,
  REVIEW_ACTIONS,
} from "./agent-review-constants.ts";
import { reviewIssues } from "./agent-review-rules.ts";
import {
  count,
  isMaintainer,
  pack,
  readEvent,
  readPages,
  stateOf,
  unpack,
  writeOutputs,
} from "./agent-review-shared.ts";
import type {
  GithubComment,
  Issue,
  MaintainerComment,
  ReviewEvent,
} from "./agent-review-types.ts";

/**
 * A pull request that had its reviews before the master comment existed has
 * one comment for each review. The newest of them has the issues that the
 * next review must keep.
 */
export function reviewComment({
  repository,
  number,
}: {
  repository: string;
  number: number;
}): GithubComment | undefined {
  const comments = readPages<GithubComment[]>(
    `repos/${repository}/issues/${number}/comments?per_page=100`,
  )
    .flat()
    .filter((comment) => comment.user?.login === "github-actions[bot]");
  return (
    comments.find((comment) => comment.body.startsWith(MASTER_MARKER)) ??
    comments.filter((comment) => comment.body.startsWith(OLD_MARKER)).at(-1)
  );
}

export function plan(): void {
  const event = readEvent();
  const pull = event.pull_request;
  let mode = "skip";
  if (pull.draft) {
    console.log("The pull request is a draft.");
  } else if (DEPENDENCY_BOTS.has(pull.user.login)) {
    console.log(`${pull.user.login} opened the pull request.`);
  } else if (
    (event.action !== undefined && REVIEW_ACTIONS.has(event.action)) ||
    // A rule can ask for a reason in the description, so a new title or
    // description needs a new review.
    (event.action === "edited" && (event.changes?.title || event.changes?.body))
  ) {
    mode = "review";
  } else if (event.label?.name === LABEL) {
    mode = "label";
  } else {
    console.log(`A "${event.action}" event changes nothing for the review.`);
  }
  console.log(`Mode: ${mode}`);
  writeOutputs({
    mode,
    earlier: mode === "review" ? earlierReview(event) : "",
  });
}

function earlierReview(event: ReviewEvent): string {
  const repository = event.repository.full_name;
  const { number } = event.pull_request;
  const comment = reviewComment({ repository, number });
  const [, head, , reviewed, base] = comment?.body.match(MARKER_FIELDS) ?? [];
  if (!comment || !head) {
    return "";
  }
  const master = comment.body.startsWith(MASTER_MARKER);
  const issues = reviewIssues(
    master
      ? (stateOf(comment.body)?.issues ?? [])
      : oldIssues({ body: comment.body, head }),
  );
  const open = issues.filter((issue) => issue.status === "open").length;
  const comments = maintainerComments({ repository, number });
  console.log(
    `${master ? "The master comment" : `The comment of the review of ${head}`} has ${count(open, "open issue")}.`,
  );
  return pack({
    head,
    comment: comment.id,
    master,
    issues: issues.map((issue) => {
      const written = comments.get(issue.id);
      return written ? { ...issue, comments: written } : issue;
    }),
    reviewed,
    base,
  });
}

/**
 * What the maintainers wrote about each issue: a reply to its line comment, or
 * a comment on the pull request that names its ID.
 */
const isMaintainerComment = ({ user }: GithubComment) =>
  isMaintainer(user?.login) && !BOT_LOGINS.has(user?.login);

function maintainerComments({
  repository,
  number,
}: {
  repository: string;
  number: number;
}): Map<string, MaintainerComment[]> {
  const written = new Map<string, MaintainerComment[]>();
  const add = (id: string, { user, body }: GithubComment) =>
    written.set(id, [
      ...(written.get(id) ?? []),
      { author: user?.login ?? "", body },
    ]);
  const lineComments = readPages<GithubComment[]>(
    `repos/${repository}/pulls/${number}/comments?per_page=100`,
  ).flat();
  const issueOfLine = new Map(
    lineComments.flatMap((comment): [number, string][] => {
      const id = comment.body?.match(LINE_PATTERN)?.[1];
      return id && BOT_LOGINS.has(comment.user?.login)
        ? [[comment.id, id]]
        : [];
    }),
  );
  for (const comment of lineComments.filter(isMaintainerComment)) {
    const id =
      comment.in_reply_to_id === undefined
        ? undefined
        : issueOfLine.get(comment.in_reply_to_id);
    if (id) {
      add(id, comment);
    }
  }
  const pullComments = readPages<GithubComment[]>(
    `repos/${repository}/issues/${number}/comments?per_page=100`,
  ).flat();
  for (const comment of pullComments.filter(isMaintainerComment)) {
    for (const id of new Set(comment.body?.match(ISSUE_ID) ?? [])) {
      add(id, comment);
    }
  }
  return written;
}

/** The comment of an older review stores its findings, with these fields. */
type OldFinding = Omit<Issue, "id" | "status" | "found" | "head"> & {
  number: number;
  accepted?: string | undefined;
};

/**
 * Before the master comment, each review posted a comment that stored its
 * open findings. The next review gives them IDs, and posts the master
 * comment. A box that a maintainer checked after that comment does not count.
 */
function oldIssues({ body, head }: { body: string; head: string }): Issue[] {
  return (
    unpack<OldFinding[]>(body.match(OLD_FINDINGS_PATTERN)?.[1]) ?? []
  ).map(({ number, accepted, ...finding }): Issue => ({
    ...finding,
    id: `F${number}`,
    found: 1,
    head,
    ...(accepted
      ? { status: "accepted", acceptedBy: accepted, acceptedIn: 1 }
      : { status: "open" }),
  }));
}
