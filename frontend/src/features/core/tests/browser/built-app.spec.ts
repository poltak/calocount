import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { expect, test, type Page } from "@playwright/test";
import { TEST_OWNER_CREDENTIALS } from "../test-owner.js";
import { FRONTEND_ORIGIN } from "./origins.js";

// These tests are one visit to the built app, in one page. Each test starts
// where the test before it ended, and a failure skips the tests after it.
test.describe.configure({ mode: "serial" });

const NOTE = { title: "Browser test note", body: "Written in a real browser" };

/** The headers that let the page read an answer that a test writes for the API. */
const CROSS_ORIGIN_HEADERS = {
  "access-control-allow-origin": FRONTEND_ORIGIN,
  "access-control-allow-credentials": "true",
};

let page: Page;
/** Errors that no code caught. Normal use must not cause one. */
const uncaughtErrors: Error[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ baseURL: FRONTEND_ORIGIN });
  page.on("pageerror", (error) => uncaughtErrors.push(error));
});

test.afterAll(async () => {
  await page.close();
});

test("should send a visitor without a session to the sign-in page", async () => {
  // A static host must also answer a path that is not a file with the app.
  await page.goto("/notes");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle(APP_NAME);
  await expect(
    page.getByRole("heading", { name: `Sign in to ${APP_NAME}` }),
  ).toBeVisible();
});

test("should sign the owner in, and return to the page that the visitor asked for", async () => {
  await page.getByLabel("Email").fill(TEST_OWNER_CREDENTIALS.email);
  await page.getByLabel("Password").fill(TEST_OWNER_CREDENTIALS.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(
    page.getByText(TEST_OWNER_CREDENTIALS.name, { exact: true }),
  ).toBeVisible();
});

test("should keep the session and a new note across a reload", async () => {
  const note = page.getByRole("listitem").filter({ hasText: NOTE.title });
  await expect(page.getByText("You have no notes yet.")).toBeVisible();

  await page.getByLabel("Title").fill(NOTE.title);
  await page.getByLabel("Note", { exact: true }).fill(NOTE.body);
  await page.getByRole("button", { name: "Add note" }).click();

  await expect(note).toContainText(NOTE.body);

  // After a reload, the page has only what the browser and the backend kept.
  // The API is on another origin, so this also shows that the browser stored
  // the session cookie from that origin and sends it again.
  await page.reload();

  await expect(page).toHaveURL(/\/notes$/);
  await expect(note).toContainText(NOTE.body);
});

test("should open another page from the navigation without a page load", async () => {
  let pageLoads = 0;
  page.on("load", () => (pageLoads += 1));

  await page.getByRole("link", { name: "Counter" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Counter example" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Increase" }).click();

  await expect(page.getByLabel("Count")).toHaveText("1");
  expect(pageLoads).toEqual(0);
  expect(uncaughtErrors).toEqual([]);
});

test("should show a fallback in place of a page that fails to render", async () => {
  // A note whose title is not text makes the notes page throw while it renders.
  await page.route("**/api/notes", (route) =>
    route.fulfill({
      headers: CROSS_ORIGIN_HEADERS,
      json: {
        notes: [
          { id: "broken", title: { not: "text" }, body: "", updatedAt: "" },
        ],
      },
    }),
  );

  await page.getByRole("link", { name: "Notes" }).click();

  await expect(
    page.getByRole("heading", { name: "This page failed to load" }),
  ).toBeVisible();
  // The header is outside the failed page, so it still works.
  await expect(page.getByRole("link", { name: "Counter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();

  await page.unroute("**/api/notes");
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("listitem")).toContainText(NOTE.title);
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

  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();
});

test("should sign the owner out, and ask for sign-in again", async () => {
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/notes");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
