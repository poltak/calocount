import type { Locator, Page } from "@playwright/test";

interface SignInCredentials {
  email: string;
  password: string;
}

export class SignInPageObject {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/login");
  }

  /**
   * The heading has the product name after "Sign in to". A page object
   * cannot import that name, and each project changes it.
   */
  get heading(): Locator {
    return this.page.getByRole("heading", { name: /^Sign in to / });
  }

  get emailField(): Locator {
    return this.page.getByLabel("Email");
  }

  get passwordField(): Locator {
    return this.page.getByLabel("Password");
  }

  /** The reason for a refused sign-in, at a field or below the form. */
  get message(): Locator {
    return this.page.getByRole("alert");
  }

  /** The page shows this link only when a visitor can make an account. */
  get signUpLink(): Locator {
    return this.page.getByRole("link", { name: "Create an account" });
  }

  /**
   * The fields stay disabled while the page checks the session, and while an
   * attempt runs. `fill()` waits until they are enabled.
   */
  async signIn(credentials: SignInCredentials): Promise<void> {
    await this.emailField.fill(credentials.email);
    await this.passwordField.fill(credentials.password);
    await this.page
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
  }

  async openSignUp(): Promise<void> {
    await this.signUpLink.click();
    // The sign-up page also has an "Email" and a "Password" field, so the next
    // step could fill the fields of this page until it goes.
    await this.heading.waitFor({ state: "hidden" });
  }
}
