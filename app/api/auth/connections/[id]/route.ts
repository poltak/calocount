import { removeConnection } from "../../../../auth/oauth";
import { requirePasskeyAuth } from "../../../_lib/auth-routes";
import { ApiError, getRequestDb, jsonResponse, requireApiIdentity, withApiErrors } from "../../../_lib/http";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    requirePasskeyAuth();
    const { id } = await context.params;
    if (!(await removeConnection({ db: getRequestDb(), ownerKey: identity.ownerKey, id }))) {
      throw new ApiError(404, "not_found", "Connection not found.");
    }
    return jsonResponse({ removed: true });
  });
}
