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

/** D1 allows 100 bound values in a statement, and the query of the items also binds the owner. */
const MEAL_ID_CHUNK_SIZE = 40;

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

  async findEntryByRequestId({
    ownerKey,
    requestId,
  }: {
    ownerKey: string;
    requestId: string;
  }): Promise<MealWithItems | undefined> {
    const meal = await this.deps.db
      .selectFrom("mealLogs")
      .select("id")
      .where("ownerKey", "=", ownerKey)
      .where("externalRequestId", "=", requestId)
      .executeTakeFirst();
    return meal ? this.findEntry({ ownerKey, id: meal.id }) : undefined;
  }

  /** The entries that agents logged with these request IDs. An ID with no entry has no result. */
  async listEntriesByRequestIds({
    ownerKey,
    requestIds,
  }: {
    ownerKey: string;
    requestIds: string[];
  }): Promise<MealWithItems[]> {
    const meals = [];
    for (
      let start = 0;
      start < requestIds.length;
      start += MEAL_ID_CHUNK_SIZE
    ) {
      meals.push(
        ...(await this.deps.db
          .selectFrom("mealLogs")
          .selectAll()
          .where("ownerKey", "=", ownerKey)
          .where(
            "externalRequestId",
            "in",
            requestIds.slice(start, start + MEAL_ID_CHUNK_SIZE),
          )
          .execute()),
      );
    }
    return this.attachItems({ ownerKey, meals });
  }

  /**
   * One page of complete entries from `from` up to, not including, `to`,
   * newest first. The cursor is the last entry of the page before.
   */
  async listCompleteEntriesPage({
    ownerKey,
    from,
    to,
    limit,
    cursor,
  }: {
    ownerKey: string;
    from: number;
    to: number;
    limit: number;
    cursor: { consumedAt: number; id: string } | null;
  }): Promise<{ entries: MealWithItems[]; hasMore: boolean }> {
    let query = this.deps.db
      .selectFrom("mealLogs")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("status", "=", "complete")
      .where("consumedAt", ">=", from)
      .where("consumedAt", "<", to);
    if (cursor) {
      query = query.where((expression) =>
        expression.or([
          expression("consumedAt", "<", cursor.consumedAt),
          expression.and([
            expression("consumedAt", "=", cursor.consumedAt),
            expression("id", "<", cursor.id),
          ]),
        ]),
      );
    }
    const meals = await query
      .orderBy("consumedAt", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute();
    return {
      entries: await this.attachItems({
        ownerKey,
        meals: meals.slice(0, limit),
      }),
      hasMore: meals.length > limit,
    };
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

  /**
   * The statements of an entry that an agent logs. A retry with the same
   * request ID, and a second item with the same ID, change nothing, so
   * parallel retries cannot save a meal twice.
   */
  planInsertExternalEntry({
    meal,
    items,
  }: {
    meal: NewMealLog;
    items: NewMealItem[];
  }): PlannedStatement<never>[] {
    const { db } = this.deps;
    return [
      planWrite(
        db
          .insertInto("mealLogs")
          .values(meal)
          .onConflict((conflict) =>
            conflict.column("externalRequestId").doNothing(),
          ),
      ),
      ...items.map((item) =>
        planWrite(
          db
            .insertInto("mealItems")
            .values(item)
            .onConflict((conflict) => conflict.column("id").doNothing()),
        ),
      ),
    ];
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

  private async attachItems({
    ownerKey,
    meals,
  }: {
    ownerKey: string;
    meals: MealWithItems["meal"][];
  }): Promise<MealWithItems[]> {
    const itemsByMeal = new Map<string, MealWithItems["items"]>();
    for (let start = 0; start < meals.length; start += MEAL_ID_CHUNK_SIZE) {
      const items = await this.deps.db
        .selectFrom("mealItems")
        .selectAll()
        .where("ownerKey", "=", ownerKey)
        .where(
          "mealId",
          "in",
          meals.slice(start, start + MEAL_ID_CHUNK_SIZE).map(({ id }) => id),
        )
        .orderBy("createdAt", "desc")
        .orderBy(sql`rowid`)
        .execute();
      for (const item of items) {
        const group = itemsByMeal.get(item.mealId);
        if (group) {
          group.push(item);
        } else {
          itemsByMeal.set(item.mealId, [item]);
        }
      }
    }
    return meals.map((meal) => ({
      meal,
      items: itemsByMeal.get(meal.id) ?? [],
    }));
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
