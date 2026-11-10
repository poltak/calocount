import type { DailyWeightRow } from "../storage/types.js";

/** A weight as the old app sends it: the row without the owner key. */
export function serialiseWeight(row: DailyWeightRow) {
  return {
    id: row.id,
    logicalDate: row.logicalDate,
    weightKg: row.weightKg,
    recordedAt: row.recordedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type DailyWeight = ReturnType<typeof serialiseWeight>;
