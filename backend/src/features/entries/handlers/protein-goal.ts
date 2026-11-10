import { proteinGoalForDay } from "@app/common/features/goals/utils/daily-targets";
import type { BackendLogic } from "../../core/types.js";

type Goals = Awaited<ReturnType<BackendLogic["settings"]["dailyGoals"]>>;
type DayWeight = Awaited<ReturnType<BackendLogic["weights"]["day"]>>;

/**
 * The protein target of one day. A goal per kilogram uses the weight of the
 * day, or the latest weight before it. The Logic classes of settings and
 * weights do not know each other, so the handler joins them here.
 */
export async function proteinGoalOfDay({
  logic,
  ownerKey,
  date,
  goals,
  dayWeight,
}: {
  logic: Pick<BackendLogic, "weights">;
  ownerKey: string;
  date: string;
  goals: Goals;
  dayWeight?: DayWeight;
}) {
  const weight =
    goals.proteinMode === "gramsPerKg"
      ? (dayWeight ??
        (await logic.weights.latestOnOrBefore({ ownerKey, date })))
      : undefined;
  return proteinGoalForDay({
    mode: goals.proteinMode,
    fixedTargetG: goals.fixedProteinG,
    gramsPerKg: goals.proteinGramsPerKg,
    weight: weight
      ? { weightKg: weight.weightKg, logicalDate: weight.logicalDate }
      : null,
  });
}

/**
 * The protein target of each of some days, oldest first. A goal per kilogram
 * uses, for each day, the latest weight on or before it. `weights` holds the
 * weights from the first day on, oldest first, and `weightBefore` the latest
 * weight before the first day.
 */
export function proteinTargetsOfDays({
  dates,
  goals,
  weights,
  weightBefore,
}: {
  dates: readonly string[];
  goals: Goals;
  weights: readonly { weightKg: number; logicalDate: string }[];
  weightBefore: { weightKg: number; logicalDate: string } | undefined;
}): { date: string; targetG: number | null }[] {
  const known = weightBefore ? [weightBefore, ...weights] : [...weights];
  return dates.map((date) => {
    const weight = known.findLast((entry) => entry.logicalDate <= date);
    const { targetG } = proteinGoalForDay({
      mode: goals.proteinMode,
      fixedTargetG: goals.fixedProteinG,
      gramsPerKg: goals.proteinGramsPerKg,
      weight: weight ?? null,
    });
    return { date, targetG };
  });
}
