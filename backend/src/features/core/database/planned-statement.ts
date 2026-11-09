import { CompiledQuery } from "kysely";

/** One statement of an `atomic` call. A Storage `plan` method returns it. */
export interface PlannedStatement<Row> {
  readonly compiled: CompiledQuery<Row>;
}

/** The result of one statement of an `atomic` call. */
export interface StatementResult<Row> {
  rows: Row[];
  /** The rows that the statement inserted, updated, or deleted. */
  changes: number;
  /** The rows that D1 counts against its daily limit. `null` when the host does not report it. */
  rowsWritten: number | null;
}

/** Plan a Kysely query builder. The plan holds its compiled SQL and parameters. */
export function planQuery<Row>(query: {
  compile(): CompiledQuery<Row>;
}): PlannedStatement<Row> {
  return { compiled: query.compile() };
}

/** Plan a query with no rows that a caller reads: an insert, an update, or a delete. */
export function planWrite(query: {
  compile(): CompiledQuery<unknown>;
}): PlannedStatement<never> {
  return { compiled: query.compile() as CompiledQuery<never> };
}

/**
 * Plan a raw statement, for SQLite features or for a statement that must stay
 * in one piece. `sql` has the database's snake_case names, and the rows come
 * back in camelCase.
 */
export function planRaw<Row = never>({
  sql,
  parameters = [],
}: {
  sql: string;
  parameters?: readonly unknown[];
}): PlannedStatement<Row> {
  return {
    compiled: CompiledQuery.raw(sql, [...parameters]) as CompiledQuery<Row>,
  };
}
