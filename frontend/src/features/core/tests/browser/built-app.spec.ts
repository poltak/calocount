import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { expect, test, type Page } from "@playwright/test";
import { TEST_OWNER_CREDENTIALS } from "../test-owner.js";
import { CROSS_ORIGIN_HEADERS, signIn, startVisit } from "./built-app-visit.js";

// These tests are one visit to the built app, in one page. Each test starts
// where the test before it ended, and a failure skips the tests after it.
test.describe.configure({ mode: "serial" });

// An address with no route, so these tests need no page of a feature, and a
// project with other pages keeps this file as it is.
const MISSING_PAGE = "/a-page-that-no-route-has";

let visit: Awaited<ReturnType<typeof startVisit>>;
let page: Page;

test.beforeAll(async ({ browser }) => {
  visit = await startVisit({ browser });
  ({ page } = visit);
});

test.afterAll(() => visit.end());

test("should send a visitor without a session to the sign-in page", async () => {
  // A static host must also answer a path that is not a file with the app.
  await page.goto(MISSING_PAGE);

  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle(APP_NAME);
  await expect(
    page.getByRole("heading", { name: `Sign in to ${APP_NAME}` }),
  ).toBeVisible();
});

test("should sign the owner in, and return to the page that the visitor asked for", async () => {
  await signIn({ page });

  await expect(page).toHaveURL(new RegExp(`${MISSING_PAGE}$`));
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(
    page.getByText(TEST_OWNER_CREDENTIALS.name, { exact: true }),
  ).toBeVisible();
});

test("should keep the session across a reload", async () => {
  // After a reload, the page has only what the browser and the backend kept.
  // The API is on another origin, so this also shows that the browser stored
  // the session cookie from that origin and sends it again.
  await page.reload();

  await expect(page).toHaveURL(new RegExp(`${MISSING_PAGE}$`));
  await expect(
    page.getByText(TEST_OWNER_CREDENTIALS.name, { exact: true }),
  ).toBeVisible();
});

test("should open another page from a link without a page load", async () => {
  let pageLoads = 0;
  page.on("load", () => (pageLoads += 1));

  await page.getByRole("link", { name: APP_NAME, exact: true }).click();

  await expect(page).not.toHaveURL(new RegExp(`${MISSING_PAGE}$`));
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeHidden();
  expect(pageLoads).toEqual(0);
  expect(visit.uncaughtErrors).toEqual([]);
});

test("should show a fallback in place of the app when the header fails to render", async () => {
  // A user name that is not text makes the header throw, outside every page.
  await page.route("**/api/me", (route) =>
    route.fulfill({
      headers: CROSS_ORIGIN_HEADERS,
      json: {
        user: {
          id: "broken",
          email: TEST_OWNER_CREDENTIALS.email,
          name: { not: "text" },
        },
      },
    }),
  );

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  await page.unroute("**/api/me");
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();
  await expect(
    page.getByText(TEST_OWNER_CREDENTIALS.name, { exact: true }),
  ).toBeVisible();
});

test("should sign the owner out, and ask for sign-in again", async () => {
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);

  await page.goto(MISSING_PAGE);

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
