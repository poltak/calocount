/** Error codes shared by the API contract. The HTTP layer maps each to a status. */
export type AppErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "UNAVAILABLE";

export interface AppErrorIssue {
  path: string;
  message: string;
}

interface AppErrorProps {
  code: AppErrorCode;
  message: string;
  issues?: AppErrorIssue[];
  /** The wait before a retry. The response carries it in `Retry-After`. */
  retryAfterSeconds?: number;
  cause?: unknown;
}

/** An expected failure that Logic and handlers throw for callers to handle. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly issues: AppErrorIssue[] | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor({
    code,
    message,
    issues,
    retryAfterSeconds,
    cause,
  }: AppErrorProps) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.issues = issues;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A refusal that tells the user the wait, as the `Retry-After` header tells a client. */
export function tooManyAttempts({
  action,
  retryAfterSeconds,
}: {
  action: string;
  retryAfterSeconds: number;
}): AppError {
  const unit = retryAfterSeconds === 1 ? "second" : "seconds";
  return new AppError({
    code: "RATE_LIMITED",
    message: `Too many ${action} attempts. Try again in ${retryAfterSeconds} ${unit}.`,
    retryAfterSeconds,
  });
}
