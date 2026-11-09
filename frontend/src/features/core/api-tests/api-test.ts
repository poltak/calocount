// The Playwright documentation names the second parameter of a fixture `use`.
// Here it is `provide`, because lint takes `use` for the React hook.

import type { APIRequestContext, Page } from "@playwright/test";
import { PasskeySignInPageObject } from "../../auth/black-box-tests/passkey-sign-in-page-object.js";
import { test as blackBoxTest } from "../black-box-tests/black-box-test.js";
import { McpClient } from "./mcp-client.js";
import { connectWithOAuth } from "./oauth-client.js";

interface ApiFixtures {
  /** The origin of the API. On both targets one Worker serves the page and the API. */
  apiOrigin: string;
  /** `page`, signed in as the owner through the passkey setup. */
  ownerPage: Page;
  /** Requests with the owner's session, from the owner's site. */
  ownerRequest: APIRequestContext;
  /** Requests with no session, as any client on the internet sends. */
  anonymousRequest: APIRequestContext;
  /** An MCP client that the owner connected with OAuth, as ChatGPT is. */
  agent: McpClient;
}

/**
 * The `test` function of every API black-box test. It is the black-box
 * fixture on an instance with passkey sign-in and no passkey yet, so that
 * each test starts with an empty backend and signs in as a real owner does.
 */
export const test = blackBoxTest.extend<ApiFixtures>({
  authenticated: false,
  passkeyDevice: true,
  apiOrigin: async ({ baseURL }, provide) => {
    await provide(baseURL ?? "");
  },
  ownerPage: async ({ page, setupCode }, provide) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    await provide(page);
  },
  ownerRequest: async ({ ownerPage, playwright, baseURL }, provide) => {
    const storageState = await ownerPage.context().storageState();
    const request = await playwright.request.newContext({
      storageState,
      // The old Worker refuses a write from another site.
      ...(baseURL === undefined
        ? {}
        : { extraHTTPHeaders: { origin: baseURL } }),
    });
    await provide(request);
    await request.dispose();
  },
  anonymousRequest: async ({ playwright }, provide) => {
    const request = await playwright.request.newContext();
    await provide(request);
    await request.dispose();
  },
  agent: async ({ ownerPage, anonymousRequest, apiOrigin }, provide) => {
    const accessToken = await connectWithOAuth({
      request: anonymousRequest,
      page: ownerPage,
      origin: apiOrigin,
      clientName: "Black-box agent",
      approve: async () => {
        await ownerPage.getByRole("button", { name: "Allow" }).click();
      },
    });
    const agent = new McpClient({
      request: anonymousRequest,
      origin: apiOrigin,
      accessToken,
    });
    await agent.initialize();
    await provide(agent);
  },
});
