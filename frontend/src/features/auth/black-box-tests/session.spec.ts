import { expect } from "@playwright/test";
import { AppShellPageObject } from "../../core/black-box-tests/app-shell-page-object.js";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { SignInPageObject } from "./sign-in-page-object.js";

const REFUSED_CREDENTIALS = "Invalid email or password";
/** Chromium's text for a request that has no connection. */
const NO_CONNECTION =
  "No connection. Check your internet connection and try again.";

test.describe("sign-in", () => {
  test.use({ authenticated: false });

  test("should sign the owner in from the start path, and keep the session after a reload", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();

    await signInPage.signIn(owner);

    await expect(appShell.userName(owner.name)).toBeVisible();
    await expect(signInPage.heading).toBeHidden();
    await page.reload();
    await expect(appShell.userName(owner.name)).toBeVisible();
  });

  test("should sign the owner in with the email in capital letters", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();

    await signInPage.signIn({
      email: owner.email.toUpperCase(),
      password: owner.password,
    });

    await expect(appShell.userName(owner.name)).toBeVisible();
  });

  test("should open the address that the visitor asked for, after sign-in", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    // An address from a link, behind the session gate. The app has no page
    // of its own at this path, so no feature can remove it.
    const address = "/an-address-from-a-link?view=all";
    await page.goto(address);
    await expect(signInPage.heading).toBeVisible();

    await signInPage.signIn(owner);

    await expect(appShell.userName(owner.name)).toBeVisible();
    await expect(page).toHaveURL(
      (url) => url.pathname + url.search === address,
    );
  });

  test("should refuse a wrong password, keep the email, and stay signed out", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();

    // The password differs only in case, as with Caps Lock on.
    await signInPage.signIn({
      email: owner.email,
      password: owner.password.toUpperCase(),
    });

    await expect(signInPage.message).toHaveText(REFUSED_CREDENTIALS);
    await expect(signInPage.emailField).toHaveValue(owner.email);
    await expect(signInPage.passwordField).toHaveValue("");
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
  });

  test("should refuse an email that has no account, with the message for a wrong password", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    const email = "nobody@example.test";
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();

    await signInPage.signIn({ email, password: owner.password });

    await expect(signInPage.message).toHaveText(REFUSED_CREDENTIALS);
    await expect(signInPage.emailField).toHaveValue(email);
    await expect(signInPage.passwordField).toHaveValue("");
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
  });

  test("should refuse an email address whose domain has no dot", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    // The browser accepts this address in an email field, and the backend
    // does not.
    const email = "owner@example";
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();

    await signInPage.signIn({ email, password: owner.password });

    await expect(signInPage.message).toHaveText("Enter a valid email address");
    await expect(signInPage.emailField).toHaveAccessibleDescription(
      "Enter a valid email address",
    );
    await expect(signInPage.passwordField).toHaveAccessibleDescription("");
    await expect(signInPage.emailField).toHaveValue(email);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
  });

  test("should sign the owner in at the third attempt, after two wrong passwords", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await signInPage.signIn({
        email: owner.email,
        password: "wrong-password",
      });
      // The field empties when the attempt ends, so the next attempt does not
      // start while this one runs.
      await expect(signInPage.passwordField).toHaveValue("");
      await expect(signInPage.message).toHaveText(REFUSED_CREDENTIALS);
    }

    await signInPage.signIn(owner);

    await expect(appShell.userName(owner.name)).toBeVisible();
  });

  test("should refuse a fourth attempt in a short time, even with the correct password", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await signInPage.signIn({
        email: owner.email,
        password: "wrong-password",
      });
      await expect(signInPage.passwordField).toHaveValue("");
      await expect(signInPage.message).toHaveText(REFUSED_CREDENTIALS);
    }

    await signInPage.signIn(owner);

    await expect(signInPage.message).toHaveText(
      "Too many sign-in attempts. Try again later.",
    );
    await expect(signInPage.emailField).toHaveValue(owner.email);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
  });

  test("should keep the visitor on the sign-in page without a connection, and sign in when it returns", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
    await page.context().setOffline(true);

    await signInPage.signIn(owner);

    await expect(signInPage.message).toHaveText(NO_CONNECTION);
    await expect(signInPage.emailField).toHaveValue(owner.email);
    await expect(signInPage.heading).toBeVisible();

    await page.context().setOffline(false);
    await signInPage.signIn(owner);

    await expect(appShell.userName(owner.name)).toBeVisible();
  });
});

test.describe("a signed-in user", () => {
  test("should open the start page after sign-out and another sign-in", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    const address = "/an-address-from-a-link?view=all";
    await page.goto(address);
    await expect(appShell.userName(owner.name)).toBeVisible();
    await expect(page).toHaveURL(
      (url) => url.pathname + url.search === address,
    );

    await appShell.signOut();
    await expect(signInPage.heading).toBeVisible();
    await signInPage.signIn(owner);

    await expect(appShell.userName(owner.name)).toBeVisible();
    await expect(page).not.toHaveURL(
      (url) => url.pathname + url.search === address,
    );
  });

  test("should go to the start page from the sign-in page", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);

    await signInPage.goto();

    await expect(appShell.userName(owner.name)).toBeVisible();
    await expect(signInPage.heading).toBeHidden();
  });

  test("should sign out, and need to sign in again to open the app", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(appShell.userName(owner.name)).toBeVisible();

    await appShell.signOut();

    await expect(signInPage.heading).toBeVisible();
    await expect(appShell.userName(owner.name)).toBeHidden();
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
  });

  test("should stay signed in when sign-out has no connection, and sign out when it returns", async ({
    page,
    owner,
  }) => {
    const appShell = new AppShellPageObject(page);
    const signInPage = new SignInPageObject(page);
    await appShell.goto();
    await expect(appShell.userName(owner.name)).toBeVisible();
    await page.context().setOffline(true);

    await appShell.signOut();

    await expect(appShell.signOutMessage).toHaveText(NO_CONNECTION);
    await expect(appShell.userName(owner.name)).toBeVisible();

    await page.context().setOffline(false);
    await appShell.signOut();

    await expect(signInPage.heading).toBeVisible();
    await appShell.goto();
    await expect(signInPage.heading).toBeVisible();
  });
});
