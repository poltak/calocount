import {
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
} from "kysely";
import type { D1Binding } from "./d1-binding.js";

const NO_TRANSACTION =
  "D1 has no interactive transaction. Use `atomic`, which sends one batch.";

class D1Connection implements DatabaseConnection {
  constructor(private readonly binding: D1Binding) {}

  async executeQuery<Row>(query: CompiledQuery): Promise<QueryResult<Row>> {
    const outcome = await this.binding
      .prepare(query.sql)
      .bind(...query.parameters)
      .all();
    return {
      rows: (outcome.results ?? []) as Row[],
      numAffectedRows: BigInt(outcome.meta.changes ?? 0),
      insertId: BigInt(outcome.meta.last_row_id ?? 0),
    };
  }

  // A generator that throws, because the interface asks for an iterator.
  // oxlint-disable-next-line require-yield
  async *streamQuery<Row>(): AsyncIterableIterator<QueryResult<Row>> {
    throw new Error("D1 cannot stream the rows of a query");
  }
}

/**
 * Each query is one call to the binding, so a connection holds nothing. The
 * transaction methods throw, because D1 runs no code between statements.
 */
class D1Driver implements Driver {
  private readonly connection: D1Connection;

  constructor(binding: D1Binding) {
    this.connection = new D1Connection(binding);
  }

  async init(): Promise<void> {
    // No pool and no socket to open.
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }

  async beginTransaction(): Promise<void> {
    throw new Error(NO_TRANSACTION);
  }

  async commitTransaction(): Promise<void> {
    throw new Error(NO_TRANSACTION);
  }

  async rollbackTransaction(): Promise<void> {
    throw new Error(NO_TRANSACTION);
  }

  async releaseConnection(): Promise<void> {
    // The connection stays for the next query.
  }

  async destroy(): Promise<void> {
    // The binding belongs to the platform.
  }
}

/**
 * The SQL of SQLite, without the lock of a SQLite file. For a dialect with one
 * connection, Kysely runs one query at a time for each `Kysely` object, behind
 * one promise. D1 has no connection, and the App lives for an isolate. So that
 * lock would make each request of an isolate wait for the others, and a request
 * that the runtime stops while it holds the lock would stop each later query of
 * the isolate.
 */
class D1Adapter extends SqliteAdapter {
  override get supportsMultipleConnections(): boolean {
    return true;
  }
}

/** A Kysely dialect around a D1 binding. It opens nothing, so it is safe to keep for an isolate. */
export class D1Dialect implements Dialect {
  constructor(private readonly deps: { binding: D1Binding }) {}

  createAdapter(): DialectAdapter {
    return new D1Adapter();
  }

  createDriver(): Driver {
    return new D1Driver(this.deps.binding);
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }
}
