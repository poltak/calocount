import { expect, test, type Page } from "@playwright/test";
import { CROSS_ORIGIN_HEADERS, signIn, startVisit } from "./built-app-visit.js";

// One visit to the pages of the example. `withExample` in
// `scripts/template-paths.json` lists this file, so it leaves with the example.
test.describe.configure({ mode: "serial" });

const NOTE = { title: "Browser test note", body: "Written in a real browser" };

let visit: Awaited<ReturnType<typeof startVisit>>;
let page: Page;

test.beforeAll(async ({ browser }) => {
  visit = await startVisit({ browser });
  ({ page } = visit);
});

test.afterAll(() => visit.end());

/** The keys of the unsaved note text that the browser keeps for this app. */
async function readDraftKeys(): Promise<string[]> {
  const { origins } = await page.context().storageState();
  return origins
    .flatMap((origin) => origin.localStorage)
    .map((entry) => entry.name)
    .filter((name) => name.startsWith("notes.draft."));
}

test("should keep a new note across a reload", async () => {
  await page.goto("/notes");
  await signIn({ page });

  const note = page.getByRole("listitem").filter({ hasText: NOTE.title });
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByText("You have no notes yet.")).toBeVisible();

  await page.getByLabel("Title").fill(NOTE.title);
  await page.getByLabel("Note", { exact: true }).fill(NOTE.body);
  await page.getByRole("button", { name: "Add note" }).click();

  await expect(note).toContainText(NOTE.body);

  await page.reload();

  await expect(page).toHaveURL(/\/notes$/);
  await expect(note).toContainText(NOTE.body);
});

test("should open a note from its link", async () => {
  await page.getByRole("link", { name: "Edit" }).click();

  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Edit note" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(NOTE.title);
  expect(visit.uncaughtErrors).toEqual([]);
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

  await page.getByRole("link", { name: "Notes", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "This page failed to load" }),
  ).toBeVisible();
  // The header is outside the failed page, so it still works.
  await expect(
    page.getByRole("link", { name: "Notes", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();

  await page.unroute("**/api/notes");
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("listitem")).toContainText(NOTE.title);
});

test("should forget the unsaved text at sign-out", async () => {
  // The Logic of the page hears the sign-out from the Logic of the header.
  // Only the route table connects the two, and no UI Logic test runs it.
  await page.getByLabel("Title").fill("Unsaved text");
  await expect.poll(readDraftKeys).toHaveLength(1);

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(readDraftKeys).toEqual([]);
});
