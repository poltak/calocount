import type { Locator, Page } from "@playwright/test";

export class SignInPageObject {
  readonly heading: Locator;
  readonly emailField: Locator;
  readonly alert: Locator;

  constructor(private readonly page: Page) {
    // The heading also has the app's name, which each project changes.
    this.heading = page.getByRole("heading", { name: /^Sign in to / });
    this.emailField = page.getByLabel("Email");
    this.alert = page.getByRole("alert");
  }

  async goto(): Promise<void> {
    await this.page.goto("/login");
  }

  async signIn({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<void> {
    await this.emailField.fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
  }
}
