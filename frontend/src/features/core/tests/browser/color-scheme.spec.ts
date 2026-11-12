import { expect, test } from "@playwright/test";
import { startVisit } from "./built-app-visit.js";

test("the built app follows device changes and explicit theme overrides", async ({
  browser,
}) => {
  const visit = await startVisit({ browser });
  const { page } = visit;
  try {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/components");
    await expect(
      page.getByRole("heading", { name: "Component library" }),
    ).toBeVisible();
    await page.addStyleTag({
      content:
        ":root { --proof-theme: light; } :root.dark { --proof-theme: dark; }",
    });
    const root = page.locator("html");
    const theme = () =>
      root.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--proof-theme").trim(),
      );
    await expect.poll(theme).toBe("dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(theme).toBe("light");
    await root.evaluate((element) => {
      element.setAttribute("data-theme", "dark");
    });
    await expect.poll(theme).toBe("dark");
    await page.emulateMedia({ colorScheme: "dark" });
    await root.evaluate((element) => {
      element.setAttribute("data-theme", "light");
    });
    await expect.poll(theme).toBe("light");
    await root.evaluate((element) => {
      element.removeAttribute("data-theme");
    });
    await expect.poll(theme).toBe("dark");
    expect(visit.uncaughtErrors).toEqual([]);
  } finally {
    await visit.end();
  }
});
