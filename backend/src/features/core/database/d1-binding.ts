/**
 * The part of a Cloudflare D1 binding that this app uses. The dialect and
 * `atomic` depend on this shape, and not on a Cloudflare type, so that the test
 * root can give them the `node:sqlite` wrapper with the same shape. The public
 * type of `backend/testing` then also needs no Cloudflare type.
 */
export interface D1Outcome {
  results?: unknown[];
  meta: {
    changes?: number;
    last_row_id?: number;
    /** Local D1 reports it. The `node:sqlite` wrapper leaves it out. */
    rows_written?: number;
    /** The `node:sqlite` wrapper gives the rows of the result. */
    rows_read?: number;
  };
}

export interface D1BoundStatement {
  all(): Promise<D1Outcome>;
}

export interface D1Statement {
  bind(...values: unknown[]): D1BoundStatement;
}

export interface D1Binding {
  prepare(sql: string): D1Statement;
  /** All statements commit or none do. No code runs between them. */
  batch(statements: D1BoundStatement[]): Promise<D1Outcome[]>;
}
