import { test } from "./black-box-test.js";
import { captureScreens } from "../tests/browser/screens.js";

test("root redirect", async ({ page }) => {
  await captureScreens(page, [
    { route: "/", url: "/", contentRoot: ".ui-app-content" },
    {
      route: "/",
      url: "/",
      state: "navigation-toggled",
      contentRoot: ".ui-app-content",
      steps: [
        { role: "button", name: "Toggle Sidebar", action: "click" },
        { role: "dialog", name: "Sidebar", action: "waitFor", width: "phone" },
      ],
    },
    {
      route: "/",
      url: "/",
      state: "navigation-focused",
      contentRoot: ".ui-app-content",
      steps: [{ role: "button", name: "Toggle Sidebar", action: "focus" }],
    },
  ]);
});

test("not-found page", async ({ page }) => {
  await captureScreens(page, [
    { route: "*", url: "/no-such-page", contentRoot: ".ui-app-content" },
  ]);
});
