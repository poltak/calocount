import type { ThemeServiceInterface } from "./types.js";
import type { ThemePreference } from "../utils/theme.js";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

export class BrowserThemeService implements ThemeServiceInterface {
  private stopFollowing: (() => void) | null = null;

  apply(preference: ThemePreference): void {
    this.stopFollowing?.();
    this.stopFollowing = null;
    const root = document.documentElement;
    const show = (theme: "light" | "dark") => {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    };
    if (preference !== "system") {
      show(preference);
      return;
    }
    const query = window.matchMedia(LIGHT_QUERY);
    const sync = () => show(query.matches ? "light" : "dark");
    sync();
    query.addEventListener("change", sync);
    this.stopFollowing = () => query.removeEventListener("change", sync);
  }
}
