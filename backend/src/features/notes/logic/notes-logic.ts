import { Logic } from "@shadow/common/features/core/logic/logic";
import type { AuthUser } from "../../auth/services/types.js";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendLogicProps,
  BackendTransactionProps,
} from "../../core/logic/types.js";
import type { Note } from "../storage/types.js";

type NotesProps = BackendLogicProps<"notes"> & BackendTransactionProps;

interface NoteContent {
  title: string;
  body: string;
}

function noteNotFound(): AppError {
  return new AppError({
    code: "NOT_FOUND",
    message: "This note does not exist",
  });
}

/**
 * A user's own notes. A note of another user is the same as no note. Each
 * change and its activity record are one transaction, so neither exists
 * without the other.
 */
export class NotesLogic extends Logic<NotesProps, Record<string, never>> {
  constructor(deps: NotesProps) {
    super({ deps, initialState: {} });
  }

  list({ user }: { user: AuthUser }): Promise<Note[]> {
    return this.deps.storage.notes.listForUser({ userId: user.id });
  }

  async get({ user, id }: { user: AuthUser; id: string }): Promise<Note> {
    const note = await this.deps.storage.notes.findForUser({
      userId: user.id,
      id,
    });
    if (!note) {
      throw noteNotFound();
    }
    return note;
  }

  create({
    user,
    ...content
  }: NoteContent & { user: AuthUser }): Promise<Note> {
    return this.deps.transaction(async (storage) => {
      const note = await storage.notes.create({ userId: user.id, ...content });
      await storage.activity.record({
        userId: user.id,
        action: "note.created",
        subjectId: note.id,
      });
      return note;
    });
  }

  update({
    user,
    ...note
  }: NoteContent & { user: AuthUser; id: string }): Promise<Note> {
    return this.deps.transaction(async (storage) => {
      const updated = await storage.notes.update({ userId: user.id, ...note });
      if (!updated) {
        throw noteNotFound();
      }
      await storage.activity.record({
        userId: user.id,
        action: "note.updated",
        subjectId: updated.id,
      });
      return updated;
    });
  }

  delete({ user, id }: { user: AuthUser; id: string }): Promise<void> {
    return this.deps.transaction(async (storage) => {
      const deleted = await storage.notes.delete({ userId: user.id, id });
      if (!deleted) {
        throw noteNotFound();
      }
      await storage.activity.record({
        userId: user.id,
        action: "note.deleted",
        subjectId: id,
      });
    });
  }
}
