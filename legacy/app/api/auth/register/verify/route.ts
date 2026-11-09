import { finishPasskeyRegistration, relyingParty } from "../../../../auth/passkeys";
import { requirePasskeyAuth, requireSameOrigin, startSession } from "../../../_lib/auth-routes";
import { configuredOwnerKey, getRequestDb, jsonResponse, parseJsonBody, readSession, withApiErrors } from "../../../_lib/http";

/**
 * Save a new passkey. The challenge came only to a signed-in owner or to a
 * person with the setup code, and it works once. Without a session, the new
 * passkey signs the browser in.
 */
export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    requirePasskeyAuth();
    requireSameOrigin(request);
    const body = await parseJsonBody(request);
    const passkey = await finishPasskeyRegistration({
      db: getRequestDb(),
      ownerKey: configuredOwnerKey(),
      rp: relyingParty(request),
      body,
      userAgent: request.headers.get("user-agent"),
    });
    const headers = (await readSession(request)) ? {} : await startSession(request, passkey.id);
    return jsonResponse({ passkey }, { status: 201, headers });
  });
}
