import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  NUTRIENT_UPPER_LIMIT_KEYS,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import { NUTRIENT_VALUE_ORIGINS } from "@app/common/features/entries/utils/nutrient-provenance";
import { z } from "zod";

/** The largest amount of each source or form of a nutrient that the API accepts for one item. */
const UPPER_LIMIT_MAXIMUMS: Record<NutrientUpperLimitKey, number> = {
  preformedVitaminAMcgRae: 10_000_000,
  supplementalMagnesiumMg: 10_000_000,
  folicAcidMcg: 1_000_000,
  supplementalVitaminEMg: 10_000_000,
};

const nutrientAmount = (maximum: number) =>
  z.number().min(0).max(maximum).nullable().optional();

const nutrientFields = Object.fromEntries([
  ...NUTRIENT_META.map(({ key, maximum }) => [key, nutrientAmount(maximum)]),
  ...NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [
    key,
    nutrientAmount(UPPER_LIMIT_MAXIMUMS[key]),
  ]),
]) as Record<
  NutrientKey | NutrientUpperLimitKey,
  ReturnType<typeof nutrientAmount>
>;

const itemSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1, "Enter a name.").max(200),
  quantity: z.number().min(0).max(1_000).optional(),
  unit: z.string().trim().max(50).optional(),
  calories: z.number().min(0).max(100_000).optional(),
  proteinG: z.number().min(0).max(10_000).optional(),
  carbsG: z.number().min(0).max(10_000).optional(),
  fatG: z.number().min(0).max(10_000).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.string().trim().max(50).optional(),
  nutrientProvenance: z
    .partialRecord(z.enum(NUTRIENT_KEYS), z.enum(NUTRIENT_VALUE_ORIGINS))
    .nullable()
    .optional(),
  ...nutrientFields,
});

/** A time as a number of milliseconds, or as text that `Date` reads. */
const consumedAtSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((value, context) => {
    const milliseconds = typeof value === "number" ? value : Date.parse(value);
    if (
      !Number.isFinite(milliseconds) ||
      milliseconds < 0 ||
      !Number.isFinite(new Date(milliseconds).getTime())
    ) {
      context.addIssue({
        code: "custom",
        message: "consumedAt must be a valid timestamp.",
      });
      return z.NEVER;
    }
    return milliseconds;
  });

export const entryInputSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  consumedAt: consumedAtSchema.optional(),
  source: z.string().trim().max(50).optional(),
  caption: z.string().trim().max(4_000).optional(),
  mealType: z.string().trim().max(50).nullable().optional(),
  status: z
    .enum(["pending", "needs_input", "complete", "failed", "archived"])
    .optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  assumptions: z.array(z.unknown()).max(100).optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  items: z.array(itemSchema).max(100).optional(),
});

export const entryPatchSchema = entryInputSchema.extend({
  reason: z.string().trim().max(500).optional(),
});

export const copySchema = z.object({ consumedAt: consumedAtSchema.optional() });

export const savedEntryInputSchema = z.object({
  sourceEntryId: z.string().trim().min(1).max(120),
});

export const idParamSchema = z.object({
  id: z.string().trim().min(1).max(120),
});
