import { NUTRIENT_KEYS, type NutrientKey } from "./nutrients.js";

/**
 * Where a recorded nutrient value came from. It is separate from the generic
 * `source` of an item, which says how the item entered the log and cannot say
 * where each nutrient number came from.
 */
export const NUTRIENT_VALUE_ORIGINS = [
  "manual",
  "label",
  "database",
  "ai",
] as const;
export type NutrientValueOrigin = (typeof NUTRIENT_VALUE_ORIGINS)[number];
export type NutrientProvenanceMap = Partial<
  Record<NutrientKey, NutrientValueOrigin>
>;

const originLabels: Record<NutrientValueOrigin, string> = {
  manual: "Manual entry",
  label: "Nutrition label",
  database: "Food database",
  ai: "AI estimate",
};

export function isNutrientValueOrigin(
  value: unknown,
): value is NutrientValueOrigin {
  return (
    typeof value === "string" &&
    (NUTRIENT_VALUE_ORIGINS as readonly string[]).includes(value)
  );
}

/**
 * Read only supported origins. When nutrient values are given, an origin stays
 * only for a known value. A blank or old value then stays visibly unknown, and
 * the origin of a cleared field does not survive.
 */
export function parseNutrientProvenance(
  value: unknown,
  nutrientValues?: Partial<Record<NutrientKey, unknown>>,
): NutrientProvenanceMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const result: NutrientProvenanceMap = {};
  for (const key of NUTRIENT_KEYS) {
    const origin = record[key];
    if (!isNutrientValueOrigin(origin)) {
      continue;
    }
    const known = nutrientValues?.[key];
    if (
      nutrientValues &&
      !(typeof known === "number" && Number.isFinite(known) && known >= 0)
    ) {
      continue;
    }
    result[key] = origin;
  }
  return result;
}

export function nutrientValueOriginLabel(
  origin: NutrientValueOrigin | null | undefined,
): string {
  return origin ? originLabels[origin] : "Origin unknown";
}
