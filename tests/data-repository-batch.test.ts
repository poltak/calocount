import assert from "node:assert/strict";
import test from "node:test";

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { createMeal, updateMeal } from "../db/repository";

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

  constructor(
    private readonly meal: Row,
    private readonly items: Row[] = [],
  ) {}

  prepare(sql: string): D1PreparedStatement {
    this.preparedSql.push(sql);
    return new RecordingD1Statement(this, sql) as unknown as D1PreparedStatement;
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.batches.push(
      statements.map((statement) => {
        const recording = statement as unknown as RecordingD1Statement;
        return { sql: recording.sql, values: recording.values };
      }),
    );
    return Promise.resolve(statements.map(() => result<T>()));
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

  selectResult(sql: string): D1Result<Row> {
    if (sql.includes("meal_logs")) return result([this.meal]);
    if (sql.includes("meal_items")) return result(this.items);
    return result();
  }

  selectRaw(sql: string): unknown[][] {
    const rows = this.selectResult(sql).results;
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
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    return this.db.selectResult(this.sql) as D1Result<T>;
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
    return this.db.selectRaw(this.sql) as T[];
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

test("createMeal batches the meal insert before one item insert and keeps totals", async () => {
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

  assertBatchTables(client, ["meal_logs insert", "meal_items insert"]);
  const batch = client.batches[0] ?? [];
  const mealInsert = batch[0];
  const itemInsert = batch[1];
  assert.ok(mealInsert);
  assert.ok(itemInsert);
  assert.ok(mealInsert.values.includes(560));
  assert.ok(mealInsert.values.includes(55));
  assert.ok(mealInsert.values.includes(56));
  assert.ok(mealInsert.values.includes(9));
  assert.ok(itemInsert.values.includes(OWNER_KEY));
  assert.ok(itemInsert.values.includes("Chicken"));
  assert.ok(itemInsert.values.includes("Rice"));
  assertNoSqlTransaction(client);
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
