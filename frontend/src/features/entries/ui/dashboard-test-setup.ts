import { expect } from "vitest";
import type { FullApplication } from "../../core/tests/full-application.js";

export type Seed = (app: FullApplication) => Promise<void>;

export async function saveWeight(
  { frontend }: Pick<FullApplication, "frontend">,
  logicalDate: string,
  weightKg: number,
) {
  const response = await frontend.api.weights.$put({
    json: { logicalDate, weightKg },
  });
  expect(response.status).toEqual(200);
}

export async function patchSettings(
  { frontend }: Pick<FullApplication, "frontend">,
  json: Parameters<
    FullApplication["frontend"]["api"]["settings"]["$patch"]
  >[0]["json"],
) {
  const response = await frontend.api.settings.$patch({ json });
  expect(response.status).toEqual(200);
}
