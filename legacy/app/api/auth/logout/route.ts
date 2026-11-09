import { readSessionCookie } from "../../../auth/cookies";
import { deleteSession } from "../../../auth/store";
import { endSessionHeaders, requirePasskeyAuth, requireSameOrigin } from "../../_lib/auth-routes";
import { getRequestDb, jsonResponse, withApiErrors } from "../../_lib/http";

/** End the session of this browser. It works without a live session, so an expired cookie also goes. */
export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    requirePasskeyAuth();
    requireSameOrigin(request);
    const token = readSessionCookie(request);
    if (token) await deleteSession({ db: getRequestDb(), token });
    return jsonResponse({ signedIn: false }, { headers: endSessionHeaders(request) });
  });
}
