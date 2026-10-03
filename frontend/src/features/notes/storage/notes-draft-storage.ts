import type { BrowserKeyValueStore } from "../../core/storage/types.js";
import type { NoteDraft, NoteDraftOwner } from "./types.js";

interface NotesDraftStorageDeps {
  store: BrowserKeyValueStore;
}

function storeKey({ userId, noteId }: NoteDraftOwner): string {
  return `notes.draft.${userId}.${noteId ?? "new"}`;
}

/** Unsaved note text, kept in the browser so that a reload does not lose it. */
export class NotesDraftStorage {
  constructor(private readonly deps: NotesDraftStorageDeps) {}

  /** Returns `null` when nothing is stored, or when the stored value is not a draft. */
  read(owner: NoteDraftOwner): NoteDraft | null {
    const stored = this.deps.store.getItem(storeKey(owner));
    if (stored === null) {
      return null;
    }
    try {
      const value: unknown = JSON.parse(stored);
      if (
        typeof value === "object" &&
        value !== null &&
        "title" in value &&
        typeof value.title === "string" &&
        "body" in value &&
        typeof value.body === "string"
      ) {
        return { title: value.title, body: value.body };
      }
    } catch {
      // Another version of the app, or the user, wrote something else here.
    }
    return null;
  }

  write(owner: NoteDraftOwner, { title, body }: NoteDraft): void {
    this.deps.store.setItem(storeKey(owner), JSON.stringify({ title, body }));
  }

  remove(owner: NoteDraftOwner): void {
    this.deps.store.removeItem(storeKey(owner));
  }
}
