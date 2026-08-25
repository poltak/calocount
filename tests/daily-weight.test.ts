import assert from "node:assert/strict";
import test from "node:test";

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { upsertDailyWeight } from "../db/repository";

type Row = Record<string, unknown>;

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
      changed_db: results.length > 0,
      changes: results.length,
    },
  };
}

class WeightD1Database {
  readonly rows: Row[] = [];
  readonly preparedSql: string[] = [];

  prepare(sql: string): D1PreparedStatement {
    this.preparedSql.push(sql);
    return new WeightD1Statement(this, sql) as unknown as D1PreparedStatement;
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
    throw new Error("not used in daily weight tests");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  select(values: unknown[]): D1Result<Row> {
    const [ownerKey, logicalDate] = values.filter(
      (value): value is string => typeof value === "string",
    );
    return result(this.rows.filter((row) => (
      row.owner_key === ownerKey && row.logical_date === logicalDate
    )));
  }

  upsert(sql: string, values: unknown[]): D1Result {
    const columnsMatch = sql.match(/insert into ["`]daily_weights["`] \(([^)]+)\)/i);
    assert.ok(columnsMatch);
    const columns = columnsMatch[1]
      .split(",")
      .map((column) => column.trim().replaceAll(/["`]/g, ""));
    const inserted = Object.fromEntries(
      columns.map((column, index) => [column, values[index]]),
    );
    const existing = this.rows.find((row) => (
      row.owner_key === inserted.owner_key && row.logical_date === inserted.logical_date
    ));

    if (existing) {
      const updateValues = values.slice(columns.length);
      existing.weight_kg = updateValues[0];
      existing.recorded_at = updateValues[1];
      existing.updated_at = updateValues[2];
    } else {
      this.rows.push(inserted);
    }
    return result();
  }
}

class WeightD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: WeightD1Database,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve(this.db.upsert(this.sql, this.values) as D1Result<T>);
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    return this.db.select(this.values) as D1Result<T>;
  }

  async get<T = Row>(): Promise<T | null> {
    return (this.db.select(this.values).results[0] as T | undefined) ?? null;
  }

  async raw<T = unknown[]>(
    _options?: { readonly columnNames?: boolean },
  ): Promise<T[]> {
    void _options;
    return this.db.select(this.values).results.map((row) => Object.values(row)) as T[];
  }
}

test("daily weight saves one row per owner and date and refreshes the recorded time", async () => {
  const database = new WeightD1Database();
  const db = drizzle(database as unknown as D1Database, { schema });
  const originalDateNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;

  try {
    const first = await upsertDailyWeight({
      db,
      ownerKey: "owner-1",
      input: { logicalDate: "2025-06-15", weightKg: 73.4 },
    });
    assert.equal(first.weightKg, 73.4);
    assert.equal(first.recordedAt, now);

    now += 60_000;
    const second = await upsertDailyWeight({
      db,
      ownerKey: "owner-1",
      input: { logicalDate: "2025-06-15", weightKg: 73.1 },
    });
    assert.equal(database.rows.length, 1);
    assert.equal(second.id, first.id);
    assert.equal(second.weightKg, 73.1);
    assert.equal(second.recordedAt, now);
    assert.match(database.preparedSql.join("\n"), /on conflict \([^)]*owner_key[^)]*logical_date[^)]*\) do update/i);
  } finally {
    Date.now = originalDateNow;
  }
});
