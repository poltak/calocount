import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import type { ProteinGoalMode } from "@app/common/features/goals/utils/daily-targets";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import type { SettingsEvent } from "../types.js";
import {
  nutrientGoalDraftFromMap,
  patchOfDraft,
  settingsDraftOf,
  type SettingsDraft,
} from "../utils/settings-draft.js";

type SettingsProps = FrontendLogicProps<never, "clock", "settings">;

interface SettingsState {
  isOpen: boolean;
  /** `null` until the saved settings are read. The form shows the defaults and waits. */
  draft: SettingsDraft | null;
  loadState: TaskState;
  loadError: string | null;
  saveState: TaskState;
  saveError: string | null;
}

/** The settings dialog: the saved targets, timezone and nutrition goals as a form that the owner can save. */
export class SettingsLogic extends Logic<
  SettingsProps,
  SettingsState,
  SettingsEvent
> {
  constructor(deps: SettingsProps) {
    super({
      deps,
      initialState: {
        isOpen: false,
        draft: null,
        loadState: "pristine",
        loadError: null,
        saveState: "pristine",
        saveError: null,
      },
    });
  }

  /** Open the dialog and read the saved settings again, so the form never shows an old save. */
  async open(): Promise<void> {
    this.setState({
      isOpen: true,
      draft: null,
      saveState: "pristine",
      saveError: null,
    });
    await this.executeTask("load", async () => {
      try {
        const response = await this.deps.api.settings.$get(undefined, {
          init: { signal: this.signal },
        });
        await requireApiSuccess(response);
        if (response.status !== 200) {
          throw new Error("Unexpected settings response");
        }
        const { settings } = await response.json();
        this.setState({
          draft: settingsDraftOf({
            saved: settings,
            deviceTimeZone: this.deps.services.clock.timeZone(),
          }),
        });
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      }
    });
  }

  close(): void {
    this.setState({ isOpen: false });
  }

  changeDraft({ change }: { change: Partial<SettingsDraft> }): void {
    const { draft } = this.state;
    if (draft) {
      this.setState({ draft: { ...draft, ...change } });
    }
  }

  changeNutrient({ key, value }: { key: NutrientKey; value: string }): void {
    const { draft } = this.state;
    if (draft) {
      this.setState({
        draft: { ...draft, nutrients: { ...draft.nutrients, [key]: value } },
      });
    }
  }

  setProteinMode({ mode }: { mode: ProteinGoalMode }): void {
    this.changeDraft({ change: { proteinGoalMode: mode } });
  }

  restoreRecommendedGoals(): void {
    this.changeDraft({ change: { nutrients: nutrientGoalDraftFromMap() } });
  }

  chooseDeviceTimeZone(): void {
    this.changeDraft({
      change: { timezone: this.deps.services.clock.timeZone() },
    });
  }

  /** A refused form stays open with the message. A saved form closes, and the dashboard reads the new targets. */
  async save(): Promise<void> {
    const { draft } = this.state;
    if (!draft) {
      return;
    }
    await this.executeTask("save", async () => {
      const result = patchOfDraft(draft);
      if ("error" in result) {
        throw new Error(result.error);
      }
      try {
        const response = await this.deps.api.settings.$patch(
          { json: result.patch },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      }
      this.setState({ isOpen: false });
      this.events.emitDetached({
        type: "settingsSaved",
        message: "Targets saved.",
      });
    });
  }
}
