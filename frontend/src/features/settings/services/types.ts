import type { ThemePreference } from "../utils/theme.js";

/** The look of the page. */
export interface ThemeServiceInterface {
  /** Show the theme. `system` follows the device, and keeps following it until the next call. */
  apply(preference: ThemePreference): void;
}
