export interface PullRequest {
  number: number;
  title?: string | null | undefined;
  body?: string | null | undefined;
  draft?: boolean | undefined;
  user: { login: string };
  labels: { name: string }[];
  base: { sha: string };
  head: { sha: string };
}

export interface ReviewEvent {
  action?: string | undefined;
  changes?: { title?: unknown; body?: unknown } | undefined;
  label?: { name: string } | undefined;
  repository: { full_name: string };
  pull_request: PullRequest;
}

/** A comment of a pull request, from the REST API of GitHub. */
export interface GithubComment {
  id: number;
  node_id?: string;
  created_at?: string;
  html_url?: string;
  in_reply_to_id?: number;
  user?: { login: string } | null;
  body: string;
}

export interface MaintainerComment {
  author: string;
  body: string;
}

// The schema of the findings says that `line` can be null. The script treats
// the line as a number, and a null gives an empty range.
export interface Finding {
  rule?: string | undefined;
  file: string;
  line: number;
  quote: string;
  explanation: string;
  models: string[];
  commit?: string | undefined;
}

export interface Vote {
  model: string;
  status?: string | undefined;
  explanation?: string | undefined;
}

export interface Issue extends Finding {
  id: string;
  status: "open" | "accepted" | "fixed";
  found: number;
  head?: string | undefined;
  reopened?: number | undefined;
  lineComment?: string | undefined;
  reason?: string | undefined;
  votes?: Vote[] | undefined;
  fixedIn?: number | undefined;
  acceptedBy?: string | undefined;
  acceptedIn?: number | undefined;
  comments?: MaintainerComment[] | undefined;
}

export interface ModelStatus {
  id: string;
  status: string;
  explanation?: string | undefined;
}

export interface ModelResult {
  name: string;
  model: string;
  state: "ok" | "not-configured" | "failed";
  findings: Finding[];
  notes: Finding[];
  statuses: ModelStatus[];
  usage?: string | undefined;
  message?: string | undefined;
}

/** The output of a model, before the script adds the model to each item. */
export interface ModelOutput {
  findings?: Omit<Finding, "models">[] | undefined;
  notes?: Omit<Finding, "models">[] | undefined;
  earlier?: ModelStatus[] | undefined;
}

export interface ReviewRecord {
  number: number;
  head: string;
  from?: string | undefined;
  added: number;
  addressed: number;
  open: number;
  url?: string | undefined;
  node?: string | undefined;
}

export interface ReviewState {
  issues: Issue[];
  reviews: ReviewRecord[];
}

export interface EarlierReview {
  head: string;
  comment: number;
  master: boolean;
  issues: Issue[];
  reviewed?: string | undefined;
  base?: string | undefined;
}

export interface Range {
  base: string;
  head: string;
}

export interface Scope extends Range {
  from: string;
  reason: string;
}

export interface Changes {
  fixed: Issue[];
  accepted: Issue[];
  added: Issue[];
  reopened: Issue[];
  disagree: Issue[];
}

export interface Deleted {
  quote: number;
  rule: number;
}

export interface Read {
  reviewed?: string | undefined;
  base?: string | undefined;
}

export interface LinkInput {
  file: string;
  line?: number | undefined;
  commit?: string | undefined;
}

/** The functions that write the links and the titles of the issues. */
export interface View {
  server: string;
  repositoryUrl: string;
  pullUrl: string;
  ruleLink: (rule: string) => string;
  sensitiveFiles: Set<string>;
  link: (input: LinkInput) => string;
  title: (issue: Issue) => string;
  issueLink: (issue: Issue) => string;
  reviewLink: (review: number | undefined) => string;
  showsQuote: (issue: Issue) => boolean;
}

export interface CommentLimits {
  open: number;
  addressed: number;
}
