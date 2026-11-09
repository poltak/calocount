import type { FullApplication } from "../../core/tests/full-application.js";
import { entryViewOf, type EntryView } from "../utils/entry-view.js";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/** The first moment of today in UTC, by the clock of the test backend. */
export function startOfToday({ backend }: Pick<FullApplication, "backend">) {
  return Math.floor(backend.services.clock.now() / DAY_MS) * DAY_MS;
}

/** Today's date in UTC, as the dashboard names it. */
export function todayKey(app: Pick<FullApplication, "backend">) {
  return new Date(startOfToday(app)).toISOString().slice(0, 10);
}

/** The date `days` before today. */
export function dateAgo(app: Pick<FullApplication, "backend">, days: number) {
  return new Date(startOfToday(app) - days * DAY_MS).toISOString().slice(0, 10);
}

interface SeedItem {
  name: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number | null;
  sodiumMg?: number | null;
  folicAcidMcg?: number | null;
}

export interface SeedEntry {
  name?: string;
  calories?: number;
  proteinG?: number;
  consumedAt?: number;
  caption?: string;
  mealType?: string;
  status?: "complete" | "pending";
  items?: SeedItem[];
}

/** Log an entry through the API, as the owner's page does, and return its ID. */
export async function seedEntry(
  { frontend }: Pick<FullApplication, "frontend">,
  entry: SeedEntry = {},
): Promise<string> {
  const response = await frontend.api.meals.$post({
    json: {
      ...(entry.consumedAt === undefined
        ? {}
        : { consumedAt: entry.consumedAt }),
      caption: entry.caption ?? "",
      ...(entry.mealType === undefined ? {} : { mealType: entry.mealType }),
      ...(entry.status === undefined ? {} : { status: entry.status }),
      items: entry.items ?? [
        {
          name: entry.name ?? "Oats",
          calories: entry.calories ?? 300,
          proteinG: entry.proteinG ?? 10,
        },
      ],
    },
  });
  if (response.status !== 201) {
    throw new Error(`The seed entry was refused: ${response.status}`);
  }
  return (await response.json()).meal.id;
}

/** An entry of today as the dashboard lists it, to start an edit or an action from. */
export async function readEntryView(
  app: Pick<FullApplication, "backend" | "frontend">,
  id: string,
  date = todayKey(app),
): Promise<EntryView> {
  const response = await app.frontend.api.days[":date"].$get({
    param: { date },
    query: { timezone: "UTC" },
  });
  if (response.status !== 200) {
    throw new Error(`The day was refused: ${response.status}`);
  }
  const { meals } = await response.json();
  const entry = meals.find((meal) => meal.id === id);
  if (!entry) {
    throw new Error("The seed entry is not in the day");
  }
  return entryViewOf({ entry, timeZone: "UTC" });
}
