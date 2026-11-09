import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { PrivacyPageObject } from "./privacy-page-object.js";

test.describe("the privacy policy", () => {
  test("should be open to a visitor with no session", async ({
    visitorPage,
  }) => {
    const privacy = new PrivacyPageObject(visitorPage);

    await privacy.goto();

    await expect(privacy.heading).toBeVisible();
    await expect(privacy.section("About this service")).toContainText(
      "personal, single-user food and drink logging service",
    );
    await expect(privacy.section("Information we process")).toBeVisible();
  });
});
