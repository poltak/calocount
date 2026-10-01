import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { Database } from "../../../database/database.js";
import type { AuthConfiguration } from "./configuration.js";
import type { AuthService, AuthUser } from "./types.js";

interface BetterAuthServiceDeps extends AuthConfiguration {
  db: Database;
}

/** Embedded authentication SDK; Better Auth owns its auth-table persistence. */
export class BetterAuthService implements AuthService {
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

  handle(request: Request): Promise<Response> {
    return this.instance().handler(request);
  }

  async getSession({ headers }: { headers: Headers }) {
    if (!headers.get("cookie")) return null;
    return this.instance().api.getSession({ headers });
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
