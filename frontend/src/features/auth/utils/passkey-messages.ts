import { APP_NAME } from "@app/common/features/core/utils/app-name";

/** The text for a code of the backend. The old sign-in page used the same texts. */
export function serverMessage(code: string | undefined): string {
  switch (code) {
    case "INVALID_SETUP_CODE":
      return "This setup code is not correct.";
    case "RATE_LIMITED":
      return "Too many wrong setup codes. Wait 15 minutes, then try again.";
    case "SETUP_CODE_MISSING":
      return `This ${APP_NAME} has no setup code yet. Add the secret CALOCOUNT_SETUP_CODE to the Worker, then try again.`;
    case "SETUP_CODE_TOO_SHORT":
      return `The setup code of this ${APP_NAME} is too short. Change the secret CALOCOUNT_SETUP_CODE to at least 12 characters, then try again.`;
    case "CHALLENGE_EXPIRED":
      return "The request expired. Try again.";
    case "PASSKEY_UNKNOWN":
      return `This passkey does not belong to this ${APP_NAME}. Use another passkey, or add one with the setup code.`;
    case "PASSKEY_EXISTS":
      return `This device already has a passkey for this ${APP_NAME}. Sign in with it.`;
    case "PASSKEY_INVALID":
      return "The passkey could not be checked. Try again.";
    default:
      return "Sign-in did not work. Try again.";
  }
}

/** A message for a failed browser passkey request. The browser library keeps the name of the DOM error. */
export function ceremonyMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") {
    return "The passkey request was cancelled or timed out. Try again.";
  }
  if (name === "InvalidStateError") {
    return `This device already has a passkey for this ${APP_NAME}. Sign in with it.`;
  }
  if (name === "SecurityError") {
    return `This address cannot use passkeys. Open ${APP_NAME} at its HTTPS address.`;
  }
  return "The passkey request did not work. Try again.";
}

export const UNREACHABLE_MESSAGE = `${APP_NAME} could not be reached. Try again.`;
export const CHECK_FAILED_MESSAGE = `${APP_NAME} could not check the sign-in. Try again.`;

/** A passkey prompt that failed. Its message is for the user and needs no more mapping. */
export class PromptError extends Error {}
