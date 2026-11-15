/* oxlint-disable no-empty-pattern -- Playwright reads the fixtures that a fixture needs from its first parameter, so a fixture that needs none has an empty pattern. */
import { test as base } from "@playwright/test";

// oxlint-disable-next-line node/no-process-env -- Playwright runs this file in Node, outside the app. Each worktree can run the Workers on ports of its own.
const env = process.env;

/** The port of the first Worker. Worker `n` of the test run listens on this port plus `n`. */
export const FIRST_PORT = Number(env["NEXT_BLACK_BOX_PORT"] || 4284);

/**
 * The count of test workers, and of Workers of the app. Each test worker has
 * a Worker of its own, with a database of its own, because a test empties the
 * database when it starts.
 */
export const WORKER_COUNT = Number(env["NEXT_BLACK_BOX_WORKERS"] || 4);

export function workerOrigin(parallelIndex: number): string {
  return `http://localhost:${FIRST_PORT + parallelIndex}`;
}

/**
 * The base `test` of each browser test. `baseURL` is the origin of the Worker
 * of this test worker, so two tests that run at the same time do not empty
 * the database of each other.
 */
export const test = base.extend<object, { workerOrigin: string }>({
  workerOrigin: [
    async ({}, provide, workerInfo) => {
      await provide(workerOrigin(workerInfo.parallelIndex));
    },
    { scope: "worker" },
  ],
  baseURL: async ({ workerOrigin: origin }, provide) => {
    await provide(origin);
  },
});
