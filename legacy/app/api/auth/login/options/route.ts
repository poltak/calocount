import { relyingParty, startPasskeySignIn } from "../../../../auth/passkeys";
import { requirePasskeyAuth, requireSameOrigin } from "../../../_lib/auth-routes";
import { configuredOwnerKey, getRequestDb, jsonResponse, withApiErrors } from "../../../_lib/http";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    requirePasskeyAuth();
    requireSameOrigin(request);
    return jsonResponse(await startPasskeySignIn({ db: getRequestDb(), ownerKey: configuredOwnerKey(), rp: relyingParty(request) }));
  });
}
