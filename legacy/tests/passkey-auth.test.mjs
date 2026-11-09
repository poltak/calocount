import assert from "node:assert/strict";
import test from "node:test";

import { createAuthenticator } from "./helpers/passkey-authenticator.mjs";
import { startWorker } from "./helpers/worker-runtime.mjs";

// These requests run the built Worker with a real database. The passkey
// answers come from a software authenticator, so the WebAuthn checks are real.

const ORIGIN = "http://localhost";
const SETUP_CODE = "correct horse battery staple";
const PASSKEY = { CALOCOUNT_ALLOW_LOCAL: "false", CALOCOUNT_OWNER_KEY: "owner", CALOCOUNT_SETUP_CODE: SETUP_CODE };
const MCP_HEADERS = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" };
const CHATGPT_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

/** A browser with a cookie jar. Writes send this site's Origin unless a test says otherwise. */
function browser(worker) {
  const jar = { cookie: null };
  async function call({ path, method = "GET", body, origin = method === "GET" ? null : ORIGIN, headers = {} }) {
    const response = await worker.request({
      path,
      method,
      body,
      headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...(origin ? { origin } : {}), ...headers },
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) jar.cookie = /Max-Age=0/.test(setCookie) ? null : setCookie.split(";")[0];
    return response;
  }
  async function page(path, init = {}) {
    return worker.fetch(path, { redirect: "manual", ...init, headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...init.headers } });
  }
  return { jar, call, page };
}

async function setUp(user, authenticator, setupCode = SETUP_CODE) {
  const options = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode } });
  assert.equal(options.status, 200, JSON.stringify(options.body));
  const response = await authenticator.register({ options: options.body.options, origin: ORIGIN });
  const verified = await user.call({ path: "/api/auth/register/verify", method: "POST", body: { challengeId: options.body.challengeId, response } });
  return { options, verified };
}

async function signIn(user, authenticator, { tamper = false } = {}) {
  const options = await user.call({ path: "/api/auth/login/options", method: "POST", body: {} });
  assert.equal(options.status, 200, JSON.stringify(options.body));
  const response = await authenticator.signIn({ options: options.body.options, origin: ORIGIN, tamper });
  return user.call({ path: "/api/auth/login/verify", method: "POST", body: { challengeId: options.body.challengeId, response } });
}

test("a new instance saves its first passkey with the setup code, then signs in with it", async () => {
  const worker = await startWorker(PASSKEY, { storage: true });
  const user = browser(worker);
  const phone = await createAuthenticator();
  try {
    const status = await user.call({ path: "/api/auth/status" });
    assert.deepEqual(status.body, { mode: "passkey", signedIn: false, hasPasskeys: false, setupCode: "ready" });
    assert.match(await (await user.page("/owner")).text(), /data-view="sign-in"/);
    assert.equal((await user.call({ path: "/api/dashboard/summary" })).body.error.code, "sign_in_required");
    assert.equal((await user.call({ path: "/api/auth/login/options", method: "POST", body: {} })).body.error.code, "setup_required");

    // Another site cannot start the setup, and a wrong code does not work.
    const crossSite = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: SETUP_CODE }, origin: "https://evil.example" });
    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.body.error.code, "invalid_origin");
    const wrongCode = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: "wrong code that is long" } });
    assert.equal(wrongCode.status, 403);
    assert.equal(wrongCode.body.error.code, "invalid_setup_code");

    const { options, verified } = await setUp(user, phone);
    assert.equal(options.body.options.rp.id, "localhost");
    assert.equal(options.body.options.authenticatorSelection.residentKey, "required");
    assert.equal(options.body.options.authenticatorSelection.userVerification, "required");
    assert.equal(verified.status, 201);
    assert.equal(verified.body.passkey.id, phone.id);
    assert.ok(user.jar.cookie?.startsWith("calocount_session="));

    // A challenge works once.
    const replay = await user.call({
      path: "/api/auth/register/verify",
      method: "POST",
      body: { challengeId: options.body.challengeId, response: await phone.register({ options: options.body.options, origin: ORIGIN }) },
    });
    assert.equal(replay.body.error.code, "challenge_expired");

    assert.equal((await user.call({ path: "/api/dashboard/summary" })).status, 200);
    assert.equal((await user.call({ path: "/api/auth/status" })).body.signedIn, true);
    const ownerPage = await user.page("/owner");
    assert.match(await ownerPage.text(), /Loading your saved log/);
    assert.match(ownerPage.headers.get("set-cookie") ?? "", /^calocount_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=34560000$/);

    // A write with the cookie must come from a page of this site.
    const meal = { consumedAt: Date.now(), mealType: "lunch", source: "dashboard", status: "complete", items: [{ name: "Pho", quantity: 1, unit: "bowl", calories: 500, proteinG: 30, carbsG: 60, fatG: 12 }] };
    assert.equal((await user.call({ path: "/api/meals", method: "POST", body: meal, origin: null })).body.error.code, "invalid_origin");
    assert.equal((await user.call({ path: "/api/meals", method: "POST", body: meal })).status, 201);

    const signedOutCookie = user.jar.cookie;
    const logout = await user.call({ path: "/api/auth/logout", method: "POST", body: {} });
    assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
    const oldSession = await worker.request({ path: "/api/dashboard/summary", headers: { cookie: signedOutCookie } });
    assert.equal(oldSession.status, 401);
    // The owner page shows the sign-in page for the old cookie and removes it.
    const oldCookiePage = await worker.fetch("/owner", { headers: { cookie: signedOutCookie } });
    assert.match(await oldCookiePage.text(), /data-view="sign-in"/);
    assert.match(oldCookiePage.headers.get("set-cookie") ?? "", /Max-Age=0/);

    assert.equal((await signIn(user, phone, { tamper: true })).body.error.code, "passkey_invalid");
    const signedIn = await signIn(user, phone);
    assert.equal(signedIn.status, 200);
    assert.equal((await user.call({ path: "/api/dashboard/summary" })).status, 200);

    const passkeys = await user.call({ path: "/api/auth/passkeys" });
    assert.equal(passkeys.body.passkeys.length, 1);
    assert.equal(passkeys.body.passkeys[0].current, true);
    assert.equal(passkeys.body.passkeys[0].synced, true);
    assert.ok(passkeys.body.passkeys[0].lastUsedAt);
    const removeLast = await user.call({ path: `/api/auth/passkeys/${phone.id}`, method: "DELETE" });
    assert.equal(removeLast.status, 409);
    assert.equal(removeLast.body.error.code, "last_passkey");
  } finally {
    await worker.dispose();
  }
});

test("the setup code adds a passkey after a lost device, and removing a passkey ends its sessions", async () => {
  const worker = await startWorker(PASSKEY, { storage: true });
  const phone = await createAuthenticator();
  const laptop = await createAuthenticator();
  const newPhone = await createAuthenticator();
  try {
    const phoneUser = browser(worker);
    assert.equal((await setUp(phoneUser, phone)).verified.status, 201);

    // A signed-in owner adds a passkey without the setup code.
    const laptopUser = browser(worker);
    laptopUser.jar.cookie = phoneUser.jar.cookie;
    const added = await setUp(laptopUser, laptop, undefined);
    assert.equal(added.verified.status, 201);
    assert.equal(added.verified.headers.get("set-cookie"), null, "a signed-in owner keeps the session");

    // On a new device without a session, the setup code adds a passkey and signs in.
    const newPhoneUser = browser(worker);
    assert.equal((await setUp(newPhoneUser, newPhone)).verified.status, 201);
    assert.equal((await newPhoneUser.call({ path: "/api/auth/passkeys" })).body.passkeys.length, 3);

    // Remove the lost phone. The session that the phone signed in ends.
    const removed = await newPhoneUser.call({ path: `/api/auth/passkeys/${phone.id}`, method: "DELETE" });
    assert.deepEqual(removed.body, { removed: true, signedOut: false });
    assert.equal((await phoneUser.call({ path: "/api/dashboard/summary" })).status, 401);
    assert.equal((await newPhoneUser.call({ path: "/api/dashboard/summary" })).status, 200);
    assert.equal((await signIn(browser(worker), phone)).body.error.code, "passkey_unknown");
  } finally {
    await worker.dispose();
  }
});

test("parallel wrong setup codes cannot pass the limit, and another network still gets its own tries", async () => {
  const worker = await startWorker(PASSKEY, { storage: true });
  try {
    const attacker = { "cf-connecting-ip": "203.0.113.7" };
    const results = await Promise.all(Array.from({ length: 30 }, (_, attempt) => worker.request({
      path: "/api/auth/register/options",
      method: "POST",
      body: { setupCode: `wrong code ${attempt}` },
      headers: { origin: ORIGIN, ...attacker },
    })));
    // Each attempt counts before its check, so a burst gets at most 10 checks. It often gets fewer.
    const codes = results.map((result) => result.body.error.code);
    const checked = codes.filter((code) => code === "invalid_setup_code").length;
    assert.ok(checked >= 1 && checked <= 10, codes.join(","));
    assert.equal(codes.filter((code) => code === "too_many_attempts").length, 30 - checked);
    // Refused attempts do not count against the shared limit, so the owner on another network can still set up.
    const owner = browser(worker);
    const options = await owner.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: SETUP_CODE }, headers: { "cf-connecting-ip": "198.51.100.4" } });
    assert.equal(options.status, 200);
  } finally {
    await worker.dispose();
  }
});

test("two parallel removals cannot remove the last passkey", async () => {
  const worker = await startWorker(PASSKEY, { storage: true });
  try {
    const user = browser(worker);
    const phone = await createAuthenticator();
    const laptop = await createAuthenticator();
    assert.equal((await setUp(user, phone)).verified.status, 201);
    assert.equal((await setUp(user, laptop)).verified.status, 201);
    const [first, second] = await Promise.all([
      user.call({ path: `/api/auth/passkeys/${laptop.id}`, method: "DELETE" }),
      user.call({ path: `/api/auth/passkeys/${phone.id}`, method: "DELETE" }),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const left = await worker.request({ path: "/api/auth/status" });
    assert.equal(left.body.hasPasskeys, true);
  } finally {
    await worker.dispose();
  }
});

test("wrong setup codes reach a limit, and a short or missing setup code is refused", async () => {
  const worker = await startWorker(PASSKEY, { storage: true });
  try {
    const user = browser(worker);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const wrong = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: `wrong ${attempt}` } });
      assert.equal(wrong.body.error.code, "invalid_setup_code");
    }
    const limited = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: SETUP_CODE } });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, "too_many_attempts");
  } finally {
    await worker.dispose();
  }
  for (const [setupCode, state, code] of [["", "missing", "setup_code_missing"], ["too short", "too_short", "setup_code_too_short"]]) {
    const instance = await startWorker({ ...PASSKEY, CALOCOUNT_SETUP_CODE: setupCode }, { storage: true });
    try {
      const user = browser(instance);
      assert.equal((await user.call({ path: "/api/auth/status" })).body.setupCode, state);
      const refused = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode } });
      assert.equal(refused.status, 503);
      assert.equal(refused.body.error.code, code);
    } finally {
      await instance.dispose();
    }
  }
});

async function pkcePair() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  return { verifier, challenge };
}

function authorizeParams({ clientId, challenge, state = "state-123", redirectUri = CHATGPT_REDIRECT, extra = {} }) {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    resource: `${ORIGIN}/mcp`,
    ...extra,
  });
}

async function tokenRequest(worker, { client, form }) {
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams(form);
  if (client.client_secret) headers.authorization = `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
  else body.set("client_id", client.client_id);
  const response = await worker.fetch("/oauth/token", { method: "POST", headers, body: body.toString() });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

/** Approve an authorization request on the consent page and return the code. */
async function approve(user, params) {
  const consent = await user.page(`/oauth/authorize?${params}`);
  assert.equal(consent.status, 200);
  const form = new URLSearchParams(params);
  form.set("decision", "allow");
  const answer = await user.page("/oauth/authorize", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  assert.equal(answer.status, 303);
  return new URL(answer.headers.get("location"));
}

function mcpToolsList(worker, token) {
  return worker.request({
    path: "/mcp",
    method: "POST",
    headers: { ...MCP_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
}

test("ChatGPT connects to the MCP endpoint with OAuth after the owner allows it", async () => {
  const worker = await startWorker(PASSKEY, { storage: true });
  const user = browser(worker);
  try {
    assert.equal((await setUp(user, await createAuthenticator())).verified.status, 201);

    const resource = await worker.request({ path: "/.well-known/oauth-protected-resource/mcp" });
    assert.deepEqual(resource.body, {
      resource: `${ORIGIN}/mcp`,
      authorization_servers: [ORIGIN],
      bearer_methods_supported: ["header"],
      resource_name: "Calocount",
    });
    assert.equal(resource.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual((await worker.request({ path: "/.well-known/oauth-protected-resource" })).body, resource.body);
    const server = (await worker.request({ path: "/.well-known/oauth-authorization-server" })).body;
    assert.equal(server.issuer, ORIGIN);
    assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
    assert.equal(server.authorization_response_iss_parameter_supported, true);
    assert.equal(server.registration_endpoint, `${ORIGIN}/oauth/register`);

    const unauthenticated = await mcpToolsList(worker, null);
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get("www-authenticate"), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);

    // One network cannot use up the registrations of everyone.
    for (let index = 0; index < 10; index += 1) {
      const spam = await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: ["https://spam.example/cb"] }, headers: { "cf-connecting-ip": "203.0.113.9" } });
      assert.equal(spam.status, 201);
    }
    const limited = await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: ["https://spam.example/cb"] }, headers: { "cf-connecting-ip": "203.0.113.9" } });
    assert.equal(limited.status, 429);

    const badRedirect = await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: ["http://evil.example/callback"] } });
    assert.equal(badRedirect.status, 400);
    assert.equal(badRedirect.body.error, "invalid_redirect_uri");
    const registered = await worker.request({ path: "/oauth/register", method: "POST", body: { client_name: "ChatGPT", redirect_uris: [CHATGPT_REDIRECT] } });
    assert.equal(registered.status, 201);
    const client = registered.body;
    assert.equal(client.token_endpoint_auth_method, "client_secret_basic");
    assert.ok(client.client_secret);

    // Without a session, the authorize page asks the owner to sign in first and then comes back.
    const { verifier, challenge } = await pkcePair();
    const params = authorizeParams({ clientId: client.client_id, challenge });
    const signedOutPage = await browser(worker).page(`/oauth/authorize?${params}`);
    const signedOutHtml = await signedOutPage.text();
    assert.match(signedOutHtml, /data-view="sign-in"/);
    assert.match(signedOutHtml, /ChatGPT wants to connect to your Calocount/);
    assert.ok(signedOutHtml.includes(`data-return-to="/oauth/authorize?${params.toString().replaceAll("&", "&#38;")}"`));

    const consent = await user.page(`/oauth/authorize?${params}`);
    const consentHtml = await consent.text();
    assert.match(consentHtml, /Connect ChatGPT to Calocount\?/);
    assert.match(consentHtml, /<strong>chatgpt\.com<\/strong>/);
    assert.equal(consent.headers.get("x-frame-options"), "DENY");
    // With no-referrer, a browser sends Origin: null with the form, and the owner's own answer fails.
    assert.equal(consent.headers.get("referrer-policy"), "same-origin");

    // An answer from another site does not count.
    const crossSite = await user.page("/oauth/authorize", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
      body: `${params}&decision=allow`,
    });
    assert.equal(crossSite.status, 403);

    const redirect = await approve(user, params);
    assert.equal(`${redirect.origin}${redirect.pathname}`, CHATGPT_REDIRECT);
    assert.equal(redirect.searchParams.get("state"), "state-123");
    assert.equal(redirect.searchParams.get("iss"), ORIGIN);
    const code = redirect.searchParams.get("code");
    assert.ok(code);

    const tokens = await tokenRequest(worker, {
      client,
      form: { grant_type: "authorization_code", code, redirect_uri: CHATGPT_REDIRECT, code_verifier: verifier, resource: `${ORIGIN}/mcp` },
    });
    assert.equal(tokens.status, 200, JSON.stringify(tokens.body));
    assert.equal(tokens.body.token_type, "Bearer");
    assert.equal(tokens.body.expires_in, 3600);
    assert.equal(tokens.headers.get("cache-control"), "no-store");
    const reused = await tokenRequest(worker, {
      client,
      form: { grant_type: "authorization_code", code, redirect_uri: CHATGPT_REDIRECT, code_verifier: verifier },
    });
    assert.equal(reused.body.error, "invalid_grant");

    const listed = await mcpToolsList(worker, tokens.body.access_token);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.result.tools.some((tool) => tool.name === "add_meals"));
    const wrongToken = await mcpToolsList(worker, "cca_not_a_real_token_value_at_all");
    assert.equal(wrongToken.status, 401);
    assert.match(wrongToken.headers.get("www-authenticate"), /error="invalid_token"/);

    // A confidential client keeps its refresh token and gets a new access token.
    const refreshed = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.refresh_token, tokens.body.refresh_token);
    assert.notEqual(refreshed.body.access_token, tokens.body.access_token);
    assert.equal((await mcpToolsList(worker, refreshed.body.access_token)).status, 200);

    const connections = await user.call({ path: "/api/auth/connections" });
    assert.equal(connections.body.connections.length, 1);
    assert.equal(connections.body.connections[0].name, "ChatGPT");
    assert.ok(connections.body.connections[0].lastUsedAt);
    const disconnected = await user.call({ path: `/api/auth/connections/${connections.body.connections[0].id}`, method: "DELETE" });
    assert.equal(disconnected.status, 200);
    assert.equal((await mcpToolsList(worker, refreshed.body.access_token)).status, 401);
    const afterDisconnect = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
    assert.equal(afterDisconnect.body.error, "invalid_grant");
  } finally {
    await worker.dispose();
  }
});

test("OAuth refuses a bad request, a wrong verifier, a denial, and rotates the refresh token of a public client", async () => {
  const worker = await startWorker(PASSKEY, { storage: true });
  const user = browser(worker);
  try {
    assert.equal((await setUp(user, await createAuthenticator())).verified.status, 201);
    const client = (await worker.request({
      path: "/oauth/register",
      method: "POST",
      body: { client_name: "Inspector", redirect_uris: ["http://localhost:6274/callback"], token_endpoint_auth_method: "none" },
    })).body;
    assert.equal(client.client_secret, undefined);
    const redirectUri = "http://localhost:6274/callback";
    const { verifier, challenge } = await pkcePair();

    // A return address that the client did not register shows an error page and never redirects.
    const unregistered = await user.page(`/oauth/authorize?${authorizeParams({ clientId: client.client_id, challenge, redirectUri: "https://evil.example/cb" })}`);
    assert.equal(unregistered.status, 400);
    assert.match(await unregistered.text(), /did not register/);
    // Other errors also show on the page. Anyone can register a client, so an error redirect would be an open redirect.
    for (const [extra, message] of [
      [{ code_challenge_method: "plain" }, /did not use PKCE/],
      [{ resource: "https://other.example/mcp" }, /asked for another resource/],
      [{ response_type: "token" }, /unsupported response type/],
    ]) {
      for (const visitor of [user, browser(worker)]) {
        const response = await visitor.page(`/oauth/authorize?${authorizeParams({ clientId: client.client_id, challenge, redirectUri, extra })}`);
        assert.equal(response.status, 400);
        assert.equal(response.headers.get("location"), null);
        assert.match(await response.text(), message);
      }
    }

    const denied = await user.page("/oauth/authorize", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
      body: `${authorizeParams({ clientId: client.client_id, challenge, redirectUri })}&decision=deny`,
    });
    assert.equal(new URL(denied.headers.get("location")).searchParams.get("error"), "access_denied");

    const wrongVerifierCode = (await approve(user, authorizeParams({ clientId: client.client_id, challenge, redirectUri }))).searchParams.get("code");
    const wrongVerifier = await tokenRequest(worker, {
      client,
      form: { grant_type: "authorization_code", code: wrongVerifierCode, redirect_uri: redirectUri, code_verifier: "x".repeat(43) },
    });
    assert.equal(wrongVerifier.body.error, "invalid_grant");

    const code = (await approve(user, authorizeParams({ clientId: client.client_id, challenge, redirectUri }))).searchParams.get("code");
    const tokens = await tokenRequest(worker, { client, form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier } });
    assert.equal(tokens.status, 200);
    // A second approval replaces the first connection of the same app.
    assert.equal((await user.call({ path: "/api/auth/connections" })).body.connections.length, 1);

    const rotated = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.body.refresh_token, tokens.body.refresh_token);
    // The old refresh token works for a short time, so a client that lost the answer can retry.
    const retry = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
    assert.equal(retry.status, 200);
    assert.equal((await mcpToolsList(worker, rotated.body.access_token)).status, 200);

    const unsupported = await tokenRequest(worker, { client, form: { grant_type: "client_credentials" } });
    assert.equal(unsupported.body.error, "unsupported_grant_type");
    const unknownClient = await tokenRequest(worker, { client: { client_id: "ccc_unknown" }, form: { grant_type: "refresh_token", refresh_token: "x" } });
    assert.equal(unknownClient.status, 401);
    assert.equal(unknownClient.body.error, "invalid_client");
  } finally {
    await worker.dispose();
  }
});

test("an Access instance keeps Access and turns the passkey and OAuth routes off", async () => {
  const worker = await startWorker({
    CALOCOUNT_ALLOW_LOCAL: "false",
    CALOCOUNT_OWNER_KEY: "owner",
    CALOCOUNT_ACCESS_TEAM_DOMAIN: "team.example.com",
    CALOCOUNT_ACCESS_AUDIENCE: "api-audience",
    CALOCOUNT_ALLOWED_EMAIL_SHA256: "a".repeat(64),
  }, { storage: true });
  try {
    assert.deepEqual((await worker.request({ path: "/api/auth/status" })).body, { mode: "access" });
    assert.equal((await worker.request({ path: "/api/auth/login/options", method: "POST", body: {}, headers: { origin: ORIGIN } })).status, 404);
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"]) {
      assert.equal((await worker.request({ path })).status, 404, path);
    }
    assert.equal((await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: [CHATGPT_REDIRECT] } })).status, 404);
    assert.equal((await worker.fetch("/oauth/authorize?client_id=x")).status, 404);
    // Access signs the owner in before the request arrives, so the owner page is the dashboard.
    assert.match(await (await worker.fetch("/owner")).text(), /Loading your saved log/);
    assert.equal((await worker.request({ path: "/api/dashboard/summary" })).body.error.code, "unauthorized");
  } finally {
    await worker.dispose();
  }
});
