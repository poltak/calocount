import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { AppConfig } from "../../core/types.js";
import { sha256Hex } from "../../core/utils/crypto.js";
import type { AuthSession } from "../types.js";
import {
  SESSION_IDLE_TTL_MS,
  SESSION_RENEW_AFTER_MS,
} from "../utils/session-times.js";

type AuthSessionProps = BackendLogicProps<"auth", "clock"> & {
  config: Pick<AppConfig, "ownerKey">;
};

/** Reads and ends the session of a cookie token. Passkey sign-in starts one. */
export class AuthSessionLogic extends Logic<
  AuthSessionProps,
  Record<string, never>
> {
  constructor(deps: AuthSessionProps) {
    super({ deps, initialState: {} });
  }

  /**
   * The live session of a token, or `null`. A session that was last seen more
   * than a day ago gets a new end, so an owner who uses the app stays signed in.
   */
  async authenticate({
    token,
  }: {
    token: string;
  }): Promise<AuthSession | null> {
    const { storage, services, config } = this.deps;
    const id = await sha256Hex({ value: token });
    const now = services.clock.now();
    const session = await storage.auth.findSession({
      id,
      ownerKey: config.ownerKey,
      now,
    });
    if (!session) {
      return null;
    }
    if (now - session.lastSeenAt > SESSION_RENEW_AFTER_MS) {
      await storage.auth.renewSession({
        id,
        now,
        expiresAt: now + SESSION_IDLE_TTL_MS,
      });
    }
    return { ownerKey: session.ownerKey, passkeyId: session.passkeyId };
  }

  async endSession({ token }: { token: string }): Promise<void> {
    await this.deps.storage.auth.deleteSession({
      id: await sha256Hex({ value: token }),
    });
  }
}
