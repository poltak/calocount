import type { Page } from "@playwright/test";

export class SettingsPageObject {
  constructor(private readonly page: Page) {}

  get dialog() {
    return this.page.getByRole("dialog", { name: "Daily targets" });
  }

  field(name: string) {
    return this.dialog.getByLabel(name, { exact: true });
  }

  get timezone() {
    return this.dialog.getByRole("combobox", { name: "Timezone", exact: true });
  }

  get nutritionGoals() {
    return this.dialog.getByText("Nutrition goals", { exact: true });
  }

  get primaryGoals() {
    return this.dialog.getByText("Primary goals", { exact: true });
  }

  get passkeyHeading() {
    return this.dialog.getByRole("heading", { name: "Passkeys", exact: true });
  }

  get removePasskey() {
    return this.dialog.getByRole("button", { name: /^Remove passkey / });
  }

  async open() {
    await this.page.getByRole("button", { name: "Open settings" }).click();
    await this.dialog.waitFor();
  }

  async save() {
    await this.dialog
      .getByRole("button", { name: "Save targets", exact: true })
      .click();
    await this.dialog.waitFor({ state: "hidden" });
  }

  async attemptSave() {
    await this.dialog
      .getByRole("button", { name: "Save targets", exact: true })
      .click();
  }

  async restoreDefaults() {
    await this.dialog
      .getByRole("button", { name: "Restore recommended defaults" })
      .click();
  }

  async useDeviceTimezone() {
    await this.dialog
      .getByRole("button", { name: /Use this device's timezone/ })
      .click();
  }
}
