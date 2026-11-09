import { getEnvValue } from "../../../../../db";
import { checkSetupCode, relyingParty, startPasskeyRegistration } from "../../../../auth/passkeys";
import { networkKey } from "../../../../auth/tokens";
import { requirePasskeyAuth, requireSameOrigin } from "../../../_lib/auth-routes";
import { configuredOwnerKey, getRequestDb, jsonResponse, parseJsonBody, readSession, withApiErrors } from "../../../_lib/http";

/**
 * Start to add a passkey. A signed-in owner can add one. Without a session,
 * the setup code is required: for the first passkey, or after a lost device.
 */
export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    requirePasskeyAuth();
    requireSameOrigin(request);
    const body = await parseJsonBody(request);
    const db = getRequestDb();
    if (!(await readSession(request))) {
      await checkSetupCode({ db, configured: getEnvValue("CALOCOUNT_SETUP_CODE"), given: body.setupCode, network: await networkKey(request) });
    }
    return jsonResponse(await startPasskeyRegistration({ db, ownerKey: configuredOwnerKey(), rp: relyingParty(request) }));
  });
}
