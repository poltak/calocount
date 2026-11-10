import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { zonedTimestamp } from "@app/common/features/core/utils/logical-date";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { EntryEvent } from "../types.js";
import type { SavedEntry } from "../utils/api-types.js";
import { clockTime } from "../../core/utils/dashboard-format.js";
import type { EntryView } from "../utils/entry-view.js";
import { failureMessage } from "../../core/logic/failure-message.js";

type EntryActionsProps = FrontendLogicProps<
  never,
  "clock" | "dialogs",
  "meals" | "saved-entries"
>;

interface EntryActionsState {
  /** One action runs at a time. This is its state, and the error of the last one. */
  actState: TaskState;
  actError: string | null;
}

/** The buttons on an entry and on a saved entry: delete, copy, duplicate, save for later, and track. */
export class EntryActionsLogic extends Logic<
  EntryActionsProps,
  EntryActionsState,
  EntryEvent
> {
  constructor(deps: EntryActionsProps) {
    super({
      deps,
      initialState: { actState: "pristine", actError: null },
    });
  }

  get busy(): boolean {
    return this.state.actState === "running";
  }

  /** Ask first. A no leaves everything as it was. */
  async deleteEntry({ entry }: { entry: EntryView }): Promise<void> {
    const sure = this.deps.services.dialogs.confirm(
      `Delete "${entry.name}"? This removes the entry and its analysis data. This cannot be undone.`,
    );
    if (!sure) {
      return;
    }
    await this.act(async () => {
      const response = await this.deps.api.meals[":id"].$delete(
        { param: { id: entry.id } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.events.emitDetached({
        type: "entriesChanged",
        message: "Entry deleted.",
      });
    });
  }

  /** Copy an entry from an older day to today, at the time of day on this device. */
  async copyEntryToToday({
    entry,
    today,
  }: {
    entry: EntryView;
    today: string;
  }): Promise<void> {
    await this.copy({
      entry,
      consumedAt: this.timeOnDay({ date: today }),
      message: `Copied “${entry.name}” to today.`,
    });
  }

  /** Add the same entry again at its own time. */
  async duplicateEntry({ entry }: { entry: EntryView }): Promise<void> {
    await this.copy({
      entry,
      consumedAt: entry.consumedAt,
      message: `Duplicated “${entry.name}”.`,
    });
  }

  async saveForLater({ entry }: { entry: EntryView }): Promise<void> {
    await this.act(async () => {
      const response = await this.deps.api["saved-entries"].$post(
        { json: { sourceEntryId: entry.id } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.events.emitDetached({
        type: "savedEntriesChanged",
        message: "Added to saved entries.",
      });
    });
  }

  async removeSaved({ saved }: { saved: SavedEntry }): Promise<void> {
    await this.act(async () => {
      const response = await this.deps.api["saved-entries"][":id"].$delete(
        { param: { id: saved.id } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.events.emitDetached({
        type: "savedEntriesChanged",
        message: "Removed from saved entries.",
      });
    });
  }

  /** Log a saved entry for today, at the time of day on this device. */
  async trackSaved({
    saved,
    today,
  }: {
    saved: SavedEntry;
    today: string;
  }): Promise<void> {
    await this.act(async () => {
      const response = await this.deps.api["saved-entries"][":id"].track.$post(
        {
          param: { id: saved.id },
          json: { consumedAt: this.timeOnDay({ date: today }) },
        },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      const name = saved.items[0]?.name || saved.caption || "Saved entry";
      this.events.emitDetached({
        type: "entriesChanged",
        message: `Tracked “${name}”.`,
        date: today,
      });
    });
  }

  private async copy({
    entry,
    consumedAt,
    message,
  }: {
    entry: EntryView;
    consumedAt: number;
    message: string;
  }): Promise<void> {
    await this.act(async () => {
      const response = await this.deps.api.meals[":id"].copy.$post(
        { param: { id: entry.id }, json: { consumedAt } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.events.emitDetached({ type: "entriesChanged", message });
    });
  }

  /** The moment on `date` that has the time of day of this device now. */
  private timeOnDay({ date }: { date: string }): number {
    const { clock } = this.deps.services;
    const now = clock.now();
    const timeZone = clock.timeZone();
    return (
      zonedTimestamp({ date, time: clockTime(now, timeZone), timeZone }) ?? now
    );
  }

  /** Run one action. A failure becomes the text that the page shows. */
  private async act(work: () => Promise<void>): Promise<void> {
    await this.executeTask("act", async () => {
      try {
        await work();
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      }
    });
  }
}
