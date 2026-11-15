import type {
  PlannedStatement,
  StatementResult,
} from "../database/planned-statement.js";
import type { BackendServices, BackendStorage } from "../types.js";

export interface BackendLogicProps<
  StorageKeys extends keyof BackendStorage = never,
  ServiceKeys extends keyof BackendServices = never,
> {
  storage: Pick<BackendStorage, StorageKeys>;
  services: Pick<BackendServices, ServiceKeys>;
}

type PlanMethods<Storage> = {
  [
    Key in keyof Storage as Key extends `plan${string}` ? Key : never
  ]: Storage[Key];
};

/** Each Storage class, with only the methods that build a statement and run no query. */
export type PlanningStorage = {
  [Feature in keyof BackendStorage]: PlanMethods<BackendStorage[Feature]>;
};

/**
 * Runs the planned statements in one D1 `batch()`. All commit or none do, in
 * order, and no code runs between them. The result has one entry for each
 * statement, in the same order.
 *
 * D1 has no `transaction()`, because it runs no code between the statements of
 * a transaction. `plan` is synchronous and receives each Storage class in
 * planning form, so a Logic class can plan statements of more than one
 * feature. Each decision goes in the SQL of a statement, or in Logic after the
 * batch.
 */
export type RunAtomic = <
  const Plan extends readonly PlannedStatement<unknown>[],
>(
  plan: (storage: PlanningStorage) => Plan,
) => Promise<{
  -readonly [Index in keyof Plan]: Plan[Index] extends PlannedStatement<
    infer Row
  >
    ? StatementResult<Row>
    : never;
}>;

/** For a Logic class whose operation needs several statements to be one unit. */
export interface BackendAtomicProps {
  atomic: RunAtomic;
}
