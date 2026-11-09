/** The entry types that the dashboard can set. An entry may also have no type. */
export const ENTRY_KINDS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const entryKindLabels: Record<EntryKind, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Read a stored entry type. A value that the dashboard does not know counts as no type. */
export function entryKind(value: string | null | undefined): EntryKind | null {
  return (ENTRY_KINDS as readonly string[]).includes(value ?? "")
    ? (value as EntryKind)
    : null;
}

/** Suggest a type for a new entry from its HH:MM time. */
export function entryKindForTime(time: string): EntryKind {
  const hour = Number(time.slice(0, 2));
  if (!Number.isFinite(hour)) {
    return "snack";
  }
  if (hour >= 4 && hour < 11) {
    return "breakfast";
  }
  if (hour >= 11 && hour < 15) {
    return "lunch";
  }
  if (hour >= 17 && hour < 22) {
    return "dinner";
  }
  return "snack";
}
