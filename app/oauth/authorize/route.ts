import { renderConsentPage, renderOAuthErrorPage, renderSignInPage } from "../../../worker/pages";
import { isSameOriginWrite } from "../../auth/cookies";
import {
  approveAuthorization,
  checkAuthorizationRequest,
  denyAuthorization,
  type AuthorizationRequest,
} from "../../auth/oauth";
import { configuredOwnerKey, getRequestDb, isPasskeyAuth, readSession } from "../../api/_lib/http";
import { readSmallText } from "../_lib";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
}

/** The fields that the consent form posts back. The server checks all of them again. */
function consentFields(request: AuthorizationRequest, params: URLSearchParams): Record<string, string> {
  const fields: Record<string, string> = {
    response_type: "code",
    client_id: request.client.id,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
  };
  for (const name of ["state", "scope", "resource"]) {
    const value = params.get(name);
    if (value !== null) fields[name] = value;
  }
  return fields;
}

async function handle(request: Request, params: URLSearchParams, decision: string | null): Promise<Response> {
  if (!isPasskeyAuth()) return renderOAuthErrorPage(request, { status: 404, message: "This Calocount does not use OAuth sign-in." });
  const origin = new URL(request.url).origin;
  const db = getRequestDb();
  const check = await checkAuthorizationRequest({ db, params, origin });
  if (!check.ok) return renderOAuthErrorPage(request, { status: 400, message: check.description });
  const session = await readSession(request);
  if (!session) {
    // After sign-in, the sign-in page loads this request again.
    const returnTo = `/oauth/authorize?${params.toString()}`;
    return renderSignInPage(request, { returnTo, notice: `${check.request.client.name} wants to connect to your Calocount. Sign in first.` });
  }
  if (decision === null) {
    return renderConsentPage(request, {
      clientName: check.request.client.name,
      redirectHost: new URL(check.request.redirectUri).host,
      fields: consentFields(check.request, params),
    });
  }
  const location = decision === "allow"
    ? await approveAuthorization({ db, request: check.request, ownerKey: configuredOwnerKey(), origin })
    : denyAuthorization({ request: check.request, origin });
  return redirect(location);
}

async function safely(request: Request, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error("calocount oauth authorize error", error);
    return renderOAuthErrorPage(request, { status: 503, message: "Calocount could not check this request." });
  }
}

/** Show the consent page, or the sign-in page first. */
export async function GET(request: Request): Promise<Response> {
  return safely(request, () => handle(request, new URL(request.url).searchParams, null));
}

/** The owner's answer from the consent page. Only a page of this site can send it. */
export async function POST(request: Request): Promise<Response> {
  return safely(request, async () => {
    if (!isSameOriginWrite(request)) {
      return renderOAuthErrorPage(request, { status: 403, message: "The answer must come from the Calocount page." });
    }
    const text = await readSmallText(request);
    if (text === null) return renderOAuthErrorPage(request, { status: 413, message: "The request is too large." });
    const params = new URLSearchParams(text);
    const decision = params.get("decision") === "allow" ? "allow" : "deny";
    params.delete("decision");
    return handle(request, params, decision);
  });
}
