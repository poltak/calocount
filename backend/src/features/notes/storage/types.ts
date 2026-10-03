import type { Generated, Selectable } from "kysely";

/** The tables of the notes feature. The database fills the generated columns. */
export interface NotesTables {
  note: {
    id: Generated<string>;
    /** The user who owns the note. Every query is limited to one owner. */
    userId: string;
    title: string;
    body: string;
    createdAt: Generated<Date>;
    updatedAt: Generated<Date>;
  };
}

/** A note as its owner sees it. */
export type Note = Omit<Selectable<NotesTables["note"]>, "userId">;
