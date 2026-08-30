import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
  copyMeal,
  deleteMeal,
  findMeal,
  hasMealPhotoReference,
} from "../db/repository";

type Row = Record<string, unknown>;

const OWNER_KEY = "owner-1";
const OTHER_OWNER_KEY = "owner-2";
const PHOTO_KEY = "meals/source/original";

function result<T>(results: T[] = [], changes = 0): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

function mealRow({
  id,
  ownerKey = OWNER_KEY,
  photoKey = PHOTO_KEY,
}: {
  id: string;
  ownerKey?: string;
  photoKey?: string | null;
}): Row {
  return {
    id,
    owner_key: ownerKey,
    consumed_at: 1_700_000_000_000,
    source: "telegram",
    caption: "Chicken and rice",
    meal_type: "lunch",
    status: "complete",
    photo_key: photoKey,
    photo_mime_type: "image/jpeg",
    photo_size_bytes: 1234,
    total_calories: 560,
    total_protein_g: 55,
    total_carbs_g: 56,
    total_fat_g: 9,
    confidence: 0.8,
    assumptions_json: '["portion estimated"]',
    notes: "Lunch after training",
    external_request_id: null,
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
  };
}

function itemRow({ id, mealId, name, calories, proteinG, carbsG, fatG }: {
  id: string;
  mealId: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Row {
  return {
    id,
    meal_id: mealId,
    owner_key: OWNER_KEY,
    name,
    quantity: 1,
    unit: "serving",
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    confidence: 0.8,
    source: "telegram",
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
  };
}

class MemoryD1Database {
  readonly meals: Row[];
  readonly items: Row[];

  constructor(meals: Row[], items: Row[]) {
    this.meals = [...meals];
    this.items = [...items];
  }

  prepare(sql: string): D1PreparedStatement {
    return new MemoryD1Statement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    for (const statement of statements) {
      await (statement as unknown as MemoryD1Statement).run();
    }
    return statements.map(() => result<T>([], 1));
  }

  exec(_query: string): Promise<D1ExecResult> {
    void _query;
    return Promise.resolve({ count: 0, duration: 0 });
  }

  withSession(_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession {
    void _constraintOrBookmark;
    throw new Error("not used in meal copy tests");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  select(sql: string, values: unknown[]): D1Result<Row> {
    const lowerSql = sql.toLowerCase();
    if (lowerSql.includes('from "meal_logs"')) {
      const ownerKey = String(values[0] ?? "");
      let rows = this.meals.filter((meal) => meal.owner_key === ownerKey);
      if (lowerSql.includes('"meal_logs"."photo_key" =')) {
        rows = rows.filter((meal) => meal.photo_key === values[1]);
      } else if (lowerSql.includes('"meal_logs"."id" =')) {
        rows = rows.filter((meal) => meal.id === values[1]);
      }
      return result(rows.slice(0, 1));
    }
    if (lowerSql.includes('from "meal_items"')) {
      const ownerKey = String(values[0] ?? "");
      const mealId = String(values[1] ?? "");
      const rows = this.items
        .filter((item) => item.owner_key === ownerKey && item.meal_id === mealId)
        .sort((left, right) => Number(right.created_at) - Number(left.created_at));
      return result(rows);
    }
    return result();
  }

  selectRaw(sql: string, values: unknown[]): unknown[][] {
    const selection = sql.match(/^select\s+(.+?)\s+from\s+/i)?.[1];
    if (!selection) return [];
    const columns = selection.split(",").map((column) => column.trim().replace(/^.*\./, "").replaceAll('"', ""));
    const rows = this.select(sql, values).results;
    return rows.map((row) => columns.map((column) => row[column] ?? null));
  }

  write(sql: string, values: unknown[]): D1Result<Row> {
    const lowerSql = sql.toLowerCase();
    if (lowerSql.startsWith('insert into "meal_logs"')) {
      this.insertRows(this.meals, sql, values);
      return result([], 1);
    }
    if (lowerSql.startsWith('insert into "meal_items"')) {
      this.insertRows(this.items, sql, values);
      return result([], 1);
    }
    const deleteMatch = sql.match(/delete from "([^"]+)"/i);
    if (deleteMatch) {
      const table = deleteMatch[1];
      if (table === "meal_logs") this.removeRows(this.meals, values);
      if (table === "meal_items") this.removeRows(this.items, values);
      return result([], 1);
    }
    return result([], 1);
  }

  private insertRows(target: Row[], sql: string, values: unknown[]) {
    const columnsMatch = sql.match(/insert into "[^"]+" \(([^)]+)\)/i);
    if (!columnsMatch) throw new Error(`Could not parse insert: ${sql}`);
    const columns = columnsMatch[1].split(",").map((column) => column.trim().replaceAll('"', ""));
    for (let offset = 0; offset < values.length; offset += columns.length) {
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = values[offset + index];
      });
      target.push(row);
    }
  }

  private removeRows(target: Row[], values: unknown[]) {
    const ownerKey = values[0];
    const id = values[1];
    if (target === this.items) {
      for (let index = target.length - 1; index >= 0; index -= 1) {
        if (target[index]?.owner_key === ownerKey && target[index]?.meal_id === id) target.splice(index, 1);
      }
      return;
    }
    for (let index = target.length - 1; index >= 0; index -= 1) {
      if (target[index]?.owner_key === ownerKey && target[index]?.id === id) target.splice(index, 1);
    }
  }
}

class MemoryD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: MemoryD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    return this.db.select(this.sql, this.values) as D1Result<T>;
  }

  async first<T = Row>(): Promise<T | null> {
    const response = await this.all<T>();
    return response.results[0] ?? null;
  }

  async run<T = Row>(): Promise<D1Result<T>> {
    return this.db.write(this.sql, this.values) as D1Result<T>;
  }

  raw<T = unknown[]>(options: { readonly columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { readonly columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: { readonly columnNames?: boolean }): Promise<[string[], ...T[]] | T[]> {
    const rows = this.db.selectRaw(this.sql, this.values) as T[];
    if (options?.columnNames) {
      const selection = this.sql.match(/^select\s+(.+?)\s+from\s+/i)?.[1] ?? "";
      const columns = selection.split(",").map((column) => column.trim().replace(/^.*\./, "").replaceAll('"', ""));
      return [columns, ...rows] as [string[], ...T[]];
    }
    return rows;
  }
}

function createDb({ meals, items }: { meals: Row[]; items: Row[] }) {
  const client = new MemoryD1Database(meals, items);
  return { client, db: drizzle(client as unknown as D1Database, { schema }) };
}

test("copy route requires the owner identity and returns the serialized clone", async () => {
  const route = await readFile(new URL("../app/api/meals/[id]/copy/route.ts", import.meta.url), "utf8");

  assert.match(route, /export async function POST/);
  assert.match(route, /requireApiIdentity\(request\)/);
  assert.match(route, /copyMeal\(getRequestDb\(\), identity\.ownerKey/);
  assert.match(route, /serialiseMeal\(meal\)/);
  assert.match(route, /status: 201/);
  assert.doesNotMatch(route, /body\.ownerKey/);
});

test("copyMeal rejects a source meal that belongs to another owner", async () => {
  const { client, db } = createDb({
    meals: [mealRow({ id: "source", ownerKey: OTHER_OWNER_KEY })],
    items: [],
  });

  const copied = await copyMeal(db, OWNER_KEY, "source", { consumedAt: 1_800_000_000_000 });

  assert.equal(copied, null);
  assert.equal(client.meals.length, 1);
});

test("copyMeal creates fresh IDs, copies meal fields and items, and preserves the original", async () => {
  const sourceMeal = mealRow({ id: "source" });
  const sourceItems = [
    itemRow({ id: "item-1", mealId: "source", name: "Chicken", calories: 300, proteinG: 50, carbsG: 0, fatG: 8 }),
    itemRow({ id: "item-2", mealId: "source", name: "Rice", calories: 260, proteinG: 5, carbsG: 56, fatG: 1 }),
  ];
  const { client, db } = createDb({ meals: [sourceMeal], items: sourceItems });
  const targetTimestamp = 1_800_000_000_000;

  const copied = await copyMeal(db, OWNER_KEY, "source", { consumedAt: targetTimestamp });

  assert.ok(copied);
  assert.notEqual(copied.meal.id, sourceMeal.id);
  assert.equal(copied.meal.ownerKey, OWNER_KEY);
  assert.equal(copied.meal.consumedAt, targetTimestamp);
  assert.equal(copied.meal.caption, sourceMeal.caption);
  assert.equal(copied.meal.mealType, sourceMeal.meal_type);
  assert.equal(copied.meal.photoKey, PHOTO_KEY);
  assert.equal(copied.meal.photoMimeType, "image/jpeg");
  assert.equal(copied.meal.photoSizeBytes, 1234);
  assert.equal(copied.meal.notes, sourceMeal.notes);
  assert.deepEqual(copied.items.map((item) => item.name).sort(), ["Chicken", "Rice"]);
  assert.equal(copied.meal.totalCalories, 560);
  assert.equal(copied.meal.totalProteinG, 55);
  assert.equal(copied.meal.totalCarbsG, 56);
  assert.equal(copied.meal.totalFatG, 9);
  for (const item of copied.items) {
    assert.notEqual(item.mealId, "source");
    assert.ok(!sourceItems.some((sourceItem) => sourceItem.id === item.id));
  }

  const original = await findMeal(db, OWNER_KEY, "source");
  assert.deepEqual(original?.meal, {
    id: "source",
    ownerKey: OWNER_KEY,
    consumedAt: sourceMeal.consumed_at,
    source: sourceMeal.source,
    caption: sourceMeal.caption,
    mealType: sourceMeal.meal_type,
    status: sourceMeal.status,
    photoKey: PHOTO_KEY,
    photoMimeType: sourceMeal.photo_mime_type,
    photoSizeBytes: sourceMeal.photo_size_bytes,
    totalCalories: sourceMeal.total_calories,
    totalProteinG: sourceMeal.total_protein_g,
    totalCarbsG: sourceMeal.total_carbs_g,
    totalFatG: sourceMeal.total_fat_g,
    confidence: sourceMeal.confidence,
    assumptionsJson: sourceMeal.assumptions_json,
    notes: sourceMeal.notes,
    externalRequestId: null,
    createdAt: sourceMeal.created_at,
    updatedAt: sourceMeal.updated_at,
  });
  assert.equal(client.meals.length, 2);
  assert.equal(client.items.length, 4);
});

test("shared photo references prevent deletion of the R2 object until the last meal is removed", async () => {
  const { client, db } = createDb({
    meals: [mealRow({ id: "source" }), mealRow({ id: "copy" })],
    items: [],
  });

  await deleteMeal(db, OWNER_KEY, "source");
  assert.equal(await hasMealPhotoReference(db, OWNER_KEY, PHOTO_KEY), true);

  await deleteMeal(db, OWNER_KEY, "copy");
  assert.equal(await hasMealPhotoReference(db, OWNER_KEY, PHOTO_KEY), false);
  assert.equal(client.meals.length, 0);
});
