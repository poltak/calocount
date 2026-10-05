import type { BackendServices, BackendStorage } from "../types.js";

export interface BackendLogicProps<
  StorageKeys extends keyof BackendStorage = never,
  ServiceKeys extends keyof BackendServices = never,
> {
  storage: Pick<BackendStorage, StorageKeys>;
  services: Pick<BackendServices, ServiceKeys>;
}

/**
 * Runs `run` in one database transaction. The transaction commits when `run`
 * returns, and rolls back when it throws.
 *
 * `run` receives every Storage class, bound to the transaction. This is the
 * one place where a Logic class can use the Storage of another feature. See
 * docs/agents/code-architecture.md (Transactions).
 */
export type RunTransaction = <Result>(
  run: (storage: BackendStorage) => Promise<Result>,
) => Promise<Result>;

/** For a Logic class whose operation needs several writes to be one unit. */
export interface BackendTransactionProps {
  transaction: RunTransaction;
}
