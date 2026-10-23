import { expect } from "@playwright/test";
import { AppShellPageObject } from "../../core/tests/browser/app-shell-page-object.js";
import { test } from "../../core/tests/browser/black-box-test.js";
import { SignInPageObject } from "./sign-in-page-object.js";

test.describe("a visitor without a session", () => {
  test.use({ authenticated: false });

  test("should sign in, and see their name", async ({ page, owner }) => {
    const signInPage = new SignInPageObject(page);
    const app = new AppShellPageObject(page);
    await signInPage.goto();

    await signInPage.signIn(owner);

    await expect(app.userName(owner.name)).toBeVisible();
  });

  test("should stay signed out after a wrong password, and keep the email", async ({
    page,
    owner,
  }) => {
    const signInPage = new SignInPageObject(page);
    const app = new AppShellPageObject(page);
    await signInPage.goto();

    await signInPage.signIn({ email: owner.email, password: "wrong-password" });

    await expect(signInPage.alert).toHaveText("Invalid email or password");
    await expect(signInPage.emailField).toHaveValue(owner.email);
    await app.goto();
    await expect(signInPage.heading).toBeVisible();
  });
});

test("should sign the owner out, and ask for sign-in on the next visit", async ({
  page,
  owner,
}) => {
  const app = new AppShellPageObject(page);
  const signInPage = new SignInPageObject(page);
  await app.goto();
  await expect(app.userName(owner.name)).toBeVisible();

  await app.signOut();

  await expect(signInPage.heading).toBeVisible();
  await app.goto();
  await expect(signInPage.heading).toBeVisible();
});
