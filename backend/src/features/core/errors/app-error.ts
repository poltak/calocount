/** Error codes shared by the API contract. The HTTP layer maps each to a status. */
export type AppErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "UNAVAILABLE"
  // The sign-in codes. The page shows its own text for each one.
  | "SETUP_REQUIRED"
  | "INVALID_SETUP_CODE"
  | "SETUP_CODE_MISSING"
  | "SETUP_CODE_TOO_SHORT"
  | "CHALLENGE_EXPIRED"
  | "PASSKEY_UNKNOWN"
  | "PASSKEY_INVALID"
  | "PASSKEY_EXISTS"
  | "LAST_PASSKEY";

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
