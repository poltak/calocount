import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  isDateKey,
  shiftDateKey,
} from "@app/common/features/core/utils/logical-date";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { resolveNutrientGoals } from "@app/common/features/entries/utils/nutrient-goals";
import type { SettingsEvents } from "../../settings/types.js";
import type { WeightEvents } from "../../weights/types.js";
import { requireApiSuccess } from "../../api/client/api-client.js";
import { LatestRequest } from "../../core/logic/latest-request.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { EntryEvent, EntryEvents } from "../types.js";
import type {
  DayWeightRow,
  ProteinGoalOfDay,
  SavedEntry,
  SummaryDay,
  SummaryTargets,
} from "../utils/api-types.js";
import { entryViewOf, type EntryView } from "../utils/entry-view.js";
import { failureMessage } from "../../core/logic/failure-message.js";

type DashboardProps = FrontendLogicProps<
  "entries",
  "clock" | "windowFocus",
  "dashboard" | "days" | "saved-entries"
> & {
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
  /** The logical date of today in the timezone of this device. `null` until the first read. */
  today: string | null;
  timeZone: string;
  targets: SummaryTargets;
  /** The last seven days, oldest first. */
  days: SummaryDay[];
  /** The weights of those days. A day without a weight is not in the list. */
  recentWeights: DayWeightRow[];
  /** The weight of `selectedDate`, if the owner saved one. */
  weight: DayWeightRow | null;
  /** The protein target of `selectedDate`. `null` until the day is read. */
  proteinGoal: ProteinGoalOfDay | null;
  averageCalories: number;
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
}

/** The owner dashboard: the day in view, its entries, the recent days, and the saved entries. */
export class DashboardLogic extends Logic<
  DashboardProps,
  DashboardState,
  EntryEvent
> {
  private readonly dashboardReads = new LatestRequest(this.signal);
  private readonly dayReads = new LatestRequest(this.signal);

  constructor(deps: DashboardProps) {
    super({
      deps,
      initialState: {
        loaded: false,
        loadDashboardState: "pristine",
        loadDashboardError: null,
        loadDayState: "pristine",
        loadDayError: null,
        today: null,
        timeZone: "UTC",
        targets: {
          calories: 0,
          proteinG: null,
          nutrients: resolveNutrientGoals(),
        },
        days: [],
        recentWeights: [],
        weight: null,
        proteinGoal: null,
        averageCalories: 0,
        selectedDate: null,
        entries: [],
        savedEntries: [],
        statusMessage: null,
        nutritionCollapsed: false,
        trendNutrient: "fiberG",
        openDetailIds: [],
        activeSection: "today",
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
      entries: [],
      weight: null,
      statusMessage: null,
    });
    await this.loadDay();
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

  private onChange(message: string): Promise<void> {
    this.setState({ statusMessage: message });
    return this.loadDashboard();
  }

  private async readDashboard({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<void> {
    const { api, services } = this.deps;
    const init = { init: { signal } };
    const [summaryResponse, savedResponse] = await Promise.all([
      api.dashboard.summary.$get(
        { query: { timezone: services.clock.timeZone() } },
        init,
      ),
      api["saved-entries"].$get(undefined, init),
    ]);
    await requireApiSuccess(summaryResponse);
    await requireApiSuccess(savedResponse);
    if (summaryResponse.status !== 200 || savedResponse.status !== 200) {
      throw new Error("Unexpected dashboard response");
    }
    const summary = await summaryResponse.json();
    const { entries: savedEntries } = await savedResponse.json();
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
      recentWeights: summary.recentWeights,
      savedEntries,
      selectedDate: keepsSelection ? selectedDate : summary.date,
    });
    await this.loadDay();
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
      const response = await this.deps.api.days[":date"].$get(
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
      this.setState({
        entries: day.meals.map((entry) =>
          entryViewOf({ entry, timeZone: day.timezone }),
        ),
        weight: day.weight,
        proteinGoal: day.proteinGoal,
        loadDayState: "success",
      });
    } catch (error) {
      if (!signal.aborted) {
        this.setState({
          loadDayState: "error",
          loadDayError: failureMessage(error),
        });
      }
    }
  }
}
