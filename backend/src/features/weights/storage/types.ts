import type { Selectable } from "kysely";

/**
 * The table comes from the old app (`backend/migrations/0001`), and it keeps
 * its columns. The owner has one weight for each logical date.
 */
interface DailyWeightTable {
  id: string;
  ownerKey: string;
  /** The day, as `YYYY-MM-DD`. */
  logicalDate: string;
  weightKg: number;
  /** When the owner saved the weight, as milliseconds since the Unix epoch. */
  recordedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface WeightsTables {
  dailyWeights: DailyWeightTable;
}

export type DailyWeightRow = Selectable<DailyWeightTable>;
export type NewDailyWeight = DailyWeightTable;
