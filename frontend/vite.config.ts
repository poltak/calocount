import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Enabled by the `test` script. See docs/agents/testing.md (Coverage).
    coverage: {
      provider: "v8",
      reporter: ["text"],
      // The same tests measure the backend. Source maps point its build output
      // back to its source files.
      allowExternal: true,
      include: [
        "src/features/**/*.ts",
        "**/backend/dist/features/**",
        "**/backend/src/features/**",
      ],
      exclude: [
        "**/*.test.*",
        "**/features/core/tests/**",
        "**/features/core/live/**",
      ],
      thresholds: {
        "src/features/*/ui/*-{logic,plugin}.ts": {
          functions: 100,
          perFile: true,
        },
      },
    },
  },
});
