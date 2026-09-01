import { parseArgs } from "node:util";

import { buildCompleteMealFixtures } from "../tests/fixtures/example-meals";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type SeedExampleMealsOptions = {
  anchorDate: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timezone?: string;
};

export type SeedExampleMealsResult = {
  inserted: number;
  skipped: number;
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function localBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || !LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error("The example seed can only write to a local HTTP server.");
  }
  return url;
}

export function logicalDateForTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    day: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function seedExampleMeals({
  anchorDate,
  baseUrl = "http://localhost:3000",
  fetchImpl = fetch,
  timezone = "Asia/Ho_Chi_Minh",
}: SeedExampleMealsOptions): Promise<SeedExampleMealsResult> {
  const origin = localBaseUrl(baseUrl);
  const fixtures = buildCompleteMealFixtures({ anchorDate, timezone });
  const timestamps = fixtures.map((meal) => meal.consumedAt);
  const listUrl = new URL("/api/meals", origin);
  listUrl.searchParams.set("from", String(Math.min(...timestamps)));
  listUrl.searchParams.set("to", String(Math.max(...timestamps) + 1));
  listUrl.searchParams.set("limit", "500");

  const existingResponse = await fetchImpl(listUrl);
  if (!existingResponse.ok) {
    throw new Error(`Could not list local meals: ${existingResponse.status} ${await existingResponse.text()}`);
  }
  const existingBody = await existingResponse.json() as { meals?: Array<{ id?: string }> };
  const existingIds = new Set((existingBody.meals ?? []).map((meal) => meal.id).filter(Boolean));
  let inserted = 0;
  let skipped = 0;

  for (const meal of fixtures) {
    if (existingIds.has(meal.id)) {
      skipped += 1;
      continue;
    }
    const response = await fetchImpl(new URL("/api/meals", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(meal),
    });
    if (!response.ok) {
      throw new Error(`Could not insert ${meal.id}: ${response.status} ${await response.text()}`);
    }
    inserted += 1;
  }

  return { inserted, skipped };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "anchor-date": { type: "string" },
      "base-url": { type: "string", default: "http://localhost:3000" },
      timezone: { type: "string", default: "Asia/Ho_Chi_Minh" },
    },
  });
  const timezone = values.timezone ?? "Asia/Ho_Chi_Minh";
  const anchorDate = values["anchor-date"] ?? logicalDateForTimezone(new Date(), timezone);
  const result = await seedExampleMeals({
    anchorDate,
    baseUrl: values["base-url"],
    timezone,
  });
  console.log(`Example meal seed complete for ${anchorDate}: ${result.inserted} inserted, ${result.skipped} skipped.`);
}

if (process.argv[1]?.endsWith("seed-example-meals.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
