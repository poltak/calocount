import { deletePasskey } from "../../../../auth/store";
import { endSessionHeaders, requirePasskeyAuth } from "../../../_lib/auth-routes";
import { ApiError, getRequestDb, jsonResponse, readSession, requireApiIdentity, withApiErrors } from "../../../_lib/http";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

/** Remove a passkey, such as the one of a lost phone. Its sessions end. The last passkey stays, so the owner keeps a way in. */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    requirePasskeyAuth();
    const { id } = await context.params;
    const session = await readSession(request);
    const result = await deletePasskey({ db: getRequestDb(), ownerKey: identity.accountKey, id });
    if (result === "last") throw new ApiError(409, "last_passkey", "Add another passkey before you remove this one.");
    if (result === "missing") throw new ApiError(404, "not_found", "Passkey not found.");
    const signedOut = session?.passkeyId === id;
    return jsonResponse({ removed: true, signedOut }, { headers: signedOut ? endSessionHeaders(request) : {} });
  });
}
