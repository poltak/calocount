import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { zonedTimestamp } from "@app/common/features/core/utils/logical-date";
import {
  entryKind,
  entryKindForTime,
  type EntryKind,
} from "@app/common/features/entries/utils/entry-kind";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { EntryEvent } from "../types.js";
import { clockTime } from "../../core/utils/dashboard-format.js";
import {
  editBody,
  newEntryBody,
  startDraft,
  type EditDraft,
  type NewEntryValues,
  type TotalField,
} from "../utils/entry-form.js";
import type { EntryView } from "../utils/entry-view.js";
import { failureMessage } from "../../core/logic/failure-message.js";

type EntryFormProps = FrontendLogicProps<never, "clock", "meals">;

interface EntryFormState {
  addFormOpen: boolean;
  /** The time that the form for a new entry starts with. */
  formTime: string;
  /** The type that the form for a new entry suggests for that time. */
  formKind: EntryKind;
  addEntryState: TaskState;
  addEntryError: string | null;
  /** The open edit, or `null`. Only one entry is edited at a time. */
  draft: EditDraft | null;
  saveEntryState: TaskState;
  saveEntryError: string | null;
}

/** A change to a text field of the edit. */
type DraftChange =
  | { field: "name" | "description"; value: string }
  | { field: TotalField; value: string }
  | { field: "kind"; value: string };

/** The form for a new entry, and the edit of an entry. */
export class EntryFormLogic extends Logic<
  EntryFormProps,
  EntryFormState,
  EntryEvent
> {
  constructor(deps: EntryFormProps) {
    super({
      deps,
      initialState: {
        addFormOpen: false,
        formTime: "",
        formKind: "snack",
        addEntryState: "pristine",
        addEntryError: null,
        draft: null,
        saveEntryState: "pristine",
        saveEntryError: null,
      },
    });
  }

  /** True while a request of this Logic runs, so the page can hold the other actions. */
  get busy(): boolean {
    return (
      this.state.addEntryState === "running" ||
      this.state.saveEntryState === "running"
    );
  }

  /** Start the form at the time of day on this device, with the type that fits it. */
  openAddForm(): void {
    const { clock } = this.deps.services;
    const formTime = clockTime(clock.now(), clock.timeZone());
    this.setState({
      addFormOpen: true,
      formTime,
      formKind: entryKindForTime(formTime),
      addEntryState: "pristine",
      addEntryError: null,
    });
  }

  closeAddForm(): void {
    this.setState({ addFormOpen: false });
  }

  /** Log an entry on `date`, at the time in the form. */
  async addEntry({
    date,
    values,
  }: {
    date: string;
    values: NewEntryValues;
  }): Promise<void> {
    await this.executeTask("addEntry", async () => {
      const consumedAt = zonedTimestamp({
        date,
        time: values.time,
        timeZone: this.deps.services.clock.timeZone(),
      });
      if (consumedAt === null) {
        throw new Error("Enter a valid entry time.");
      }
      try {
        const response = await this.deps.api.meals.$post(
          { json: newEntryBody({ values, consumedAt }) },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      }
      this.setState({ addFormOpen: false });
      this.events.emitDetached({
        type: "entriesChanged",
        message: "Entry added.",
      });
    });
  }

  startEdit({ entry }: { entry: EntryView }): void {
    this.setState({
      draft: startDraft(entry),
      saveEntryState: "pristine",
      saveEntryError: null,
    });
  }

  cancelEdit(): void {
    this.setState({ draft: null });
  }

  changeDraft(change: DraftChange): void {
    const { draft } = this.state;
    if (!draft) {
      return;
    }
    if (change.field === "kind") {
      this.setState({ draft: { ...draft, kind: entryKind(change.value) } });
    } else if (change.field === "name" || change.field === "description") {
      this.setState({ draft: { ...draft, [change.field]: change.value } });
    } else {
      this.setState({
        draft: {
          ...draft,
          totals: { ...draft.totals, [change.field]: change.value },
        },
      });
    }
  }

  /** A typed value counts as entered by hand. A blank value has no origin. */
  changeDraftNutrient({
    itemIndex,
    key,
    value,
  }: {
    itemIndex: number;
    key: NutrientKey;
    value: string;
  }): void {
    this.changeDraftItem({
      itemIndex,
      change: (item) => ({
        nutrients: { ...item.nutrients, [key]: value },
        origins: {
          ...item.origins,
          [key]: value.trim() === "" ? "" : "manual",
        },
      }),
    });
  }

  changeDraftOrigin({
    itemIndex,
    key,
    origin,
  }: {
    itemIndex: number;
    key: NutrientKey;
    origin: string;
  }): void {
    this.changeDraftItem({
      itemIndex,
      change: (item) => ({
        nutrients: item.nutrients,
        // An origin belongs to a known value, so a blank field keeps none.
        origins: {
          ...item.origins,
          [key]: (item.nutrients[key] ?? "").trim() === "" ? "" : origin,
        },
      }),
    });
  }

  async saveEdit(): Promise<void> {
    await this.executeTask("saveEntry", async () => {
      const { draft } = this.state;
      if (!draft) {
        return;
      }
      try {
        const response = await this.deps.api.meals[":id"].$patch(
          { param: { id: draft.original.id }, json: editBody(draft) },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      }
      this.setState({ draft: null });
      this.events.emitDetached({
        type: "entriesChanged",
        message: "Entry saved.",
      });
    });
  }

  private changeDraftItem({
    itemIndex,
    change,
  }: {
    itemIndex: number;
    change: (item: EditDraft["items"][number]) => EditDraft["items"][number];
  }): void {
    const { draft } = this.state;
    const item = draft?.items[itemIndex];
    if (!draft || !item) {
      return;
    }
    this.setState({
      draft: {
        ...draft,
        items: draft.items.map((current, index) =>
          index === itemIndex ? change(item) : current,
        ),
      },
    });
  }
}
