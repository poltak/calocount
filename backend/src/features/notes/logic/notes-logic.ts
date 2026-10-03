import { Logic } from "@shadow/common/features/core/logic/logic";
import type { AuthUser } from "../../auth/services/types.js";
import { AppError } from "../../core/errors/app-error.js";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { Note } from "../storage/types.js";

type NotesProps = BackendLogicProps<"notes">;

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

/** A user's own notes. A note of another user is the same as no note. */
export class NotesLogic extends Logic<NotesProps, Record<string, never>> {
  constructor(deps: NotesProps) {
    super({ deps, initialState: {} });
  }

  list({ user }: { user: AuthUser }): Promise<Note[]> {
    return this.deps.storage.notes.listForUser({ userId: user.id });
  }

  create({
    user,
    ...content
  }: NoteContent & { user: AuthUser }): Promise<Note> {
    return this.deps.storage.notes.create({ userId: user.id, ...content });
  }

  async update({
    user,
    ...note
  }: NoteContent & { user: AuthUser; id: string }): Promise<Note> {
    const updated = await this.deps.storage.notes.update({
      userId: user.id,
      ...note,
    });
    if (!updated) {
      throw noteNotFound();
    }
    return updated;
  }

  async delete({ user, id }: { user: AuthUser; id: string }): Promise<void> {
    const deleted = await this.deps.storage.notes.delete({
      userId: user.id,
      id,
    });
    if (!deleted) {
      throw noteNotFound();
    }
  }
}
