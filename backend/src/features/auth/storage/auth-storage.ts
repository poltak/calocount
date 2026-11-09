import type { BackendStorageProps } from "../../core/storage/types.js";

/** Read-only setup queries over the SDK's user table. SDK writes stay in its adapter. */
export class AuthStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  async getUserCount(): Promise<number> {
    const result = await this.deps.db
      .selectFrom("user")
      .select((expression) => expression.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }
}
