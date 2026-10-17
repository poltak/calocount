import { CamelCasePlugin, type DatabaseIntrospector } from "kysely";
import type { Database } from "./database.js";

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

  inTypeScript(name: string): string {
    return this.camelCase(name);
  }
}

/**
 * The query builder with an introspection that gives each table and column
 * name in TypeScript form, as the queries and their results do. The plugin
 * cannot change the introspection, because Kysely runs it without plugins.
 */
export function withTypeScriptNamesInIntrospection(db: Database): Database {
  const names = new DatabaseNames();
  const introspector = (inner: DatabaseIntrospector): DatabaseIntrospector => ({
    getSchemas: () => inner.getSchemas(),
    getTables: async (options) =>
      (await inner.getTables(options)).map((table) => ({
        ...table,
        name: names.inTypeScript(table.name),
        columns: table.columns.map((column) => ({
          ...column,
          name: names.inTypeScript(column.name),
        })),
      })),
  });
  return new Proxy(db, {
    get(target, property) {
      if (property === "introspection") {
        return introspector(target.introspection);
      }
      // Kysely keeps its state in private fields, which only the real
      // instance can read.
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
