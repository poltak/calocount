import type { ColorSchemeServiceInterface } from "./types.js";

export class BrowserColorSchemeService implements ColorSchemeServiceInterface {
  start(): () => void {
    const root = document.documentElement;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const override = root.dataset.theme;
      root.classList.toggle(
        "dark",
        override === "dark" || (override !== "light" && preference.matches),
      );
    };
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    preference.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
    };
  }
}
