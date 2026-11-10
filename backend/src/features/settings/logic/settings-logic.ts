import { Logic } from "@app/common/features/core/logic/logic";
import { resolveTimeZone } from "@app/common/features/core/utils/logical-date";
import {
  DEFAULT_CALORIE_TARGET,
  DEFAULT_PROTEIN_TARGET_G,
  normaliseProteinGoalMode,
  type ProteinGoalMode,
} from "@app/common/features/goals/utils/daily-targets";
import {
  parseNutrientGoalOverridesJson,
  resolveNutrientGoals,
  type NutrientGoalMap,
} from "@app/common/features/entries/utils/nutrient-goals";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { NewSettings, SettingsRow } from "../storage/types.js";
import type { SettingsPatch } from "../utils/settings-patch.js";

type SettingsProps = BackendLogicProps<"settings", "clock"> &
  BackendAtomicProps;

const MAX_GOAL_CHANGES = 50;

/** The goals that apply to the dashboard, with the old defaults for a goal that the owner never set. */
export interface DailyGoals {
  calories: number;
  proteinMode: ProteinGoalMode;
  fixedProteinG: number;
  /** `null` when the owner never set a goal per kilogram. */
  proteinGramsPerKg: number | null;
  nutrients: NutrientGoalMap;
}

interface GoalValues {
  dailyCalorieTarget: number | null;
  proteinGoalMode: ProteinGoalMode;
  dailyProteinTargetG: number | null;
  dailyProteinTargetPerKg: number | null;
}

/** The protein value of the mode that is not selected has no effect, so it reads as null. */
function effectiveGoals(values: {
  dailyCalorieTarget: number | null;
  proteinGoalMode: string | null;
  dailyProteinTargetG: number | null;
  dailyProteinTargetPerKg: number | null;
}): GoalValues {
  const proteinGoalMode = normaliseProteinGoalMode(values.proteinGoalMode);
  return {
    dailyCalorieTarget: values.dailyCalorieTarget,
    proteinGoalMode,
    dailyProteinTargetG:
      proteinGoalMode === "grams" ? values.dailyProteinTargetG : null,
    dailyProteinTargetPerKg:
      proteinGoalMode === "gramsPerKg" ? values.dailyProteinTargetPerKg : null,
  };
}

function sameGoals(left: GoalValues, right: GoalValues): boolean {
  return (
    left.dailyCalorieTarget === right.dailyCalorieTarget &&
    left.proteinGoalMode === right.proteinGoalMode &&
    left.dailyProteinTargetG === right.dailyProteinTargetG &&
    left.dailyProteinTargetPerKg === right.dailyProteinTargetPerKg
  );
}

function flag(requested: boolean | undefined, current: number | undefined) {
  return requested === undefined ? (current ?? 0) : requested ? 1 : 0;
}

/** The goals, the timezone and the other settings of the owner. */
export class SettingsLogic extends Logic<SettingsProps, Record<string, never>> {
  constructor(deps: SettingsProps) {
    super({ deps, initialState: {} });
  }

  read({ ownerKey }: { ownerKey: string }): Promise<SettingsRow | undefined> {
    return this.deps.storage.settings.findSettings({ ownerKey });
  }

  /** The latest recorded changes of the calorie and protein goals, oldest first. */
  goalChanges({
    ownerKey,
    limit = MAX_GOAL_CHANGES,
  }: {
    ownerKey: string;
    limit?: number;
  }) {
    return this.deps.storage.settings.listGoalChanges({ ownerKey, limit });
  }

  async dailyGoals({ ownerKey }: { ownerKey: string }): Promise<DailyGoals> {
    const row = await this.read({ ownerKey });
    return {
      calories: row?.dailyCalorieTarget ?? DEFAULT_CALORIE_TARGET,
      proteinMode: normaliseProteinGoalMode(row?.proteinGoalMode),
      fixedProteinG: row?.dailyProteinTargetG ?? DEFAULT_PROTEIN_TARGET_G,
      proteinGramsPerKg: row?.dailyProteinTargetPerKg ?? null,
      nutrients: resolveNutrientGoals(
        parseNutrientGoalOverridesJson(row?.nutrientTargetsJson),
      ),
    };
  }

  /**
   * Whether visitors may read the log, and the timezone that sets its days.
   * A missing timezone, or one that no longer exists, is UTC.
   */
  async publicView({
    ownerKey,
  }: {
    ownerKey: string;
  }): Promise<{ enabled: boolean; timeZone: string }> {
    const row = await this.read({ ownerKey });
    return {
      enabled: row?.publicViewEnabled === 1,
      timeZone: resolveTimeZone(row?.timezone),
    };
  }

  /**
   * Save the fields of the patch. A change of the primary goals also adds a
   * row to the record of goal changes, in the same batch, so the record cannot
   * miss a change.
   */
  async update({
    ownerKey,
    patch,
  }: {
    ownerKey: string;
    patch: SettingsPatch;
  }): Promise<SettingsRow> {
    const { storage, atomic, services } = this.deps;
    const existing = await storage.settings.findSettings({ ownerKey });
    const timestamp = services.clock.now();
    const goals = {
      dailyCalorieTarget:
        patch.dailyCalorieTarget === undefined
          ? (existing?.dailyCalorieTarget ?? null)
          : patch.dailyCalorieTarget,
      dailyProteinTargetG:
        patch.dailyProteinTargetG === undefined
          ? (existing?.dailyProteinTargetG ?? null)
          : patch.dailyProteinTargetG,
      proteinGoalMode:
        patch.proteinGoalMode ??
        normaliseProteinGoalMode(existing?.proteinGoalMode),
      dailyProteinTargetPerKg:
        patch.dailyProteinTargetPerKg === undefined
          ? (existing?.dailyProteinTargetPerKg ?? null)
          : patch.dailyProteinTargetPerKg,
    };
    const goalChanged =
      !existing || !sameGoals(effectiveGoals(goals), effectiveGoals(existing));
    const row = this.settingsRow({
      ownerKey,
      existing,
      patch,
      goals,
      timestamp,
    });
    await atomic((planning) => [
      planning.settings.planSaveSettings(row),
      ...(goalChanged
        ? [
            planning.settings.planInsertGoalChange({
              id: `goal_${crypto.randomUUID()}`,
              ownerKey,
              changedAt: timestamp,
              ...effectiveGoals(goals),
              createdAt: timestamp,
            }),
          ]
        : []),
    ]);
    const saved = await storage.settings.findSettings({ ownerKey });
    if (!saved) {
      throw new Error("The settings were not saved.");
    }
    return saved;
  }

  /**
   * The confirmation time of an upper-limit consent is the time of the first
   * consent, and a withdrawal clears it.
   */
  private settingsRow({
    ownerKey,
    existing,
    patch,
    goals,
    timestamp,
  }: {
    ownerKey: string;
    existing: SettingsRow | undefined;
    patch: SettingsPatch;
    goals: GoalValues;
    timestamp: number;
  }): NewSettings {
    const consent = (
      requested: boolean | undefined,
      current: { enabled: number; confirmedAt: number | null },
    ) => {
      if (requested === undefined) {
        return current;
      }
      return {
        enabled: requested ? 1 : 0,
        confirmedAt: requested ? (current.confirmedAt ?? timestamp) : null,
      };
    };
    const b6 = consent(patch.vitaminB6UsFnbAdultUlEnabled, {
      enabled: existing?.vitaminB6UsFnbAdultUlEnabled ?? 0,
      confirmedAt: existing?.vitaminB6UsFnbAdultUlConfirmedAt ?? null,
    });
    const general = consent(patch.usFnbAdultUlEnabled, {
      enabled: existing?.usFnbAdultUlEnabled ?? 0,
      confirmedAt: existing?.usFnbAdultUlConfirmedAt ?? null,
    });
    const nutrientTargetsJson =
      patch.nutrientTargets === undefined
        ? existing
          ? existing.nutrientTargetsJson
          : JSON.stringify({})
        : patch.nutrientTargets === null
          ? null
          : JSON.stringify(patch.nutrientTargets);
    return {
      id: existing?.id ?? `settings_${ownerKey}`,
      ownerKey,
      timezone: patch.timezone ?? existing?.timezone ?? "UTC",
      ...goals,
      nutrientTargetsJson,
      vitaminB6UsFnbAdultUlEnabled: b6.enabled,
      vitaminB6UsFnbAdultUlConfirmedAt: b6.confirmedAt,
      usFnbAdultUlEnabled: general.enabled,
      usFnbAdultUlConfirmedAt: general.confirmedAt,
      partnerProfileEnabled: flag(
        patch.partnerProfileEnabled,
        existing?.partnerProfileEnabled,
      ),
      publicViewEnabled: flag(
        patch.publicViewEnabled,
        existing?.publicViewEnabled,
      ),
      activeAiProfileId: existing?.activeAiProfileId ?? null,
      photoRetentionDays: existing?.photoRetentionDays ?? 30,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  }
}
