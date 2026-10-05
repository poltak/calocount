import type { Selectable } from "kysely";
import type { BaseTable } from "../../core/database/standard-columns.js";

interface NoteTable extends BaseTable {
  /** The user who owns the note. Every query is limited to one owner. */
  userId: string;
  title: string;
  body: string;
}

export interface NotesTables {
  note: NoteTable;
}

export type Note = Omit<Selectable<NoteTable>, "userId">;
