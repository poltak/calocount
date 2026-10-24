import { listPasskeys } from "../../../auth/store";
import { requirePasskeyAuth } from "../../_lib/auth-routes";
import { getRequestDb, jsonResponse, readSession, requireApiIdentity, withApiErrors } from "../../_lib/http";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    requirePasskeyAuth();
    const [passkeys, session] = await Promise.all([listPasskeys({ db: getRequestDb(), ownerKey: identity.ownerKey }), readSession(request)]);
    return jsonResponse({
      passkeys: passkeys.map((passkey) => ({
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt,
        synced: passkey.backedUp,
        current: passkey.id === session?.passkeyId,
      })),
    });
  });
}
