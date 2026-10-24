import { authorizationServerMetadata } from "../../auth/oauth";
import { corsPreflight, oauthJson, requireOAuth, withOAuthErrors } from "../_lib";

/** RFC 8414: the endpoints and features of the authorization server. */
export async function GET(request: Request): Promise<Response> {
  return withOAuthErrors(async () => {
    requireOAuth();
    return oauthJson(authorizationServerMetadata(new URL(request.url).origin));
  });
}

export const OPTIONS = corsPreflight;
