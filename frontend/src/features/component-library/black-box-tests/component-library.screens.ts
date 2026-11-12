import { test } from "../../core/black-box-tests/black-box-test.js";
import { captureScreens } from "../../core/tests/browser/screens.js";

test("component gallery", async ({ page }) => {
  await captureScreens(page, [{ route: "/components", url: "/components" }]);
});
