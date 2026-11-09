import { createDatabaseTemplate, type DatabaseTemplate } from "backend/testing";
import type { TestProject } from "vitest/node";
import { TEST_OWNER_CREDENTIALS } from "./test-owner.js";

declare module "vitest" {
  export interface ProvidedContext {
    databaseTemplate: DatabaseTemplate;
  }
}

/**
 * Vitest runs this once, before the test files. It builds the migrated
 * database with the owner in it, and a copy in which the owner has signed in,
 * and gives both to every test file. Building them in each test file would
 * take several seconds there, inside the time limit of that file's first test.
 */
export async function setup(project: TestProject): Promise<void> {
  project.provide(
    "databaseTemplate",
    await createDatabaseTemplate(TEST_OWNER_CREDENTIALS),
  );
}
