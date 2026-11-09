import { CamelCasePlugin } from "kysely";

/**
 * The database has snake_case names, and TypeScript has camelCase names. This
 * plugin changes each name in a query and in its result. A raw SQL string gets
 * no change, so a raw statement writes the snake_case names, and its rows come
 * back in camelCase.
 *
 * Without `maintainNestedObjectKeys`, the plugin also changes the keys inside
 * a JSON value that a query returns, and a stored document comes back with
 * other keys.
 */
export class DatabaseNames extends CamelCasePlugin {
  constructor() {
    super({ maintainNestedObjectKeys: true });
  }

  /** For the rows of `atomic`, which do not pass through the Kysely executor. */
  rowInTypeScript(row: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(row)) {
      mapped[this.camelCase(name)] = value;
    }
    return mapped;
  }

  /** The name that the database has for a TypeScript table or column name. */
  inDatabase(name: string): string {
    return this.snakeCase(name);
  }
}
