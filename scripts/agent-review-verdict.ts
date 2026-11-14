import {
  LABEL,
  MARKER_FIELDS,
  MINIMIZE_QUERY,
  SENSITIVE_RULES,
} from "./agent-review-constants.ts";
import { acceptances, followUp } from "./agent-review-followup.ts";
import {
  commitWithQuote,
  mergeFindings,
  modelResult,
  newDocuments,
  quoteIsInFile,
} from "./agent-review-findings.ts";
import { lineComments, markLines } from "./agent-review-lines.ts";
import { masterBody } from "./agent-review-master.ts";
import { reviewComment } from "./agent-review-plan.ts";
import {
  permitsApproval,
  reviewIssues,
  ruleNames,
} from "./agent-review-rules.ts";
import {
  are,
  callApi,
  count,
  errorMessage,
  flatten,
  isMaintainer,
  rangeOf,
  readEvent,
  readOne,
  readPages,
  stateOf,
  unpack,
} from "./agent-review-shared.ts";
import { scopeOf } from "./agent-review-prompt.ts";
import { summaryBody } from "./agent-review-summary.ts";
import type {
  EarlierReview,
  GithubComment,
  Issue,
  Read,
  ReviewEvent,
  ReviewRecord,
  ReviewState,
} from "./agent-review-types.ts";
import { isOpen, isOpenFinding, viewOf } from "./agent-review-view.ts";

/**
 * Hides the summary of the earlier review as outdated, so that the pull
 * request shows only the newest one. The master comment links each summary.
 */
function hideSummary(node: string): void {
  try {
    const result = callApi<{ errors?: unknown }>({
      method: "POST",
      route: "graphql",
      body: { query: MINIMIZE_QUERY, variables: { id: node } },
    });
    if (result?.errors) {
      throw new Error(JSON.stringify(result.errors));
    }
  } catch (error) {
    console.log(
      `::warning title=Agent review::GitHub did not hide the summary of the earlier review: ${flatten(errorMessage(error)).slice(0, 300)}`,
    );
  }
}

// The master comment has each issue, so a line comment that GitHub refuses
// must not stop the verdict.
const lineFailed = (error: unknown) =>
  console.log(
    `::warning title=Agent review::GitHub refused a line comment: ${flatten(errorMessage(error)).slice(0, 300)}`,
  );

function reviewVerdict(event: ReviewEvent): boolean {
  const repository = event.repository.full_name;
  const pull = event.pull_request;
  const head = pull.head.sha;
  const current = readOne<{ head: { sha: string } }>(
    `repos/${repository}/pulls/${pull.number}`,
  ).head.sha;
  if (current !== head) {
    console.log(`A newer push (${current}) replaced the review of ${head}.`);
    return true;
  }
  // The Claude job stops when a newer review of the pull request starts, such
  // as after an edit of the description. That review posts the result, and a
  // second result for the head would count each change two times.
  if (
    (JSON.parse(process.env.CLAUDE_JOB || "{}") as { result?: string })
      .result === "cancelled"
  ) {
    console.log(
      "Something cancelled the Claude job: a newer review of this head, a person, or the time limit. So this review posts nothing. When no newer review runs, run the review again.",
    );
    return false;
  }

  const models = [
    modelResult({
      name: "Claude",
      model: `${process.env.CLAUDE_MODEL}, ${process.env.CLAUDE_EFFORT}`,
      job: process.env.CLAUDE_JOB,
    }),
    modelResult({
      name: "Codex",
      model: `${process.env.CODEX_MODEL}, ${process.env.CODEX_EFFORT}`,
      job: process.env.CODEX_JOB,
    }),
  ];
  if (models.every((model) => model.state === "not-configured")) {
    console.log(
      "No model is set up, so nothing reviewed the pull request. docs/agents/agent-review.md has the secrets.",
    );
    return true;
  }

  const range = rangeOf(event);
  const found = [
    ...models.flatMap((model) => model.findings),
    ...newDocuments(range),
  ].map((finding) =>
    SENSITIVE_RULES.has(finding.rule)
      ? { ...finding, commit: commitWithQuote(finding, range) }
      : finding,
  );
  const rules = ruleNames();
  const deleted = { quote: 0, rule: 0 };
  const kept = found.filter((finding) => {
    const sensitive = SENSITIVE_RULES.has(finding.rule);
    const reason = !rules.has(finding.rule)
      ? "rule"
      : !(sensitive ? finding.commit : quoteIsInFile(finding))
        ? "quote"
        : undefined;
    if (reason) {
      deleted[reason] += 1;
      console.log(
        `Deleted a finding of ${finding.models.join(", ")}, because ${reason === "rule" ? `"${finding.rule}" is not a rule of the review` : `its quote is not in ${finding.file}`}${sensitive ? "." : `: ${flatten(finding.quote).slice(0, 200)}`}`,
      );
    }
    return !reason;
  });
  const allNotes = models.flatMap((model) => model.notes);
  const notes = allNotes.filter(quoteIsInFile);
  deleted.quote += allNotes.length - notes.length;

  const earlier = unpack<EarlierReview>(process.env.EARLIER_REVIEW);
  const scope = scopeOf(event, earlier);
  // A model that failed did not read the changes, so the next review reads
  // them again, from the commit that each model read.
  const read: Read = models.every((model) => model.state !== "failed")
    ? { reviewed: head, base: range.base }
    : { reviewed: earlier?.reviewed, base: earlier?.base };
  // The plan job read the master comment before the models ran, and a
  // maintainer can have checked a box since then.
  const master = earlier?.master
    ? readOne<GithubComment>(
        `repos/${repository}/issues/comments/${earlier.comment}`,
      )
    : undefined;
  const state: ReviewState = (master && stateOf(master.body)) ?? {
    issues: earlier?.issues ?? [],
    reviews: [],
  };
  const review = state.reviews.length + 1;
  const { issues, changes } = followUp({
    issues: state.issues,
    findings: mergeFindings(kept),
    notes: mergeFindings(notes),
    models,
    accepted: acceptances({
      repository,
      number: pull.number,
      issues: state.issues,
      master,
    }),
    review,
    head,
  });
  const blockers =
    issues.filter(isOpenFinding).length +
    models.filter((model) => model.state === "failed").length;
  const thisReview: ReviewRecord = {
    number: review,
    head,
    from: scope.from === scope.base ? undefined : scope.from,
    added: changes.added.length,
    addressed: changes.fixed.length + changes.accepted.length,
    open: issues.filter(isOpen).length,
  };
  const reviews: ReviewRecord[] = [...state.reviews, thisReview];
  const view = viewOf({
    repository,
    number: pull.number,
    head,
    issues,
    reviews,
  });
  const masterOf = (shown: Issue[]) =>
    masterBody({
      view,
      repository,
      issues: shown,
      reviews,
      head,
      read,
      blockers,
      models,
      deleted,
    });
  const commentsRoute = `repos/${repository}/issues/${pull.number}/comments`;

  // The first review posts the master comment. Each later review posts a
  // summary, and not only an edit, so that GitHub sends a notification.
  let posted: GithubComment | undefined = master;
  if (master) {
    const body = summaryBody({
      view,
      issues,
      changes,
      review,
      head,
      scope,
      masterUrl: `${view.pullUrl}#issuecomment-${master.id}`,
      blockers,
      models,
      deleted,
    });
    console.log(body);
    const summary = callApi<GithubComment>({
      method: "POST",
      route: commentsRoute,
      body: { body },
    });
    Object.assign(thisReview, {
      url: summary?.html_url,
      node: summary?.node_id,
    });
  } else {
    const { body, full } = masterOf(issues);
    console.log(full);
    posted = callApi<GithubComment>({
      method: "POST",
      route: commentsRoute,
      body: { body },
    });
    thisReview.url = posted?.html_url;
  }
  const masterUrl = posted?.id
    ? `${view.pullUrl}#issuecomment-${posted.id}`
    : view.pullUrl;

  let comments: ReturnType<typeof lineComments> = [];
  try {
    comments = lineComments({ added: changes.added, range, view });
    if (comments.length > 0) {
      // A review that requests changes blocks the merge until a person
      // dismisses it, also after a maintainer accepts the issues with the
      // label. The check already fails while a rule violation is open.
      callApi({
        method: "POST",
        route: `repos/${repository}/pulls/${pull.number}/reviews`,
        body: {
          commit_id: head,
          event: "COMMENT",
          body: `${count(comments.length, "new issue")} of the agent review ${are(comments.length)} on lines of this change. The [master comment](${masterUrl}) of the agent review has each issue, and the result of the check.`,
          comments,
        },
      });
    }
  } catch (error) {
    lineFailed(error);
  }
  let addresses = new Map<string, string | undefined>();
  if (issues.length > 0) {
    try {
      addresses = markLines({
        repository,
        number: pull.number,
        issues,
        fixed: changes.fixed,
        accepted: changes.accepted,
        link: view.reviewLink(review),
      });
    } catch (error) {
      lineFailed(error);
    }
  }
  const linked = issues.map((issue) =>
    !issue.lineComment && addresses.has(issue.id)
      ? { ...issue, lineComment: addresses.get(issue.id) }
      : issue,
  );
  if (
    posted?.id &&
    (master || linked.some((issue, index) => issue !== issues[index]))
  ) {
    const { body, full } = masterOf(linked);
    if (master) {
      console.log(full);
    }
    callApi({
      method: "PATCH",
      route: `repos/${repository}/issues/comments/${posted.id}`,
      body: { body },
    });
  }
  const earlierSummary = state.reviews.at(-1)?.node;
  if (master && earlierSummary) {
    hideSummary(earlierSummary);
  }

  if (blockers === 0) {
    return true;
  }
  if (pull.labels.some((label) => label.name === LABEL)) {
    callApi({
      method: "DELETE",
      route: `repos/${repository}/issues/${pull.number}/labels/${LABEL}`,
    });
    console.log(
      `The review has open rule violations, so it removed the ${LABEL} label.`,
    );
  }
  console.log(
    `::error title=Agent review::The review has ${blockers} open ${blockers === 1 ? "item" : "items"}. Fix required findings and failed review jobs cannot be accepted.`,
  );
  return false;
}

function labelVerdict(event: ReviewEvent): boolean {
  const repository = event.repository.full_name;
  const pull = event.pull_request;
  const comment = reviewComment({ repository, number: pull.number });
  const marker = comment?.body.match(MARKER_FIELDS);
  if (!comment || !marker || marker[1] !== pull.head.sha) {
    console.log(
      `::error title=Agent review::The review of ${pull.head.sha} has not finished. Its result replaces this one.`,
    );
    return false;
  }
  const state = stateOf(comment.body);
  const issues = reviewIssues(state?.issues ?? []);
  const open = issues.filter(isOpenFinding);
  if (Number(marker[2]) === 0 && open.length === 0) {
    console.log("The review of the head commit has no open items.");
    return true;
  }
  if (pull.labels.some((label) => label.name === LABEL)) {
    const adder = readPages<
      { event: string; label?: { name: string }; actor?: { login: string } }[]
    >(`repos/${repository}/issues/${pull.number}/events?per_page=100`)
      .flat()
      .filter(
        (entry) => entry.event === "labeled" && entry.label?.name === LABEL,
      )
      .at(-1)?.actor?.login;
    if (isMaintainer(adder)) {
      if (!state) {
        console.log(
          "The earlier review has no issue state. Run a new review before applying the acceptance label.",
        );
        return false;
      }
      const required = open.filter((issue) => !permitsApproval(issue));
      const failures =
        Number(marker[2]) - state.issues.filter(isOpenFinding).length;
      console.log(
        `${adder}, a maintainer, accepted ${count(open.length - required.length, "approval-permitted finding")} for this head.`,
      );
      if (required.length > 0 || failures !== 0) {
        console.log(
          "Findings that require a fix and failed review jobs cannot be accepted.",
        );
        return false;
      }
      return true;
    }
    console.log(`${adder} added the ${LABEL} label, and is not a maintainer.`);
  }
  console.log(
    `::error title=Agent review::The review has ${marker[2]} open items. The ${LABEL} label accepts only findings whose rules permit approval.`,
  );
  return false;
}

export function verdict(): boolean {
  const event = readEvent();
  return process.env.MODE === "label"
    ? labelVerdict(event)
    : reviewVerdict(event);
}
