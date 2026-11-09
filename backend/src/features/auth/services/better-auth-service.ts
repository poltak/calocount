import type {
  LoggerServiceInterface,
  LogLevel,
} from "@app/common/features/core/services/types";
import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { Database } from "../../core/database/database.js";
import { withTypeScriptNamesInIntrospection } from "../../core/database/database-names.js";
import type {
  AuthConfiguration,
  AuthServiceInterface,
  AuthUser,
  PasswordResetResult,
  PasswordSignInResult,
  PasswordSignUpResult,
  SessionChange,
  SessionRequest,
} from "./types.js";

interface BetterAuthServiceDeps extends AuthConfiguration {
  db: Database;
  /** The engine of `db`, because the SDK writes SQL for it. See docs/agents/decisions.md. */
  databaseType?: "postgres" | "sqlite";
  logger: LoggerServiceInterface;
}

/**
 * The only header from which the SDK reads the caller's address. `dispatch`
 * sets it from a value the transport determined, so a caller cannot choose
 * the address that the rate limits count.
 */
const CLIENT_ADDRESS_HEADER = "x-client-address";

/**
 * The SDK logs this each time it checks the schema, although the column is
 * correct. The column is `bigint`, the database reports that type as `int8`,
 * and the SDK's list of number types for PostgreSQL has no `int8`. Seen in
 * better-auth 1.7.6. Remove this when an upgrade stops the warning.
 */
const FALSE_RATE_LIMIT_TYPE_WARNING =
  "Field lastRequest in table rateLimit has a different type in the database";

const EMAIL_TAKEN_CODE = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";

/** Embedded authentication. Better Auth owns its auth-table persistence. */
export class BetterAuthService implements AuthServiceInterface {
  private auth?: ReturnType<BetterAuthService["createInstance"]>;
  readonly trustedOrigins: readonly string[];

  constructor(private readonly deps: BetterAuthServiceDeps) {
    this.trustedOrigins = Array.from(
      new Set([new URL(deps.baseUrl).origin, ...deps.trustedOrigins]),
    );
  }

  private database(db: Database) {
    return { db, type: this.deps.databaseType ?? "postgres" };
  }

  private options() {
    return {
      appName: APP_NAME,
      database: this.database(this.deps.db),
      secret: this.deps.secret,
      baseURL: this.deps.baseUrl,
      trustedOrigins: [...this.trustedOrigins],
      emailAndPassword: {
        enabled: true,
        disableSignUp: !this.deps.allowSignUp,
      },
      // The SDK turns its rate limits on only when NODE_ENV is "production",
      // and counts in process memory. Here they are always on, and the counts
      // are in the database, so every server instance shares them.
      rateLimit: { enabled: true, storage: "database" as const },
      advanced: { ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] } },
      logger: {
        log: (level: LogLevel, message: string, ...details: unknown[]) => {
          if (message.startsWith(FALSE_RATE_LIMIT_TYPE_WARNING)) {
            return;
          }
          this.deps.logger[level](
            message,
            details.length > 0 ? { details } : undefined,
          );
        },
      },
    };
  }

  private instance() {
    // Keep composition lazy: creating an App does not open its database.
    return (this.auth ??= this.createInstance());
  }

  private createInstance() {
    return betterAuth(this.options());
  }

  async getSession({ headers }: { headers: Headers }) {
    if (!headers.get("cookie")) {
      return null;
    }
    return this.instance().api.getSession({ headers });
  }

  async signInWithPassword({
    email,
    password,
    ...request
  }: SessionRequest & {
    email: string;
    password: string;
  }): Promise<PasswordSignInResult> {
    const response = await this.dispatch("/sign-in/email", {
      ...request,
      body: { email, password },
    });
    if (response.ok) {
      const { user } = (await response.json()) as { user: AuthUser };
      return {
        ok: true,
        user: { id: user.id, email: user.email, name: user.name },
        responseHeaders: cookieHeaders(response),
      };
    }
    if (response.status === 401) {
      return { ok: false, reason: "invalidCredentials" };
    }
    if (response.status === 429) {
      return { ok: false, reason: "rateLimited" };
    }
    if (response.status === 403) {
      return { ok: false, reason: "untrustedOrigin" };
    }
    throw new Error(`Sign-in failed with status ${response.status}`);
  }

  async signUpWithPassword({
    email,
    name,
    password,
    ...request
  }: SessionRequest & {
    email: string;
    name: string;
    password: string;
  }): Promise<PasswordSignUpResult> {
    if (!this.deps.allowSignUp) {
      return { ok: false, reason: "closed" };
    }
    const response = await this.dispatch("/sign-up/email", {
      ...request,
      body: { email, name, password },
    });
    if (response.ok) {
      const { user } = (await response.json()) as { user: AuthUser };
      return {
        ok: true,
        user: { id: user.id, email: user.email, name: user.name },
        responseHeaders: cookieHeaders(response),
      };
    }
    if (response.status === 429) {
      return { ok: false, reason: "rateLimited" };
    }
    if (response.status === 403) {
      return { ok: false, reason: "untrustedOrigin" };
    }
    // The SDK uses this status for other failures also, so the code decides.
    if (response.status === 422) {
      const { code } = (await response.json()) as { code?: string };
      if (code === EMAIL_TAKEN_CODE) {
        return { ok: false, reason: "emailTaken" };
      }
    }
    throw new Error(`Sign-up failed with status ${response.status}`);
  }

  async signOut(request: SessionRequest): Promise<SessionChange> {
    const response = await this.dispatch("/sign-out", {
      ...request,
      body: {},
    });
    if (!response.ok) {
      throw new Error(`Sign-out failed with status ${response.status}`);
    }
    return { responseHeaders: cookieHeaders(response) };
  }

  /**
   * Send a request through the SDK's own HTTP handler, which is never mounted
   * publicly. Its rate limits and origin checks only run on that path.
   */
  private dispatch(
    path: string,
    { requestHeaders, clientAddress, body }: SessionRequest & { body: object },
  ): Promise<Response> {
    const headers = new Headers(requestHeaders);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    // Drop a value that the caller sent in this header itself.
    headers.delete(CLIENT_ADDRESS_HEADER);
    if (clientAddress) {
      headers.set(CLIENT_ADDRESS_HEADER, clientAddress);
    }
    const url = new URL(`/api/auth${path}`, this.deps.baseUrl);
    return this.instance().handler(
      new Request(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  async migrate(): Promise<void> {
    // The migration looks for its own names, such as `emailVerified`, among
    // the names from the introspection, and the database has
    // `email_verified`. On a database that has the tables, it then adds each
    // column again and fails. Its statements still go through
    // `DatabaseNames`, so a new table or column gets a snake_case name. Seen
    // in better-auth 1.7.7 to 1.7.10. Remove this when the SDK looks for the
    // names that its queries send.
    const migration = await getMigrations({
      ...this.options(),
      database: this.database(withTypeScriptNamesInIntrospection(this.deps.db)),
    });
    await migration.runMigrations();
  }

  async createAccount(props: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthUser> {
    // This private SDK instance is used only by trusted setup code. Its handler
    // is never mounted. The other instance lets a visitor sign up only when
    // `allowSignUp` is set.
    const provisioning = betterAuth({
      ...this.options(),
      emailAndPassword: {
        enabled: true,
        disableSignUp: false,
        autoSignIn: false,
      },
    });
    const { user } = await provisioning.api.signUpEmail({ body: props });
    return { id: user.id, email: user.email, name: user.name };
  }

  async resetPassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<PasswordResetResult> {
    const context = await this.instance().$context;
    // The SDK starts a schema check in the background when it starts. A
    // command can end before that check does, and a database that closes
    // under the check keeps the process alive.
    await context.checkSchema?.();
    const { internalAdapter, password: passwords } = context;
    // The SDK checks the length only on its own routes, and this path uses
    // none of them.
    const { minPasswordLength, maxPasswordLength } = passwords.config;
    if (
      password.length < minPasswordLength ||
      password.length > maxPasswordLength
    ) {
      return {
        ok: false,
        reason: "passwordLength",
        minLength: minPasswordLength,
        maxLength: maxPasswordLength,
      };
    }

    const found = await internalAdapter.findUserByEmail(email);
    // Without a password record the update below changes nothing, and the
    // operator must not get a success.
    if (
      !found ||
      !(await internalAdapter.findCredentialAccount(found.user.id))
    ) {
      return { ok: false, reason: "noAccount" };
    }
    const { user } = found;
    await internalAdapter.updatePassword(
      user.id,
      await passwords.hash(password),
    );
    await internalAdapter.deleteUserSessions(user.id);
    return {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}

/** Keep only the session cookies the SDK set; the response body stays private. */
function cookieHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return headers;
}
