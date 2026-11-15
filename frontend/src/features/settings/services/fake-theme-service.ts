import type { ThemeServiceInterface } from "./types.js";
import type { ThemePreference } from "../utils/theme.js";

/** Records the themes that the page showed. */
export class FakeThemeService implements ThemeServiceInterface {
  readonly applied: ThemePreference[] = [];

  apply(preference: ThemePreference): void {
    this.applied.push(preference);
  }
}
