import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import type { FullApplication } from "../../core/tests/full-application.js";

const HOUR_MS = 3_600_000;

type MealInput = Parameters<
  FullApplication["frontend"]["api"]["meals"]["$post"]
>[0]["json"];

/** Today's date in UTC, by the clock of the test backend. */
export function today({ backend }: Pick<FullApplication, "backend">): string {
  return new Date(backend.services.clock.now()).toISOString().slice(0, 10);
}

/** The date `days` before today. */
export function dateAgo(
  app: Pick<FullApplication, "backend">,
  days: number,
): string {
  return shiftDateKey(today(app), -days);
}

/** Noon, or the given hour, of a date in UTC. */
function at(date: string, hour = 12): number {
  return Date.parse(`${date}T00:00:00Z`) + hour * HOUR_MS;
}

export interface SeedItem {
  name: string;
  quantity?: number;
  unit?: string;
  calories?: number;
  proteinG?: number;
  fiberG?: number | null;
  sodiumMg?: number | null;
  caffeineMg?: number | null;
  vitaminB6Mg?: number | null;
  saturatedFatG?: number | null;
  supplementalMagnesiumMg?: number | null;
  magnesiumMg?: number | null;
}

/** Log an entry on a date through the API, as the owner's page does. */
export async function seedDay(
  { frontend }: Pick<FullApplication, "frontend">,
  {
    date,
    items,
    hour = 12,
    status,
  }: {
    date: string;
    items: SeedItem[];
    hour?: number;
    status?: "complete" | "pending";
  },
): Promise<string> {
  const json: MealInput = {
    consumedAt: at(date, hour),
    caption: "",
    ...(status ? { status } : {}),
    items,
  };
  const response = await frontend.api.meals.$post({ json });
  if (response.status !== 201) {
    throw new Error(`The seed entry was refused: ${response.status}`);
  }
  return (await response.json()).meal.id;
}

/** Change the settings through the API, as the settings form does. */
export async function patchSettings(
  { frontend }: Pick<FullApplication, "frontend">,
  json: Parameters<
    FullApplication["frontend"]["api"]["settings"]["$patch"]
  >[0]["json"],
) {
  const response = await frontend.api.settings.$patch({ json });
  if (response.status !== 200) {
    throw new Error(`The settings were refused: ${response.status}`);
  }
}

export async function saveWeight(
  { frontend }: Pick<FullApplication, "frontend">,
  logicalDate: string,
  weightKg: number,
) {
  const response = await frontend.api.weights.$put({
    json: { logicalDate, weightKg },
  });
  if (response.status !== 200) {
    throw new Error(`The weight was refused: ${response.status}`);
  }
}
