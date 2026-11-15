import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  isDateKey,
  shiftDateKey,
  zonedCalendar,
} from "@app/common/features/core/utils/logical-date";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { resolveNutrientGoals } from "@app/common/features/entries/utils/nutrient-goals";
import type { SettingsEvents } from "../../settings/types.js";
import type { WeightEvents } from "../../weights/types.js";
import {
  ApiRequestError,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { TrendRange } from "../../core/utils/trend-range.js";
import { LatestRequest } from "../../core/logic/latest-request.js";
import type { Audience, FrontendLogicProps } from "../../core/logic/types.js";
import type { EntryEvent, EntryEvents } from "../types.js";
import type {
  DayWeightRow,
  ProteinGoalOfDay,
  ProteinTargetOfDay,
  SavedEntry,
  SummaryDay,
  SummaryTargets,
  TrendWeight,
} from "../utils/api-types.js";
import { entryViewOf, type EntryView } from "../utils/entry-view.js";
import { failureMessage } from "../../core/logic/failure-message.js";

type DashboardProps = FrontendLogicProps<
  "entries",
  "clock" | "ticker" | "windowFocus",
  "dashboard" | "days" | "saved-entries" | "public"
> & {
  /** A visitor reads the public mirrors, and no saved entries. */
  audience: Audience;
  /** The Logic classes that change entries. The dashboard reads again after each change. */
  entryEvents: readonly EntryEvents[];
  /** The goals and the weights come from other features. The dashboard reads again after a save. */
  settingsEvents: readonly SettingsEvents[];
  weightEvents: readonly WeightEvents[];
};

export const DASHBOARD_SECTIONS = [
  "today",
  "meals",
  "trend",
  "macros",
  "nutrition",
] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

interface DashboardState {
  /** True after the first read of the dashboard succeeded. */
  loaded: boolean;
  loadDashboardState: TaskState;
  loadDashboardError: string | null;
  loadDayState: TaskState;
  loadDayError: string | null;
  /** The day that a change of day is reading, or `null`. The rows of the day before stay until it arrives. */
  loadingDate: string | null;
  /** Why the saved entries could not be read. The rest of the dashboard still loads. */
  loadSavedEntriesError: string | null;
  /** Counts the requests to open the weight form, so that the weight panel opens it when the number changes. */
  weightFormRequest: number;
  /** True when the owner keeps the public view off. The public page then opens the owner view. */
  publicViewOff: boolean;
  /** The logical date of today in the timezone of this device. `null` until the first read. */
  today: string | null;
  timeZone: string;
  targets: SummaryTargets;
  /** The last seven days, oldest first. */
  days: SummaryDay[];
  /** The weights of those days. A day without a weight is not in the list. */
  recentWeights: DayWeightRow[];
  /** The last 30 days, oldest first. The trend charts show the last 7 or all 30. */
  trendDays: SummaryDay[];
  trendWeights: TrendWeight[];
  /** The protein target of each of the 30 days. `null` for a day without a target. */
  proteinTargets: ProteinTargetOfDay[];
  trendRange: TrendRange;
  showCalendar: boolean;
  /** True when the recent-days panel lists all seven days, not the last four. */
  showAllDays: boolean;
  /** The month that the calendar showed when it opened: the month of the day in view. */
  calendarMonth: string | null;
  /** Changes with each read of the dashboard, so the calendar reads its month again. */
  reloadKey: number;
  /** The weight of `selectedDate`, if the owner saved one. */
  weight: DayWeightRow | null;
  /** The protein target of `selectedDate`. `null` until the day is read. */
  proteinGoal: ProteinGoalOfDay | null;
  averageCalories: number;
  /** True when the owner keeps a partner log. The profile switch shows then. */
  partnerProfileEnabled: boolean;
  selectedDate: string | null;
  /** The entries of `selectedDate`. */
  entries: EntryView[];
  savedEntries: SavedEntry[];
  /** The confirmation of the last change. */
  statusMessage: string | null;
  nutritionCollapsed: boolean;
  trendNutrient: NutrientKey;
  openDetailIds: string[];
  activeSection: DashboardSection;
  /** The entry that an insight sent the owner to. Its row scrolls into view and takes focus once. */
  inspectedEntryId: string | null;
}

/** The dashboard: the day in view, its entries, the recent days, and, for the owner, the saved entries. */
export class DashboardLogic extends Logic<
  DashboardProps,
  DashboardState,
  EntryEvent
> {
  private readonly dashboardReads = new LatestRequest(this.signal);
  private readonly dayReads = new LatestRequest(this.signal);
  /** The day that `entries` and `weight` belong to. */
  private shownDate: string | null = null;

  constructor(deps: DashboardProps) {
    super({
      deps,
      initialState: {
        loaded: false,
        loadDashboardState: "pristine",
        loadDashboardError: null,
        loadDayState: "pristine",
        loadDayError: null,
        loadingDate: null,
        loadSavedEntriesError: null,
        weightFormRequest: 0,
        publicViewOff: false,
        today: null,
        timeZone: "UTC",
        targets: {
          calories: 0,
          proteinG: null,
          nutrients: resolveNutrientGoals(),
        },
        days: [],
        recentWeights: [],
        trendDays: [],
        trendWeights: [],
        proteinTargets: [],
        trendRange: 7,
        showCalendar: false,
        showAllDays: false,
        calendarMonth: null,
        reloadKey: 0,
        weight: null,
        proteinGoal: null,
        averageCalories: 0,
        partnerProfileEnabled: false,
        selectedDate: null,
        entries: [],
        savedEntries: [],
        statusMessage: null,
        nutritionCollapsed: false,
        trendNutrient: "fiberG",
        openDetailIds: [],
        activeSection: "today",
        inspectedEntryId: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.setState({
      nutritionCollapsed: this.deps.storage.entries.readNutritionCollapsed(),
    });
    for (const emitter of this.deps.entryEvents) {
      this.listen(emitter, (event) => this.onEntryEvent(event));
    }
    for (const emitter of this.deps.settingsEvents) {
      this.listen(emitter, (event) => this.onChange(event.message));
    }
    for (const emitter of this.deps.weightEvents) {
      this.listen(emitter, (event) => this.onChange(event.message));
    }
    // The owner may come back to the page on another day.
    this.registerCleanup(
      this.deps.services.windowFocus.listen(() => void this.loadDashboard()),
    );
    // The page can stay open past midnight. The focus does not tell it.
    this.registerCleanup(
      this.deps.services.ticker.listen(() => {
        const { today, timeZone } = this.state;
        const { clock } = this.deps.services;
        if (
          today !== null &&
          zonedCalendar(timeZone).dateKey(clock.now()) !== today
        ) {
          void this.loadDashboard();
        }
      }),
    );
    await this.loadDashboard();
  }

  /** Read the recent days, the goals, the saved entries, and the entries of the day in view. */
  async loadDashboard(): Promise<void> {
    const signal = this.dashboardReads.start();
    this.setState({ loadDashboardState: "running", loadDashboardError: null });
    try {
      await this.readDashboard({ signal });
      if (!signal.aborted) {
        this.setState({ loaded: true, loadDashboardState: "success" });
      }
    } catch (error) {
      // A newer read replaced this one, or the page closed.
      if (!signal.aborted) {
        if (
          error instanceof ApiRequestError &&
          error.code === "public_view_off"
        ) {
          this.setState({
            publicViewOff: true,
            loadDashboardState: "success",
          });
          return;
        }
        this.setState({
          loadDashboardState: "error",
          loadDashboardError: failureMessage(error),
        });
      }
    }
  }

  async selectDate({ date }: { date: string }): Promise<void> {
    const { today, selectedDate } = this.state;
    if (!today || !isDateKey(date) || date > today || date === selectedDate) {
      return;
    }
    this.setState({
      selectedDate: date,
      loadingDate: date,
      statusMessage: null,
    });
    await this.loadDay();
  }

  /** Ask the weight panel to open its form, as the link of an unknown protein goal does. */
  requestWeightForm(): void {
    this.setState({ weightFormRequest: this.state.weightFormRequest + 1 });
  }

  /**
   * Open the day of an entry that an insight names, and return the entry once
   * the day has loaded, so the caller can start its editor. When the entry is
   * not on that day any more, it tells the owner and returns `null`.
   */
  async inspectEntry({
    entryId,
    date,
  }: {
    entryId: string;
    date: string;
  }): Promise<EntryView | null> {
    await this.selectDate({ date });
    const entry =
      this.state.selectedDate === date
        ? this.state.entries.find((candidate) => candidate.id === entryId)
        : undefined;
    if (!entry) {
      this.setState({
        statusMessage: "The historical entry could not be loaded.",
      });
      return null;
    }
    this.setState({ statusMessage: null, inspectedEntryId: entry.id });
    return entry;
  }

  /** The row of the inspected entry has scrolled into view. */
  finishInspect(): void {
    this.setState({ inspectedEntryId: null });
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

  toggleAllDays(): void {
    this.setState({ showAllDays: !this.state.showAllDays });
  }

  setTrendRange({ range }: { range: TrendRange }): void {
    this.setState({ trendRange: range });
  }

  /**
   * Tells a visitor that the days and times follow the owner's saved timezone
   * when the device is in another one. The owner needs no notice.
   */
  get timeZoneNotice(): string | null {
    const { timeZone } = this.state;
    if (
      this.deps.audience !== "public" ||
      timeZone === this.deps.services.clock.timeZone()
    ) {
      return null;
    }
    return `Days and times are shown in ${timeZone.replaceAll("_", " ")} time.`;
  }

  /** The days that the trend charts show: the last 7 or 30. */
  get visibleTrendDays(): SummaryDay[] {
    return this.state.trendDays.slice(-this.state.trendRange);
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

  toggleNutritionSection(): void {
    const nutritionCollapsed = !this.state.nutritionCollapsed;
    this.deps.storage.entries.writeNutritionCollapsed({
      collapsed: nutritionCollapsed,
    });
    this.setState({ nutritionCollapsed });
  }

  setTrendNutrient({ key }: { key: NutrientKey }): void {
    this.setState({ trendNutrient: key });
  }

  toggleNutritionDetails({ entryId }: { entryId: string }): void {
    const { openDetailIds } = this.state;
    this.setState({
      openDetailIds: openDetailIds.includes(entryId)
        ? openDetailIds.filter((id) => id !== entryId)
        : [...openDetailIds, entryId],
    });
  }

  /** Follow the address of the page: `#meals` marks the Entries tab. */
  setActiveSection({ hash }: { hash: string }): void {
    const section = DASHBOARD_SECTIONS.find(
      (candidate) => candidate === hash.replace(/^#/, ""),
    );
    this.setState({ activeSection: section ?? "today" });
  }

  /** The returned promise lets the Logic that sent the event wait for the new read. */
  private onEntryEvent(event: EntryEvent): Promise<void> {
    const { selectedDate } = this.state;
    const moves =
      event.type === "entriesChanged" &&
      event.date !== undefined &&
      event.date !== selectedDate;
    this.setState({
      statusMessage: event.message,
      ...(moves
        ? {
            selectedDate: event.date ?? selectedDate,
            entries: [],
            weight: null,
          }
        : {}),
    });
    return this.loadDashboard();
  }

  /** The reads of the audience. Their paths differ, and the public bodies are subtypes of the owner bodies. */
  private get reads() {
    const { api, audience } = this.deps;
    const source = audience === "public" ? api.public : api;
    return {
      summary: source.dashboard.summary.$get,
      day: source.days[":date"].$get,
    };
  }

  private onChange(message: string): Promise<void> {
    this.setState({ statusMessage: message });
    return this.loadDashboard();
  }

  private async readDashboard({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<void> {
    const { services } = this.deps;
    const init = { init: { signal } };
    const [summaryResponse, saved] = await Promise.all([
      this.reads.summary(
        { query: { timezone: services.clock.timeZone() } },
        init,
      ),
      this.readSavedEntries({ signal }),
    ]);
    await requireApiSuccess(summaryResponse);
    if (summaryResponse.status !== 200) {
      throw new Error("Unexpected dashboard response");
    }
    const summary = await summaryResponse.json();
    if (signal.aborted) {
      return;
    }
    const { today: previousToday, selectedDate } = this.state;
    // A day in view stays in view, but a new day moves the view that showed the old today.
    const keepsSelection =
      selectedDate !== null &&
      selectedDate !== previousToday &&
      selectedDate <= summary.date;
    this.setState({
      today: summary.date,
      timeZone: summary.timezone,
      targets: summary.targets,
      days: summary.days,
      averageCalories: summary.averageCalories,
      partnerProfileEnabled: summary.partnerProfileEnabled,
      recentWeights: summary.recentWeights,
      trendDays: summary.trend.days,
      trendWeights: summary.trend.weights,
      proteinTargets: summary.trend.proteinTargets,
      reloadKey: this.state.reloadKey + 1,
      savedEntries: saved.entries ?? this.state.savedEntries,
      loadSavedEntriesError: saved.error,
      selectedDate: keepsSelection ? selectedDate : summary.date,
    });
    await this.loadDay();
  }

  /**
   * A visitor has no saved entries, and the public page does not read them. A
   * failure does not stop the dashboard: the entries stay as they were.
   */
  private async readSavedEntries({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<{ entries: SavedEntry[] | null; error: string | null }> {
    if (this.deps.audience === "public") {
      return { entries: [], error: null };
    }
    try {
      const response = await this.deps.api["saved-entries"].$get(undefined, {
        init: { signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected saved entries response");
      }
      return { entries: (await response.json()).entries, error: null };
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      return { entries: null, error: failureMessage(error) };
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
      const response = await this.reads.day(
        {
          param: { date },
          query: { timezone: this.deps.services.clock.timeZone() },
        },
        { init: { signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected day response");
      }
      const day = await response.json();
      if (signal.aborted) {
        return;
      }
      this.shownDate = date;
      this.setState({
        entries: day.meals.map((entry) =>
          entryViewOf({ entry, timeZone: day.timezone }),
        ),
        weight: day.weight,
        proteinGoal: day.proteinGoal,
        loadDayState: "success",
        loadingDate: null,
      });
    } catch (error) {
      if (!signal.aborted) {
        this.setState({
          loadDayState: "error",
          loadDayError: failureMessage(error),
          loadingDate: null,
          // Rows of another day must not stay under this day.
          ...(this.shownDate === date ? {} : { entries: [], weight: null }),
        });
      }
    }
  }
}
