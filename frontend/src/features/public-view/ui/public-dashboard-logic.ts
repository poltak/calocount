import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  isDateKey,
  shiftDateKey,
} from "@app/common/features/core/utils/logical-date";
import { DEFAULT_CALORIE_TARGET } from "@app/common/features/goals/utils/daily-targets";
import {
  ApiRequestError,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import { LatestRequest } from "../../core/logic/latest-request.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import {
  publicEntryViewOf,
  type PublicEntryView,
} from "../utils/public-entry-view.js";
import type { PublicDay } from "../utils/public-types.js";

type PublicDashboardProps = FrontendLogicProps<never, never, "public">;

/** The date strip shows this many days, ending today. */
const STRIP_DAY_COUNT = 7;

interface PublicDashboardState {
  loadState: TaskState;
  loadError: string | null;
  /** True when the owner keeps the public view off. The page then opens the owner view. */
  off: boolean;
  loadDayState: TaskState;
  loadDayError: string | null;
  /** The logical date of today in the owner's saved timezone. */
  today: string | null;
  /** The saved timezone of the owner, which sets every day and time on the page. */
  timeZone: string;
  calorieTarget: number;
  /** The last seven days, oldest first. */
  days: { date: string; mealCount: number }[];
  selectedDate: string | null;
  entries: PublicEntryView[];
  weightKg: number | null;
  /** `null` when the owner has no protein goal for the day. */
  proteinTargetG: number | null;
  showCalendar: boolean;
  /** The month that the calendar showed when it opened: the month of the day in view. */
  calendarMonth: string | null;
  /** The entry whose photo shows large, or `null`. */
  previewEntry: PublicEntryView | null;
  /** Photos that did not load. An entry with one shows no thumbnail. */
  failedPhotoIds: string[];
}

/** The read-only dashboard that a visitor with no session opens. */
export class PublicDashboardLogic extends Logic<
  PublicDashboardProps,
  PublicDashboardState
> {
  private readonly dayReads = new LatestRequest(this.signal);

  constructor(deps: PublicDashboardProps) {
    super({
      deps,
      initialState: {
        loadState: "pristine",
        loadError: null,
        off: false,
        loadDayState: "pristine",
        loadDayError: null,
        today: null,
        timeZone: "UTC",
        calorieTarget: DEFAULT_CALORIE_TARGET,
        days: [],
        selectedDate: null,
        entries: [],
        weightKg: null,
        proteinTargetG: null,
        showCalendar: false,
        calendarMonth: null,
        previewEntry: null,
        failedPhotoIds: [],
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.load();
  }

  /** Read the recent days and the targets, then the entries of today. */
  async load(): Promise<void> {
    this.setState({ loadState: "running", loadError: null });
    try {
      const response = await this.deps.api.public.summary.$get(
        { query: { view: "daily" } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected public response");
      }
      const summary = await response.json();
      if (!("view" in summary) || summary.view !== "daily") {
        throw new Error("Unexpected public response");
      }
      this.setState({
        loadState: "success",
        today: summary.date,
        timeZone: summary.timezone,
        calorieTarget: summary.targets.calories ?? DEFAULT_CALORIE_TARGET,
        // The daily view starts at the first entry, and the strip always shows seven days.
        days: Array.from({ length: STRIP_DAY_COUNT }, (_, index) => {
          const date = shiftDateKey(summary.date, index + 1 - STRIP_DAY_COUNT);
          return {
            date,
            mealCount:
              summary.days.find((day) => day.date === date)?.mealCount ?? 0,
          };
        }),
        selectedDate: summary.date,
      });
      await this.loadDay();
    } catch (error) {
      if (this.signal.aborted) {
        return;
      }
      if (
        error instanceof ApiRequestError &&
        error.code === "public_view_off"
      ) {
        this.setState({ loadState: "success", off: true });
        return;
      }
      this.setState({
        loadState: "error",
        loadError: failureMessage(error),
      });
    }
  }

  async selectDate({ date }: { date: string }): Promise<void> {
    const { today, selectedDate } = this.state;
    if (!today || !isDateKey(date) || date > today || date === selectedDate) {
      return;
    }
    this.setState({ selectedDate: date, entries: [], weightKg: null });
    await this.loadDay();
  }

  /** Open a day from the calendar and close the calendar. */
  async selectCalendarDate({ date }: { date: string }): Promise<void> {
    this.closeCalendar();
    await this.selectDate({ date });
  }

  toggleCalendar(): void {
    const { showCalendar, selectedDate } = this.state;
    this.setState({
      showCalendar: !showCalendar,
      calendarMonth: showCalendar ? null : (selectedDate?.slice(0, 7) ?? null),
    });
  }

  closeCalendar(): void {
    this.setState({ showCalendar: false, calendarMonth: null });
  }

  /**
   * The address of the public photo of an entry, or `null` when the entry has
   * none or the photo is known to fail. The route is on the origin of the API
   * and takes the entry ID, so the private bucket key never reaches the page.
   */
  shownPhotoUrl({ entry }: { entry: PublicEntryView }): string | null {
    if (!entry.hasPhoto || this.state.failedPhotoIds.includes(entry.id)) {
      return null;
    }
    const { origin } = this.deps.api.public.summary.$url();
    return `${origin}/meal-photos/${encodeURIComponent(entry.id)}`;
  }

  openPhoto({ entry }: { entry: PublicEntryView }): void {
    this.setState({ previewEntry: entry });
  }

  closePhoto(): void {
    this.setState({ previewEntry: null });
  }

  markPhotoFailed({ entry }: { entry: PublicEntryView }): void {
    if (!this.state.failedPhotoIds.includes(entry.id)) {
      this.setState({
        failedPhotoIds: [...this.state.failedPhotoIds, entry.id],
      });
    }
  }

  async goToPreviousDay(): Promise<void> {
    const { selectedDate } = this.state;
    if (selectedDate) {
      await this.selectDate({ date: shiftDateKey(selectedDate, -1) });
    }
  }

  async goToNextDay(): Promise<void> {
    const { selectedDate } = this.state;
    if (selectedDate) {
      await this.selectDate({ date: shiftDateKey(selectedDate, 1) });
    }
  }

  /** Read the entries of the day in view. A newer read replaces an older one. */
  private async loadDay(): Promise<void> {
    const date = this.state.selectedDate;
    if (!date) {
      return;
    }
    const signal = this.dayReads.start();
    this.setState({ loadDayState: "running", loadDayError: null });
    try {
      const response = await this.deps.api.public.summary.$get(
        { query: { view: "day", date } },
        { init: { signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected public response");
      }
      const day = await response.json();
      if (!("view" in day) || day.view !== "day") {
        throw new Error("Unexpected public response");
      }
      if (signal.aborted) {
        return;
      }
      this.setDay({ day });
    } catch (error) {
      if (!signal.aborted) {
        this.setState({
          loadDayState: "error",
          loadDayError: failureMessage(error),
        });
      }
    }
  }

  private setDay({ day }: { day: PublicDay }): void {
    this.setState({
      entries: day.meals.map((meal) =>
        publicEntryViewOf({ meal, timeZone: day.timezone }),
      ),
      weightKg: day.weight?.weightKg ?? null,
      proteinTargetG: day.proteinGoal.targetG,
      loadDayState: "success",
    });
  }
}
