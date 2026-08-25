import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
  createShareLink,
  resolveShareLink,
  revokeShareLink,
} from "../db/repository";
import { generateShareToken, hashShareToken, isValidShareToken } from "../db/share-links";
import { projectPublicDashboardSummary } from "../app/api/share/_lib/projection";

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

class ShareLinksD1Database {
  readonly links: Row[] = [];

  prepare(sql: string): D1PreparedStatement {
    return new ShareLinksD1Statement(this, sql) as unknown as D1PreparedStatement;
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return Promise.all(statements.map((statement) => (
      (statement as unknown as ShareLinksD1Statement).run<T>()
    )));
  }

  exec(_query: string): Promise<D1ExecResult> {
    void _query;
    return Promise.resolve({ count: 0, duration: 0 });
  }

  withSession(_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession {
    void _constraintOrBookmark;
    throw new Error("not used in share link tests");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  execute(sql: string, values: unknown[]): D1Result<Row> {
    if (/^insert into ["`]share_links/i.test(sql)) {
      const [id, ownerKey, tokenHash, label, createdAt, expiresAt, revokedAt] = values;
      this.links.push({
        id,
        owner_key: ownerKey,
        token_hash: tokenHash,
        label,
        created_at: createdAt,
        expires_at: expiresAt,
        revoked_at: revokedAt,
      });
      return result();
    }
    if (/^update ["`]share_links/i.test(sql)) {
      const [revokedAt, ownerKey, id] = values;
      const link = this.links.find((candidate) => candidate.owner_key === ownerKey && candidate.id === id);
      if (link) link.revoked_at = revokedAt;
      return result();
    }
    if (/from ["`]share_links/i.test(sql)) {
      const hasTokenFilter = /"token_hash"\s*=/.test(sql);
      const hasOwnerFilter = /"owner_key"\s*=/.test(sql);
      const hasIdFilter = /"id"\s*=/.test(sql);
      const tokenHash = hasTokenFilter ? values[0] : undefined;
      const ownerKey = hasTokenFilter ? undefined : hasOwnerFilter ? values[0] : undefined;
      const id = hasTokenFilter ? undefined : hasIdFilter ? values[1] : undefined;
      let matches = this.links.filter((link) => {
        if (hasTokenFilter && link.token_hash !== tokenHash) return false;
        if (hasOwnerFilter && link.owner_key !== ownerKey) return false;
        if (hasIdFilter && id != null && link.id !== id) return false;
        return true;
      });
      if (sql.includes("order by")) matches = matches.slice().sort((left, right) => Number(right.created_at) - Number(left.created_at));
      if (sql.includes("limit")) matches = matches.slice(0, 1);
      return result(matches);
    }
    return result();
  }
}

class ShareLinksD1Statement {
  values: unknown[] = [];

  constructor(
    private readonly db: ShareLinksD1Database,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    return this.db.execute(this.sql, this.values) as D1Result<T>;
  }

  async get<T = Row>(): Promise<T | null> {
    const rows = this.db.execute(this.sql, this.values).results;
    return (rows[0] as T | undefined) ?? null;
  }

  async run<T = Row>(): Promise<D1Result<T>> {
    return this.db.execute(this.sql, this.values) as D1Result<T>;
  }

  raw<T = unknown[]>(options?: { readonly columnNames?: boolean }): Promise<T[]> {
    if (options?.columnNames) return Promise.resolve([] as T[]);
    const rows = this.db.execute(this.sql, this.values).results;
    return Promise.resolve(rows.map((row) => Object.values(row)) as T[]);
  }
}

function createShareLinksDb() {
  const client = new ShareLinksD1Database();
  return { client, db: drizzle(client as unknown as D1Database, { schema }) };
}

test("share tokens use 32 random bytes and hash to SHA-256", async () => {
  const token = generateShareToken();
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(isValidShareToken(token), true);
  assert.equal(isValidShareToken(`${token}x`), false);
  assert.equal(isValidShareToken("not-a-token"), false);

  const hash = await hashShareToken(token);
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  await assert.rejects(hashShareToken("not-a-token"), /invalid_share_token/);
});

test("share links expire and revoke without storing the raw token", async () => {
  const { client, db } = createShareLinksDb();
  const expiring = await createShareLink(db, "owner-1", { expiresAt: 2_000 });
  assert.ok(!client.links.some((link) => Object.values(link).includes(expiring.token)));
  assert.ok(await resolveShareLink(db, expiring.token, 1_999));
  assert.equal(await resolveShareLink(db, expiring.token, 2_000), null);

  const revocable = await createShareLink(db, "owner-1");
  assert.ok(await resolveShareLink(db, revocable.token, 2_000));
  const revoked = await revokeShareLink(db, "owner-1", revocable.id);
  assert.ok((revoked?.revokedAt ?? 0) > 0);
  assert.equal(await resolveShareLink(db, revocable.token, 2_000), null);
  assert.equal(await revokeShareLink(db, "other-owner", revocable.id), null);
});

test("public summary projection contains trend and no private fields", () => {
  const summary = {
    date: "2026-08-25",
    targets: { calories: 2_100, proteinG: 150 },
    today: { calories: 2_337, proteinG: 120, carbsG: 220, fatG: 80, mealCount: 2 },
    sevenDay: {
      calories: 12_000,
      proteinG: 800,
      averageCalories: 1_714,
      averageProteinG: 114,
      daysWithMeals: 7,
    },
    recentMeals: [{
      meal: {
        id: "meal-1",
        ownerKey: "owner-secret",
        consumedAt: Date.parse("2026-08-25T12:00:00Z"),
        source: "telegram",
        caption: "private caption",
        mealType: "lunch",
        status: "complete",
        photoKey: "raw/photo-key",
        photoMimeType: "image/jpeg",
        photoSizeBytes: 123,
        totalCalories: 2_337,
        totalProteinG: 120,
        totalCarbsG: 220,
        totalFatG: 80,
        confidence: 0.9,
        assumptionsJson: "[\"private\"]",
        notes: "private note",
        createdAt: 1,
        updatedAt: 1,
      },
      items: [{
        id: "item-1",
        mealId: "meal-1",
        ownerKey: "owner-secret",
        name: "Rice bowl",
        quantity: 1,
        unit: "serving",
        calories: 2_337,
        proteinG: 120,
        carbsG: 220,
        fatG: 80,
        confidence: 0.9,
        source: "ai",
        createdAt: 1,
        updatedAt: 1,
      }],
    }, {
      meal: {
        id: "meal-pending",
        ownerKey: "owner-secret",
        consumedAt: Date.parse("2026-08-25T13:00:00Z"),
        source: "telegram",
        caption: "pending caption",
        mealType: "dinner",
        status: "pending",
        photoKey: "raw/pending-photo-key",
        photoMimeType: "image/jpeg",
        photoSizeBytes: 456,
        totalCalories: 999,
        totalProteinG: 50,
        totalCarbsG: 90,
        totalFatG: 30,
        confidence: 0.2,
        assumptionsJson: "[\"private\"]",
        notes: "pending note",
        createdAt: 1,
        updatedAt: 1,
      },
      items: [],
    }, {
      meal: {
        id: "meal-failed",
        ownerKey: "owner-secret",
        consumedAt: Date.parse("2026-08-25T14:00:00Z"),
        source: "telegram",
        caption: "failed caption",
        mealType: "snack",
        status: "failed",
        photoKey: "raw/failed-photo-key",
        photoMimeType: "image/jpeg",
        photoSizeBytes: 789,
        totalCalories: 888,
        totalProteinG: 40,
        totalCarbsG: 70,
        totalFatG: 20,
        confidence: 0.1,
        assumptionsJson: "[\"private\"]",
        notes: "failed note",
        createdAt: 1,
        updatedAt: 1,
      },
      items: [],
    }],
    recentWeights: [{
      id: "weight-1",
      ownerKey: "owner-secret",
      logicalDate: "2026-08-25",
      weightKg: 74.5,
      recordedAt: Date.parse("2026-08-25T07:30:00Z"),
      createdAt: 1,
      updatedAt: 2,
    }],
  } as never;

  const projection = projectPublicDashboardSummary(summary);
  assert.equal(projection.sevenDay.trend.length, 7);
  assert.equal(projection.sevenDay.trend.at(-1)?.calories, 2_337);
  assert.deepEqual(projection.recentMeals.map((meal) => meal.id), ["meal-1"]);
  assert.deepEqual(projection.recentMeals[0], {
    id: "meal-1",
    consumedAt: Date.parse("2026-08-25T12:00:00Z"),
    mealType: "lunch",
    totalCalories: 2_337,
    totalProteinG: 120,
    totalCarbsG: 220,
    totalFatG: 80,
    items: [{ name: "Rice bowl", quantity: 1, unit: "serving", calories: 2_337, proteinG: 120, carbsG: 220, fatG: 80 }],
  });
  assert.equal("status" in (projection.recentMeals[0] ?? {}), false);
  assert.deepEqual(projection.recentWeights, [{
    logicalDate: "2026-08-25",
    weightKg: 74.5,
    recordedAt: Date.parse("2026-08-25T07:30:00Z"),
  }]);
  assert.deepEqual(Object.keys(projection.recentWeights[0] ?? {}).sort(), [
    "logicalDate",
    "recordedAt",
    "weightKg",
  ]);
  assert.equal("id" in (projection.recentWeights[0] ?? {}), false);

  const serialised = JSON.stringify(projection);
  for (const field of [
    "ownerKey", "createdAt", "updatedAt", "photoKey", "caption", "notes",
    "assumptions", "confidence", "source", "provider", "telegram", "export", "rawUsage", "photoMimeType",
  ]) assert.doesNotMatch(serialised, new RegExp(field, "i"));
});
