import { createDatabaseTemplate, type DatabaseTemplate } from "backend/testing";
import type { TestProject } from "vitest/node";
import { TEST_OWNER_CREDENTIALS } from "./test-owner.js";

declare module "vitest" {
  export interface ProvidedContext {
    /** The database that every test database starts from. */
    databaseTemplate: DatabaseTemplate;
  }
}

/**
 * Vitest runs this once, before the test files. It builds the migrated
 * database with the owner in it, and gives it to every test file. Building it
 * in each test file would take several seconds there, inside the time limit
 * of that file's first test.
 */
export async function setup(project: TestProject): Promise<void> {
  project.provide(
    "databaseTemplate",
    await createDatabaseTemplate(TEST_OWNER_CREDENTIALS),
  );
}
