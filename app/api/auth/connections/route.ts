import { listConnections } from "../../../auth/oauth";
import { requirePasskeyAuth } from "../../_lib/auth-routes";
import { getRequestDb, jsonResponse, requireApiIdentity, withApiErrors } from "../../_lib/http";

/** The apps, such as ChatGPT, that the owner allowed to use the MCP endpoint. */
export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    requirePasskeyAuth();
    return jsonResponse({ connections: await listConnections({ db: getRequestDb(), ownerKey: identity.ownerKey }) });
  });
}
