import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type {
  D1Binding,
  D1BoundStatement,
  D1Outcome,
  D1Statement,
} from "../database/d1-binding.js";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../migrations/", import.meta.url),
);

/** The limits of D1. Each one that this wrapper did not enforce would pass in a test and fail in production. */
const MAX_BOUND_PARAMETERS = 100;
const MAX_STATEMENT_BYTES = 100_000;
/** D1 refuses a LIKE or GLOB pattern over 50 bytes: "LIKE or GLOB pattern too complex". */
const MAX_LIKE_PATTERN_BYTES = 50;
/** D1 refuses these, because it runs each batch as its own transaction. */
const TRANSACTION_CONTROL =
  /^\s*(?:begin|commit|end|rollback|savepoint|release)\b/i;

/** A connection to a database in memory, with the limits of D1. */
function openSqlite(): DatabaseSync {
  return new DatabaseSync(":memory:", {
    limits: { likePatternLength: MAX_LIKE_PATTERN_BYTES },
  });
}

function d1Error(message: string, cause?: unknown): Error {
  return new Error(`D1_ERROR: ${message}`, { cause });
}

function toSqliteValue(value: unknown): SQLInputValue {
  if (value === undefined) {
    throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported");
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return value as SQLInputValue;
}

/** D1 gives a BLOB as a list of numbers. */
function toD1Row(row: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    mapped[column] = value instanceof Uint8Array ? Array.from(value) : value;
  }
  return mapped;
}

/**
 * A database on `node:sqlite` with the shape of a D1 binding, for the Node
 * host. The production dialect and `atomic` run on it unchanged. It refuses
 * what D1 refuses, and runs `batch()` in one real transaction.
 *
 * It leaves `rows_written` out of each result.
 */
export class NodeSqliteD1 implements D1Binding {
  constructor(private readonly sqlite: DatabaseSync) {}

  prepare(sql: string): D1Statement {
    return {
      bind: (...values: unknown[]): D1BoundStatement => {
        const bound = values.map(toSqliteValue);
        return new NodeSqliteStatement(this, sql, bound);
      },
    };
  }

  async batch(statements: D1BoundStatement[]): Promise<D1Outcome[]> {
    this.sqlite.exec("BEGIN");
    try {
      const outcomes = statements.map((statement) =>
        this.run(statement as NodeSqliteStatement),
      );
      this.sqlite.exec("COMMIT");
      return outcomes;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  run({ sql, values }: NodeSqliteStatement): D1Outcome {
    if (TRANSACTION_CONTROL.test(sql)) {
      throw d1Error(
        "To execute a transaction, use a batch. D1 has no BEGIN, COMMIT, or SAVEPOINT",
      );
    }
    if (values.length > MAX_BOUND_PARAMETERS) {
      throw d1Error(`too many SQL variables: ${values.length}`);
    }
    if (new TextEncoder().encode(sql).length > MAX_STATEMENT_BYTES) {
      throw d1Error("SQL statement too long");
    }
    const before = this.readNumber("select total_changes() as value");
    let rows: Record<string, unknown>[];
    try {
      rows = this.sqlite.prepare(sql).all(...values) as Record<
        string,
        unknown
      >[];
    } catch (error) {
      throw d1Error(
        error instanceof Error ? error.message : "SQLite failed",
        error,
      );
    }
    const changed = this.readNumber("select total_changes() as value") > before;
    return {
      results: rows.map(toD1Row),
      meta: {
        changes: changed ? this.readNumber("select changes() as value") : 0,
        last_row_id: this.readNumber("select last_insert_rowid() as value"),
        // SQLite does not report the rows that it read. This is the count of the result.
        rows_read: rows.length,
      },
    };
  }

  /**
   * Run each file of `backend/migrations` in the order of its name, as
   * `wrangler d1 migrations apply` does. The old files hold
   * `--> statement-breakpoint` lines. Those are SQL comments, so SQLite reads
   * the whole file, as D1 does.
   */
  migrate(): void {
    for (const file of readdirSync(MIGRATIONS_DIRECTORY)
      .filter((name) => name.endsWith(".sql"))
      .toSorted()) {
      this.sqlite.exec(readFileSync(`${MIGRATIONS_DIRECTORY}${file}`, "utf8"));
    }
  }

  /** All bytes of the database, for a later `openDatabase`. */
  snapshot(): ArrayBuffer {
    return this.sqlite.serialize().slice().buffer as ArrayBuffer;
  }

  private readNumber(sql: string): number {
    return Number((this.sqlite.prepare(sql).get() as { value: number }).value);
  }
}

class NodeSqliteStatement implements D1BoundStatement {
  constructor(
    private readonly database: NodeSqliteD1,
    readonly sql: string,
    readonly values: SQLInputValue[],
  ) {}

  async all(): Promise<D1Outcome> {
    return this.database.run(this);
  }
}

/** A database in memory: empty, or with the contents of a snapshot. */
export function openDatabase({
  snapshot,
}: { snapshot?: ArrayBuffer } = {}): NodeSqliteD1 {
  const sqlite = openSqlite();
  if (snapshot) {
    sqlite.deserialize(new Uint8Array(snapshot));
  }
  return new NodeSqliteD1(sqlite);
}
