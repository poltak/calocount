import { sql } from "kysely";
import {
  planQuery,
  planWrite,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import type {
  MealWithItems,
  NewMealItem,
  NewMealLog,
  NewMealRevision,
  SavedEntryRow,
} from "./types.js";

/** The entries of the owner with their items, the revisions of their edits, and the saved entries. */
export class EntriesStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  // ---------- Entries ----------

  async findEntry({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<MealWithItems | undefined> {
    const { db } = this.deps;
    const meal = await db
      .selectFrom("mealLogs")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("id", "=", id)
      .executeTakeFirst();
    if (!meal) {
      return undefined;
    }
    const items = await db
      .selectFrom("mealItems")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("mealId", "=", id)
      // Items of one batch share a time, and `rowid` keeps the order that the owner typed.
      .orderBy("createdAt", "desc")
      .orderBy(sql`rowid`)
      .execute();
    return { meal, items };
  }

  /** The entries from `from` up to, not including, `to`, newest first. */
  async listEntriesInRange({
    ownerKey,
    from,
    to,
  }: {
    ownerKey: string;
    from: number;
    to: number;
  }): Promise<MealWithItems[]> {
    const { db } = this.deps;
    const [meals, items] = await Promise.all([
      db
        .selectFrom("mealLogs")
        .selectAll()
        .where("ownerKey", "=", ownerKey)
        .where("consumedAt", ">=", from)
        .where("consumedAt", "<", to)
        .orderBy("consumedAt", "desc")
        .orderBy("id", "desc")
        .execute(),
      db
        .selectFrom("mealItems")
        .innerJoin("mealLogs", "mealLogs.id", "mealItems.mealId")
        .selectAll("mealItems")
        .where("mealLogs.ownerKey", "=", ownerKey)
        .where("mealLogs.consumedAt", ">=", from)
        .where("mealLogs.consumedAt", "<", to)
        .where("mealItems.ownerKey", "=", ownerKey)
        .orderBy("mealItems.createdAt", "desc")
        .orderBy(sql`meal_items.rowid`)
        .execute(),
    ]);
    const itemsByMeal = new Map<string, typeof items>();
    for (const item of items) {
      const group = itemsByMeal.get(item.mealId);
      if (group) {
        group.push(item);
      } else {
        itemsByMeal.set(item.mealId, [item]);
      }
    }
    return meals.map((meal) => ({
      meal,
      items: itemsByMeal.get(meal.id) ?? [],
    }));
  }

  /** When the owner's earliest complete entry was eaten, or `undefined` for an owner without one. */
  async findFirstCompleteConsumedAt({
    ownerKey,
  }: {
    ownerKey: string;
  }): Promise<number | undefined> {
    const row = await this.deps.db
      .selectFrom("mealLogs")
      .select("consumedAt")
      .where("ownerKey", "=", ownerKey)
      .where("status", "=", "complete")
      .orderBy("consumedAt")
      .limit(1)
      .executeTakeFirst();
    return row?.consumedAt;
  }

  /** One statement for the entry and one for each item. D1 limits the values of a statement, so a multi-row insert of items does not fit. */
  planInsertEntry({
    meal,
    items,
  }: {
    meal: NewMealLog;
    items: NewMealItem[];
  }): PlannedStatement<never>[] {
    const { db } = this.deps;
    return [
      planQuery(db.insertInto("mealLogs").values(meal)),
      ...items.map((item) =>
        planQuery(db.insertInto("mealItems").values(item)),
      ),
    ];
  }

  planUpdateEntry({
    ownerKey,
    id,
    changes,
  }: {
    ownerKey: string;
    id: string;
    changes: Partial<Omit<NewMealLog, "id" | "ownerKey" | "createdAt">>;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("mealLogs")
        .set(changes)
        .where("ownerKey", "=", ownerKey)
        .where("id", "=", id),
    );
  }

  /** The delete comes first, so the new items take the place of the old ones. */
  planReplaceItems({
    ownerKey,
    mealId,
    items,
  }: {
    ownerKey: string;
    mealId: string;
    items: NewMealItem[];
  }): PlannedStatement<never>[] {
    const { db } = this.deps;
    return [
      planWrite(
        db
          .deleteFrom("mealItems")
          .where("ownerKey", "=", ownerKey)
          .where("mealId", "=", mealId),
      ),
      ...items.map((item) =>
        planQuery(db.insertInto("mealItems").values(item)),
      ),
    ];
  }

  planInsertRevision(revision: NewMealRevision): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("mealRevisions").values(revision));
  }

  /** Delete an entry and the records of its analysis. The entry goes last, in case the tables get foreign keys. */
  planDeleteEntry({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): PlannedStatement<never>[] {
    const { db } = this.deps;
    return [
      planWrite(
        db
          .deleteFrom("mealItems")
          .where("ownerKey", "=", ownerKey)
          .where("mealId", "=", id),
      ),
      planWrite(
        db
          .deleteFrom("analysisJobs")
          .where("ownerKey", "=", ownerKey)
          .where("mealId", "=", id),
      ),
      planWrite(
        db
          .deleteFrom("mealRevisions")
          .where("ownerKey", "=", ownerKey)
          .where("mealId", "=", id),
      ),
      planWrite(
        db
          .deleteFrom("aiRuns")
          .where("ownerKey", "=", ownerKey)
          .where("mealId", "=", id),
      ),
      planWrite(
        db
          .deleteFrom("mealLogs")
          .where("ownerKey", "=", ownerKey)
          .where("id", "=", id),
      ),
    ];
  }

  // ---------- Saved entries ----------

  listSavedEntries({
    ownerKey,
  }: {
    ownerKey: string;
  }): Promise<SavedEntryRow[]> {
    return this.deps.db
      .selectFrom("savedEntries")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .orderBy("createdAt", "desc")
      .orderBy("id")
      .execute();
  }

  findSavedEntry({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<SavedEntryRow | undefined> {
    return this.deps.db
      .selectFrom("savedEntries")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("id", "=", id)
      .executeTakeFirst();
  }

  findSavedEntryOfSource({
    ownerKey,
    sourceMealId,
  }: {
    ownerKey: string;
    sourceMealId: string;
  }): Promise<SavedEntryRow | undefined> {
    return this.deps.db
      .selectFrom("savedEntries")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("sourceMealId", "=", sourceMealId)
      .executeTakeFirst();
  }

  /** Saving the same entry again replaces its snapshot. */
  planUpsertSavedEntry(saved: SavedEntryRow): PlannedStatement<never> {
    return planQuery(
      this.deps.db
        .insertInto("savedEntries")
        .values(saved)
        .onConflict((conflict) =>
          conflict.columns(["ownerKey", "sourceMealId"]).doUpdateSet({
            snapshotJson: saved.snapshotJson,
            updatedAt: saved.updatedAt,
          }),
        ),
    );
  }

  planDeleteSavedEntry({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .deleteFrom("savedEntries")
        .where("ownerKey", "=", ownerKey)
        .where("id", "=", id),
    );
  }
}
