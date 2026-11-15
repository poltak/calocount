import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

// The screenshots for the UI review. `pnpm run ui:screens` runs this config;
// `pnpm run test:browser` does not, because each `.screens.ts` file only
// takes pictures and checks nothing.
export default defineConfig({
  ...baseConfig,
  testMatch: "**/*.screens.ts",
  outputDir: ".browser-test/screens-results",
});
