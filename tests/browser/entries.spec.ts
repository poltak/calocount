import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("adding an entry sends precise macros, the chosen time and optional nutrients", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const form = page.locator(".add-meal-form");
  await form.getByLabel("Entry time").fill("08:15");
  await form.getByLabel("Entry name", { exact: true }).fill("Oat porridge");
  await form.getByLabel("Description", { exact: true }).fill("Oats with milk");
  await form.getByLabel("Calories", { exact: true }).fill("312.5");
  await form.getByLabel("Protein (g)", { exact: true }).fill("12.25");
  await form.getByLabel("Carbs (g)", { exact: true }).fill("48.5");
  await form.getByLabel("Fat (g)", { exact: true }).fill("7.75");
  await form.locator("summary", { hasText: "Advanced nutrition" }).click();
  await form.locator('input[name="nutrient-fiberG"]').fill("6.5");
  await form.locator('input[name="nutrient-sodiumMg"]').fill("0");
  await form.getByRole("button", { name: "Save entry", exact: true }).click();

  const row = page.locator(".meal-row", { hasText: "Oat porridge" });
  await expect(page.getByRole("button", { name: "Delete Oat porridge", exact: true })).toHaveCount(1);
  await expect(row.locator("time")).toHaveText("08:15");
  await expect(row.locator(".meal-info > span")).toHaveText("Oats with milk");
  await expect(row.locator(".calories-stat")).toHaveText("Energy312.5 kcal");
  await expect(row.locator(".protein-stat")).toHaveText("Protein12.25 g");
  await expect(row.locator(".carbs-stat")).toHaveText("Carbs48.5 g");
  await expect(row.locator(".fat-stat")).toHaveText("Fat7.75 g");

  const creates = state.requests.filter((request) => request.method === "POST" && request.path === "/api/meals");
  expect(creates).toHaveLength(1);
  expect(creates[0].contentType).toContain("application/json");
  expect(creates[0].body).toMatchObject({
    consumedAt: Date.parse("2026-09-12T08:15:00Z"),
    caption: "Oats with milk",
    items: [{
      name: "Oat porridge",
      calories: 312.5,
      proteinG: 12.25,
      carbsG: 48.5,
      fatG: 7.75,
      fiberG: 6.5,
      // An explicit zero stays zero; a blank field stays unknown.
      sodiumMg: 0,
      calciumMg: null,
      nutrientProvenance: { fiberG: "manual", sodiumMg: "manual" },
    }],
  });
});

test("saving an edit sends one PATCH with the items and keeps the stored source and type", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Audit lunch", exact: true }).click();
  const editor = page.locator(".inline-editor");
  await editor.getByLabel("Calories", { exact: true }).fill("650");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("650 / 2,400");
  await expect(editor).toHaveCount(0);

  const patches = state.requests.filter((request) => request.method === "PATCH");
  expect(patches).toHaveLength(1);
  expect(patches[0].path).toBe("/api/meals/meal-1");
  expect(patches[0].body).toMatchObject({ items: [{ name: "Audit lunch", calories: 650, proteinG: 30 }] });
  // The description did not change, so the caption, source, type and status are left alone.
  expect(Object.keys(patches[0].body ?? {})).toEqual(["items"]);

  await page.getByRole("button", { name: "Edit Audit lunch", exact: true }).click();
  await editor.getByLabel("Description", { exact: true }).fill("Lunch at the audit");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".meal-row .meal-info > span")).toHaveText("Lunch at the audit");
  const second = state.requests.filter((request) => request.method === "PATCH")[1];
  expect(Object.keys(second.body ?? {}).sort()).toEqual(["caption", "items"]);
  expect(second.body?.caption).toBe("Lunch at the audit");
});

test("editing the total of a multi-item entry keeps every item", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.meals[0].items = [
    { ...state.meals[0].items[0], name: "Rice", calories: 300, proteinG: 6, carbsG: 60, fatG: 2 },
    { ...state.meals[0].items[0], name: "Chicken", calories: 200, proteinG: 24, carbsG: 0, fatG: 8 },
  ];
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Rice", exact: true }).click();
  const editor = page.locator(".inline-editor");
  await expect(editor.locator(".meal-item-editor")).toHaveCount(2);
  await editor.getByLabel("Calories", { exact: true }).fill("700");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("700 / 2,400");

  const items = state.requests.find((request) => request.method === "PATCH")?.body?.items as Array<{ name: string; calories: number }>;
  expect(items.map((item) => item.name)).toEqual(["Rice", "Chicken"]);
  expect(items.reduce((total, item) => total + item.calories, 0)).toBe(700);
});

test("declining the delete confirmation keeps the entry", async ({ page }) => {
  const state = await mockDashboardApi(page);
  page.on("dialog", (dialog) => dialog.dismiss());
  await page.goto("/");
  await page.getByRole("button", { name: "Delete Audit lunch", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Audit lunch", exact: true })).toBeEnabled();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
  expect(state.writes).toBe(0);
});

test("an entry shows its description only when it differs from the name", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.meals.push({ ...structuredClone(state.meals[0]), id: "meal-2", caption: "Leftovers from Friday" });
  await page.goto("/");
  const rows = page.locator(".meal-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".meal-info > span")).toHaveCount(0);
  await expect(rows.nth(1).locator(".meal-info > span")).toHaveText("Leftovers from Friday");
});

test("copy to today is offered only on earlier days", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.meals.push({ ...structuredClone(state.meals[0]), id: "meal-2", consumedAt: state.meals[0].consumedAt - 86_400_000 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Copy Audit lunch to today", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Duplicate Audit lunch", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy Audit lunch to today", exact: true })).toHaveCount(1);
});

test("an entry photo is uploaded as a multipart form with the entry payload", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const form = page.locator(".add-meal-form");
  await form.getByLabel("Entry name", { exact: true }).fill("Photo snack");
  await form.getByLabel("Calories", { exact: true }).fill("120");
  await form.locator('input[name="photo"]').setInputFiles({ name: "snack.png", mimeType: "image/png", buffer: PNG });
  await form.getByRole("button", { name: "Save entry", exact: true }).click();

  await expect(page.getByRole("button", { name: "View photo of Photo snack", exact: true })).toBeVisible();
  const create = state.requests.find((request) => request.method === "POST" && request.path === "/api/meals");
  expect(create?.contentType).toContain("multipart/form-data");
  expect(create?.photoName).toBe("snack.png");
  expect(create?.body).toMatchObject({ items: [{ name: "Photo snack", calories: 120 }] });

  // The editor of an entry with a photo offers a replacement, and a replacement is sent the same way.
  await page.getByRole("button", { name: "Edit Photo snack", exact: true }).click();
  const editor = page.locator(".inline-editor");
  await expect(editor.getByText("Replace photo (optional)")).toBeVisible();
  await expect(editor.getByText("Current photo stays unless you select a replacement.")).toBeVisible();
  await editor.locator('input[type="file"]').setInputFiles({ name: "better.png", mimeType: "image/png", buffer: PNG });
  await expect(editor.getByText("better.png")).toBeVisible();
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const patch = state.requests.find((request) => request.method === "PATCH");
  expect(patch?.contentType).toContain("multipart/form-data");
  expect(patch?.photoName).toBe("better.png");
});

test("a photo of the wrong type or over 10 MB is rejected before any request", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const form = page.locator(".add-meal-form");
  await form.getByLabel("Entry name", { exact: true }).fill("Photo snack");
  await form.getByLabel("Calories", { exact: true }).fill("120");

  await form.locator('input[name="photo"]').setInputFiles({ name: "snack.gif", mimeType: "image/gif", buffer: PNG });
  await form.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByText("Select a JPEG, PNG, or WebP image.", { exact: true })).toBeVisible();

  await form.locator('input[name="photo"]').setInputFiles({
    name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await form.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByText("Select an image that is 10 MB or smaller.", { exact: true })).toBeVisible();
  expect(state.writes).toBe(0);
});
