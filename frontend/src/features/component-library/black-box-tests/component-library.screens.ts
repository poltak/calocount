import { test } from "../../core/black-box-tests/black-box-test.js";
import { captureScreens } from "../../core/tests/browser/screens.js";

const GALLERY = {
  route: "/components",
  url: "/components",
  contentRoot: "#root",
};

test("component gallery", async ({ page }) => {
  test.setTimeout(90_000);
  await captureScreens(page, [
    GALLERY,
    {
      ...GALLERY,
      state: "select-open",
      steps: [
        { role: "combobox", name: "Plan", action: "click" },
        { role: "option", name: "Team", action: "waitFor" },
      ],
    },
    {
      ...GALLERY,
      state: "name-focused",
      steps: [{ role: "textbox", name: "Name", action: "focus" }],
    },
    {
      ...GALLERY,
      state: "search-focused",
      steps: [
        { role: "searchbox", name: "Search the example text", action: "focus" },
      ],
    },
    {
      ...GALLERY,
      state: "checkbox-focused",
      steps: [
        { role: "checkbox", name: "Include archived items", action: "focus" },
      ],
    },
    {
      ...GALLERY,
      state: "radio-focused",
      steps: [{ role: "radio", name: "Email", action: "focus" }],
    },
    {
      ...GALLERY,
      state: "form-error",
      steps: [
        { role: "button", name: "Save contact", action: "click" },
        { name: "Enter a name", action: "waitFor" },
      ],
    },
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
