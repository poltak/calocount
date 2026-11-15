import { ApiRequestError } from "../../api/client/api-client.js";

/**
 * The text for a failed request. The backend refuses a single field with a
 * message for the owner, and that message is the best text. Any other failure
 * keeps its own message.
 */
export function failureMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.issues?.[0]) {
    return error.issues[0].message;
  }
  return error instanceof Error ? error.message : String(error);
}
