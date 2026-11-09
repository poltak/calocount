import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { MealWithItems } from "../storage/types.js";
import {
  buildEntryRows,
  readSnapshot,
  serialiseSavedEntry,
  snapshotOf,
} from "../utils/entry-rows.js";
import { newId } from "../utils/ids.js";

type SavedEntriesProps = BackendLogicProps<"entries", "clock"> &
  BackendAtomicProps;

const SAVED_NOT_FOUND = {
  code: "NOT_FOUND",
  message: "Saved entry not found.",
} as const;

/** Entries that the owner keeps to track again. */
export class SavedEntriesLogic extends Logic<
  SavedEntriesProps,
  Record<string, never>
> {
  constructor(deps: SavedEntriesProps) {
    super({ deps, initialState: {} });
  }

  /** A saved entry with damaged text is left out, so it cannot hide the others. */
  async list({ ownerKey }: { ownerKey: string }) {
    const rows = await this.deps.storage.entries.listSavedEntries({ ownerKey });
    return rows.flatMap((row) => {
      const snapshot = readSnapshot(row);
      return snapshot ? [serialiseSavedEntry(row, snapshot)] : [];
    });
  }

  /** Saving an entry that is already saved replaces its snapshot. */
  async save({
    ownerKey,
    sourceEntryId,
  }: {
    ownerKey: string;
    sourceEntryId: string;
  }) {
    const { storage, atomic, services } = this.deps;
    const source = await storage.entries.findEntry({
      ownerKey,
      id: sourceEntryId,
    });
    if (!source) {
      throw new AppError({ code: "NOT_FOUND", message: "Entry not found." });
    }
    const timestamp = services.clock.now();
    const snapshot = snapshotOf(source);
    await atomic((planning) => [
      planning.entries.planUpsertSavedEntry({
        id: newId("saved"),
        ownerKey,
        sourceMealId: sourceEntryId,
        snapshotJson: JSON.stringify(snapshot),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ]);
    const saved = await storage.entries.findSavedEntryOfSource({
      ownerKey,
      sourceMealId: sourceEntryId,
    });
    if (!saved) {
      throw new AppError({
        code: "INTERNAL",
        message: "The entry was not saved.",
      });
    }
    return serialiseSavedEntry(saved, snapshot);
  }

  /** The guard is in the statement: a saved entry that is gone deletes no row. */
  async remove({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<void> {
    const [removal] = await this.deps.atomic((planning) => [
      planning.entries.planDeleteSavedEntry({ ownerKey, id }),
    ]);
    if (removal.changes === 0) {
      throw new AppError(SAVED_NOT_FOUND);
    }
  }

  /** Log a new entry from the snapshot of a saved entry. */
  async track({
    ownerKey,
    id,
    consumedAt,
  }: {
    ownerKey: string;
    id: string;
    consumedAt: number | undefined;
  }): Promise<MealWithItems> {
    const { storage, atomic, services } = this.deps;
    const row = await storage.entries.findSavedEntry({ ownerKey, id });
    const snapshot = row ? readSnapshot(row) : null;
    if (!snapshot) {
      throw new AppError(SAVED_NOT_FOUND);
    }
    const rows = buildEntryRows({
      ownerKey,
      input: {
        ...snapshot,
        consumedAt: consumedAt ?? services.clock.now(),
        source: "saved-entry",
        savedEntryId: id,
      },
      timestamp: services.clock.now(),
    });
    await atomic((planning) => planning.entries.planInsertEntry(rows));
    const entry = await storage.entries.findEntry({
      ownerKey,
      id: rows.meal.id,
    });
    if (!entry) {
      throw new AppError({
        code: "INTERNAL",
        message: "The entry was not saved.",
      });
    }
    return entry;
  }
}
