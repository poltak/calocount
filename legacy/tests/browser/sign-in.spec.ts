import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

// WebAuthn needs a domain name, so these pages open on localhost instead of 127.0.0.1.
const SIGN_IN_URL = "http://localhost:4178/sign-in.html";

type AuthRequest = { method: string; path: string; body: Record<string, unknown> | null };

/** A Chromium virtual authenticator that answers like a phone: resident keys and user verification. */
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return {
    credentials: async () => (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials,
  };
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function registrationOptions() {
  return {
    challenge: base64Url(crypto.getRandomValues(new Uint8Array(32))),
    rp: { name: "Calocount", id: "localhost" },
    user: { id: base64Url(crypto.getRandomValues(new Uint8Array(32))), name: "Calocount", displayName: "Calocount owner" },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    timeout: 60_000,
    attestation: "none",
    excludeCredentials: [],
    authenticatorSelection: { residentKey: "required", userVerification: "required", requireResidentKey: true },
  };
}

/** Mock the auth routes of the Worker. The mock checks nothing and records what the page sends. */
async function mockAuthApi(page: Page, { status, registerError = null, setupCode = "correct horse battery staple" }: {
  status: Record<string, unknown>;
  registerError?: { status: number; code: string } | null;
  setupCode?: string;
}) {
  const requests: AuthRequest[] = [];
  await page.route("**/api/auth/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.method() === "POST" ? request.postDataJSON() as Record<string, unknown> : null;
    requests.push({ method: request.method(), path, body });
    if (path === "/api/auth/status") return route.fulfill({ json: status });
    if (path === "/api/auth/register/options") {
      if (registerError) return route.fulfill({ status: registerError.status, json: { error: { code: registerError.code, message: "x" } } });
      if (body?.setupCode !== setupCode) return route.fulfill({ status: 403, json: { error: { code: "invalid_setup_code", message: "x" } } });
      return route.fulfill({ json: { options: registrationOptions(), challengeId: "registration-challenge-id-0001" } });
    }
    if (path === "/api/auth/register/verify") return route.fulfill({ status: 201, json: { passkey: { id: "x", name: "Mac" } } });
    if (path === "/api/auth/login/options") {
      return route.fulfill({
        json: {
          options: { challenge: base64Url(crypto.getRandomValues(new Uint8Array(32))), rpId: "localhost", allowCredentials: [], userVerification: "required", timeout: 60_000 },
          challengeId: "authentication-challenge-id-0001",
        },
      });
    }
    if (path === "/api/auth/login/verify") return route.fulfill({ json: { signedIn: true } });
    return route.fulfill({ status: 404, json: {} });
  });
  return requests;
}

test("a new instance saves its first passkey with the setup code, then opens the return page", async ({ page }) => {
  await mockDashboardApi(page);
  const authenticator = await addVirtualAuthenticator(page);
  const requests = await mockAuthApi(page, { status: { mode: "passkey", signedIn: false, hasPasskeys: false, setupCode: "ready" } });
  await page.goto(`${SIGN_IN_URL}?returnTo=/`);
  await expect(page.getByRole("heading", { name: "Set up Calocount" })).toBeVisible();

  await page.getByLabel("Setup code").fill("wrong code here");
  await page.getByRole("button", { name: "Create passkey" }).click();
  await expect(page.getByRole("alert")).toHaveText("This setup code is not correct.");

  await page.getByLabel("Setup code").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create passkey" }).click();
  await page.waitForURL("http://localhost:4178/");
  const verify = requests.find((request) => request.path === "/api/auth/register/verify");
  expect(verify?.body?.challengeId).toBe("registration-challenge-id-0001");
  const response = verify?.body?.response as { id: string; type: string; response: { attestationObject: string; clientDataJSON: string } };
  expect(response.type).toBe("public-key");
  expect(response.response.attestationObject.length).toBeGreaterThan(100);
  expect(JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString()).origin).toBe("http://localhost:4178");
  // The virtual phone keeps a resident passkey for the site.
  const [credential] = await authenticator.credentials();
  expect(credential.rpId).toBe("localhost");
  expect(credential.isResidentCredential).toBe(true);
});

test("an owner with a passkey signs in with it, and a lost passkey leads to the setup code", async ({ page }) => {
  await mockDashboardApi(page);
  await addVirtualAuthenticator(page);
  // Save a passkey first, so the authenticator has one for the sign-in.
  const requests = await mockAuthApi(page, { status: { mode: "passkey", signedIn: false, hasPasskeys: false, setupCode: "ready" } });
  await page.goto(`${SIGN_IN_URL}?returnTo=/`);
  await page.getByLabel("Setup code").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create passkey" }).click();
  await page.waitForURL("http://localhost:4178/");

  await page.unroute("**/api/auth/**");
  const signInRequests = await mockAuthApi(page, { status: { mode: "passkey", signedIn: false, hasPasskeys: true, setupCode: "ready" } });
  await page.goto(`${SIGN_IN_URL}?returnTo=/&notice=${encodeURIComponent("ChatGPT wants to connect to your Calocount. Sign in first.")}`);
  await expect(page.getByRole("heading", { name: "Sign in to Calocount" })).toBeVisible();
  await expect(page.getByText("ChatGPT wants to connect to your Calocount. Sign in first.")).toBeVisible();

  await page.getByRole("button", { name: "Lost your passkey? Use your setup code" }).click();
  await expect(page.getByRole("heading", { name: "Add a passkey" })).toBeVisible();
  await page.getByRole("button", { name: "Back to sign-in" }).click();

  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await page.waitForURL("http://localhost:4178/");
  const verify = signInRequests.find((request) => request.path === "/api/auth/login/verify");
  const response = verify?.body?.response as { response: { authenticatorData: string; signature: string } };
  expect(response.response.signature.length).toBeGreaterThan(40);
  expect(requests.some((request) => request.path === "/api/auth/register/verify")).toBe(true);
});

test("the sign-in page explains a missing setup code, a browser without passkeys, and a signed-in browser", async ({ page }) => {
  await mockDashboardApi(page);
  await mockAuthApi(page, { status: { mode: "passkey", signedIn: false, hasPasskeys: false, setupCode: "missing" } });
  await page.goto(`${SIGN_IN_URL}?returnTo=/`);
  await expect(page.getByRole("alert")).toContainText("Add the secret CALOCOUNT_SETUP_CODE to the Worker");
  await expect(page.getByLabel("Setup code")).toHaveCount(0);

  await page.unroute("**/api/auth/**");
  await mockAuthApi(page, { status: { mode: "passkey", signedIn: true, hasPasskeys: true, setupCode: "ready" } });
  await page.goto(`${SIGN_IN_URL}?returnTo=/`);
  await page.waitForURL("http://localhost:4178/");

  await page.addInitScript(() => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  });
  await page.goto(`${SIGN_IN_URL}?returnTo=/`);
  await expect(page.getByRole("heading", { name: "This browser cannot use passkeys" })).toBeVisible();
});

test("a return address on another site is ignored", async ({ page }) => {
  await mockDashboardApi(page);
  await mockAuthApi(page, { status: { mode: "passkey", signedIn: true, hasPasskeys: true, setupCode: "ready" } });
  // Browsers remove tabs from addresses, and some read a backslash as a slash.
  for (const returnTo of ["//evil.example/", "/\\evil.example/", "/\t/evil.example/", "https://evil.example/"]) {
    await page.goto(`${SIGN_IN_URL}?returnTo=${encodeURIComponent(returnTo)}`);
    await page.waitForURL("http://localhost:4178/owner");
  }
});
