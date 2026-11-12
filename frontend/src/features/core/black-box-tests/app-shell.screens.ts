import { test } from "./black-box-test.js";
import { captureScreens } from "../tests/browser/screens.js";

test("root redirect", async ({ page }) => {
  await captureScreens(page, [{ route: "/", url: "/" }]);
});

test("not-found page", async ({ page }) => {
  await captureScreens(page, [{ route: "*", url: "/no-such-page" }]);
});
