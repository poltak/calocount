import assert from "node:assert/strict";
import test from "node:test";

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { NUTRIENT_KEYS, type PartialNutrientValues } from "../domain/nutrients";
import { createMeal, createMealForExternalRequest, deleteMeal, findMeal, listMeals, updateMeal } from "../db/repository";

type Row = Record<string, unknown>;

const OWNER_KEY = "owner-1";

function result<T>(results: T[] = []): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changed_db: results.length > 0,
      changes: results.length,
    },
  };
}

function mealRow(id: string, ownerKey = OWNER_KEY): Row {
  return {
    id,
    owner_key: ownerKey,
    consumed_at: 1_700_000_000_000,
    source: "telegram",
    caption: "Chicken and rice",
    meal_type: "lunch",
    status: "complete",
    photo_key: null,
    photo_mime_type: null,
    photo_size_bytes: null,
    total_calories: 400,
    total_protein_g: 30,
    total_carbs_g: 40,
    total_fat_g: 10,
    confidence: 0.8,
    assumptions_json: "[]",
    notes: null,
    external_request_id: null,
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
  };
}

function itemRow(id: string, mealId: string, ownerKey = OWNER_KEY): Row {
  return {
    id,
    meal_id: mealId,
    owner_key: ownerKey,
    name: "Old item",
    quantity: 1,
    unit: "serving",
    calories: 400,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 10,
    confidence: 0.8,
    source: "telegram",
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
  };
}

class RecordingD1Database {
  readonly preparedSql: string[] = [];
  readonly batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
  private readonly maxBindings: number;
  private readonly persistInserts: boolean;
  private readonly persistedMeals: Row[];
  private readonly persistedItems: Row[];

  constructor(
    meal: Row,
    private readonly items: Row[] = [],
    options: { maxBindings?: number; persistInserts?: boolean; meals?: Row[] } = {},
  ) {
    this.maxBindings = options.maxBindings ?? Number.POSITIVE_INFINITY;
    this.persistInserts = options.persistInserts ?? false;
    this.persistedMeals = this.persistInserts ? [] : options.meals ?? [meal];
    this.persistedItems = this.persistInserts ? [] : items;
  }

  prepare(sql: string): D1PreparedStatement {
    this.preparedSql.push(sql);
    return new RecordingD1Statement(this, sql) as unknown as D1PreparedStatement;
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const batch = statements.map((statement) => {
      const recording = statement as unknown as RecordingD1Statement;
      if (recording.values.length > this.maxBindings) {
        throw new Error(`too_many_bindings: ${recording.values.length}`);
      }
      if (this.persistInserts) this.persistInsert(recording);
      return { sql: recording.sql, values: recording.values };
    });
    this.batches.push(batch);
    return Promise.resolve(statements.map(() => result<T>()));
  }

  private persistInsert(statement: RecordingD1Statement): void {
    const match = statement.sql.match(/insert\s+into\s+"([^"]+)"\s*\(([^)]+)\)\s+values/iu);
    if (!match) return;
    const [, table, columnList] = match;
    if (!table || !columnList) return;
    const columns = columnList.split(",").map((column) => column.trim().replace(/^"|"$/gu, ""));
    for (let offset = 0; offset < statement.values.length; offset += columns.length) {
      const row = Object.fromEntries(columns.map((column, index) => [column, statement.values[offset + index]]));
      if (table === "meal_logs") this.persistedMeals.push(row);
      if (table === "meal_items") this.persistedItems.push(row);
    }
  }

  exec(_query: string): Promise<D1ExecResult> {
    void _query;
    return Promise.resolve({ count: 0, duration: 0 });
  }

  withSession(_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession {
    void _constraintOrBookmark;
    throw new Error("not used in repository batch tests");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  validateBindings(values: unknown[]): void {
    if (values.length > this.maxBindings) throw new Error(`too_many_bindings: ${values.length}`);
  }

  selectResult(sql: string, values: unknown[] = []): D1Result<Row> {
    if (sql.includes("meal_logs")) return result(this.persistedMeals);
    if (sql.includes("meal_items")) {
      const items = this.persistInserts ? this.persistedItems : this.items;
      return result(sql.includes(" in (")
        ? items.filter((item) => item.owner_key === values[0] && values.slice(1).includes(item.meal_id))
        : items);
    }
    return result();
  }

  selectRaw(sql: string, values: unknown[]): unknown[][] {
    const rows = this.selectResult(sql, values).results;
    const selectedColumns = sql
      .replace(/^select\s+/iu, "")
      .split(/\s+from\s+/iu, 1)[0]
      ?.split(",")
      .map((column) => column.trim().replace(/^"|"$/gu, "").split(/\s+as\s+/iu, 1)[0]);
    if (!selectedColumns) return [];
    return rows.map((row) => selectedColumns.map((column) => row[column] ?? null));
  }
}

class RecordingD1Statement {
  values: unknown[] = [];

  constructor(
    private readonly db: RecordingD1Database,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.db.validateBindings(values);
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    return this.db.selectResult(this.sql, this.values) as D1Result<T>;
  }

  async first<T = Row>(): Promise<T | null> {
    const response = await this.all<T>();
    return response.results[0] ?? null;
  }

  async run<T = Row>(): Promise<D1Result<T>> {
    return result<T>();
  }

  raw<T = unknown[]>(options: { readonly columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { readonly columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(
    options?: { readonly columnNames?: boolean },
  ): Promise<[string[], ...T[]] | T[]> {
    if (options?.columnNames) return [[]] as [string[], ...T[]];
    return this.db.selectRaw(this.sql, this.values) as T[];
  }
}

function createRecordingDb(mealId: string, items: Row[] = []) {
  const client = new RecordingD1Database(mealRow(mealId), items);
  return { client, db: drizzle(client as unknown as D1Database, { schema }) };
}

function assertNoSqlTransaction(client: RecordingD1Database) {
  assert.doesNotMatch(client.preparedSql.join("\n"), /\b(begin|commit|rollback|savepoint)\b/i);
}

function assertBatchTables(
  client: RecordingD1Database,
  expectedTables: string[],
) {
  assert.equal(client.batches.length, 1);
  const batch = client.batches[0];
  assert.ok(batch);
  assert.deepEqual(
    batch.map(({ sql }) => {
      if (/insert into ["`]meal_logs["`]/i.test(sql)) return "meal_logs insert";
      if (/update ["`]meal_logs["`]/i.test(sql)) return "meal_logs update";
      if (/delete from ["`]meal_items["`]/i.test(sql)) return "meal_items delete";
      if (/delete from ["`]analysis_jobs["`]/i.test(sql)) return "analysis_jobs delete";
      if (/delete from ["`]meal_revisions["`]/i.test(sql)) return "meal_revisions delete";
      if (/delete from ["`]ai_runs["`]/i.test(sql)) return "ai_runs delete";
      if (/delete from ["`]telegram_updates["`]/i.test(sql)) return "telegram_updates delete";
      if (/delete from ["`]meal_logs["`]/i.test(sql)) return "meal_logs delete";
      if (/insert into ["`]meal_items["`]/i.test(sql)) return "meal_items insert";
      if (/insert into ["`]meal_revisions["`]/i.test(sql)) return "meal_revisions insert";
      return sql;
    }),
    expectedTables,
  );
}

test("createMeal batches one meal insert when there are no items", async () => {
  const { client, db } = createRecordingDb("meal-create-empty");

  await createMeal(db, OWNER_KEY, {
    id: "meal-create-empty",
    items: [],
  });

  assertBatchTables(client, ["meal_logs insert"]);
  const [mealInsert] = client.batches[0] ?? [];
  assert.ok(mealInsert);
  assert.match(mealInsert.sql, /total_calories/);
  assert.ok(mealInsert.values.includes(OWNER_KEY));
  assertNoSqlTransaction(client);
});

test("createMeal batches the meal insert before item inserts and keeps totals", async () => {
  const { client, db } = createRecordingDb("meal-create-items");

  await createMeal(db, OWNER_KEY, {
    id: "meal-create-items",
    items: [
      {
        name: "Chicken",
        quantity: 1,
        calories: 300,
        proteinG: 50,
        carbsG: 0,
        fatG: 8,
      },
      {
        name: "Rice",
        quantity: 1,
        calories: 260,
        proteinG: 5,
        carbsG: 56,
        fatG: 1,
      },
    ],
  });

  assertBatchTables(client, ["meal_logs insert", "meal_items insert", "meal_items insert"]);
  const batch = client.batches[0] ?? [];
  const mealInsert = batch[0];
  const itemInsert = batch[1];
  const secondItemInsert = batch[2];
  assert.ok(mealInsert);
  assert.ok(itemInsert);
  assert.ok(secondItemInsert);
  assert.ok(mealInsert.values.includes(560));
  assert.ok(mealInsert.values.includes(55));
  assert.ok(mealInsert.values.includes(56));
  assert.ok(mealInsert.values.includes(9));
  assert.ok(itemInsert.values.includes(OWNER_KEY));
  assert.ok(itemInsert.values.includes("Chicken"));
  assert.ok(secondItemInsert.values.includes("Rice"));
  assertNoSqlTransaction(client);
});

test("createMeal creates and retrieves four complete nutrient items within the D1 binding limit", async () => {
  const mealId = "meal-create-complete-nutrients";
  const client = new RecordingD1Database(mealRow(mealId), [], {
    maxBindings: 100,
    persistInserts: true,
  });
  const db = drizzle(client as unknown as D1Database, { schema });
  const items = Array.from({ length: 4 }, (_, index) => {
    const nutrients = Object.fromEntries(
      NUTRIENT_KEYS.map((key, nutrientIndex) => [key, index + nutrientIndex / 10 + 1]),
    ) as PartialNutrientValues;
    return {
      name: `Complete item ${index + 1}`,
      quantity: 1,
      unit: "serving",
      calories: 100 + index,
      proteinG: 10 + index,
      carbsG: 20 + index,
      fatG: 5 + index,
      ...nutrients,
      confidence: 1,
      source: "fixture",
    };
  });

  const created = await createMeal(db, OWNER_KEY, { id: mealId, items });
  const retrieved = await findMeal(db, OWNER_KEY, mealId);

  assert.ok(retrieved);
  assert.equal(client.batches.length, 1);
  assert.deepEqual(
    client.batches[0]?.map(({ sql }) => sql.includes('"meal_logs"') ? "meal_logs insert" : "meal_items insert"),
    ["meal_logs insert", "meal_items insert", "meal_items insert", "meal_items insert", "meal_items insert"],
  );
  assert.ok(client.batches[0]?.slice(1).every(({ values }) => values.length <= 100));
  assert.equal(created.items.length, 4);
  assert.equal(retrieved.items.length, 4);
  assert.deepEqual(retrieved.items.map((item) => item.name), items.map((item) => item.name));
  assert.deepEqual(retrieved.items.map((item) => item.fiberG), items.map((item) => item.fiberG));
  assert.deepEqual(retrieved.items.map((item) => item.caffeineMg), items.map((item) => item.caffeineMg));
  assert.equal(retrieved.items[3]?.seleniumMcg, items[3]?.seleniumMcg);
  assertNoSqlTransaction(client);
});

test("external meal writes batch conflict-safe meal and item inserts", async () => {
  const { client, db } = createRecordingDb("meal-external-request");
  const requestId = "c5a84680-d0c7-4af6-a4f5-89495c3923ec";

  await createMealForExternalRequest(db, OWNER_KEY, requestId, {
    name: "Chicken rice",
    kcal: 610,
    protein: 58,
    carbs: 41,
    fat: 20,
    consumedAt: 1_700_000_000_000,
  });

  assertBatchTables(client, ["meal_logs insert", "meal_items insert"]);
  const [mealInsert, itemInsert] = client.batches[0] ?? [];
  assert.ok(mealInsert);
  assert.ok(itemInsert);
  assert.match(mealInsert.sql, /on conflict \("meal_logs"\."external_request_id"\) do nothing/i);
  assert.match(itemInsert.sql, /on conflict \("meal_items"\."id"\) do nothing/i);
  assert.ok(mealInsert.values.includes(requestId));
  assert.ok(itemInsert.values.includes(`item_external_${requestId}`));
  assertNoSqlTransaction(client);
});

test("listMeals retrieves 500 meals and their owned items within the D1 binding limit", async () => {
  const meals = Array.from({ length: 500 }, (_, index) => mealRow(`meal-list-${index}`));
  const items = meals.map((meal, index) => itemRow(`item-list-${index}`, String(meal.id)));
  const client = new RecordingD1Database(meals[0]!, [
    ...items,
    itemRow("other-owner-item", String(meals[0]!.id), "other-owner"),
  ], { maxBindings: 100, meals });
  const db = drizzle(client as unknown as D1Database, { schema });

  const listed = await listMeals(db, OWNER_KEY, { limit: 500 });

  assert.equal(listed.length, 500);
  assert.deepEqual(listed.map(({ items: mealItems }) => mealItems.map((item) => item.id)),
    items.map((item) => [item.id]));
  assert.equal(client.preparedSql.filter((sql) => sql.includes('from "meal_items"')).length, 6);
});

test("updateMeal keeps 100 replacement items and the revision in one D1-safe batch", async () => {
  const mealId = "meal-update-many-items";
  const client = new RecordingD1Database(mealRow(mealId), [], { maxBindings: 100 });
  const db = drizzle(client as unknown as D1Database, { schema });
  const items = Array.from({ length: 100 }, (_, index) => ({
    name: `Replacement ${index}`,
    calories: 10,
    ...Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 1])),
  }));

  await updateMeal(db, OWNER_KEY, mealId, { items });

  assert.equal(client.batches.length, 1);
  const batch = client.batches[0]!;
  const inserts = batch.filter(({ sql }) => sql.includes('insert into "meal_items"'));
  assert.equal(inserts.length, 100);
  assert.ok(batch.every(({ values }) => values.length <= 100));
  assert.ok(batch[0]!.values.includes(1_000));
  assert.match(batch[1]!.sql, /delete from "meal_items"/);
  assert.match(batch.at(-1)!.sql, /insert into "meal_revisions"/);
  const revision = batch.at(-1)!.values.find((value) => typeof value === "string" && value.includes("Replacement 99"));
  assert.equal(JSON.parse(String(revision)).items.length, 100);
});

test("updateMeal batches meal update and revision when items are not replaced", async () => {
  const { client, db } = createRecordingDb("meal-update-no-items", [
    itemRow("old-item", "meal-update-no-items"),
  ]);

  await updateMeal(
    db,
    OWNER_KEY,
    "meal-update-no-items",
    { caption: "Updated caption", reason: "manual correction" },
  );

  assertBatchTables(client, ["meal_logs update", "meal_revisions insert"]);
  const batch = client.batches[0] ?? [];
  assert.ok(batch[0]?.values.includes(OWNER_KEY));
  assert.ok(batch[1]?.values.some((value) => String(value).includes("Updated caption")));
  assert.ok(batch[1]?.values.some((value) => String(value).includes("manual correction")));
  assertNoSqlTransaction(client);
});

test("updateMeal batches replacement delete, insert, and revision atomically", async () => {
  const { client, db } = createRecordingDb("meal-update-items", [
    itemRow("old-item", "meal-update-items"),
  ]);

  await updateMeal(
    db,
    OWNER_KEY,
    "meal-update-items",
    {
      items: [{ name: "New item", calories: 123, proteinG: 10, carbsG: 20, fatG: 4 }],
      reason: "replace estimate",
    },
  );

  assertBatchTables(client, [
    "meal_logs update",
    "meal_items delete",
    "meal_items insert",
    "meal_revisions insert",
  ]);
  const batch = client.batches[0] ?? [];
  assert.ok(batch[0]?.values.includes(123));
  assert.ok(batch[0]?.values.includes(10));
  assert.ok(batch[0]?.values.includes(20));
  assert.ok(batch[0]?.values.includes(4));
  assert.ok(batch[1]?.values.includes(OWNER_KEY));
  assert.ok(batch[1]?.values.includes("meal-update-items"));
  assert.ok(batch[2]?.values.includes("New item"));
  assert.ok(batch[3]?.values.some((value) => String(value).includes("replace estimate")));
  assertNoSqlTransaction(client);
});

test("updateMeal defaults revision reason from source and keeps explicit reasons", async () => {
  const dashboard = createRecordingDb("meal-update-dashboard-reason", [
    itemRow("old-item", "meal-update-dashboard-reason"),
  ]);
  await updateMeal(
    dashboard.db,
    OWNER_KEY,
    "meal-update-dashboard-reason",
    { caption: "Dashboard edit" },
    "dashboard",
  );
  const dashboardRevision = dashboard.client.batches[0]?.find(({ sql }) => /meal_revisions/i.test(sql));
  assert.ok(dashboardRevision);
  assert.ok(dashboardRevision.values.includes("dashboard"));
  assert.ok(dashboardRevision.values.includes("edit"));

  const correction = createRecordingDb("meal-update-correction-reason", [
    itemRow("old-item", "meal-update-correction-reason"),
  ]);
  await updateMeal(
    correction.db,
    OWNER_KEY,
    "meal-update-correction-reason",
    { caption: "Correction" },
    "correction",
  );
  const correctionRevision = correction.client.batches[0]?.find(({ sql }) => /meal_revisions/i.test(sql));
  assert.ok(correctionRevision);
  assert.equal(correctionRevision.values.filter((value) => value === "correction").length, 2);

  const explicit = createRecordingDb("meal-update-explicit-reason", [
    itemRow("old-item", "meal-update-explicit-reason"),
  ]);
  await updateMeal(
    explicit.db,
    OWNER_KEY,
    "meal-update-explicit-reason",
    { caption: "Explicit reason", reason: "nutrition correction" },
    "dashboard",
  );
  const explicitRevision = explicit.client.batches[0]?.find(({ sql }) => /meal_revisions/i.test(sql));
  assert.ok(explicitRevision);
  assert.ok(explicitRevision.values.includes("nutrition correction"));
  assert.ok(!explicitRevision.values.includes("edit"));
});

test("deleteMeal batches dependent rows before the meal and returns its snapshot", async () => {
  const { client, db } = createRecordingDb("meal-delete", [
    itemRow("old-item", "meal-delete"),
  ]);

  const deleted = await deleteMeal(db, OWNER_KEY, "meal-delete");

  assert.equal(deleted?.meal.id, "meal-delete");
  assertBatchTables(client, [
    "meal_items delete",
    "analysis_jobs delete",
    "meal_revisions delete",
    "ai_runs delete",
    "telegram_updates delete",
    "meal_logs delete",
  ]);
  const batch = client.batches[0] ?? [];
  for (const statement of batch) {
    assert.ok(statement.values.includes(OWNER_KEY));
    assert.ok(statement.values.includes("meal-delete"));
  }
  assertNoSqlTransaction(client);
});
