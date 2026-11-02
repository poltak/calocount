import type { Browser, Page } from "@playwright/test";
import {
  createDatabaseTemplate,
  startTestBackendServer,
} from "backend/testing";
import { TEST_OWNER_CREDENTIALS } from "../test-owner.js";
import { BACKEND_PORT, FRONTEND_ORIGIN } from "./origins.js";

/** The headers that let the page read an answer that a test writes for the API. */
export const CROSS_ORIGIN_HEADERS = {
  "access-control-allow-origin": FRONTEND_ORIGIN,
  "access-control-allow-credentials": "true",
};

/** One backend with one database serves one page for a whole test file. */
export async function startVisit({ browser }: { browser: Browser }) {
  const server = await startTestBackendServer({
    template: await createDatabaseTemplate(TEST_OWNER_CREDENTIALS),
    port: BACKEND_PORT,
    trustedOrigins: [FRONTEND_ORIGIN],
  });
  const page = await browser.newPage({ baseURL: FRONTEND_ORIGIN });
  /** Errors that no code caught. Normal use must not cause one. */
  const uncaughtErrors: Error[] = [];
  page.on("pageerror", (error) => uncaughtErrors.push(error));
  return {
    page,
    uncaughtErrors,
    end: async () => {
      await page.close();
      await server.close();
    },
  };
}

export async function signIn({ page }: { page: Page }) {
  await page.getByLabel("Email").fill(TEST_OWNER_CREDENTIALS.email);
  await page.getByLabel("Password").fill(TEST_OWNER_CREDENTIALS.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
