import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { AppConfig } from "../../core/types.js";
import type { AuthSession } from "../types.js";

type AuthPasskeyManageProps = BackendLogicProps<"auth"> &
  BackendAtomicProps & { config: Pick<AppConfig, "ownerKey"> };

/** The passkeys of the owner: the list, and the removal of one. */
export class AuthPasskeyManageLogic extends Logic<
  AuthPasskeyManageProps,
  Record<string, never>
> {
  constructor(deps: AuthPasskeyManageProps) {
    super({ deps, initialState: {} });
  }

  async list({ session }: { session: AuthSession }) {
    const passkeys = await this.deps.storage.auth.listPasskeys({
      ownerKey: session.ownerKey,
    });
    return passkeys.map((passkey) => ({
      id: passkey.id,
      name: passkey.name,
      createdAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt,
      synced: passkey.backedUp === 1,
      current: passkey.id === session.passkeyId,
    }));
  }

  /**
   * Remove a passkey, such as the one of a lost phone. Its sessions end. The
   * last passkey stays, so the owner keeps a way in. `signedOut` is true when
   * the removed passkey signed in the session that asks.
   */
  async remove({
    session,
    id,
  }: {
    session: AuthSession;
    id: string;
  }): Promise<{ removed: true; signedOut: boolean }> {
    const { ownerKey } = session;
    const [removal, , remaining] = await this.deps.atomic((storage) => [
      storage.auth.planDeletePasskeyIfNotLast({ ownerKey, id }),
      storage.auth.planDeleteSessionsOfRemovedPasskey({
        ownerKey,
        passkeyId: id,
      }),
      storage.auth.planPasskeyExists({ ownerKey, id }),
    ]);
    if (removal.changes === 0) {
      if (remaining.rows[0]?.found === 1) {
        throw new AppError({
          code: "LAST_PASSKEY",
          message: "Add another passkey before you remove this one.",
        });
      }
      throw new AppError({
        code: "NOT_FOUND",
        message: "Passkey not found.",
      });
    }
    return { removed: true, signedOut: session.passkeyId === id };
  }
}
