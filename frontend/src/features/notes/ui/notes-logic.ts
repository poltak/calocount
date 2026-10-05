import {
  Logic,
  type TaskFieldErrors,
  type TaskState,
} from "@app/common/features/core/logic/logic";
import {
  encodeApiParam,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { AuthEvents } from "../../auth/types.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { NoteDraftPlugin } from "./note-draft-plugin.js";

type NotesProps = FrontendLogicProps<"notesDrafts", never, "notes"> & {
  /** The signed-in user, who owns the drafts in browser storage. */
  userId: string;
  authEvents: AuthEvents;
};

interface Note {
  id: string;
  title: string;
  body: string;
  /** ISO 8601 timestamps, as the API sends them. */
  createdAt: string;
  updatedAt: string;
}

interface NotesState {
  /** The user's notes, with the most recently changed one first. */
  notes: Note[];
  loadState: TaskState;
  loadError: string | null;
  createState: TaskState;
  createError: string | null;
  createFieldErrors: TaskFieldErrors | null;
  removeState: TaskState;
  removeError: string | null;
}

/**
 * The notes page: the user's list of notes, and the form that creates one. The
 * form's fields are in the `draft` plugin.
 */
export class NotesLogic extends Logic<
  NotesProps,
  NotesState,
  never,
  { draft: NoteDraftPlugin }
> {
  constructor(deps: NotesProps) {
    super({
      deps,
      initialState: {
        notes: [],
        loadState: "pristine",
        loadError: null,
        createState: "pristine",
        createError: null,
        createFieldErrors: null,
        removeState: "pristine",
        removeError: null,
      },
      plugins: {
        draft: ({ storage, userId, authEvents }) =>
          new NoteDraftPlugin({
            storage,
            authEvents,
            owner: { userId, noteId: null },
          }),
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    await this.executeTask("load", async () => {
      const response = await this.deps.api.notes.$get(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected notes response");
      }
      const { notes } = await response.json();
      this.setState({ notes });
    });
  }

  async create(): Promise<void> {
    await this.executeTask("create", async () => {
      const { title, body } = this.plugins.draft.state;
      const response = await this.deps.api.notes.$post(
        { json: { title, body } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 201) {
        throw new Error("Unexpected notes response");
      }
      const { note } = await response.json();
      this.setState({ notes: [note, ...this.state.notes] });
      this.plugins.draft.discard();
    });
  }

  /** Delete a note, and the unsaved changes to it in browser storage. */
  async remove(noteId: string): Promise<void> {
    await this.executeTask("remove", async () => {
      const response = await this.deps.api.notes[":noteId"].$delete(
        { param: { noteId: encodeApiParam(noteId) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.setState({
        notes: this.state.notes.filter(({ id }) => id !== noteId),
      });
      this.deps.storage.notesDrafts.remove({
        userId: this.deps.userId,
        noteId,
      });
    });
  }
}
