import type { ApiType } from "backend/api";
import { hc } from "hono/client";

/** The body of the response of a route, for one status. Other code reads response types through this layer. */
export type { InferResponseType as ApiResponseBody } from "hono/client";

const NO_CONNECTION =
  "No connection. Check your internet connection and try again.";

export interface ApiClientProps {
  /** An absolute URL. `$url()` of the client fails on a relative one. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  onSessionRejected?: () => void;
}

/**
 * First-party client for routes under `/api`. Its endpoint and request types
 * come from the Hono routes.
 */
export function createApiClient({
  baseUrl,
  fetch,
  onSessionRejected,
}: ApiClientProps) {
  if (!URL.canParse(baseUrl)) {
    throw new Error(`The API base URL is not absolute: "${baseUrl}"`);
  }
  const transport = fetch ?? globalThis.fetch.bind(globalThis);
  const authenticatedFetch: typeof globalThis.fetch = async (input, init) => {
    let response: Response;
    try {
      response = await transport(input, init);
    } catch (error) {
      // fetch rejects with a TypeError without a connection. Its message differs in each browser.
      if (error instanceof TypeError) {
        throw new Error(NO_CONNECTION, { cause: error });
      }
      throw error;
    }
    if (await isSessionRejected(response)) {
      onSessionRejected?.();
    }
    return response;
  };
  return hc<ApiType>(`${baseUrl.replace(/\/+$/, "")}/api`, {
    init: { credentials: "include" },
    fetch: authenticatedFetch,
  });
}

export type BackendApi = ReturnType<typeof createApiClient>;

interface ApiRequestIssue {
  path: string;
  message: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** Set when the backend refused single fields. A task shows them as field errors. */
  readonly issues: ApiRequestIssue[] | undefined;

  constructor({
    status,
    code,
    message,
    issues,
  }: {
    status: number;
    code?: string | undefined;
    message: string;
    issues?: ApiRequestIssue[] | undefined;
  }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

function isApiRequestIssue(value: unknown): value is ApiRequestIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

async function readApiError(response: Response) {
  let code: string | undefined;
  let message = `Request failed with status ${response.status}`;
  let issues: ApiRequestIssue[] | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (error && typeof error === "object") {
        if ("code" in error && typeof error.code === "string") {
          code = error.code;
        }
        if ("message" in error && typeof error.message === "string") {
          message = error.message;
        }
        if ("issues" in error && Array.isArray(error.issues)) {
          issues = error.issues.filter(isApiRequestIssue);
        }
      }
    }
  } catch {
    // A non-JSON error still has its HTTP status.
  }
  return { code, message, issues };
}

/**
 * Only the backend's own refusal ends a session. A proxy in front of the
 * backend can also answer 401, and that says nothing about the session.
 */
async function isSessionRejected(response: Response): Promise<boolean> {
  if (response.status !== 401) {
    return false;
  }
  const { code } = await readApiError(response.clone());
  return code === "UNAUTHENTICATED";
}

/** Common transport error handling, rather than a wrapper per feature. */
export async function requireApiSuccess(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  throw new ApiRequestError({
    status: response.status,
    ...(await readApiError(response)),
  });
}
