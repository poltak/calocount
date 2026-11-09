import { OAuthError, registerClient } from "../../auth/oauth";
import { networkKey } from "../../auth/tokens";
import { getRequestDb, parseJsonBody } from "../../api/_lib/http";
import { corsPreflight, oauthJson, requireOAuth, withOAuthErrors } from "../_lib";

/** RFC 7591 dynamic client registration. ChatGPT registers once for each connection. */
export async function POST(request: Request): Promise<Response> {
  return withOAuthErrors(async () => {
    requireOAuth();
    let body: Record<string, unknown>;
    try {
      body = await parseJsonBody(request);
    } catch {
      throw new OAuthError(400, "invalid_client_metadata", "The request body must be a JSON object.");
    }
    return oauthJson(await registerClient({ db: getRequestDb(), body, network: await networkKey(request) }), { status: 201 });
  });
}

export const OPTIONS = corsPreflight;
