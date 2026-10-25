import type { Locator, Page } from "@playwright/test";

export interface SignUpFields {
  name: string;
  email: string;
  password: string;
}

/** The page where a visitor makes an account, or reads that sign-up is closed. */
export class SignUpPageObject {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/sign-up");
  }

  /** The heading of the form. Each project puts its own product name in it. */
  get heading(): Locator {
    return this.page.getByRole("heading", { name: /^Create your .+ account$/ });
  }

  get closedHeading(): Locator {
    return this.page.getByRole("heading", { name: "Sign-up is closed" });
  }

  get nameField(): Locator {
    return this.page.getByLabel("Name");
  }

  get emailField(): Locator {
    return this.page.getByLabel("Email");
  }

  get passwordField(): Locator {
    return this.page.getByLabel("Password");
  }

  /** The messages about the last attempt, in the order of the page. */
  get messages(): Locator {
    return this.page.getByRole("alert");
  }

  async signUp(fields: SignUpFields): Promise<void> {
    await this.nameField.fill(fields.name);
    await this.emailField.fill(fields.email);
    await this.passwordField.fill(fields.password);
    await this.createAccount();
  }

  /** Send the form with the values that are in its fields now. */
  async createAccount(): Promise<void> {
    await this.page.getByRole("button", { name: "Create account" }).click();
  }

  async openSignIn(): Promise<void> {
    await this.page.getByRole("link", { name: "Sign in" }).click();
    // The sign-in page also has an "Email" and a "Password" field, so the next
    // step could fill the fields of this page until it goes.
    await this.heading.or(this.closedHeading).waitFor({ state: "hidden" });
  }
}
