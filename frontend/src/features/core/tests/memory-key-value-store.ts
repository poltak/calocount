import type { BrowserKeyValueStore } from "../storage/types.js";

/**
 * Stands in for the browser's `localStorage` in tests. Each test app has its
 * own, and a test reads and writes it directly to assert on what a Storage
 * class stored.
 */
export class MemoryKeyValueStore implements BrowserKeyValueStore {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
}
