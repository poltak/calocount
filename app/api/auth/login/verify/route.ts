import { finishPasskeySignIn, relyingParty } from "../../../../auth/passkeys";
import { requirePasskeyAuth, requireSameOrigin, startSession } from "../../../_lib/auth-routes";
import { configuredOwnerKey, getRequestDb, jsonResponse, parseJsonBody, withApiErrors } from "../../../_lib/http";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    requirePasskeyAuth();
    requireSameOrigin(request);
    const body = await parseJsonBody(request);
    const passkey = await finishPasskeySignIn({ db: getRequestDb(), ownerKey: configuredOwnerKey(), rp: relyingParty(request), body });
    return jsonResponse({ signedIn: true }, { headers: await startSession(request, passkey.id) });
  });
}
