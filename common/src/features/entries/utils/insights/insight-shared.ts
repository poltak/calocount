/** The grouping key for a food name. Every insight panel must group foods the same way. */
export function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase();
}
