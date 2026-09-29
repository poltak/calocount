import type { Kysely } from "kysely";

/** Add table types here when the first database migration is defined. */
export interface DatabaseSchema {}

/** The same query builder type is used by live and test storage. */
export type Database = Kysely<DatabaseSchema>;
