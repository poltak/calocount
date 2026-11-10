import type { ProteinGoalMode } from "@app/common/features/goals/utils/daily-targets";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";

/** The settings that one request changes. A field that is absent stays as it is. */
export interface SettingsPatch {
  timezone?: string | undefined;
  dailyCalorieTarget?: number | null | undefined;
  dailyProteinTargetG?: number | null | undefined;
  proteinGoalMode?: ProteinGoalMode | undefined;
  dailyProteinTargetPerKg?: number | null | undefined;
  /** `null` removes every override, so each nutrient goes back to its default. */
  nutrientTargets?:
    Partial<Record<NutrientKey, number | null | undefined>> | null | undefined;
  vitaminB6UsFnbAdultUlEnabled?: boolean | undefined;
  usFnbAdultUlEnabled?: boolean | undefined;
  partnerProfileEnabled?: boolean | undefined;
  publicViewEnabled?: boolean | undefined;
}
