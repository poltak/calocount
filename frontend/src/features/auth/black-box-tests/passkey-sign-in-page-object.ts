import type { Locator, Page } from "@playwright/test";

/** The page that a visitor sees on an owner page without a session. */
export class PasskeySignInPageObject {
  readonly setUpHeading: Locator;
  readonly signInHeading: Locator;
  readonly setupCodeField: Locator;
  readonly createPasskeyButton: Locator;
  readonly signInButton: Locator;

  constructor(private readonly page: Page) {
    this.setUpHeading = page.getByRole("heading", {
      name: "Set up Calocount",
    });
    this.signInHeading = page.getByRole("heading", {
      name: "Sign in to Calocount",
    });
    this.setupCodeField = page.getByLabel("Setup code");
    this.createPasskeyButton = page.getByRole("button", {
      name: "Create passkey",
    });
    this.signInButton = page.getByRole("button", {
      name: "Sign in with passkey",
    });
  }

  async goto(path = "/owner"): Promise<void> {
    await this.page.goto(path);
  }

  /** Save the first passkey of a new instance. */
  async setUp(setupCode: string): Promise<void> {
    await this.setUpHeading.waitFor();
    await this.setupCodeField.fill(setupCode);
    await this.createPasskeyButton.click();
  }

  async signIn(): Promise<void> {
    await this.signInHeading.waitFor();
    await this.signInButton.click();
  }
}
