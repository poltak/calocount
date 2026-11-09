import assert from "node:assert/strict";
import test from "node:test";
import {
  applyThemePreference,
  effectiveTheme,
  readThemePreference,
  subscribeToTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
  type ThemePreference,
} from "../app/theme";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function themeRoot() {
  return { dataset: {} as DOMStringMap, style: { colorScheme: "" } };
}

test("theme preference defaults to System and ignores invalid stored values", () => {
  assert.equal(readThemePreference(storage()), "system");
  assert.equal(readThemePreference(storage({ [THEME_STORAGE_KEY]: "sepia" })), "system");
});

test("explicit Light and Dark choices persist in browser storage", () => {
  const browserStorage = storage();
  for (const preference of ["light", "dark"] as ThemePreference[]) {
    writeThemePreference(browserStorage, preference);
    assert.equal(readThemePreference(browserStorage), preference);
  }
});

test("System resolves to the current operating system preference", () => {
  assert.equal(effectiveTheme("system", false), "dark");
  assert.equal(effectiveTheme("system", true), "light");
  assert.equal(effectiveTheme("light", false), "light");
  assert.equal(effectiveTheme("dark", true), "dark");
});

test("System follows live operating system preference changes", () => {
  const root = themeRoot();
  let prefersLight = false;
  const listeners = new Set<() => void>();
  const mediaQuery = {
    get matches() {
      return prefersLight;
    },
    addEventListener(_event: "change", listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_event: "change", listener: () => void) {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;

  const unsubscribe = subscribeToTheme("system", root, mediaQuery);
  assert.equal(root.dataset.theme, "dark");
  prefersLight = true;
  listeners.forEach((listener) => listener());
  assert.equal(root.dataset.theme, "light");
  unsubscribe();
  prefersLight = false;
  listeners.forEach((listener) => listener());
  assert.equal(root.dataset.theme, "light");
});

test("applying an explicit theme updates the document color scheme", () => {
  const root = themeRoot();
  applyThemePreference("light", root, false);
  assert.equal(root.dataset.theme, "light");
  assert.equal(root.style.colorScheme, "light");
  applyThemePreference("dark", root, true);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.style.colorScheme, "dark");
});
