import type { BackendStorageProps } from "../../core/storage/types.js";
import type { Note } from "./types.js";

const NOTE_COLUMNS = ["id", "title", "body", "createdAt", "updatedAt"] as const;

/** Notes, always limited to the one user who owns them. */
export class NotesStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  listForUser({ userId }: { userId: string }): Promise<Note[]> {
    return this.deps.db
      .selectFrom("note")
      .select(NOTE_COLUMNS)
      .where("userId", "=", userId)
      .orderBy("updatedAt", "desc")
      .orderBy("id")
      .execute();
  }

  findForUser({
    userId,
    id,
  }: {
    userId: string;
    id: string;
  }): Promise<Note | undefined> {
    return this.deps.db
      .selectFrom("note")
      .select(NOTE_COLUMNS)
      .where("id", "=", id)
      .where("userId", "=", userId)
      .executeTakeFirst();
  }

  create(note: { userId: string; title: string; body: string }): Promise<Note> {
    return this.deps.db
      .insertInto("note")
      .values(note)
      .returning(NOTE_COLUMNS)
      .executeTakeFirstOrThrow();
  }

  update({
    userId,
    id,
    title,
    body,
  }: {
    userId: string;
    id: string;
    title: string;
    body: string;
  }): Promise<Note | undefined> {
    return this.deps.db
      .updateTable("note")
      .set({ title, body })
      .where("id", "=", id)
      .where("userId", "=", userId)
      .returning(NOTE_COLUMNS)
      .executeTakeFirst();
  }

  /** Returns `false` when the user has no such note. */
  async delete({
    userId,
    id,
  }: {
    userId: string;
    id: string;
  }): Promise<boolean> {
    const result = await this.deps.db
      .deleteFrom("note")
      .where("id", "=", id)
      .where("userId", "=", userId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
