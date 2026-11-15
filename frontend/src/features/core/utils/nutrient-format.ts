import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  type NutrientGroup,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";

const GROUP_ORDER: NutrientGroup[] = [
  "carbohydrates",
  "fats",
  "vitamins",
  "minerals",
  "other",
];

const GROUP_LABELS: Record<NutrientGroup, string> = {
  carbohydrates: "Carbohydrates",
  fats: "Fats and lipids",
  vitamins: "Vitamins",
  minerals: "Minerals",
  other: "Other",
};

const metaByKey = new Map<string, (typeof NUTRIENT_META)[number]>(
  NUTRIENT_META.map((meta) => [meta.key, meta]),
);

export function nutrientLabel(key: NutrientKey): string {
  return metaByKey.get(key)?.label ?? key;
}

export function nutrientUnit(key: NutrientKey): string {
  return metaByKey.get(key)?.unit ?? "g";
}

export function nutrientGroupLabel(group: NutrientGroup): string {
  return GROUP_LABELS[group];
}

/** The nutrient keys in groups, in the order that the forms and the details show. */
export function groupedNutrientKeys(): {
  group: NutrientGroup;
  keys: NutrientKey[];
}[] {
  return GROUP_ORDER.map((group) => ({
    group,
    keys: NUTRIENT_KEYS.filter((key) => metaByKey.get(key)?.group === group),
  })).filter(({ keys }) => keys.length > 0);
}

const amountFormatters = new Map<number, Intl.NumberFormat>();

/** An amount with the precision of its nutrient, or a dash when it is unknown. */
export function formatNutrientAmount(
  value: number | null | undefined,
  key: NutrientKey,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const precision = metaByKey.get(key)?.precision ?? 1;
  let formatter = amountFormatters.get(precision);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: precision,
      minimumFractionDigits: 0,
    });
    amountFormatters.set(precision, formatter);
  }
  return formatter.format(value);
}

/** An amount with its unit, such as "6.5 g", or a dash when it is unknown. */
export function nutrientValueText(
  value: number | null | undefined,
  key: NutrientKey,
): string {
  const amount = formatNutrientAmount(value, key);
  return amount === "—" ? amount : `${amount} ${nutrientUnit(key)}`;
}

/** What a typed field means: blank or not a number is unknown, and zero is zero. */
export function parseNutrientText(text: string): number | null {
  if (text.trim() === "") {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
