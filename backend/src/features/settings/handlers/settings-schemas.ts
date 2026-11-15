import { isValidTimeZone } from "@app/common/features/core/utils/logical-date";
import {
  PROTEIN_GOAL_MODES,
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
} from "@app/common/features/goals/utils/daily-targets";
import {
  NUTRIENT_META,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";
import { z } from "zod";

const nutrientTarget = (maximum: number) =>
  z
    .number()
    .gt(0, "Enter a goal above zero, or leave it blank.")
    .max(maximum)
    .nullable()
    .optional();

const nutrientTargets = z.strictObject(
  Object.fromEntries(
    NUTRIENT_META.map(({ key, maximum }) => [key, nutrientTarget(maximum)]),
  ) as Record<NutrientKey, ReturnType<typeof nutrientTarget>>,
);

export const settingsPatchSchema = z.object({
  timezone: z
    .string()
    .trim()
    .max(100)
    .refine(isValidTimeZone, "Choose a valid timezone.")
    .optional(),
  // The old app stores whole calories.
  dailyCalorieTarget: z
    .number()
    .min(0)
    .max(100_000)
    .nullable()
    .transform((value) => (value === null ? null : Math.round(value)))
    .optional(),
  dailyProteinTargetG: z.number().min(0).max(10_000).nullable().optional(),
  proteinGoalMode: z.enum(PROTEIN_GOAL_MODES).optional(),
  dailyProteinTargetPerKg: z
    .number()
    .min(PROTEIN_PER_KG_MIN)
    .max(PROTEIN_PER_KG_MAX)
    .nullable()
    .optional(),
  nutrientTargets: nutrientTargets.nullable().optional(),
  vitaminB6UsFnbAdultUlEnabled: z.boolean().optional(),
  usFnbAdultUlEnabled: z.boolean().optional(),
  partnerProfileEnabled: z.boolean().optional(),
  publicViewEnabled: z.boolean().optional(),
});
