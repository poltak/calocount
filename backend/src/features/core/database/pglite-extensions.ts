import type { Extensions } from "@electric-sql/pglite";

/**
 * The PGlite extensions of each test database. PGlite loads only these, so a
 * migration that creates an extension, such as `pg_trgm` from
 * `@electric-sql/pglite/contrib/pg_trgm`, fails in each test until the
 * extension is here. The project owns this file, so a template sync does not
 * change it.
 */
export const PGLITE_EXTENSIONS: Extensions = {};
