import assert from "node:assert/strict";
import test from "node:test";

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getDashboardSummary, isValidTimeZone } from "../db/repository";

type Row = Record<string, unknown>;

const OWNER_KEY = "owner-1";
const OTHER_OWNER = "owner-2";
const DAY_MS = 86_400_000;

function result<T>(results: T[] = []): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: 0,
      last_row_id: 0,
      changed_db: false,
      changes: 0,
    },
  };
}

function mealRow(
  id: string,
  ownerKey: string,
  consumedAt: number,
  calories: number,
  proteinG: number,
): Row {
  return {
    id,
    owner_key: ownerKey,
    consumed_at: consumedAt,
    source: "dashboard",
    caption: id,
    meal_type: "meal",
    status: "complete",
    photo_key: null,
    photo_mime_type: null,
    photo_size_bytes: null,
    total_calories: calories,
    total_protein_g: proteinG,
    total_carbs_g: calories / 10,
    total_fat_g: calories / 20,
    confidence: 1,
    assumptions_json: "[]",
    notes: null,
    created_at: consumedAt,
    updated_at: consumedAt,
  };
}

function settingsRow(ownerKey: string, timezone = "UTC"): Row {
  return {
    id: `settings_${ownerKey}`,
    owner_key: ownerKey,
    telegram_user_id: null,
    telegram_chat_id: null,
    timezone,
    daily_calorie_target: 2_000,
    daily_protein_target_g: 150,
    active_ai_profile_id: null,
    photo_retention_days: 30,
    created_at: 0,
    updated_at: 0,
  };
}

function weightRow(
  id: string,
  ownerKey: string,
  logicalDate: string,
  weightKg: number,
  recordedAt: number,
): Row {
  return {
    id,
    owner_key: ownerKey,
    logical_date: logicalDate,
    weight_kg: weightKg,
    recorded_at: recordedAt,
    created_at: recordedAt,
    updated_at: recordedAt,
  };
}

class SummaryD1Database {
  constructor(
    readonly meals: Row[],
    readonly settings: Row,
    readonly weights: Row[],
  ) {}

  prepare(sql: string): D1PreparedStatement {
    return new SummaryD1Statement(this, sql) as unknown as D1PreparedStatement;
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return Promise.resolve(statements.map(() => result<T>()));
  }

  exec(_query: string): Promise<D1ExecResult> {
    void _query;
    return Promise.resolve({ count: 0, duration: 0 });
  }

  withSession(_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession {
    void _constraintOrBookmark;
    throw new Error("not used in summary tests");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  query(sql: string, values: unknown[]): D1Result<Row> {
    if (sql.includes('from "settings"')) {
      const ownerKey = values.find((value): value is string => typeof value === "string");
      return ownerKey === this.settings.owner_key ? result([this.settings]) : result();
    }

    if (sql.includes('from "meal_items"')) return result();

    if (sql.includes('from "daily_weights"')) {
      const [ownerKey, from, to] = values.filter(
        (value): value is string => typeof value === "string",
      );
      return result(this.weights
        .filter((weight) => (
          weight.owner_key === ownerKey
          && String(weight.logical_date) >= String(from)
          && String(weight.logical_date) <= String(to)
        ))
        .sort((left, right) => String(right.logical_date).localeCompare(String(left.logical_date)))
        .slice(0, 366));
    }

    const ownerKey = values.find((value): value is string => typeof value === "string");
    const timestamps = values.filter(
      (value): value is number => typeof value === "number" && value > 1_000_000_000,
    );
    const from = Math.min(...timestamps);
    const to = Math.max(...timestamps);
    const completeOnly = sql.includes('"meal_logs"."status" = ?');
    const rows = this.meals.filter((meal) => {
      const consumedAt = Number(meal.consumed_at);
      return meal.owner_key === ownerKey
        && consumedAt >= from
        && consumedAt < to
        && (!completeOnly || meal.status === "complete");
    });

    if (sql.includes("coalesce(sum")) {
      return result([{
        calories: rows.reduce((total, meal) => total + Number(meal.total_calories), 0),
        proteinG: rows.reduce((total, meal) => total + Number(meal.total_protein_g), 0),
        carbsG: rows.reduce((total, meal) => total + Number(meal.total_carbs_g), 0),
        fatG: rows.reduce((total, meal) => total + Number(meal.total_fat_g), 0),
        mealCount: rows.length,
      }]);
    }

    return result(rows
      .sort((left, right) => Number(right.consumed_at) - Number(left.consumed_at))
      .slice(0, 500));
  }
}

class SummaryD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: SummaryD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    return this.db.query(this.sql, this.values) as D1Result<T>;
  }

  async get<T = Row>(): Promise<T | null> {
    const response = this.db.query(this.sql, this.values);
    return (response.results[0] as T | undefined) ?? null;
  }

  async raw<T = unknown[]>(
    _options?: { readonly columnNames?: boolean },
  ): Promise<T[]> {
    void _options;
    return this.db.query(this.sql, this.values).results.map((row) => Object.values(row)) as T[];
  }
}

function createSummaryDb(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const meals: Row[] = [];
  for (let day = 0; day < 7; day += 1) {
    const dayStart = start.getTime() - day * DAY_MS;
    for (let meal = 0; meal < 2; meal += 1) {
      meals.push(mealRow(
        `meal-${day}-${meal}`,
        OWNER_KEY,
        dayStart + (meal + 1) * 3_600_000,
        300 + day * 20 + meal * 40,
        25 + day + meal * 5,
      ));
    }
  }
  meals.push(mealRow("outside-before", OWNER_KEY, start.getTime() - 7 * DAY_MS, 999, 99));
  meals.push(mealRow("outside-after", OWNER_KEY, start.getTime() + DAY_MS, 999, 99));
  meals.push(mealRow("other-owner", OTHER_OWNER, start.getTime() + 3_600_000, 999, 99));
  const weights = Array.from({ length: 7 }, (_, day) => {
    const logicalDate = new Date(start.getTime() - day * DAY_MS).toISOString().slice(0, 10);
    return weightRow(`weight-${day}`, OWNER_KEY, logicalDate, 73 + day / 10, start.getTime() + day);
  });
  weights.push(weightRow(
    "outside-weight",
    OWNER_KEY,
    new Date(start.getTime() - 7 * DAY_MS).toISOString().slice(0, 10),
    99,
    start.getTime(),
  ));
  weights.push(weightRow(
    "other-owner-weight",
    OTHER_OWNER,
    start.toISOString().slice(0, 10),
    99,
    start.getTime(),
  ));
  return {
    start,
    meals,
    weights,
    db: drizzle(
      new SummaryD1Database(meals, settingsRow(OWNER_KEY), weights) as unknown as D1Database,
      { schema },
    ),
  };
}

test("dashboard summary returns all seven-day meals, weights, and matching totals", async () => {
  const now = new Date("2025-06-15T12:00:00Z");
  const { db, start, meals } = createSummaryDb(now);
  const summary = await getDashboardSummary(db, OWNER_KEY, { now, timezone: "UTC" });

  const expectedMeals = meals.filter((meal) => (
    meal.owner_key === OWNER_KEY
    && Number(meal.consumed_at) >= start.getTime() - 6 * DAY_MS
    && Number(meal.consumed_at) < start.getTime() + DAY_MS
  ));
  const expectedCalories = expectedMeals.reduce((total, meal) => total + Number(meal.total_calories), 0);
  const expectedProtein = expectedMeals.reduce((total, meal) => total + Number(meal.total_protein_g), 0);
  const todayMeals = expectedMeals.filter((meal) => Number(meal.consumed_at) >= start.getTime());
  const completedDayMeals = expectedMeals.filter((meal) => Number(meal.consumed_at) < start.getTime());

  assert.equal(summary.recentMeals.length, 14);
  assert.deepEqual(
    summary.recentMeals.map(({ meal }) => meal.id),
    expectedMeals.map((meal) => meal.id).sort((left, right) => (
      Number(meals.find((meal) => meal.id === right)?.consumed_at)
      - Number(meals.find((meal) => meal.id === left)?.consumed_at)
    )),
  );
  assert.equal(summary.today.calories, todayMeals.reduce((total, meal) => total + Number(meal.total_calories), 0));
  assert.equal(summary.today.proteinG, todayMeals.reduce((total, meal) => total + Number(meal.total_protein_g), 0));
  assert.equal(summary.today.mealCount, 2);
  assert.equal(summary.sevenDay.calories, expectedCalories);
  assert.equal(summary.sevenDay.proteinG, expectedProtein);
  assert.equal(summary.sevenDay.averageCalories, completedDayMeals.reduce((total, meal) => total + Number(meal.total_calories), 0) / 6);
  assert.equal(summary.sevenDay.averageProteinG, completedDayMeals.reduce((total, meal) => total + Number(meal.total_protein_g), 0) / 6);
  assert.equal(summary.sevenDay.daysWithMeals, 7);
  assert.ok(!summary.recentMeals.some(({ meal }) => ["outside-before", "outside-after", "other-owner"].includes(meal.id)));
  assert.equal(summary.recentWeights.length, 7);
  assert.deepEqual(
    summary.recentWeights.map((weight) => weight.logicalDate),
    Array.from({ length: 7 }, (_, day) => (
      new Date(start.getTime() - day * DAY_MS).toISOString().slice(0, 10)
    )),
  );
  assert.ok(!summary.recentWeights.some((weight) => weight.id === "outside-weight" || weight.id === "other-owner-weight"));
});

test("dashboard summary applies the 9pm cutoff in the requested timezone", async () => {
  const meals = [
    ...Array.from({ length: 6 }, (_, index) => {
      const date = `2026-08-${String(24 + index).padStart(2, "0")}`;
      return mealRow(`meal-${date}`, OWNER_KEY, Date.parse(`${date}T05:00:00.000Z`), 1_000, 100);
    }),
    mealRow("meal-2026-08-30", OWNER_KEY, Date.parse("2026-08-30T05:00:00.000Z"), 2_000, 200),
  ];

  async function load(now: string) {
    const db = drizzle(
      new SummaryD1Database(meals, settingsRow(OWNER_KEY), []) as unknown as D1Database,
      { schema },
    );
    return getDashboardSummary(db, OWNER_KEY, {
      now: new Date(now),
      timezone: "Asia/Ho_Chi_Minh",
    });
  }

  const beforeCutoff = await load("2026-08-30T13:59:59.000Z");
  const atCutoff = await load("2026-08-30T14:00:00.000Z");

  assert.equal(beforeCutoff.date, "2026-08-30");
  assert.equal(beforeCutoff.sevenDay.calories, 8_000);
  assert.equal(beforeCutoff.sevenDay.averageCalories, 1_000);
  assert.equal(beforeCutoff.sevenDay.averageProteinG, 100);
  assert.equal(atCutoff.sevenDay.calories, 8_000);
  assert.equal(atCutoff.sevenDay.averageCalories, 8_000 / 7);
  assert.equal(atCutoff.sevenDay.averageProteinG, 800 / 7);
});

test("dashboard summary uses the requested timezone for local day boundaries and grouping", async () => {
  const consumedAt = Date.parse("2026-08-25T23:30:00.000Z");
  const boundaryMeal = mealRow("boundary-meal", OWNER_KEY, consumedAt, 450, 30);
  const db = drizzle(
    new SummaryD1Database([boundaryMeal], settingsRow(OWNER_KEY), []) as unknown as D1Database,
    { schema },
  );
  const summary = await getDashboardSummary(db, OWNER_KEY, {
    now: new Date("2026-08-26T12:00:00.000Z"),
    timezone: "Asia/Ho_Chi_Minh",
  });

  assert.equal(summary.date, "2026-08-26");
  assert.equal(summary.today.calories, 450);
  assert.equal(summary.today.proteinG, 30);
  assert.equal(summary.today.mealCount, 1);
  assert.equal(summary.sevenDay.calories, 450);
  assert.equal(summary.sevenDay.proteinG, 30);
  assert.equal(summary.sevenDay.daysWithMeals, 1);
  assert.deepEqual(summary.recentMeals.map(({ meal }) => meal.id), ["boundary-meal"]);
});

for (const scenario of [
  {
    date: "2026-03-08",
    timezone: "America/Havana",
    now: "2026-03-08T12:00:00.000Z",
    previous: "2026-03-08T04:59:59.000Z",
    current: "2026-03-08T05:00:00.000Z",
  },
  {
    date: "2026-09-06",
    timezone: "America/Santiago",
    now: "2026-09-06T12:00:00.000Z",
    previous: "2026-09-06T03:59:59.000Z",
    current: "2026-09-06T04:00:00.000Z",
  },
]) {
  test(`dashboard summary handles a midnight DST jump in ${scenario.timezone}`, async () => {
    const meals = [
      mealRow("previous-local-date", OWNER_KEY, Date.parse(scenario.previous), 100, 10),
      mealRow("first-local-date", OWNER_KEY, Date.parse(scenario.current), 450, 30),
    ];
    const db = drizzle(
      new SummaryD1Database(meals, settingsRow(OWNER_KEY), []) as unknown as D1Database,
      { schema },
    );
    const summary = await getDashboardSummary(db, OWNER_KEY, {
      now: new Date(scenario.now),
      timezone: scenario.timezone,
    });

    assert.equal(summary.date, scenario.date);
    assert.equal(summary.today.calories, 450);
    assert.equal(summary.today.mealCount, 1);
    assert.equal(summary.sevenDay.calories, 550);
    assert.equal(summary.sevenDay.daysWithMeals, 2);
  });
}

test("public summaries keep UTC when the timezone is missing or invalid", async () => {
  assert.equal(isValidTimeZone("Asia/Ho_Chi_Minh"), true);
  assert.equal(isValidTimeZone("Not/A_Timezone"), false);

  const db = drizzle(
    new SummaryD1Database([], settingsRow(OWNER_KEY, "Asia/Ho_Chi_Minh"), []) as unknown as D1Database,
    { schema },
  );
  const now = new Date("2026-08-25T23:30:00.000Z");
  const summary = await getDashboardSummary(db, OWNER_KEY, { now, timezone: "Not/A_Timezone" });
  const publicSummary = await getDashboardSummary(db, OWNER_KEY, { now });
  assert.equal(summary.date, "2026-08-25");
  assert.equal(publicSummary.date, "2026-08-25");
});
