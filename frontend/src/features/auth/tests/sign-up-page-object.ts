import type { Locator, Page } from "@playwright/test";

export class SignUpPageObject {
  readonly closedHeading: Locator;
  readonly alert: Locator;

  constructor(private readonly page: Page) {
    this.closedHeading = page.getByRole("heading", {
      name: "Sign-up is closed",
    });
    this.alert = page.getByRole("alert");
  }

  async goto(): Promise<void> {
    await this.page.goto("/sign-up");
  }

  async signUp({
    name,
    email,
    password,
  }: {
    name: string;
    email: string;
    password: string;
  }): Promise<void> {
    await this.page.getByLabel("Name").fill(name);
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Create account" }).click();
  }
}
