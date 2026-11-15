import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  zonedCalendar,
  zonedTimestamp,
} from "@app/common/features/core/utils/logical-date";
import { entryKind } from "@app/common/features/entries/utils/entry-kind";
import {
  requireApiSuccess,
  encodeApiParam,
} from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { EntryEvent } from "../types.js";
import type { SavedEntry } from "../utils/api-types.js";
import { clockTime } from "../../core/utils/dashboard-format.js";
import type { EntryView, PendingEntry } from "../utils/entry-view.js";
import { pendingEntry } from "../utils/entry-view.js";
import { failureMessage } from "../../core/logic/failure-message.js";

type EntryActionsProps = FrontendLogicProps<
  never,
  "clock" | "dialogs",
  "meals" | "saved-entries"
>;

/** The button that shows its busy label: the action, and the entry or saved entry that it runs on. */
export interface RunningAction {
  kind: "delete" | "copy" | "duplicate" | "track" | "remove";
  entryId: string;
}

interface EntryActionsState {
  /** One action runs at a time. This is its state, and the error of the last one. */
  actState: TaskState;
  actError: string | null;
  runningAction: RunningAction | null;
  /** The row that stands for the entry that a running action adds. It goes when the dashboard has read the day again, or when the action fails. */
  pendingEntries: PendingEntry[];
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
      initialState: {
        actState: "pristine",
        actError: null,
        runningAction: null,
        pendingEntries: [],
      },
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
    await this.act({
      running: { kind: "delete", entryId: entry.id },
      work: async () => {
        const response = await this.deps.api.meals[":id"].$delete(
          { param: { id: encodeApiParam(entry.id) } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        const photoDeleted =
          response.status === 200 ? (await response.json()).photoDeleted : true;
        return {
          type: "entriesChanged",
          message: photoDeleted
            ? "Entry deleted."
            : "Entry deleted. Its photo could not be removed.",
        };
      },
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
      date: today,
      kind: "copy",
      message: `Copied “${entry.name}” to today.`,
    });
  }

  /** Add the same entry again at its own time. */
  async duplicateEntry({ entry }: { entry: EntryView }): Promise<void> {
    await this.copy({
      entry,
      consumedAt: entry.consumedAt,
      date: zonedCalendar(this.deps.services.clock.timeZone()).dateKey(
        entry.consumedAt,
      ),
      kind: "duplicate",
      message: `Duplicated “${entry.name}”.`,
    });
  }

  async saveForLater({ entry }: { entry: EntryView }): Promise<void> {
    await this.act({
      work: async () => {
        const response = await this.deps.api["saved-entries"].$post(
          { json: { sourceEntryId: entry.id } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        return {
          type: "savedEntriesChanged",
          message: "Added to saved entries.",
        };
      },
    });
  }

  async removeSaved({ saved }: { saved: SavedEntry }): Promise<void> {
    await this.act({
      running: { kind: "remove", entryId: saved.id },
      work: async () => {
        const response = await this.deps.api["saved-entries"][":id"].$delete(
          { param: { id: encodeApiParam(saved.id) } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        return {
          type: "savedEntriesChanged",
          message: "Removed from saved entries.",
        };
      },
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
    const consumedAt = this.timeOnDay({ date: today });
    const itemNames = saved.items.map((item) => item.name).filter(Boolean);
    const name = itemNames[0] || saved.caption || "Saved entry";
    const { clock } = this.deps.services;
    await this.act({
      running: { kind: "track", entryId: saved.id },
      pending: pendingEntry({
        date: today,
        pending: "copying",
        entry: {
          consumedAt,
          time: clockTime(consumedAt, clock.timeZone()),
          name,
          description:
            saved.caption ||
            itemNames.join(", ") ||
            "Tracked from saved entries",
          kind: entryKind(saved.entryType),
          calories: saved.totalCalories,
          protein: saved.totalProteinG,
          carbs: saved.totalCarbsG,
          fat: saved.totalFatG,
          savedEntryId: saved.id,
          photoKey: null,
          publicPhoto: false,
          items: [],
        },
      }),
      work: async () => {
        const response = await this.deps.api["saved-entries"][
          ":id"
        ].track.$post(
          { param: { id: encodeApiParam(saved.id) }, json: { consumedAt } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        return {
          type: "entriesChanged",
          message: `Tracked “${name}”.`,
          date: today,
        };
      },
    });
  }

  private async copy({
    entry,
    consumedAt,
    date,
    kind,
    message,
  }: {
    entry: EntryView;
    consumedAt: number;
    /** The day that the copy belongs to. */
    date: string;
    kind: "copy" | "duplicate";
    message: string;
  }): Promise<void> {
    await this.act({
      running: { kind, entryId: entry.id },
      pending: pendingEntry({
        date,
        pending: kind === "copy" ? "copying" : "duplicating",
        entry: {
          ...entry,
          consumedAt,
          time: clockTime(consumedAt, this.deps.services.clock.timeZone()),
          savedEntryId: null,
          photoKey: null,
          publicPhoto: false,
        },
      }),
      work: async () => {
        const response = await this.deps.api.meals[":id"].copy.$post(
          { param: { id: encodeApiParam(entry.id) }, json: { consumedAt } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        return { type: "entriesChanged", message };
      },
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

  /**
   * Run one action, and wait until the dashboard has read again, so that the
   * pending row stays until the real one shows. A failure becomes the text that
   * the page shows.
   */
  private async act({
    running = null,
    pending,
    work,
  }: {
    running?: RunningAction | null;
    pending?: PendingEntry;
    work: () => Promise<EntryEvent>;
  }): Promise<void> {
    await this.executeTask("act", async () => {
      this.setState({
        runningAction: running,
        pendingEntries: pending ? [pending] : [],
      });
      try {
        const event = await work();
        try {
          await this.events.emit(event);
        } catch {
          // A listener that fails does not undo a change that the backend kept.
        }
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      } finally {
        this.setState({ runningAction: null, pendingEntries: [] });
      }
    });
  }
}
