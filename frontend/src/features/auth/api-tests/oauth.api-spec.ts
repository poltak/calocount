import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import { McpClient } from "../../core/api-tests/mcp-client.js";
import {
  authorizeWithOAuth,
  exchangeOAuthCode,
} from "../../core/api-tests/oauth-client.js";

test.describe("OAuth clients", () => {
  test("should discover both documents and refuse an invalid redirect", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const resource = await anonymousRequest.get(
      `${apiOrigin}/.well-known/oauth-protected-resource/mcp`,
    );
    expect(resource.status()).toBe(200);
    expect(resource.headers()["content-type"]).toContain("application/json");
    expect(await resource.json()).toMatchObject({
      resource: `${apiOrigin}/mcp`,
      authorization_servers: [apiOrigin],
    });
    const server = await anonymousRequest.get(
      `${apiOrigin}/.well-known/oauth-authorization-server`,
    );
    expect(server.status()).toBe(200);
    expect(await server.json()).toMatchObject({
      issuer: apiOrigin,
      token_endpoint: `${apiOrigin}/oauth/token`,
      code_challenge_methods_supported: ["S256"],
    });
    const invalid = await anonymousRequest.post(`${apiOrigin}/oauth/register`, {
      data: {
        client_name: "Invalid app",
        redirect_uris: ["javascript:alert(1)"],
      },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: "invalid_redirect_uri",
    });
  });
  test("should return access_denied when the owner denies consent", async ({
    anonymousRequest,
    ownerPage,
    apiOrigin,
  }) => {
    const authorization = await authorizeWithOAuth({
      request: anonymousRequest,
      page: ownerPage,
      origin: apiOrigin,
      clientName: "Denied app",
      approve: async () => {
        await ownerPage
          .getByRole("button", { name: "Deny", exact: true })
          .click();
      },
    });
    expect(authorization.callback.searchParams.get("error")).toBe(
      "access_denied",
    );
    expect(authorization.callback.searchParams.get("code")).toBeNull();
  });
  test("should refuse a wrong verifier and a used code and accept a refresh token", async ({
    anonymousRequest,
    ownerPage,
    apiOrigin,
  }) => {
    const options = {
      request: anonymousRequest,
      page: ownerPage,
      origin: apiOrigin,
      clientName: "Refresh app",
      approve: async () => {
        await ownerPage
          .getByRole("button", { name: "Allow", exact: true })
          .click();
      },
    };
    const wrong = await authorizeWithOAuth(options);
    const refused = await exchangeOAuthCode({
      request: anonymousRequest,
      authorization: wrong,
      verifier: "a".repeat(43),
    });
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({ error: "invalid_grant" });
    const authorization = await authorizeWithOAuth(options);
    const response = await exchangeOAuthCode({
      request: anonymousRequest,
      authorization,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const tokens = await response.json();
    expect(tokens).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: "Bearer",
    });
    const reused = await exchangeOAuthCode({
      request: anonymousRequest,
      authorization,
    });
    expect(reused.status()).toBe(400);
    expect(await reused.json()).toMatchObject({ error: "invalid_grant" });
    const refresh = await anonymousRequest.post(`${apiOrigin}/oauth/token`, {
      form: {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: authorization.clientId,
      },
    });
    expect(refresh.status()).toBe(200);
    const renewed = await refresh.json();
    expect(renewed.access_token).not.toBe(tokens.access_token);
    const client = new McpClient({
      request: anonymousRequest,
      origin: apiOrigin,
      accessToken: renewed.access_token,
    });
    await client.initialize();
    expect((await client.send("tools/list")).status()).toBe(200);
  });
  test("should challenge an invalid token and revoke a disconnected app", async ({
    agent,
    ownerPage,
    anonymousRequest,
    apiOrigin,
  }) => {
    const client = new McpClient({
      request: anonymousRequest,
      origin: apiOrigin,
      accessToken: "invalid-token",
    });
    const response = await client.send("tools/list");
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain(
      'error="invalid_token"',
    );
    await ownerPage.goto("/");
    await ownerPage.getByRole("button", { name: "Open settings" }).click();
    await expect(
      ownerPage.getByRole("heading", { name: "Connected apps", exact: true }),
    ).toBeVisible();
    ownerPage.once("dialog", (dialog) => void dialog.accept());
    await ownerPage
      .getByRole("button", { name: "Disconnect Black-box agent", exact: true })
      .click();
    await ownerPage
      .getByRole("button", { name: "Disconnect Black-box agent", exact: true })
      .waitFor({ state: "hidden" });
    expect((await agent.send("tools/list")).status()).toBe(401);
  });
});
