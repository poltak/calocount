import { expect } from "@playwright/test";
import { AppShellPageObject } from "../../core/black-box-tests/app-shell-page-object.js";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { SignUpPageObject } from "./sign-up-page-object.js";

const VISITOR = {
  name: "Visitor",
  email: "visitor@example.test",
  password: "visitor-password",
};

test.describe("in open sign-up mode", () => {
  test.use({ authenticated: false, accountMode: "openSignUp" });

  test("should make an account, and sign the new user in", async ({ page }) => {
    const signUpPage = new SignUpPageObject(page);
    const app = new AppShellPageObject(page);
    await signUpPage.goto();

    await signUpPage.signUp(VISITOR);

    await expect(app.userName(VISITOR.name)).toBeVisible();
  });

  // The specification: a password has at least 8 characters.
  test("should refuse a password of 7 characters, and accept one of 8", async ({
    page,
  }) => {
    const signUpPage = new SignUpPageObject(page);
    const app = new AppShellPageObject(page);
    await signUpPage.goto();

    await signUpPage.signUp({ ...VISITOR, password: "seven-c" });

    await expect(signUpPage.alert).toHaveText("Use at least 8 characters");

    await signUpPage.signUp({ ...VISITOR, password: "eight-ch" });

    await expect(app.userName(VISITOR.name)).toBeVisible();
  });

  test("should refuse an email that has an account already", async ({
    page,
    owner,
  }) => {
    const signUpPage = new SignUpPageObject(page);
    await signUpPage.goto();

    await signUpPage.signUp({ ...VISITOR, email: owner.email });

    await expect(signUpPage.alert).toHaveText(
      "An account with this email address exists already",
    );
  });
});

test.describe("in single-owner mode", () => {
  test.use({ authenticated: false, accountMode: "singleOwner" });

  test("should tell a visitor that sign-up is closed", async ({ page }) => {
    const signUpPage = new SignUpPageObject(page);

    await signUpPage.goto();

    await expect(signUpPage.closedHeading).toBeVisible();
  });
});
