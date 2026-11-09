import { exchangeToken } from "../../auth/oauth";
import { getRequestDb } from "../../api/_lib/http";
import { corsPreflight, oauthJson, readFormBody, requireOAuth, withOAuthErrors } from "../_lib";

export async function POST(request: Request): Promise<Response> {
  return withOAuthErrors(async () => {
    requireOAuth();
    const form = await readFormBody(request);
    return oauthJson(await exchangeToken({ db: getRequestDb(), form, authorization: request.headers.get("authorization") }));
  });
}

export const OPTIONS = corsPreflight;
