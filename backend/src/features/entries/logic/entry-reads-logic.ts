import { Logic } from "@app/common/features/core/logic/logic";
import {
  resolveTimeZone,
  shiftDateKey,
  zonedCalendar,
} from "@app/common/features/core/utils/logical-date";
import type { InsightHistory } from "@app/common/features/entries/utils/insights/insight-types";
import { aggregateNutrients } from "@app/common/features/entries/utils/nutrients";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { MealWithItems } from "../storage/types.js";
import { insightEntryOf } from "../utils/insight-entry.js";

type EntryReadsProps = BackendLogicProps<"entries", "clock">;

/** The recent days show in the date strip and in the trend charts. */
const RECENT_DAY_COUNT = 7;
/** Before this hour, the average leaves out today, which is not finished. */
const AVERAGE_INCLUDES_TODAY_FROM_HOUR = 21;
/** The insights look back over this many finished days. */
const INSIGHT_DAY_COUNT = 30;

/** What the dashboard reads: one day of entries, and the totals of the recent days. */
export class EntryReadsLogic extends Logic<
  EntryReadsProps,
  Record<string, never>
> {
  constructor(deps: EntryReadsProps) {
    super({ deps, initialState: {} });
  }

  /** The entries of one logical date, counted in the given timezone. */
  async day({
    ownerKey,
    date,
    timeZone,
  }: {
    ownerKey: string;
    date: string;
    timeZone: string | undefined;
  }): Promise<{ date: string; timeZone: string; entries: MealWithItems[] }> {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const entries = await this.deps.storage.entries.listEntriesInRange({
      ownerKey,
      from: calendar.firstInstant(date),
      to: calendar.firstInstant(shiftDateKey(date, 1)),
    });
    return { date, timeZone: calendar.timeZone, entries };
  }

  /** The totals of each of the last seven days. Only complete entries count. */
  async summary({
    ownerKey,
    timeZone,
  }: {
    ownerKey: string;
    timeZone: string | undefined;
  }) {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const now = this.deps.services.clock.now();
    const date = calendar.dateKey(now);
    const firstDate = shiftDateKey(date, 1 - RECENT_DAY_COUNT);
    const entries = await this.deps.storage.entries.listEntriesInRange({
      ownerKey,
      from: calendar.firstInstant(firstDate),
      to: calendar.firstInstant(shiftDateKey(date, 1)),
    });
    const byDate = new Map<string, MealWithItems[]>();
    for (const entry of entries) {
      if (entry.meal.status !== "complete") {
        continue;
      }
      const key = calendar.dateKey(entry.meal.consumedAt);
      byDate.set(key, [...(byDate.get(key) ?? []), entry]);
    }
    const days = Array.from({ length: RECENT_DAY_COUNT }, (_, index) => {
      const dayDate = shiftDateKey(firstDate, index);
      const dayEntries = byDate.get(dayDate) ?? [];
      return {
        date: dayDate,
        calories: sum(dayEntries.map(({ meal }) => meal.totalCalories)),
        proteinG: sum(dayEntries.map(({ meal }) => meal.totalProteinG)),
        carbsG: sum(dayEntries.map(({ meal }) => meal.totalCarbsG)),
        fatG: sum(dayEntries.map(({ meal }) => meal.totalFatG)),
        mealCount: dayEntries.length,
        nutrients: aggregateNutrients(dayEntries.flatMap(({ items }) => items)),
      };
    });
    const includeToday = calendar.hour(now) >= AVERAGE_INCLUDES_TODAY_FROM_HOUR;
    const averaged = includeToday ? days : days.slice(0, -1);
    return {
      date,
      timeZone: calendar.timeZone,
      days,
      averageCalories:
        sum(averaged.map((day) => day.calories)) / averaged.length,
    };
  }

  /**
   * The complete entries of the last `INSIGHT_DAY_COUNT` finished days and of
   * today, counted in the given timezone. An entry that is still pending has
   * no final values, so the insights leave it out.
   */
  async insightHistory({
    ownerKey,
    timeZone,
  }: {
    ownerKey: string;
    timeZone: string | undefined;
  }): Promise<InsightHistory & { timeZone: string }> {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const toDate = calendar.dateKey(this.deps.services.clock.now());
    const fromDate = shiftDateKey(toDate, -INSIGHT_DAY_COUNT);
    const entries = await this.deps.storage.entries.listEntriesInRange({
      ownerKey,
      from: calendar.firstInstant(fromDate),
      to: calendar.firstInstant(shiftDateKey(toDate, 1)),
    });
    return {
      timeZone: calendar.timeZone,
      fromDate,
      toDate,
      entries: entries
        .filter(({ meal }) => meal.status === "complete")
        .map((entry) =>
          insightEntryOf({
            entry,
            date: calendar.dateKey(entry.meal.consumedAt),
          }),
        ),
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
