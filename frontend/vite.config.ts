import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "@app/common/features/core/utils/app-name";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

/**
 * Vitest splits the test files into shards by a hash of each path, so the
 * largest files can land in one shard, which then takes much longer than the
 * others. Each test takes about the same time, so this split gives each shard
 * about the same amount of test code: each file, the largest first, goes into
 * the shard that has the least code so far.
 */
class SizeBalancedSequencer extends BaseSequencer {
  override async shard(
    files: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!;
    const shards = Array.from({ length: count }, () => ({
      size: 0,
      files: [] as TestSpecification[],
    }));
    const bySize = files
      .map((file) => ({ file, size: statSync(file.moduleId).size }))
      // The path breaks a tie, so that each shard job makes the same split.
      .toSorted(
        (a, b) =>
          b.size - a.size || (a.file.moduleId < b.file.moduleId ? -1 : 1),
      );
    for (const { file, size } of bySize) {
      const smallest = shards.reduce((least, shard) =>
        shard.size < least.size ? shard : least,
      );
      smallest.size += size;
      smallest.files.push(file);
    }
    return shards[index - 1]!.files;
  }
}

/** How long an API request waits for a backend that is starting or restarting. */
const BACKEND_WAIT_MS = 10_000;

/** Resolve when the backend answers its health route, or when the wait is over. */
async function waitForBackend(origin: string): Promise<void> {
  const deadline = Date.now() + BACKEND_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`${origin}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * `pnpm run dev` restarts the backend after each change to its code. A page
 * that reloads at the same moment would get a proxy error. This holds each API
 * request until the backend answers again.
 */
function holdApiRequestsUntilBackendAnswers(origin: string): Plugin {
  return {
    name: "hold-api-requests-until-backend-answers",
    configureServer(server) {
      server.middlewares.use("/api", (_request, _response, next) => {
        void waitForBackend(origin).then(() => next());
      });
    },
  };
}

/** Write the product name into the page, so `index.html` does not repeat it. */
function writeAppName(): Plugin {
  return {
    name: "write-app-name",
    transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME),
  };
}

export default defineConfig(({ mode }) => {
  // The backend takes HOST and PORT from the process environment, then from
  // the root `.env`. Read them the same way, so the proxy follows the backend.
  // The `test:shard` script sets VITEST_SHARD.
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), [
    "HOST",
    "PORT",
    "VITEST_SHARD",
  ]);
  const backendOrigin = `http://${env.HOST || "127.0.0.1"}:${env.PORT || "3000"}`;

  return {
    plugins: [
      react(),
      writeAppName(),
      holdApiRequestsUntilBackendAnswers(backendOrigin),
    ],
    server: {
      proxy: {
        "/api": { target: backendOrigin, changeOrigin: true },
      },
    },
    test: {
      // Logic tests need no browser. The one rendered test opts into jsdom.
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      // The first test of each file also starts the in-memory database engine,
      // which takes several seconds on a slow CI machine.
      testTimeout: 20_000,
      // Builds the database that every test database starts from, once.
      globalSetup: ["src/features/core/tests/global-setup.ts"],
      // CI runs the tests in shards. See `.github/workflows/ci.yml`.
      sequence: { sequencer: SizeBalancedSequencer },
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
          // Playwright runs these, so Vitest measures none of their code.
          "**/black-box-tests/**",
          "**/features/core/tests/**",
          "**/features/core/live/**",
        ],
        // A shard runs only some test files, so the job that merges the
        // shards checks the thresholds, on the coverage of all of them.
        thresholds: env.VITEST_SHARD
          ? {}
          : {
              "src/features/*/ui/*-{logic,plugin}.ts": {
                functions: 100,
                perFile: true,
              },
            },
      },
    },
  };
});
