import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  AppError,
  type AppErrorCode,
  type AppErrorIssue,
} from "../errors/app-error.js";

const appErrorStatuses = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
} as const satisfies Record<AppErrorCode, ContentfulStatusCode>;

type AppErrorStatus = (typeof appErrorStatuses)[AppErrorCode];

type AppErrorCodeForStatus<Status extends AppErrorStatus> = {
  [Code in AppErrorCode]: (typeof appErrorStatuses)[Code] extends Status
    ? Code
    : never;
}[AppErrorCode];

interface ApiErrorBody<Code extends AppErrorCode = AppErrorCode> {
  error: { code: Code; message: string; issues?: AppErrorIssue[] };
}

/** Every route can return these responses through the shared error handler. */
export type ApiErrorResponses = {
  [Status in AppErrorStatus]: {
    json: ApiErrorBody<AppErrorCodeForStatus<Status>>;
  };
};

function errorResponse(context: Context, error: AppError) {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message },
  };
  if (error.issues) {
    body.error.issues = error.issues;
  }
  return context.json(body, appErrorStatuses[error.code]);
}

/** Map thrown errors to the shared JSON error body. */
export const handleError: ErrorHandler = (error, context) => {
  if (error instanceof AppError) {
    return errorResponse(context, error);
  }
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  console.error(error);
  return errorResponse(
    context,
    new AppError({ code: "INTERNAL", message: "Internal server error" }),
  );
};

export const handleNotFound: NotFoundHandler = (context) =>
  errorResponse(
    context,
    new AppError({ code: "NOT_FOUND", message: "Route not found" }),
  );
