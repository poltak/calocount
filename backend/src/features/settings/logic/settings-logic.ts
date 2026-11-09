import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";

type SettingsProps = BackendLogicProps<"settings">;

/** What the dashboard shows for an owner who set no goal yet. */
const DEFAULT_CALORIE_TARGET = 2400;
const DEFAULT_PROTEIN_TARGET_G = 160;

export interface DailyTargets {
  calories: number;
  /** `null` when the goal depends on a weight that the app does not read yet. */
  proteinG: number | null;
}

/** The goals of the owner. */
export class SettingsLogic extends Logic<SettingsProps, Record<string, never>> {
  constructor(deps: SettingsProps) {
    super({ deps, initialState: {} });
  }

  async dailyTargets({
    ownerKey,
  }: {
    ownerKey: string;
  }): Promise<DailyTargets> {
    const row = await this.deps.storage.settings.findSettings({ ownerKey });
    // A goal per kilogram needs the weight of the day, which a later phase reads.
    const proteinFromWeight = row?.proteinGoalMode === "gramsPerKg";
    return {
      calories: row?.dailyCalorieTarget ?? DEFAULT_CALORIE_TARGET,
      proteinG: proteinFromWeight
        ? null
        : (row?.dailyProteinTargetG ?? DEFAULT_PROTEIN_TARGET_G),
    };
  }
}
