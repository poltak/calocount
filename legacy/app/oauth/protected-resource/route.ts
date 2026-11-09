import { protectedResourceMetadata } from "../../auth/oauth";
import { corsPreflight, oauthJson, requireOAuth, withOAuthErrors } from "../_lib";

/** RFC 9728: tells an MCP client which authorization server protects /mcp. */
export async function GET(request: Request): Promise<Response> {
  return withOAuthErrors(async () => {
    requireOAuth();
    return oauthJson(protectedResourceMetadata(new URL(request.url).origin));
  });
}

export const OPTIONS = corsPreflight;
