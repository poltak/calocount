import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import type { WeightEvent } from "../types.js";

type WeightProps = FrontendLogicProps<never, never, "weights">;

const WEIGHT_MESSAGE = "Enter a weight between 1 and 1,000 kg.";

interface WeightState {
  /** The text in the weight field, or `null` while the form is closed. */
  draft: string | null;
  saveState: TaskState;
  saveError: string | null;
}

/** The form that adds or changes the weight of a day. */
export class WeightLogic extends Logic<WeightProps, WeightState, WeightEvent> {
  constructor(deps: WeightProps) {
    super({
      deps,
      initialState: { draft: null, saveState: "pristine", saveError: null },
    });
  }

  get busy(): boolean {
    return this.state.saveState === "running";
  }

  /** Start with the weight of the day, or an empty field. */
  openForm({ current }: { current: number | null }): void {
    this.setState({
      draft: current === null ? "" : String(current),
      saveState: "pristine",
      saveError: null,
    });
  }

  closeForm(): void {
    this.setState({ draft: null, saveError: null });
  }

  changeDraft({ value }: { value: string }): void {
    if (this.state.draft !== null) {
      this.setState({ draft: value });
    }
  }

  async save({ date }: { date: string }): Promise<void> {
    const { draft } = this.state;
    if (draft === null) {
      return;
    }
    await this.executeTask("save", async () => {
      const weightKg = Number(draft);
      if (
        draft.trim() === "" ||
        !Number.isFinite(weightKg) ||
        weightKg < 1 ||
        weightKg > 1_000
      ) {
        throw new Error(WEIGHT_MESSAGE);
      }
      try {
        const response = await this.deps.api.weights.$put(
          { json: { logicalDate: date, weightKg } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      }
      this.setState({ draft: null });
      this.events.emitDetached({
        type: "weightSaved",
        message: "Weight saved.",
      });
    });
  }
}
