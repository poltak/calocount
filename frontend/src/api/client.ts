import type { ApiType } from "backend/api";
import { hc } from "hono/client";

export interface ApiClientProps {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  onSessionRejected?: () => void;
}

/**
 * First-party client for routes under `/api`. Its endpoint and request types
 * come from the Hono routes.
 */
export function createApiClient({
  baseUrl = "",
  fetch,
  onSessionRejected,
}: ApiClientProps = {}) {
  const transport = fetch ?? globalThis.fetch.bind(globalThis);
  const authenticatedFetch: typeof globalThis.fetch = async (input, init) => {
    const response = await transport(input, init);
    if (response.status === 401) onSessionRejected?.();
    return response;
  };
  return hc<ApiType>(`${baseUrl.replace(/\/+$/, "")}/api`, {
    init: { credentials: "include" },
    fetch: authenticatedFetch,
  });
}

export type BackendApi = ReturnType<typeof createApiClient>;

/** Hono substitutes path parameters without encoding them. Encode once here. */
export function encodeApiParam(value: string): string {
  return encodeURIComponent(value);
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor({
    status,
    code,
    message,
  }: {
    status: number;
    code?: string;
    message: string;
  }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

/** Common transport error handling, rather than a wrapper per feature. */
export async function requireApiSuccess(response: Response): Promise<void> {
  if (response.ok) return;

  let code: string | undefined;
  let message = `Request failed with status ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (error && typeof error === "object") {
        if ("code" in error && typeof error.code === "string")
          code = error.code;
        if ("message" in error && typeof error.message === "string")
          message = error.message;
      }
    }
  } catch {
    // A non-JSON error still has its HTTP status.
  }
  throw new ApiRequestError({ status: response.status, code, message });
}
