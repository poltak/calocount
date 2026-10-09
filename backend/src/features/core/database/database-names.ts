import { CamelCasePlugin } from "kysely";

/**
 * The database has snake_case names, and TypeScript has camelCase names. This
 * plugin changes each name in a query and in its result. The auth SDK uses the
 * same query builder, so its tables get snake_case names too. A raw SQL string
 * gets no change, so a migration writes the snake_case names.
 *
 * Without `maintainNestedObjectKeys`, the plugin also changes the keys inside
 * a JSON value that a query returns, and a stored document comes back with
 * other keys.
 */
export class DatabaseNames extends CamelCasePlugin {
  constructor() {
    super({ maintainNestedObjectKeys: true });
  }

  inDatabase(name: string): string {
    return this.snakeCase(name);
  }
}
