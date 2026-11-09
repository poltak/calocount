import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { AppShellPageObject } from "../../core/black-box-tests/app-shell-page-object.js";
import { SignInPageObject } from "./sign-in-page-object.js";
import { SignUpPageObject, type SignUpFields } from "./sign-up-page-object.js";

const VISITOR: SignUpFields = {
  name: "New User",
  email: "new-user@example.test",
  password: "a-test-password-for-sign-up",
};

/** The values at the edges of the groups of values that the form accepts. */
const ACCEPTED_INPUTS: { input: string; fields: Partial<SignUpFields> }[] = [
  { input: "a name of 1 character", fields: { name: "N" } },
  { input: "a name of 200 characters", fields: { name: "n".repeat(200) } },
  { input: "a password of 8 characters", fields: { password: "8-chars!" } },
  {
    input: "a password of 128 characters",
    fields: { password: "p".repeat(128) },
  },
];

/** A value from each group of values that the form refuses, at its edge. */
const REFUSED_INPUTS: {
  input: string;
  fields: Partial<SignUpFields>;
  message: string;
}[] = [
  {
    input: "a name of only spaces",
    fields: { name: "   " },
    message: "Enter your name",
  },
  {
    input: "a name of 201 characters",
    fields: { name: "n".repeat(201) },
    message: "Use 200 characters or fewer",
  },
  {
    // The browser does not send an address without "@". This address passes
    // the check of the browser, and the backend refuses it.
    input: "an email address with no dot in its domain",
    fields: { email: "new-user@example" },
    message: "Enter a valid email address",
  },
  {
    input: "a password of 7 characters",
    fields: { password: "7-chars" },
    message: "Use at least 8 characters",
  },
  {
    input: "a password of 129 characters",
    fields: { password: "p".repeat(129) },
    message: "Use 128 characters or fewer",
  },
];

/** After a refusal, the visitor corrects only the wrong value. */
async function expectFieldsToHold(
  signUpPage: SignUpPageObject,
  fields: SignUpFields,
): Promise<void> {
  await expect(signUpPage.nameField).toHaveValue(fields.name);
  await expect(signUpPage.emailField).toHaveValue(fields.email);
  await expect(signUpPage.passwordField).toHaveValue(fields.password);
}

test.describe("in open sign-up mode", () => {
  test.use({ accountMode: "openSignUp", authenticated: false });

  test("should make an account, and sign the new user in", async ({ page }) => {
    const signUpPage = new SignUpPageObject(page);
    const appShell = new AppShellPageObject(page);

    await signUpPage.goto();
    await signUpPage.signUp(VISITOR);

    await expect(appShell.userName(VISITOR.name)).toBeVisible();

    // After a reload, the page has only what the browser and the backend kept.
    await page.reload();

    await expect(appShell.userName(VISITOR.name)).toBeVisible();
  });

  test("should keep the account, so that the new user can sign in after sign-out", async ({
    page,
  }) => {
    const signUpPage = new SignUpPageObject(page);
    const signInPage = new SignInPageObject(page);
    const appShell = new AppShellPageObject(page);
    await signUpPage.goto();
    await signUpPage.signUp(VISITOR);
    await expect(appShell.userName(VISITOR.name)).toBeVisible();

    await appShell.signOut();
    await signInPage.signIn(VISITOR);

    await expect(appShell.userName(VISITOR.name)).toBeVisible();
  });

  test("should lead a visitor from the sign-in page to the sign-up page, and back", async ({
    page,
  }) => {
    const signInPage = new SignInPageObject(page);
    const signUpPage = new SignUpPageObject(page);

    await signInPage.goto();
    await signInPage.openSignUp();

    await expect(signUpPage.heading).toBeVisible();

    await signUpPage.openSignIn();

    await expect(signInPage.heading).toBeVisible();
  });

  for (const { input, fields } of ACCEPTED_INPUTS) {
    test(`should accept ${input}`, async ({ page }) => {
      const signUpPage = new SignUpPageObject(page);
      const appShell = new AppShellPageObject(page);
      const visitor = { ...VISITOR, ...fields };

      await signUpPage.goto();
      await signUpPage.signUp(visitor);

      await expect(appShell.userName(visitor.name)).toBeVisible();
    });
  }

  for (const { input, fields, message } of REFUSED_INPUTS) {
    test(`should refuse ${input}, and keep the fields`, async ({ page }) => {
      const signUpPage = new SignUpPageObject(page);
      const appShell = new AppShellPageObject(page);
      const attempt = { ...VISITOR, ...fields };

      await signUpPage.goto();
      await signUpPage.signUp(attempt);

      await expect(signUpPage.messages).toHaveText([message]);
      await expect(signUpPage.nameField).toHaveAccessibleDescription(
        fields.name === undefined ? "" : message,
      );
      await expect(signUpPage.emailField).toHaveAccessibleDescription(
        fields.email === undefined ? "" : message,
      );
      await expect(signUpPage.passwordField).toHaveAccessibleDescription(
        fields.password === undefined ? "" : message,
      );
      await expectFieldsToHold(signUpPage, attempt);

      // A signed-in user does not see the form, and an address that has an
      // account cannot get another one. So when the form shows after a reload,
      // and the sign-up works, the refused attempt started no session and made
      // no account with the address of the visitor.
      await page.reload();
      await signUpPage.signUp(VISITOR);

      await expect(appShell.userName(VISITOR.name)).toBeVisible();
    });
  }

  test("should refuse an email address that has an account, and keep that account as it was", async ({
    page,
    owner,
  }) => {
    const signUpPage = new SignUpPageObject(page);
    const signInPage = new SignInPageObject(page);
    const appShell = new AppShellPageObject(page);
    const attempt = { ...VISITOR, email: owner.email };

    await signUpPage.goto();
    await signUpPage.signUp(attempt);

    await expect(signUpPage.messages).toHaveText([
      "An account with this email address exists already",
    ]);
    await expectFieldsToHold(signUpPage, attempt);

    // The owner's password still works, and the account has the owner's name,
    // not the name of the attempt.
    await signInPage.goto();
    await signInPage.signIn(owner);

    await expect(appShell.userName(owner.name)).toBeVisible();
  });

  test("should keep the fields when the connection fails, and make the account on the next attempt", async ({
    page,
    context,
  }) => {
    const signUpPage = new SignUpPageObject(page);
    const appShell = new AppShellPageObject(page);
    await signUpPage.goto();
    // The form shows only after the page has asked the backend if sign-up is
    // open. Without this wait, that request can fail too.
    await expect(signUpPage.heading).toBeVisible();

    await context.setOffline(true);
    await signUpPage.signUp(VISITOR);

    await expect(signUpPage.messages).toHaveText([
      "No connection. Check your internet connection and try again.",
    ]);
    await expectFieldsToHold(signUpPage, VISITOR);

    await context.setOffline(false);
    await signUpPage.createAccount();

    await expect(appShell.userName(VISITOR.name)).toBeVisible();
  });
});

test.describe("in single-owner mode", () => {
  test.use({ accountMode: "singleOwner", authenticated: false });

  test("should tell a visitor that sign-up is closed, and lead to the sign-in page", async ({
    page,
  }) => {
    const signUpPage = new SignUpPageObject(page);
    const signInPage = new SignInPageObject(page);

    await signUpPage.goto();

    await expect(signUpPage.closedHeading).toBeVisible();
    await expect(signUpPage.nameField).toBeHidden();

    await signUpPage.openSignIn();

    await expect(signInPage.heading).toBeVisible();
    // The sign-in page uses the answer that the sign-up page loaded. So the
    // link is absent because sign-up is closed, not because the page still
    // waits for the answer.
    await expect(signInPage.signUpLink).toBeHidden();
  });
});

// The rule does not depend on the account mode, so the test runs in the mode
// of the project.
test("should show the app, and not the form, to a user who is signed in", async ({
  page,
  owner,
}) => {
  const signUpPage = new SignUpPageObject(page);
  const appShell = new AppShellPageObject(page);

  await signUpPage.goto();

  await expect(appShell.userName(owner.name)).toBeVisible();
});
