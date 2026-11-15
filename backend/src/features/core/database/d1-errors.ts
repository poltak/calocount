/**
 * D1 reports a broken constraint only as message text, and a batch rolls back
 * as a whole. So a Storage class reads the text here, and gives Logic a typed
 * result. Nothing else may match on a database message.
 */
/** `column` has the form `table.column` of the database, such as `passkeys.id`. */
export function isUniqueViolation({
  error,
  column,
}: {
  error: unknown;
  column: string;
}): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("UNIQUE constraint failed") && message.includes(column)
  );
}
