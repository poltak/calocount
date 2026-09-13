import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("layout applies the saved theme before hydration and tolerates unavailable storage", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(layout, /const themeInitializer = `/);
  assert.match(layout, /window\.localStorage\.getItem\(\$\{JSON\.stringify\(THEME_STORAGE_KEY\)\}\)/);
  assert.match(layout, /window\.matchMedia\("\(prefers-color-scheme: light\)"\)\.matches/);
  assert.match(layout, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(layout, /try \{/);
  assert.match(layout, /catch \{/);
  assert.match(layout, /<script id="theme-initializer" dangerouslySetInnerHTML=\{\{ __html: themeInitializer \}\} \/>/);
  assert.match(layout, /<html lang="en" suppressHydrationWarning>/);
});

test("layout advertises both theme color schemes to the browser", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(layout, /themeColor: \[/);
  assert.match(layout, /media: "\(prefers-color-scheme: light\)", color: "#f5f7f6"/);
  assert.match(layout, /media: "\(prefers-color-scheme: dark\)", color: "#0f131b"/);
  assert.match(layout, /colorScheme: "light dark"/);
});
