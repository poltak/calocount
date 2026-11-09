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

  get setupError() {
    return this.page.getByText("This setup code is not correct.", {
      exact: true,
    });
  }

  async goto(path = "/owner"): Promise<void> {
    await this.page.goto(path);
  }

  /** Save the first passkey of a new instance, and go on to the dashboard. */
  async setUp(setupCode: string): Promise<void> {
    await this.submitSetupCode(setupCode);
    await this.setUpHeading.waitFor({ state: "hidden" });
  }

  /** Type a setup code and ask for a passkey. The page stays on a refusal. */
  async submitSetupCode(setupCode: string): Promise<void> {
    await this.setUpHeading.waitFor();
    await this.setupCodeField.fill(setupCode);
    await this.createPasskeyButton.click();
  }

  /** On the sign-in page, add a passkey for this device with the setup code. */
  async recover(setupCode: string): Promise<void> {
    await this.signInHeading.waitFor();
    await this.page
      .getByRole("button", { name: "Lost your passkey? Use your setup code" })
      .click();
    const heading = this.page.getByRole("heading", { name: "Add a passkey" });
    await heading.waitFor();
    await this.setupCodeField.fill(setupCode);
    await this.createPasskeyButton.click();
    await heading.waitFor({ state: "hidden" });
  }

  async signIn(): Promise<void> {
    await this.signInHeading.waitFor();
    await this.signInButton.click();
    await this.signInHeading.waitFor({ state: "hidden" });
  }
}
