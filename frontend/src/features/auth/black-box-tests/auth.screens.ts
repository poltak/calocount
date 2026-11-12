import { test } from "../../core/black-box-tests/black-box-test.js";
import { captureScreens } from "../../core/tests/browser/screens.js";

test.describe("sign-in page", () => {
  test.use({ authenticated: false });

  test("sign-in page", async ({ page }) => {
    await captureScreens(page, [
      { route: "/login", url: "/login", contentRoot: "#root" },
    ]);
  });
});

test.describe("sign-up page", () => {
  test.use({ accountMode: "openSignUp", authenticated: false });

  test("sign-up page", async ({ page }) => {
    await captureScreens(page, [
      { route: "/sign-up", url: "/sign-up", contentRoot: "#root" },
    ]);
  });
});
