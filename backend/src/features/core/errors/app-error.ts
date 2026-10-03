/** Error codes shared by the API contract. The HTTP layer maps each to a status. */
export type AppErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "NOT_IMPLEMENTED"
  | "UNAVAILABLE";

export interface AppErrorIssue {
  path: string;
  message: string;
}

interface AppErrorProps {
  code: AppErrorCode;
  message: string;
  issues?: AppErrorIssue[];
  cause?: unknown;
}

/** An expected failure that Logic and handlers throw for callers to handle. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly issues?: AppErrorIssue[];

  constructor({ code, message, issues, cause }: AppErrorProps) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.issues = issues;
  }
}
