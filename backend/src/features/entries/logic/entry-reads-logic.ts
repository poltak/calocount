import { Logic } from "@app/common/features/core/logic/logic";
import {
  resolveTimeZone,
  shiftDateKey,
  zonedCalendar,
} from "@app/common/features/core/utils/logical-date";
import { aggregateNutrients } from "@app/common/features/entries/utils/nutrients";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { MealWithItems } from "../storage/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
import { summariseDays } from "../utils/nutrition-days.js";

type EntryReadsProps = BackendLogicProps<"entries", "clock">;

/** The recent days show in the date strip and in the trend charts. */
const RECENT_DAY_COUNT = 7;
/** Before this hour, the average leaves out today, which is not finished. */
const AVERAGE_INCLUDES_TODAY_FROM_HOUR = 21;

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

  /**
   * One page of complete entries for the dates of a range, newest first. The
   * dates are days in the given timezone. The cursor is the last entry of the
   * page before.
   */
  async historyPage({
    ownerKey,
    startDate,
    endDate,
    pageSize,
    cursor,
    timeZone,
  }: {
    ownerKey: string;
    startDate: string;
    endDate: string;
    pageSize: number;
    cursor: { consumedAt: number; id: string } | null;
    timeZone: string | undefined;
  }) {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const { entries, hasMore } =
      await this.deps.storage.entries.listCompleteEntriesPage({
        ownerKey,
        from: calendar.firstInstant(startDate),
        to: calendar.firstInstant(shiftDateKey(endDate, 1)),
        limit: pageSize,
        cursor,
      });
    return {
      timeZone: calendar.timeZone,
      hasMore,
      entries: entries.map((entry) => ({
        ...entry,
        date: calendar.dateKey(entry.meal.consumedAt),
      })),
    };
  }

  /** The totals and the nutrient coverage of each date of a range, including dates with no entry. */
  async nutritionDays({
    ownerKey,
    startDate,
    endDate,
    dayCount,
    timeZone,
  }: {
    ownerKey: string;
    startDate: string;
    endDate: string;
    dayCount: number;
    timeZone: string | undefined;
  }) {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const entries = await this.deps.storage.entries.listEntriesInRange({
      ownerKey,
      from: calendar.firstInstant(startDate),
      to: calendar.firstInstant(shiftDateKey(endDate, 1)),
    });
    return {
      timeZone: calendar.timeZone,
      days: summariseDays({
        entries,
        startDate,
        dayCount,
        dateKey: calendar.dateKey,
      }),
    };
  }

  /** The totals of today, which an agent gets back after it logs meals. */
  async today({
    ownerKey,
    timeZone,
  }: {
    ownerKey: string;
    timeZone: string | undefined;
  }) {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const date = calendar.dateKey(this.deps.services.clock.now());
    const [day] = summariseDays({
      entries: await this.deps.storage.entries.listEntriesInRange({
        ownerKey,
        from: calendar.firstInstant(date),
        to: calendar.firstInstant(shiftDateKey(date, 1)),
      }),
      startDate: date,
      dayCount: 1,
      dateKey: calendar.dateKey,
    });
    return {
      date,
      calories: day?.totals.caloriesKcal ?? 0,
      proteinG: day?.totals.proteinG ?? 0,
      mealCount: day?.mealCount ?? 0,
    };
  }

  /** Every entry of the owner as the API sends it, newest first, and the time of the read, for the export. */
  async everything({ ownerKey }: { ownerKey: string }) {
    const entries = await this.deps.storage.entries.listEntriesInRange({
      ownerKey,
      from: 0,
      to: Number.MAX_SAFE_INTEGER,
    });
    return {
      exportedAt: this.deps.services.clock.now(),
      entries: entries.map(serialiseEntry),
    };
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
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
