import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { Database } from "../../core/database/database.js";
import type {
  AuthConfiguration,
  AuthServiceInterface,
  AuthUser,
  PasswordSignInResult,
  SessionChange,
} from "./types.js";

interface BetterAuthServiceDeps extends AuthConfiguration {
  db: Database;
}

/** Embedded authentication. Better Auth owns its auth-table persistence. */
export class BetterAuthService implements AuthServiceInterface {
  private auth?: ReturnType<BetterAuthService["createInstance"]>;
  readonly trustedOrigins: readonly string[];

  constructor(private readonly deps: BetterAuthServiceDeps) {
    this.trustedOrigins = Array.from(
      new Set([new URL(deps.baseUrl).origin, ...deps.trustedOrigins]),
    );
  }

  private options() {
    return {
      appName: "Shadow",
      database: { db: this.deps.db, type: "postgres" as const },
      secret: this.deps.secret,
      baseURL: this.deps.baseUrl,
      trustedOrigins: [...this.trustedOrigins],
      emailAndPassword: { enabled: true, disableSignUp: true },
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
    requestHeaders,
  }: {
    email: string;
    password: string;
    requestHeaders: Headers;
  }): Promise<PasswordSignInResult> {
    const response = await this.dispatch("/sign-in/email", {
      requestHeaders,
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

  async signOut({
    requestHeaders,
  }: {
    requestHeaders: Headers;
  }): Promise<SessionChange> {
    const response = await this.dispatch("/sign-out", {
      requestHeaders,
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
    { requestHeaders, body }: { requestHeaders: Headers; body: object },
  ): Promise<Response> {
    const headers = new Headers(requestHeaders);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
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
    const migration = await getMigrations(this.options());
    await migration.runMigrations();
  }

  async createAccount(props: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthUser> {
    // This private SDK instance is used only by trusted setup code. Its handler
    // is never mounted. The public instance always has registration disabled.
    const provisioning = betterAuth({
      ...this.options(),
      emailAndPassword: {
        enabled: true,
        disableSignUp: false,
        autoSignIn: false,
      },
    });
    const result = await provisioning.api.signUpEmail({ body: props });
    return result.user;
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
