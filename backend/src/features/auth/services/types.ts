export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  session: { id: string; userId: string; expiresAt: Date };
}

export interface AuthConfiguration {
  /** Session secret, at least 32 characters. */
  secret: string;
  /** The server's HTTP(S) origin, without a path. */
  baseUrl: string;
  trustedOrigins: string[];
  /**
   * Lets a visitor make an account with `signUpWithPassword`. The auth Logic
   * decides this first. The provider refuses a second time when it is false.
   */
  allowSignUp: boolean;
}

/** A session change, with headers (such as cookies) the HTTP response must carry. */
export interface SessionChange {
  responseHeaders: Headers;
}

interface RateLimited {
  ok: false;
  reason: "rateLimited";
  retryAfterSeconds: number;
}

export type PasswordSignInResult =
  | ({ ok: true; user: AuthUser } & SessionChange)
  | { ok: false; reason: "invalidCredentials" | "untrustedOrigin" }
  | RateLimited;

export type PasswordSignUpResult =
  | ({ ok: true; user: AuthUser } & SessionChange)
  | { ok: false; reason: "closed" | "emailTaken" | "untrustedOrigin" }
  | RateLimited;

export type PasswordResetResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "noAccount" }
  | {
      ok: false;
      reason: "passwordLength";
      minLength: number;
      maxLength: number;
    };

/**
 * What the provider needs to know about the caller of a session route. The
 * request headers carry the caller's origin for the provider's origin check.
 * The provider counts attempts for its rate limits by `clientAddress`. Callers
 * without an address share one count.
 */
export interface SessionRequest {
  requestHeaders: Headers;
  clientAddress?: string | undefined;
}

/** Authentication boundary. Session identity belongs to the request, never this Service. */
export interface AuthServiceInterface {
  readonly trustedOrigins: readonly string[];
  getSession(props: { headers: Headers }): Promise<AuthSession | null>;
  signInWithPassword(
    props: SessionRequest & { email: string; password: string },
  ): Promise<PasswordSignInResult>;
  signUpWithPassword(
    props: SessionRequest & { email: string; name: string; password: string },
  ): Promise<PasswordSignUpResult>;
  /** End the caller's session. Succeeds when there is no session. */
  signOut(props: SessionRequest): Promise<SessionChange>;
  migrate(): Promise<void>;
  /**
   * Trusted setup code only. It has no public HTTP endpoint, no rate limit,
   * and no check of the account policy.
   */
  createAccount(props: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthUser>;
  /**
   * Trusted operator code only. It has no public HTTP endpoint and asks for
   * no proof that the caller is the account's user. It also ends each session
   * of the account.
   */
  resetPassword(props: {
    email: string;
    password: string;
  }): Promise<PasswordResetResult>;
}
