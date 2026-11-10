import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { shiftMonthKey } from "@app/common/features/core/utils/logical-date";
import {
  calendarWeeks,
  type CalendarCell,
} from "@app/common/features/history/utils/calendar-grid";
import { requireApiSuccess } from "../../api/client/api-client.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import { LatestRequest } from "../../core/logic/latest-request.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { MonthRead } from "../utils/api-types.js";

type CalendarProps = FrontendLogicProps<never, "clock", "days"> & {
  /** The month to show first: the month of the day in view. */
  initialMonth: string;
};

interface LoadedMonth extends MonthRead {
  /** The key of the dashboard read that this month matches. */
  reloadKey: number;
}

interface CalendarState {
  /** The month in view, as `YYYY-MM`. */
  month: string;
  weeks: (CalendarCell | null)[][];
  /** The key of the last dashboard read that the calendar knows. */
  reloadKey: number;
  /** The months that were read, by `YYYY-MM`. */
  months: Record<string, LoadedMonth>;
  loadMonthState: TaskState;
  loadMonthError: string | null;
}

/** A month of days with the calories and protein of each one. */
export class CalendarLogic extends Logic<CalendarProps, CalendarState> {
  private readonly monthReads = new LatestRequest(this.signal);

  constructor(deps: CalendarProps) {
    super({
      deps,
      initialState: {
        month: deps.initialMonth,
        weeks: calendarWeeks(deps.initialMonth),
        reloadKey: -1,
        months: {},
        loadMonthState: "pristine",
        loadMonthError: null,
      },
    });
  }

  /**
   * The first and the last month that the owner can open. The log starts at
   * the first entry or weight, but the day in view can be an earlier one.
   */
  monthBounds({
    today,
    selectedDate,
  }: {
    today: string;
    selectedDate: string;
  }): { firstMonth: string; lastMonth: string } {
    const firstDates = Object.values(this.state.months).flatMap((loaded) =>
      loaded.firstDate ? [loaded.firstDate] : [],
    );
    return {
      firstMonth:
        [today, selectedDate, ...firstDates].toSorted()[0]?.slice(0, 7) ?? "",
      lastMonth: today.slice(0, 7),
    };
  }

  async showPreviousMonth(): Promise<void> {
    await this.showMonth({ month: shiftMonthKey(this.state.month, -1) });
  }

  async showNextMonth(): Promise<void> {
    await this.showMonth({ month: shiftMonthKey(this.state.month, 1) });
  }

  /** The dashboard read again, so the month in view may be out of date. */
  async refresh({ reloadKey }: { reloadKey: number }): Promise<void> {
    this.setState({ reloadKey });
    await this.loadMonth();
  }

  /** Read the month in view when it is missing, or older than the last change of the entries. */
  async loadMonth(): Promise<void> {
    const { month, months, reloadKey } = this.state;
    if (months[month]?.reloadKey === reloadKey) {
      return;
    }
    const signal = this.monthReads.start();
    this.setState({ loadMonthState: "running", loadMonthError: null });
    try {
      const response = await this.deps.api.days.$get(
        {
          query: { month, timezone: this.deps.services.clock.timeZone() },
        },
        { init: { signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected month response");
      }
      const read = await response.json();
      if (signal.aborted) {
        return;
      }
      this.setState({
        months: { ...this.state.months, [month]: { ...read, reloadKey } },
        loadMonthState: "success",
      });
    } catch (error) {
      if (!signal.aborted) {
        this.setState({
          loadMonthState: "error",
          loadMonthError: failureMessage(error),
        });
      }
    }
  }

  private async showMonth({ month }: { month: string }): Promise<void> {
    this.setState({ month, weeks: calendarWeeks(month), loadMonthError: null });
    await this.loadMonth();
  }
}
