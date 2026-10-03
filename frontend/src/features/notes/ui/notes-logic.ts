import {
  Logic,
  type TaskFieldErrors,
  type TaskState,
} from "@shadow/common/features/core/logic/logic";
import {
  encodeApiParam,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";

type NotesProps = FrontendLogicProps<never, never, "notes">;

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
  /** The fields of the form that creates a note. */
  newTitle: string;
  newBody: string;
  /** The note that the edit form holds, and that form's fields. */
  editingNoteId: string | null;
  editTitle: string;
  editBody: string;
  loadState: TaskState;
  loadError: string | null;
  createState: TaskState;
  createError: string | null;
  createFieldErrors: TaskFieldErrors | null;
  saveState: TaskState;
  saveError: string | null;
  saveFieldErrors: TaskFieldErrors | null;
  removeState: TaskState;
  removeError: string | null;
}

const NOT_EDITING = {
  editingNoteId: null,
  editTitle: "",
  editBody: "",
} satisfies Partial<NotesState>;

/** The notes page: the user's list of notes, and the forms that change it. */
export class NotesLogic extends Logic<NotesProps, NotesState> {
  constructor(deps: NotesProps) {
    super({
      deps,
      initialState: {
        notes: [],
        newTitle: "",
        newBody: "",
        ...NOT_EDITING,
        loadState: "pristine",
        loadError: null,
        createState: "pristine",
        createError: null,
        createFieldErrors: null,
        saveState: "pristine",
        saveError: null,
        saveFieldErrors: null,
        removeState: "pristine",
        removeError: null,
      },
    });
  }

  protected async onInitialize(): Promise<void> {
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

  setNewTitle(newTitle: string): void {
    this.setState({ newTitle });
  }

  setNewBody(newBody: string): void {
    this.setState({ newBody });
  }

  async create(): Promise<void> {
    await this.executeTask("create", async () => {
      const response = await this.deps.api.notes.$post(
        { json: { title: this.state.newTitle, body: this.state.newBody } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 201) {
        throw new Error("Unexpected notes response");
      }
      const { note } = await response.json();
      this.setState({
        notes: [note, ...this.state.notes],
        newTitle: "",
        newBody: "",
      });
    });
  }

  /** Put a note in the edit form. An unknown ID does nothing. */
  startEditing(noteId: string): void {
    const note = this.state.notes.find(({ id }) => id === noteId);
    if (note) {
      this.setState({
        editingNoteId: note.id,
        editTitle: note.title,
        editBody: note.body,
      });
    }
  }

  setEditTitle(editTitle: string): void {
    this.setState({ editTitle });
  }

  setEditBody(editBody: string): void {
    this.setState({ editBody });
  }

  cancelEditing(): void {
    this.setState(NOT_EDITING);
  }

  /** Save the edit form. The saved note moves to the top of the list. */
  async save(): Promise<void> {
    const noteId = this.state.editingNoteId;
    if (noteId === null) {
      return;
    }
    await this.executeTask("save", async () => {
      const response = await this.deps.api.notes[":noteId"].$put(
        {
          param: { noteId: encodeApiParam(noteId) },
          json: { title: this.state.editTitle, body: this.state.editBody },
        },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected notes response");
      }
      const { note } = await response.json();
      this.setState({
        notes: [note, ...this.state.notes.filter(({ id }) => id !== note.id)],
        ...NOT_EDITING,
      });
    });
  }

  async remove(noteId: string): Promise<void> {
    await this.executeTask("remove", async () => {
      const response = await this.deps.api.notes[":noteId"].$delete(
        { param: { noteId: encodeApiParam(noteId) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.setState({
        notes: this.state.notes.filter(({ id }) => id !== noteId),
        ...(this.state.editingNoteId === noteId ? NOT_EDITING : {}),
      });
    });
  }
}
