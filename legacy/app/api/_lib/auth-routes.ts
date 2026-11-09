import { clearedSessionCookie, isSameOriginWrite, sessionCookie } from "../../auth/cookies";
import { createSession } from "../../auth/store";
import { ApiError, configuredOwnerKey, getRequestDb, isPasskeyAuth } from "./http";

/** The passkey routes exist only when passkeys protect this instance. */
export function requirePasskeyAuth(): void {
  if (!isPasskeyAuth()) throw new ApiError(404, "passkey_auth_off", "Passkey sign-in is off for this instance.");
}

/** A sign-in request must come from a page of this site, so another site cannot sign a browser in. */
export function requireSameOrigin(request: Request): void {
  if (!isSameOriginWrite(request)) throw new ApiError(403, "invalid_origin", "The request must come from this site.");
}

/** Start a session for a passkey, and return the header that gives the browser its cookie. */
export async function startSession(request: Request, passkeyId: string): Promise<Record<string, string>> {
  const token = await createSession({ db: getRequestDb(), ownerKey: configuredOwnerKey(), passkeyId });
  return { "set-cookie": sessionCookie({ url: new URL(request.url), token }) };
}

export function endSessionHeaders(request: Request): Record<string, string> {
  return { "set-cookie": clearedSessionCookie(new URL(request.url)) };
}
