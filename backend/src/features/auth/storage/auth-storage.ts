import type { BackendStorageProps } from "../../core/storage/types.js";

/** Read-only setup queries over the SDK's user table. SDK writes stay in its adapter. */
export class AuthStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  async getUserCount(): Promise<number> {
    const db = this.deps.db.withTables<{
      user: { id: string; email: string };
    }>();
    const result = await db
      .selectFrom("user")
      .select((expression) => expression.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }
}
