/** An ID for a new row, with a prefix that tells the kind of row in a log. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
