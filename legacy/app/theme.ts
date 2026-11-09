export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "calocount:theme";

type ThemeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type ThemeStorageSource = ThemeStorage | (() => ThemeStorage);
type ThemeRoot = {
  dataset: { theme?: string };
  style: { colorScheme: string };
};

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function readThemePreference(storage: ThemeStorageSource): ThemePreference {
  try {
    const resolved = typeof storage === "function" ? storage() : storage;
    return parseThemePreference(resolved.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeThemePreference(storage: ThemeStorageSource, preference: ThemePreference): void {
  try {
    const resolved = typeof storage === "function" ? storage() : storage;
    resolved.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Keep the dashboard usable when browser storage is unavailable.
  }
}

export function effectiveTheme(preference: ThemePreference, prefersLight: boolean): Exclude<ThemePreference, "system"> {
  return preference === "system" ? (prefersLight ? "light" : "dark") : preference;
}

export function applyThemePreference(theme: ThemePreference, root: ThemeRoot, prefersLight: boolean): void {
  const resolved = effectiveTheme(theme, prefersLight);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function subscribeToTheme(theme: ThemePreference, root: ThemeRoot, mediaQuery: MediaQueryList): () => void {
  const sync = () => applyThemePreference(theme, root, mediaQuery.matches);
  sync();
  if (theme !== "system") return () => {};

  mediaQuery.addEventListener("change", sync);
  return () => mediaQuery.removeEventListener("change", sync);
}
