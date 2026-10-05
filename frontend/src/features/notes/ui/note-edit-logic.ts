import {
  Logic,
  type TaskFieldErrors,
  type TaskState,
} from "@app/common/features/core/logic/logic";
import {
  encodeApiParam,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { NoteDraftPlugin } from "./note-draft-plugin.js";

type NoteEditProps = FrontendLogicProps<"notesDrafts", never, "notes"> & {
  /** The signed-in user, who owns the drafts in browser storage. */
  userId: string;
  noteId: string;
};

interface NoteEditState {
  loadState: TaskState;
  loadError: string | null;
  saveState: TaskState;
  saveError: string | null;
  saveFieldErrors: TaskFieldErrors | null;
  /** True after the user saved or cancelled. The page then returns to the list. */
  isDone: boolean;
}

/**
 * The page that changes one note. The form's fields are in the `draft` plugin,
 * which starts from the user's unsaved changes when there are some, and from
 * the saved note when there are none.
 */
export class NoteEditLogic extends Logic<
  NoteEditProps,
  NoteEditState,
  never,
  { draft: NoteDraftPlugin }
> {
  constructor(deps: NoteEditProps) {
    super({
      deps,
      initialState: {
        loadState: "pristine",
        loadError: null,
        saveState: "pristine",
        saveError: null,
        saveFieldErrors: null,
        isDone: false,
      },
      plugins: {
        draft: ({ storage, userId, noteId }) =>
          new NoteDraftPlugin({ storage, owner: { userId, noteId } }),
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    await this.executeTask("load", async () => {
      const response = await this.deps.api.notes[":noteId"].$get(
        { param: { noteId: encodeApiParam(this.deps.noteId) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected notes response");
      }
      const { note } = await response.json();
      this.plugins.draft.startFrom(note);
    });
  }

  /** Save the draft as the note's content, then forget the draft. */
  async save(): Promise<void> {
    await this.executeTask("save", async () => {
      const { title, body } = this.plugins.draft.state;
      const response = await this.deps.api.notes[":noteId"].$put(
        {
          param: { noteId: encodeApiParam(this.deps.noteId) },
          json: { title, body },
        },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.plugins.draft.discard();
      this.setState({ isDone: true });
    });
  }

  /** Give up the unsaved changes. */
  cancel(): void {
    this.plugins.draft.discard();
    this.setState({ isDone: true });
  }
}
