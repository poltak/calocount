import { Logic } from "@app/common/features/core/logic/logic";
import {
  resolveTimeZone,
  shiftDateKey,
  shiftMonthKey,
  zonedCalendar,
} from "@app/common/features/core/utils/logical-date";
import { aggregateNutrients } from "@app/common/features/entries/utils/nutrients";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { MealWithItems } from "../storage/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
import { summariseDays } from "../utils/nutrition-days.js";

type EntryReadsProps = BackendLogicProps<"entries", "clock">;

/** The recent days show in the date strip and the summary cards. */
const RECENT_DAY_COUNT = 7;
/** The trend charts show 7 or 30 days. */
const TREND_DAY_COUNT = 30;
/** Before this hour, the average leaves out today, which is not finished. */
const AVERAGE_INCLUDES_TODAY_FROM_HOUR = 21;

interface DayTotals {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
}

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

  /** The date of the first complete entry, or `null`. */
  async firstDate({
    ownerKey,
    timeZone,
  }: {
    ownerKey: string;
    timeZone: string | undefined;
  }): Promise<string | null> {
    const first = await this.deps.storage.entries.findFirstCompleteConsumedAt({
      ownerKey,
    });
    return first === undefined
      ? null
      : zonedCalendar(resolveTimeZone(timeZone)).dateKey(first);
  }

  /**
   * The totals of each day from `fromDate` to `toDate`, both included, that
   * has a complete entry, oldest first.
   */
  async dayTotals({
    ownerKey,
    fromDate,
    toDate,
    timeZone,
  }: {
    ownerKey: string;
    fromDate: string;
    toDate: string;
    timeZone: string | undefined;
  }) {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const meals = await this.deps.storage.entries.listCompleteTotalsInRange({
      ownerKey,
      from: calendar.firstInstant(fromDate),
      to: calendar.firstInstant(shiftDateKey(toDate, 1)),
    });
    const byDate = new Map<string, DayTotals>();
    for (const meal of meals) {
      const date = calendar.dateKey(meal.consumedAt);
      const day = byDate.get(date) ?? {
        date,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        mealCount: 0,
      };
      day.calories += meal.totalCalories;
      day.proteinG += meal.totalProteinG;
      day.carbsG += meal.totalCarbsG;
      day.fatG += meal.totalFatG;
      day.mealCount += 1;
      byDate.set(date, day);
    }
    return [...byDate.values()].toSorted((left, right) =>
      left.date.localeCompare(right.date),
    );
  }

  /**
   * The totals of each of the last 30 days, and the last seven of them as the
   * recent days. Only complete entries count.
   */
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
    const firstDate = shiftDateKey(date, 1 - TREND_DAY_COUNT);
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
    const trendDays = Array.from({ length: TREND_DAY_COUNT }, (_, index) => {
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
    const days = trendDays.slice(-RECENT_DAY_COUNT);
    const includeToday = calendar.hour(now) >= AVERAGE_INCLUDES_TODAY_FROM_HOUR;
    const averaged = includeToday ? days : days.slice(0, -1);
    return {
      date,
      timeZone: calendar.timeZone,
      days,
      trendDays,
      averageCalories:
        sum(averaged.map((day) => day.calories)) / averaged.length,
      averageProteinG:
        sum(averaged.map((day) => day.proteinG)) / averaged.length,
    };
  }

  /**
   * Every entry from the first moment of the day `daysBefore` days ago to the
   * end of today, with the logical date of today. The public dashboard reads
   * its recent entries and its insights from this one list.
   */
  async lastDays({
    ownerKey,
    timeZone,
    daysBefore,
  }: {
    ownerKey: string;
    timeZone: string | undefined;
    daysBefore: number;
  }): Promise<{ date: string; entries: MealWithItems[] }> {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const date = calendar.dateKey(this.deps.services.clock.now());
    const entries = await this.deps.storage.entries.listEntriesInRange({
      ownerKey,
      from: calendar.firstInstant(shiftDateKey(date, -daysBefore)),
      to: calendar.firstInstant(shiftDateKey(date, 1)),
    });
    return { date, entries };
  }

  /**
   * The calories and protein of each day with complete entries in a month,
   * with the days counted in the given timezone.
   */
  async month({
    ownerKey,
    month,
    timeZone,
  }: {
    ownerKey: string;
    month: string;
    timeZone: string | undefined;
  }) {
    const calendar = zonedCalendar(resolveTimeZone(timeZone));
    const [entries, firstEntryAt] = await Promise.all([
      this.deps.storage.entries.listEntriesInRange({
        ownerKey,
        from: calendar.firstInstant(`${month}-01`),
        to: calendar.firstInstant(`${shiftMonthKey(month, 1)}-01`),
      }),
      this.deps.storage.entries.findFirstCompleteConsumedAt({ ownerKey }),
    ]);
    const totals = new Map<
      string,
      { calories: number; proteinG: number; mealCount: number }
    >();
    for (const { meal } of entries) {
      if (meal.status !== "complete") {
        continue;
      }
      const date = calendar.dateKey(meal.consumedAt);
      const day = totals.get(date) ?? {
        calories: 0,
        proteinG: 0,
        mealCount: 0,
      };
      totals.set(date, {
        calories: day.calories + meal.totalCalories,
        proteinG: day.proteinG + meal.totalProteinG,
        mealCount: day.mealCount + 1,
      });
    }
    return {
      month,
      timeZone: calendar.timeZone,
      firstEntryDate:
        firstEntryAt === undefined ? null : calendar.dateKey(firstEntryAt),
      days: [...totals]
        .map(([date, day]) => ({ date, ...day }))
        .toSorted((left, right) => left.date.localeCompare(right.date)),
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
