import { NUTRIENT_KEYS, type NutrientKey } from "./nutrients";

/**
 * The origin of one recorded nutrient value. This is deliberately separate
 * from a meal item's generic `source`, which describes how the item entered
 * the log and cannot prove where each nutrient number came from.
 */
export const NUTRIENT_VALUE_ORIGINS = ["manual", "label", "database", "ai"] as const;
export type NutrientValueOrigin = (typeof NUTRIENT_VALUE_ORIGINS)[number];
export type NutrientProvenanceMap = Partial<Record<NutrientKey, NutrientValueOrigin>>;

export const nutrientValueOriginLabels: Record<NutrientValueOrigin, string> = {
  manual: "Manual entry",
  label: "Nutrition label",
  database: "Food database",
  ai: "AI estimate",
};

export function isNutrientValueOrigin(value: unknown): value is NutrientValueOrigin {
  return typeof value === "string" && (NUTRIENT_VALUE_ORIGINS as readonly string[]).includes(value);
}

function isKnownNutrientValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Parse only explicit, supported provenance values. When nutrient values are
 * supplied, provenance is retained only for known numeric values; this keeps
 * null and legacy values visibly unknown and prevents stale origin metadata
 * from surviving a cleared field.
 */
export function parseNutrientProvenance(
  value: unknown,
  nutrientValues?: Partial<Record<NutrientKey, unknown>>,
): NutrientProvenanceMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const result: NutrientProvenanceMap = {};
  for (const key of NUTRIENT_KEYS) {
    const origin = record[key];
    if (!isNutrientValueOrigin(origin)) continue;
    if (nutrientValues && !isKnownNutrientValue(nutrientValues[key])) continue;
    result[key] = origin;
  }
  return result;
}

export function nutrientValueOriginLabel(origin: NutrientValueOrigin | null | undefined) {
  return origin ? nutrientValueOriginLabels[origin] : "Origin unknown";
}

export function hasNutrientProvenance(value: NutrientProvenanceMap | null | undefined): value is NutrientProvenanceMap {
  return Boolean(value && Object.keys(value).length > 0);
}
