import { Logic } from "@app/common/features/core/logic/logic";
import { isUniqueViolation } from "../../core/database/d1-errors.js";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { AppConfig } from "../../core/types.js";
import {
  randomToken,
  secretsEqual,
  sha256Base64Url,
  sha256Hex,
} from "../../core/utils/crypto.js";
import type {
  AuthenticationAnswer,
  AuthenticationOptions,
  RegistrationAnswer,
  RegistrationOptions,
  RelyingParty,
} from "../services/types.js";
import type { ChallengePurpose } from "../storage/types.js";
import { passkeyName } from "../utils/passkey-name.js";
import { SESSION_IDLE_TTL_MS } from "../utils/session-times.js";

const SETUP_CODE_MIN_LENGTH = 12;
const SETUP_CODE_WINDOW_MS = 15 * 60 * 1000;
/** Wrong codes that one network can try in the window. */
const SETUP_CODE_MAX_PER_NETWORK = 10;
/** Wrong codes that all networks together can try in the window. */
const SETUP_CODE_MAX_TOTAL = 50;
const SETUP_CODE_MAX_LENGTH = 500;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TOTAL_ATTEMPTS_KIND = "setup_code";

type SetupCodeState = "missing" | "too_short" | "ready";

type AuthPasskeyProps = BackendLogicProps<"auth", "clock" | "passkeys"> &
  BackendAtomicProps & {
    config: Pick<AppConfig, "ownerKey" | "setupCode">;
  };

/** A passkey answer as the browser sends it. The service checks the rest. */
interface PasskeyAnswer {
  id: string;
}

function transportsOf(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** The passkey ceremonies: set up with the setup code, add a passkey, and sign in. */
export class AuthPasskeyLogic extends Logic<
  AuthPasskeyProps,
  Record<string, never>
> {
  constructor(deps: AuthPasskeyProps) {
    super({ deps, initialState: {} });
  }

  /** What the sign-in page needs to choose between its forms. */
  async status({ signedIn }: { signedIn: boolean }) {
    const { storage, config } = this.deps;
    const passkeys = await storage.auth.countPasskeys({
      ownerKey: config.ownerKey,
    });
    return {
      mode: "passkey" as const,
      signedIn,
      hasPasskeys: passkeys > 0,
      setupCode: this.setupCodeState(),
    };
  }

  /**
   * Start to add a passkey. A signed-in owner can add one. Without a session,
   * the setup code is required: for the first passkey, or after a lost device.
   */
  async startRegistration({
    relyingParty,
    signedIn,
    setupCode,
    clientAddress,
  }: {
    relyingParty: RelyingParty;
    signedIn: boolean;
    setupCode: unknown;
    clientAddress: string | undefined;
  }): Promise<{ options: RegistrationOptions; challengeId: string }> {
    const { storage, services, config } = this.deps;
    if (!signedIn) {
      await this.checkSetupCode({ given: setupCode, clientAddress });
    }
    const existing = await storage.auth.listPasskeys({
      ownerKey: config.ownerKey,
    });
    const options = await services.passkeys.createRegistrationOptions({
      relyingParty,
      userHandle: await sha256Base64Url({
        value: `calocount:${config.ownerKey}`,
      }),
      existing: existing.map((passkey) => ({
        id: passkey.id,
        transports: transportsOf(passkey.transportsJson),
      })),
    });
    const challengeId = await this.saveChallenge({
      purpose: "registration",
      challenge: options.challenge,
    });
    return { options, challengeId };
  }

  /**
   * Save a new passkey. The challenge came only to a signed-in owner or to a
   * person with the setup code, and it works once. Without a session, the new
   * passkey also starts a session, and `sessionToken` holds its cookie value.
   */
  async finishRegistration({
    relyingParty,
    signedIn,
    challengeId,
    answer,
    userAgent,
  }: {
    relyingParty: RelyingParty;
    signedIn: boolean;
    challengeId: string;
    answer: PasskeyAnswer;
    userAgent: string;
  }): Promise<{
    passkey: { id: string; name: string };
    sessionToken: string | null;
  }> {
    const { services, config } = this.deps;
    const now = services.clock.now();
    const challenge = await this.takeChallenge({
      id: challengeId,
      purpose: "registration",
      expiredMessage: "The passkey request expired. Try again.",
    });
    const verified = await services.passkeys.verifyRegistration({
      relyingParty,
      challenge,
      answer: answer as RegistrationAnswer,
    });
    if (!verified) {
      throw this.passkeyInvalid();
    }
    const name = passkeyName({ userAgent });
    const session = signedIn ? null : await this.newSession({ now });
    try {
      await this.deps.atomic((storage) => [
        storage.auth.planInsertPasskey({
          id: verified.id,
          ownerKey: config.ownerKey,
          publicKey: verified.publicKey,
          counter: verified.counter,
          transportsJson: JSON.stringify(verified.transports),
          deviceType: verified.deviceType,
          backedUp: verified.backedUp ? 1 : 0,
          name,
          createdAt: now,
        }),
        ...(session
          ? [
              storage.auth.planInsertSession({
                ...session.row,
                passkeyId: verified.id,
              }),
            ]
          : []),
      ]);
    } catch (error) {
      if (isUniqueViolation({ error, column: "passkeys.id" })) {
        throw new AppError({
          code: "PASSKEY_EXISTS",
          message: "This passkey is already saved.",
        });
      }
      throw error;
    }
    return {
      passkey: { id: verified.id, name },
      sessionToken: session?.token ?? null,
    };
  }

  async startSignIn({
    relyingParty,
  }: {
    relyingParty: RelyingParty;
  }): Promise<{ options: AuthenticationOptions; challengeId: string }> {
    const { storage, services, config } = this.deps;
    if ((await storage.auth.countPasskeys({ ownerKey: config.ownerKey })) < 1) {
      throw new AppError({
        code: "SETUP_REQUIRED",
        message: "No passkey exists yet. Set up Calocount with the setup code.",
      });
    }
    const options = await services.passkeys.createAuthenticationOptions({
      relyingParty,
    });
    const challengeId = await this.saveChallenge({
      purpose: "authentication",
      challenge: options.challenge,
    });
    return { options, challengeId };
  }

  /** Check a passkey answer and start a session. `sessionToken` holds its cookie value. */
  async finishSignIn({
    relyingParty,
    challengeId,
    answer,
  }: {
    relyingParty: RelyingParty;
    challengeId: string;
    answer: PasskeyAnswer;
  }): Promise<{ sessionToken: string }> {
    const { storage, services, config } = this.deps;
    const now = services.clock.now();
    const challenge = await this.takeChallenge({
      id: challengeId,
      purpose: "authentication",
      expiredMessage: "The sign-in request expired. Try again.",
    });
    const passkey = await storage.auth.findPasskey({
      ownerKey: config.ownerKey,
      id: answer.id,
    });
    if (!passkey) {
      throw new AppError({
        code: "PASSKEY_UNKNOWN",
        message: "This passkey does not belong to this Calocount.",
      });
    }
    const verified = await services.passkeys.verifyAuthentication({
      relyingParty,
      challenge,
      answer: answer as AuthenticationAnswer,
      passkey: {
        id: passkey.id,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: transportsOf(passkey.transportsJson),
      },
    });
    if (!verified) {
      throw this.passkeyInvalid();
    }
    const session = await this.newSession({ now });
    await this.deps.atomic((planning) => [
      planning.auth.planPasskeyUsed({
        id: passkey.id,
        counter: verified.newCounter,
        backedUp: verified.backedUp ? 1 : 0,
        now,
      }),
      planning.auth.planInsertSession({
        ...session.row,
        passkeyId: passkey.id,
      }),
    ]);
    return { sessionToken: session.token };
  }

  private passkeyInvalid(): AppError {
    return new AppError({
      code: "PASSKEY_INVALID",
      message: "The passkey could not be checked. Try again.",
    });
  }

  private setupCodeState(): SetupCodeState {
    const { setupCode } = this.deps.config;
    if (!setupCode) {
      return "missing";
    }
    return setupCode.length < SETUP_CODE_MIN_LENGTH ? "too_short" : "ready";
  }

  /** The row of a new session and its token. The database holds only a hash of the token. */
  private async newSession({ now }: { now: number }) {
    const token = randomToken();
    return {
      token,
      row: {
        id: await sha256Hex({ value: token }),
        ownerKey: this.deps.config.ownerKey,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + SESSION_IDLE_TTL_MS,
      },
    };
  }

  private async saveChallenge({
    purpose,
    challenge,
  }: {
    purpose: ChallengePurpose;
    challenge: string;
  }): Promise<string> {
    const { storage, services, config } = this.deps;
    const id = randomToken();
    const now = services.clock.now();
    await storage.auth.insertChallenge({
      id,
      ownerKey: config.ownerKey,
      purpose,
      challenge,
      createdAt: now,
      expiresAt: now + CHALLENGE_TTL_MS,
    });
    return id;
  }

  /** The challenge works once, and only before it expires. */
  private async takeChallenge({
    id,
    purpose,
    expiredMessage,
  }: {
    id: string;
    purpose: ChallengePurpose;
    expiredMessage: string;
  }): Promise<string> {
    const { storage, services, config } = this.deps;
    const taken = await storage.auth.takeChallenge({
      id,
      ownerKey: config.ownerKey,
      purpose,
    });
    if (!taken || taken.expiresAt <= services.clock.now()) {
      throw new AppError({
        code: "CHALLENGE_EXPIRED",
        message: expiredMessage,
      });
    }
    return taken.challenge;
  }

  /**
   * Check the setup code that lets a person add a passkey without a session.
   * Each network has a limit of wrong codes, and all networks together have a
   * higher one, so guessing a long code is not practical and one network
   * cannot lock the owner out. A correct code does not count.
   */
  private async checkSetupCode({
    given,
    clientAddress,
  }: {
    given: unknown;
    clientAddress: string | undefined;
  }): Promise<void> {
    const { services, config } = this.deps;
    const state = this.setupCodeState();
    if (state === "missing") {
      throw new AppError({
        code: "SETUP_CODE_MISSING",
        message:
          "This Calocount has no setup code. Add the secret CALOCOUNT_SETUP_CODE to the Worker.",
      });
    }
    if (state === "too_short") {
      throw new AppError({
        code: "SETUP_CODE_TOO_SHORT",
        message: `The setup code must have at least ${SETUP_CODE_MIN_LENGTH} characters. Change the secret CALOCOUNT_SETUP_CODE.`,
      });
    }

    const now = services.clock.now();
    const network = (
      await sha256Hex({
        value: `calocount-network:${clientAddress ?? "unknown"}`,
      })
    ).slice(0, 32);
    const networkKind = `setup_code:${network}`;
    const rows = [networkKind, TOTAL_ATTEMPTS_KIND].map((kind) => ({
      id: randomToken({ bytes: 16 }),
      kind,
      createdAt: now,
    }));
    const since = now - SETUP_CODE_WINDOW_MS;
    // The rows go in first, in the same batch as the counts, so parallel
    // requests cannot pass a limit together.
    const [, perNetwork, total] = await this.deps.atomic((storage) => [
      storage.auth.planInsertAttempts(rows),
      storage.auth.planCountAttempts({ kind: networkKind, since }),
      storage.auth.planCountAttempts({ kind: TOTAL_ATTEMPTS_KIND, since }),
    ]);
    const ids = rows.map((row) => row.id);
    if (
      (perNetwork.rows[0]?.total ?? 0) > SETUP_CODE_MAX_PER_NETWORK ||
      (total.rows[0]?.total ?? 0) > SETUP_CODE_MAX_TOTAL
    ) {
      // A refused attempt leaves no rows, so refused requests do not use up a shared limit.
      await this.deps.atomic((storage) => [
        storage.auth.planDeleteAttempts({ ids }),
      ]);
      throw new AppError({
        code: "RATE_LIMITED",
        message: "Too many wrong setup codes. Wait 15 minutes, then try again.",
      });
    }
    if (
      typeof given !== "string" ||
      given.length > SETUP_CODE_MAX_LENGTH ||
      !(await secretsEqual({ a: given.trim(), b: config.setupCode }))
    ) {
      throw new AppError({
        code: "INVALID_SETUP_CODE",
        message: "The setup code is not correct.",
      });
    }
    await this.deps.atomic((storage) => [
      storage.auth.planDeleteAttempts({ ids }),
    ]);
  }
}
