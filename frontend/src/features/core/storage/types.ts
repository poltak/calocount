/**
 * The part of the browser's `localStorage` that Storage classes use. A
 * composition root injects it: the browser's own in `main.tsx`, and one in
 * memory in tests.
 */
export type BrowserKeyValueStore = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
