import { test } from "../../core/black-box-tests/black-box-test.js";
import { captureScreens } from "../../core/tests/browser/screens.js";

const GALLERY = {
  route: "/components",
  url: "/components",
  contentRoot: "#root",
};

test("component gallery", async ({ page }) => {
  await captureScreens(page, [
    GALLERY,
    {
      ...GALLERY,
      state: "menu-open",
      steps: [
        { role: "button", name: "Actions", action: "click" },
        { role: "menu", name: "Actions", action: "waitFor" },
      ],
    },
    {
      ...GALLERY,
      state: "dialog-open",
      steps: [
        { role: "button", name: "Discard changes", action: "click" },
        { role: "dialog", name: "Discard the changes?", action: "waitFor" },
      ],
    },
    {
      ...GALLERY,
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
