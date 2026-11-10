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

  test("should state what the service processes, how it uses data, and the visitor's choices", async ({
    visitorPage,
  }) => {
    const privacy = new PrivacyPageObject(visitorPage);

    await privacy.goto();

    await expect(privacy.headings).toHaveText([
      "Privacy Policy",
      "About this service",
      "Information we process",
      "How we use information",
      "Storage and temporary file links",
      "Retention",
      "Security",
      "Your choices",
    ]);
    await expect(privacy.effectiveDate).toContainText("August 30, 2026");
    await expect(privacy.section("Information we process")).toContainText(
      "Entry name, calories, protein, carbohydrates, fat, and consumed time.",
    );
    await expect(privacy.section("Information we process")).toContainText(
      "An optional entry photo that you upload with an entry.",
    );
    await expect(privacy.section("How we use information")).toContainText(
      "We do not sell data or share it for advertising.",
    );
    await expect(
      privacy.section("Storage and temporary file links"),
    ).toContainText(
      "Temporary OpenAI file links are downloaded immediately for processing and are not retained by this service.",
    );
    await expect(privacy.section("Retention")).toContainText(
      "We retain data until you delete it or it is no longer needed for the service.",
    );
    await expect(privacy.section("Security")).toContainText(
      "We use HTTPS and access controls to protect data",
    );
    await expect(privacy.section("Your choices")).toContainText(
      "You can request access to, correction of, or deletion of your data through the service operator.",
    );
  });
});
