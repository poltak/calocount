import type { Browser, Page } from "@playwright/test";

/**
 * The setup code of the Worker in `scripts/black-box-next.mjs`, which these
 * tests run against.
 */
const SETUP_CODE = "black-box-setup-code";
/** The heading of the sign-in page of an instance with no passkey. */
export const SET_UP_HEADING = "Set up Calocount";
const RESET_PATH = "/api/__black-box/reset";

/**
 * One page, for a whole test file, on the Worker that serves the built
 * frontend and the API. The Worker is emptied first, so the page starts as a
 * visitor of a new instance. `baseURL` is the origin of the Worker.
 */
export async function startVisit({
  browser,
  baseURL,
}: {
  browser: Browser;
  baseURL: string;
}) {
  const context = await browser.newContext({ baseURL, timezoneId: "UTC" });
  const reset = await context.request.post(`${baseURL}${RESET_PATH}`);
  if (!reset.ok()) {
    throw new Error(`The reset of the Worker failed: ${reset.status()}`);
  }
  const page = await context.newPage();
  // A virtual authenticator says yes to each passkey request, as a phone does.
  const session = await context.newCDPSession(page);
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
  /** Errors that no code caught. Normal use must not cause one. */
  const uncaughtErrors: Error[] = [];
  page.on("pageerror", (error) => uncaughtErrors.push(error));
  return {
    page,
    uncaughtErrors,
    end: () => context.close(),
  };
}

/**
 * Save the first passkey with the setup code on the sign-in page of a new
 * instance, which then opens the page that the visitor asked for.
 */
export async function setUp({ page }: { page: Page }) {
  const heading = page.getByRole("heading", { name: SET_UP_HEADING });
  await heading.waitFor();
  await page.getByLabel("Setup code").fill(SETUP_CODE);
  await page.getByRole("button", { name: "Create passkey" }).click();
  await heading.waitFor({ state: "hidden" });
}
