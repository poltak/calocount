import { test } from "../../core/black-box-tests/black-box-test.js";
import { captureScreens } from "../../core/tests/browser/screens.js";

test("component gallery", async ({ page }) => {
  await captureScreens(page, [
    { route: "/components", url: "/components" },
    {
      route: "/components",
      url: "/components",
      state: "menu-open",
      steps: [
        { role: "button", name: "Actions", action: "click" },
        { role: "menu", name: "Actions", action: "waitFor" },
      ],
    },
    {
      route: "/components",
      url: "/components",
      state: "dialog-open",
      steps: [
        { role: "button", name: "Discard changes", action: "click" },
        { role: "dialog", name: "Discard the changes?", action: "waitFor" },
      ],
    },
    {
      route: "/components",
      url: "/components",
      state: "help-focused",
      steps: [
        {
          role: "button",
          name: "A short help text, on hover and on focus.",
          action: "focus",
        },
        {
          name: "A short help text, on hover and on focus.",
          action: "waitFor",
        },
      ],
    },
  ]);
});
