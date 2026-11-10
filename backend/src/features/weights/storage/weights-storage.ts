import type { BackendStorageProps } from "../../core/storage/types.js";
import type { DailyWeightRow, NewDailyWeight } from "./types.js";

/** The daily weights of the owner. */
export class WeightsStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  findDay({
    ownerKey,
    date,
  }: {
    ownerKey: string;
    date: string;
  }): Promise<DailyWeightRow | undefined> {
    return this.deps.db
      .selectFrom("dailyWeights")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("logicalDate", "=", date)
      .executeTakeFirst();
  }

  /** The weight of the latest day up to and including `date`. */
  findLatestOnOrBefore({
    ownerKey,
    date,
  }: {
    ownerKey: string;
    date: string;
  }): Promise<DailyWeightRow | undefined> {
    return this.deps.db
      .selectFrom("dailyWeights")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("logicalDate", "<=", date)
      .orderBy("logicalDate", "desc")
      .executeTakeFirst();
  }

  /** The weights from `from` to `to`, both included, oldest first. */
  listRange({
    ownerKey,
    from,
    to,
  }: {
    ownerKey: string;
    from: string;
    to: string;
  }): Promise<DailyWeightRow[]> {
    return this.deps.db
      .selectFrom("dailyWeights")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("logicalDate", ">=", from)
      .where("logicalDate", "<=", to)
      .orderBy("logicalDate")
      .execute();
  }

  /** A second weight for the same day replaces the first and keeps its ID. */
  async upsertDay(weight: NewDailyWeight): Promise<DailyWeightRow> {
    return this.deps.db
      .insertInto("dailyWeights")
      .values(weight)
      .onConflict((conflict) =>
        conflict.columns(["ownerKey", "logicalDate"]).doUpdateSet({
          weightKg: weight.weightKg,
          recordedAt: weight.recordedAt,
          updatedAt: weight.updatedAt,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
