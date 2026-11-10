import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { resolveNutrientGoals } from "@app/common/features/entries/utils/nutrient-goals";
import { buildInsightDays } from "@app/common/features/entries/utils/insights/insight-days";
import type {
  InsightDay,
  InsightEntry,
} from "@app/common/features/entries/utils/insights/insight-types";
import type { RepeatMetric } from "@app/common/features/entries/utils/insights/days-worth-repeating";
import type { FrequencyPortionMetric } from "@app/common/features/entries/utils/insights/frequency-portion";
import type {
  FoodScenarioMode,
  FoodScenarioMultiplier,
  InsightRange,
} from "@app/common/features/entries/utils/insights/nutrient-food-scenario";
import type { WeeklyMetricKey } from "@app/common/features/entries/utils/insights/weekly-changes";
import { requireApiSuccess } from "../../api/client/api-client.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import { LatestRequest } from "../../core/logic/latest-request.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { EntryEvents } from "../../entries/types.js";
import type { SettingsEvents } from "../../settings/types.js";
import type { WeightEvents } from "../../weights/types.js";
import type { InsightsRead } from "../utils/api-types.js";

type InsightsProps = FrontendLogicProps<
  never,
  "clock" | "windowFocus",
  "insights"
> & {
  /** The Logic classes that change what the panels show. The panels read again after each change. */
  entryEvents: readonly EntryEvents[];
  settingsEvents: readonly SettingsEvents[];
  weightEvents: readonly WeightEvents[];
};

export type CalorieBandName = "80–120%" | "90–110%" | "95–105%";

/** What the owner chose in the panels. A choice that no longer fits the data falls back to the first row. */
interface InsightSelections {
  repeatRange: 7 | 30;
  repeatMetric: RepeatMetric;
  repeatBand: CalorieBandName;
  repeatDate: string | null;
  frequencyRange: 7 | 30;
  frequencyMetric: FrequencyPortionMetric;
  frequencyKey: string | null;
  weeklyMetric: WeeklyMetricKey;
  weeklyKey: string | null;
  scenarioRange: InsightRange;
  scenarioMode: FoodScenarioMode;
  scenarioMultiplier: FoodScenarioMultiplier;
  scenarioCandidateId: string | null;
  scenarioBeforeId: string | null;
  scenarioAfterId: string | null;
  sourceRange: InsightRange;
  sourceNutrient: NutrientKey;
  sourceKey: string | null;
  attentionRange: InsightRange;
  shortfallNutrient: NutrientKey | null;
  shortfallDate: string | null;
  excessOption: string;
  excessDate: string | null;
  expandedSourceId: string | null;
  showAllCoverage: boolean;
  showAllShortfalls: boolean;
}

interface InsightsState extends InsightSelections {
  loadState: TaskState;
  loadError: string | null;
  /** True after the first read succeeded. */
  loaded: boolean;
  /** Today in the timezone of this device. The panels count only the days before it. */
  today: string | null;
  entries: InsightEntry[];
  days: InsightDay[];
  calorieTarget: number | null;
  nutrientGoals: InsightsRead["nutrientGoals"];
  proteinTargets: InsightsRead["proteinTargets"];
  referenceSettings: InsightsRead["referenceSettings"];
  collapsed: boolean;
  /** The nutrient of an attention finding that the owner wants to compare foods for. */
  focusedNutrient: NutrientKey | null;
}

/** The insight panels of the owner dashboard: the recent entries, and the choices in each panel. */
export class InsightsLogic extends Logic<InsightsProps, InsightsState> {
  private readonly reads = new LatestRequest(this.signal);

  constructor(deps: InsightsProps) {
    super({
      deps,
      initialState: {
        loadState: "pristine",
        loadError: null,
        loaded: false,
        today: null,
        entries: [],
        days: [],
        calorieTarget: null,
        nutrientGoals: resolveNutrientGoals(),
        proteinTargets: [],
        referenceSettings: {
          vitaminB6UsFnbAdultUlEnabled: false,
          usFnbAdultUlEnabled: false,
        },
        collapsed: false,
        focusedNutrient: null,
        repeatRange: 30,
        repeatMetric: "protein",
        repeatBand: "90–110%",
        repeatDate: null,
        frequencyRange: 30,
        frequencyMetric: "calories",
        frequencyKey: null,
        weeklyMetric: "calories",
        weeklyKey: null,
        scenarioRange: 28,
        scenarioMode: "addition",
        scenarioMultiplier: 1,
        scenarioCandidateId: null,
        scenarioBeforeId: null,
        scenarioAfterId: null,
        sourceRange: 28,
        sourceNutrient: "fiberG",
        sourceKey: null,
        attentionRange: 14,
        shortfallNutrient: null,
        shortfallDate: null,
        excessOption: "sodiumMg:guideline",
        excessDate: null,
        expandedSourceId: null,
        showAllCoverage: false,
        showAllShortfalls: false,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    const { entryEvents, settingsEvents, weightEvents, services } = this.deps;
    for (const emitter of entryEvents) {
      this.listen(emitter, () => this.load());
    }
    for (const emitter of settingsEvents) {
      this.listen(emitter, () => this.load());
    }
    for (const emitter of weightEvents) {
      this.listen(emitter, () => this.load());
    }
    // The owner may come back to the page on another day.
    this.registerCleanup(services.windowFocus.listen(() => void this.load()));
    await this.load();
  }

  /** Read the entries of the last 30 finished days and of today, with the goals to compare them with. */
  async load(): Promise<void> {
    const signal = this.reads.start();
    this.setState({ loadState: "running", loadError: null });
    try {
      const response = await this.deps.api.insights.$get(
        { query: { timezone: this.deps.services.clock.timeZone() } },
        { init: { signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected insights response");
      }
      const read = await response.json();
      if (signal.aborted) {
        return;
      }
      // Each read replaces the entries as a whole, so an edit or a delete cannot leave an old entry behind.
      this.setState({
        loadState: "success",
        loaded: true,
        today: read.toDate,
        entries: read.entries,
        days: buildInsightDays(read),
        calorieTarget: read.calorieTarget,
        nutrientGoals: read.nutrientGoals,
        proteinTargets: read.proteinTargets,
        referenceSettings: read.referenceSettings,
      });
    } catch (error) {
      if (!signal.aborted) {
        this.setState({
          loadState: "error",
          loadError: failureMessage(error),
        });
      }
    }
  }

  toggleCollapsed(): void {
    this.setState({ collapsed: !this.state.collapsed });
  }

  /** Change the choices of the panels. A change that must reset another choice gives both in one patch. */
  choose(patch: Partial<InsightSelections>): void {
    this.setState(patch);
  }

  /** Open the food comparison for the nutrient of an attention finding. */
  compareFoodChange({ nutrient }: { nutrient: NutrientKey }): void {
    this.setState({
      focusedNutrient: nutrient,
      sourceNutrient: nutrient,
      sourceKey: null,
      scenarioCandidateId: null,
      scenarioBeforeId: null,
      scenarioAfterId: null,
    });
  }
}
