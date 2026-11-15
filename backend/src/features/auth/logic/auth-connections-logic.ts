import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type AuthConnectionsProps = BackendLogicProps<"auth", "clock"> &
  BackendAtomicProps;

/** The apps that the owner connected to the MCP endpoint: list, disconnect, and the clean-up of old rows. */
export class AuthConnectionsLogic extends Logic<
  AuthConnectionsProps,
  Record<string, never>
> {
  constructor(deps: AuthConnectionsProps) {
    super({ deps, initialState: {} });
  }

  list({ ownerKey }: { ownerKey: string }) {
    return this.deps.storage.auth.listConnections({ ownerKey });
  }

  /** Remove a connection and stop all of its tokens. */
  async remove({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<void> {
    const grantId = await this.deps.storage.auth.findGrantIdOfOwner({
      ownerKey,
      id,
    });
    if (!grantId) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Connection not found.",
      });
    }
    await this.deps.atomic((planning) =>
      planning.auth.planDeleteGrant({ id: grantId }),
    );
  }

  /** The hourly clean-up of expired sessions, challenges, codes and tokens. */
  async cleanupExpired(): Promise<void> {
    const now = this.deps.services.clock.now();
    await this.deps.atomic((planning) =>
      planning.auth.planDeleteExpired({ now, olderThan: now - DAY_MS }),
    );
  }
}
