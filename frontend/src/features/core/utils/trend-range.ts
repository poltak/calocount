/** The trend charts show the past 7 or 30 days, and share one choice. */
export type TrendRange = 7 | 30;

export function parseTrendRange(value: string): TrendRange {
  return value === "30" ? 30 : 7;
}
