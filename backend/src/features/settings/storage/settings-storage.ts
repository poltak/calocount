import type { BackendStorageProps } from "../../core/storage/types.js";
import type { SettingsRow } from "./types.js";

/** The settings row of the owner. */
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
}
