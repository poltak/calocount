import {
  planWrite,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import type { NewGoalChange, NewSettings, SettingsRow } from "./types.js";

/** A second save leaves these as the first save made them. */
const KEPT_COLUMNS: ReadonlySet<string> = new Set([
  "id",
  "ownerKey",
  "createdAt",
]);

/** The settings row of the owner, and the record of its goal changes. */
export class SettingsStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  findSettings({
    ownerKey,
  }: {
    ownerKey: string;
  }): Promise<SettingsRow | undefined> {
    return this.deps.db
      .selectFrom("settings")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .executeTakeFirst();
  }

  /** The owner has one row. A second save changes the values and keeps the ID and the creation time. */
  planSaveSettings(settings: NewSettings): PlannedStatement<never> {
    const changes = Object.fromEntries(
      Object.entries(settings).filter(([column]) => !KEPT_COLUMNS.has(column)),
    ) as Partial<NewSettings>;
    return planWrite(
      this.deps.db
        .insertInto("settings")
        .values(settings)
        .onConflict((conflict) =>
          conflict.column("ownerKey").doUpdateSet(changes),
        ),
    );
  }

  planInsertGoalChange(change: NewGoalChange): PlannedStatement<never> {
    return planWrite(this.deps.db.insertInto("goalChanges").values(change));
  }
}
