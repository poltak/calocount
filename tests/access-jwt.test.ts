import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AccessJwtError,
  accessIdentityFromClaims,
  isOwnerAllowlistConfigured,
  isOwnerIdentityAllowed,
  localApiIdentity,
  verifyAccessJwt,
} from "../app/api/_lib/access-jwt";

const textEncoder = new TextEncoder();
const teamDomain = "team.cloudflareaccess.com";
const audience = "calocount-audience";
const nowSeconds = 1_750_000_000;

async function sha256Hex(value: string): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(value: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function jsonSegment(value: unknown): string {
  return base64Url(JSON.stringify(value));
}

async function signingKeys() {
  return webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2_048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function accessToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown> = {},
  keyId = "test-key",
): Promise<string> {
  const encodedHeader = jsonSegment({ alg: "RS256", kid: keyId, typ: "JWT" });
  const encodedPayload = jsonSegment({
    iss: `https://${teamDomain}`,
    aud: [audience],
    sub: "user-123",
    email: "owner@example.com",
    exp: nowSeconds + 300,
    ...claims,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await webcrypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    textEncoder.encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

function request(token: string, extraHeaders: Record<string, string> = {}): Request {
  return new Request("https://calocount.example.test/api/meals", {
    headers: { "Cf-Access-Jwt-Assertion": token, ...extraHeaders },
  });
}

async function verifier(publicKey: CryptoKey, keyId = "test-key") {
  const jwk = await webcrypto.subtle.exportKey("jwk", publicKey);
  return async (input: RequestInfo | URL) => {
    assert.equal(String(input), `https://${teamDomain}/cdn-cgi/access/certs`);
    return Response.json({ keys: [{ ...jwk, kid: keyId, alg: "RS256", use: "sig" }] });
  };
}

function verifyOptions(fetcher: typeof fetch, overrides: Record<string, unknown> = {}) {
  return {
    teamDomain,
    audience,
    nowSeconds,
    fetcher,
    ...overrides,
  };
}

test("valid Cloudflare Access JWT verifies and exposes the token identity", async () => {
  const keys = await signingKeys();
  const token = await accessToken(keys.privateKey);
  const claims = await verifyAccessJwt(request(token), verifyOptions(await verifier(keys.publicKey)));

  assert.deepEqual(accessIdentityFromClaims(claims), {
    userId: "user-123",
    email: "owner@example.com",
  });
});

test("a forged signature is rejected even when the kid is valid", async () => {
  const trusted = await signingKeys();
  const forged = await signingKeys();
  const token = await accessToken(forged.privateKey);

  await assert.rejects(
    verifyAccessJwt(request(token), verifyOptions(await verifier(trusted.publicKey))),
    (error: unknown) => error instanceof AccessJwtError && error.code === "token",
  );
});

test("wrong issuer and audience are rejected", async (t) => {
  const keys = await signingKeys();
  const fetcher = await verifier(keys.publicKey);

  await t.test("wrong issuer", async () => {
    const token = await accessToken(keys.privateKey, { iss: "https://other.cloudflareaccess.com" });
    await assert.rejects(
      verifyAccessJwt(request(token), verifyOptions(fetcher)),
      (error: unknown) => error instanceof AccessJwtError && error.code === "token",
    );
  });

  await t.test("wrong audience", async () => {
    const token = await accessToken(keys.privateKey, { aud: ["other-audience"] });
    await assert.rejects(
      verifyAccessJwt(request(token), verifyOptions(fetcher)),
      (error: unknown) => error instanceof AccessJwtError && error.code === "token",
    );
  });
});

test("expired and not-yet-valid tokens are rejected", async (t) => {
  const keys = await signingKeys();
  const fetcher = await verifier(keys.publicKey);

  await t.test("expired", async () => {
    const token = await accessToken(keys.privateKey, { exp: nowSeconds - 61 });
    await assert.rejects(
      verifyAccessJwt(request(token), verifyOptions(fetcher)),
      (error: unknown) => error instanceof AccessJwtError && error.code === "token",
    );
  });

  await t.test("not before", async () => {
    const token = await accessToken(keys.privateKey, { nbf: nowSeconds + 61 });
    await assert.rejects(
      verifyAccessJwt(request(token), verifyOptions(fetcher)),
      (error: unknown) => error instanceof AccessJwtError && error.code === "token",
    );
  });
});

test("missing Access configuration fails before any key fetch", async () => {
  const keys = await signingKeys();
  const token = await accessToken(keys.privateKey);
  let fetchCalls = 0;
  await assert.rejects(
    verifyAccessJwt(request(token), {
      audience,
      fetcher: async () => {
        fetchCalls += 1;
        return Response.json({ keys: [] });
      },
    }),
    (error: unknown) =>
      error instanceof AccessJwtError && error.code === "config" && error.reason === "config_missing",
  );
  assert.equal(fetchCalls, 0);
});

test("invalid Access configuration reports a stable reason", async () => {
  const keys = await signingKeys();
  const token = await accessToken(keys.privateKey);

  await assert.rejects(
    verifyAccessJwt(request(token), verifyOptions(await verifier(keys.publicKey), { teamDomain: "https://invalid/path" })),
    (error: unknown) =>
      error instanceof AccessJwtError && error.code === "config" && error.reason === "config_invalid",
  );
});

test("production owner allowlist requires an email or user ID", () => {
  assert.equal(isOwnerAllowlistConfigured({ allowedEmail: "", allowedUserId: " " }), false);
  assert.equal(isOwnerAllowlistConfigured({ allowedEmail: "owner@example.com" }), true);
  assert.equal(isOwnerAllowlistConfigured({ allowedEmailSha256: "a".repeat(64) }), true);
  assert.equal(isOwnerAllowlistConfigured({ allowedUserId: "user-123" }), true);
});

test("local mode does not allow anonymous access when only an email hash allowlist is configured", async () => {
  const source = await readFile(new URL("../app/api/_lib/http.ts", import.meta.url), "utf8");

  assert.match(source, /const allowLocal = getEnvValue\("CALOCOUNT_ALLOW_LOCAL"\) === "true";/);
  assert.match(
    source,
    /if \(!email && !userId && !allowedEmail && !allowedEmailSha256 && !allowedUserId\) \{\s*return localApiIdentity/u,
  );
});

test("owner email allowlist matching is case-insensitive and rejects wrong or missing email", async () => {
  const allowlist = { allowedEmail: "Owner@Example.com" };

  assert.equal(
    await isOwnerIdentityAllowed({ identity: { email: "owner@example.com", userId: null }, ...allowlist }),
    true,
  );
  assert.equal(
    await isOwnerIdentityAllowed({ identity: { email: "other@example.com", userId: null }, ...allowlist }),
    false,
  );
  assert.equal(await isOwnerIdentityAllowed({ identity: { email: null, userId: "user-123" }, ...allowlist }), false);
});

test("owner email hash allowlist normalizes the verified email", async () => {
  const allowedEmailSha256 = await sha256Hex("owner@example.com");

  assert.equal(
    await isOwnerIdentityAllowed({
      identity: { email: "  OWNER@EXAMPLE.COM ", userId: null },
      allowedEmailSha256,
    }),
    true,
  );
});

test("owner email hash allowlist rejects a wrong email or hash", async () => {
  const allowedEmailSha256 = await sha256Hex("owner@example.com");
  const wrongEmailSha256 = await sha256Hex("other@example.com");

  assert.equal(
    await isOwnerIdentityAllowed({
      identity: { email: "other@example.com", userId: null },
      allowedEmailSha256,
    }),
    false,
  );
  assert.equal(
    await isOwnerIdentityAllowed({
      identity: { email: "owner@example.com", userId: null },
      allowedEmailSha256: wrongEmailSha256,
    }),
    false,
  );
});

test("malformed owner email hashes fail closed", async () => {
  for (const allowedEmailSha256 of ["not-a-hash", "a".repeat(63), "g".repeat(64)]) {
    assert.equal(
      await isOwnerIdentityAllowed({
        identity: { email: "owner@example.com", userId: null },
        allowedEmailSha256,
      }),
      false,
    );
  }
});

test("owner email, email hash, and user ID allowlists all must match", async () => {
  const allowlist = {
    allowedEmail: "owner@example.com",
    allowedEmailSha256: await sha256Hex("owner@example.com"),
    allowedUserId: "user-123",
  };

  assert.equal(
    await isOwnerIdentityAllowed({ identity: { email: "OWNER@example.com", userId: "user-123" }, ...allowlist }),
    true,
  );
  assert.equal(
    await isOwnerIdentityAllowed({ identity: { email: "owner@example.com", userId: "user-123" }, ...allowlist, allowedEmailSha256: "a".repeat(64) }),
    false,
  );
  assert.equal(
    await isOwnerIdentityAllowed({ identity: { email: "owner@example.com", userId: "user-456" }, ...allowlist }),
    false,
  );
});

test("owner user ID allowlist accepts a matching ID and rejects wrong or missing IDs", async () => {
  const allowlist = { allowedUserId: "user-123" };

  assert.equal(await isOwnerIdentityAllowed({ identity: { email: null, userId: "user-123" }, ...allowlist }), true);
  assert.equal(await isOwnerIdentityAllowed({ identity: { email: null, userId: "user-456" }, ...allowlist }), false);
  assert.equal(await isOwnerIdentityAllowed({ identity: { email: "owner@example.com", userId: null }, ...allowlist }), false);
});

test("legacy identity headers cannot replace the Access JWT", async () => {
  const keys = await signingKeys();
  await assert.rejects(
    verifyAccessJwt(
      new Request("https://calocount.example.test/api/meals", {
        headers: {
          "cf-access-authenticated-user-email": "owner@example.com",
          "cf-access-authenticated-user-id": "user-123",
          "oai-authenticated-user-email": "owner@example.com",
        },
      }),
      verifyOptions(await verifier(keys.publicKey)),
    ),
    (error: unknown) => error instanceof AccessJwtError && error.code === "token",
  );
});

test("local development may keep its header identity without a JWT", () => {
  assert.deepEqual(localApiIdentity({ ownerKey: "local-owner" }), {
    ownerKey: "local-owner",
    userId: null,
    email: null,
  });
  assert.deepEqual(localApiIdentity({ userId: "local-user", email: "local@example.com" }), {
    ownerKey: "local-user",
    userId: "local-user",
    email: "local@example.com",
  });
});

test("oversized JWT and oversized JWK responses are rejected", async (t) => {
  const keys = await signingKeys();
  const token = await accessToken(keys.privateKey);

  await t.test("oversized JWT", async () => {
    await assert.rejects(
      verifyAccessJwt(request(`${token}${"x".repeat(32_768)}`), verifyOptions(await verifier(keys.publicKey))),
      (error: unknown) => error instanceof AccessJwtError && error.code === "token",
    );
  });

  await t.test("oversized JWK response", async () => {
    const jwk = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
    await assert.rejects(
      verifyAccessJwt(request(token), verifyOptions(async () => new Response(`{"keys":[${JSON.stringify({ ...jwk, kid: "test-key", alg: "RS256" })}]}${" ".repeat(131_072)}`))),
      (error: unknown) =>
        error instanceof AccessJwtError && error.code === "jwks" && error.reason === "jwks_too_large",
    );
  });
});

test("JWKS failures use stable, non-sensitive reason codes", async (t) => {
  const keys = await signingKeys();
  const token = await accessToken(keys.privateKey);

  await t.test("fetch failure", async () => {
    await assert.rejects(
      verifyAccessJwt(
        request(token),
        verifyOptions(async () => {
          throw new Error("private fetch details");
        }),
      ),
      (error: unknown) =>
        error instanceof AccessJwtError && error.code === "jwks" && error.reason === "jwks_fetch_failed",
    );
  });

  await t.test("HTTP failure", async () => {
    await assert.rejects(
      verifyAccessJwt(request(token), verifyOptions(async () => new Response("private response", { status: 503 }))),
      (error: unknown) =>
        error instanceof AccessJwtError && error.code === "jwks" && error.reason === "jwks_http_error",
    );
  });

  await t.test("invalid JSON or shape", async () => {
    await assert.rejects(
      verifyAccessJwt(request(token), verifyOptions(async () => new Response("{"))),
      (error: unknown) =>
        error instanceof AccessJwtError &&
        error.code === "jwks" &&
        error.reason === "jwks_invalid_json_or_shape",
    );
  });
});

test("Access JWT diagnostics contain only the stable event, code, and reason", async () => {
  const source = await readFile(new URL("../app/api/_lib/http.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /const code = error instanceof AccessJwtError \? error\.code : "unexpected";/,
  );
  assert.match(
    source,
    /const reason = error instanceof AccessJwtError \? error\.reason : "unexpected";/,
  );
  assert.match(
    source,
    /console\.warn\(JSON\.stringify\(\{ event: ACCESS_JWT_FAILURE_EVENT, code, reason \}\)\);/,
  );
  assert.match(source, /logAccessConfigurationFailure\("access_settings_missing"\)/);
  assert.match(source, /logAccessConfigurationFailure\("owner_allowlist_missing"\)/);
  assert.match(
    source,
    /throw new ApiError\(503, "auth_access_settings_missing", "Owner authentication is not configured\."\)/,
  );
  assert.match(
    source,
    /throw new ApiError\(503, "auth_owner_allowlist_missing", "Owner authentication is not configured\."\)/,
  );
  assert.match(
    source,
    /if \(error instanceof AccessJwtError && error\.code === "config"\) \{[\s\S]*?throw new ApiError\(503, "auth_unavailable"/,
  );
  assert.match(
    source,
    /if \(error instanceof AccessJwtError && error\.code === "jwks"\) \{[\s\S]*?throw new ApiError\(503, "auth_unavailable"/,
  );
  assert.doesNotMatch(source, /logAccessConfigurationFailure\(\)/);
  assert.doesNotMatch(
    source,
    /console\.warn\(JSON\.stringify\(\{[^}]*\b(?:request|token|headers|claims|email|userId|url|status|message)\b/iu,
  );

  const verifierSource = await readFile(new URL("../app/api/_lib/access-jwt.ts", import.meta.url), "utf8");
  assert.doesNotMatch(verifierSource, /fail\(\s*["'][^"']+["']\s*\)/u);
});
