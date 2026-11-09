/* oxlint-disable no-empty-pattern -- Playwright reads the fixtures that a fixture needs from its first parameter, so a fixture that needs none has an empty pattern. */

// The Playwright documentation names the second parameter of a fixture `use`.
// Here it is `provide`, because lint takes `use` for the React hook.

import {
  expect,
  test as base,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { PasskeySignInPageObject } from "../../auth/black-box-tests/passkey-sign-in-page-object.js";

/**
 * The setup code of the passkey Worker in `legacy/scripts/black-box-serve.mjs`
 * and of the Worker in `scripts/black-box-next.mjs`.
 */
const SETUP_CODE = "black-box-setup-code";
const RESET_PATH = "/api/__black-box/reset";
const RESET_ATTEMPTS = 60;

interface BlackBoxOptions {
  /**
   * Sign the owner in before the test starts. Defaults to true. A test with
   * `false` starts on an instance where passkey sign-in protects the owner
   * pages, and no passkey exists yet. On the old app, a signed-in test uses
   * the Worker with sign-in off. On the new app, the fixture saves the
   * owner's passkey through the sign-in page with the setup code, and gives
   * the test that page.
   */
  authenticated: boolean;
  /**
   * Give the browser of `page` a passkey device, as a phone or a laptop has.
   * It says yes to each passkey request. Defaults to false.
   */
  passkeyDevice: boolean;
}

interface BlackBoxFixtures {
  /** The code that saves the first passkey of a new instance. */
  setupCode: string;
  /** A page in a second browser, with no session: a visitor of the app. */
  visitorPage: Page;
  /**
   * A page in a second browser with a passkey device of its own and no
   * session: the owner's other phone or laptop.
   */
  otherDevicePage: Page;
}

type Target = "legacy" | "next";

function targetOf(testInfo: Pick<TestInfo, "config">): Target {
  return testInfo.config.metadata["blackBoxTarget"] === "next"
    ? "next"
    : "legacy";
}

function legacyOrigin(input: {
  testInfo: Pick<TestInfo, "config">;
  authenticated: boolean;
}): string {
  const { metadata } = input.testInfo.config;
  return String(
    input.authenticated
      ? metadata["legacyOwnerOrigin"]
      : metadata["legacyPasskeyOrigin"],
  );
}

/**
 * Each Worker has one database for a whole run, so each test starts with an
 * empty one. The reset route exists only on the black-box Workers.
 */
async function resetApp(input: {
  browser: Browser;
  origin: string;
}): Promise<void> {
  const context = await input.browser.newContext();
  try {
    // A Worker that stopped starts again in a few seconds, so a refused
    // connection is tried again.
    for (let attempt = 1; ; attempt += 1) {
      try {
        const reset = await context.request.post(
          `${input.origin}${RESET_PATH}`,
        );
        if (!reset.ok()) {
          throw new Error(`The reset of the app failed: ${reset.status()}`);
        }
        break;
      } catch (error) {
        if (attempt >= RESET_ATTEMPTS || !isRefused(error)) {
          throw error;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
      }
    }
  } finally {
    await context.close();
  }
}

function isRefused(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ECONNREFUSED");
}

/** A Chromium virtual authenticator that answers as a phone does. */
async function addPasskeyDevice(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("WebAuthn.enable");
  await session.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/**
 * The new app has one Worker with passkey sign-in, so a signed-in test starts
 * as a real owner does: it saves the first passkey with the setup code on the
 * sign-in page. This fixture is exempt from the black-box lint rules.
 */
async function signInAsOwner(page: Page): Promise<void> {
  const signIn = new PasskeySignInPageObject(page);
  await signIn.goto();
  await signIn.setUp(SETUP_CODE);
}

/**
 * The `test` function of every black box test. Each test gets an emptied
 * database, and a page: signed in as the owner, or with no session. Set the
 * options with `test.use()`.
 */
export const test = base.extend<BlackBoxOptions & BlackBoxFixtures>({
  authenticated: [true, { option: true }],
  passkeyDevice: [false, { option: true }],
  baseURL: async ({ baseURL, authenticated }, provide, testInfo) => {
    await provide(
      targetOf(testInfo) === "legacy"
        ? legacyOrigin({ testInfo, authenticated })
        : baseURL,
    );
  },
  setupCode: async ({}, provide) => {
    await provide(SETUP_CODE);
  },
  page: async (
    { page, browser, baseURL, authenticated, passkeyDevice },
    provide,
    testInfo,
  ) => {
    const signsInWithPasskey = targetOf(testInfo) === "next" && authenticated;
    if (passkeyDevice || signsInWithPasskey) {
      await addPasskeyDevice(page);
    }
    await resetApp({ browser, origin: baseURL ?? "" });
    const uncaughtErrors: Error[] = [];
    page.on("pageerror", (error) => uncaughtErrors.push(error));
    if (signsInWithPasskey) {
      await signInAsOwner(page);
    }

    await provide(page);

    // The old app's dev server can stop when the browser drops an open
    // request, so the test ends after the page's requests end.
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(
      uncaughtErrors,
      "Normal use must not cause an error that no code caught",
    ).toEqual([]);
  },
  otherDevicePage: async ({ browser, baseURL, page }, provide) => {
    // `page` first, so that the other device sees the same backend.
    void page;
    const context = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      timezoneId: "UTC",
    });
    const device = await context.newPage();
    await addPasskeyDevice(device);
    await provide(device);
    await device.waitForLoadState("networkidle").catch(() => {});
    await context.close();
  },
  visitorPage: async ({ browser, baseURL, page }, provide) => {
    // `page` first, so that the visitor sees the same backend.
    void page;
    const context = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      timezoneId: "UTC",
    });
    const visitor = await context.newPage();
    await provide(visitor);
    await context.close();
  },
});
