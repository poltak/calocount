import { Logic } from "@shadow/common/features/core/logic/logic";
import type { InferResponseType } from "hono/client";
import { ApiRequestError, requireApiSuccess } from "../../../api/client.js";
import type { App } from "../../../index.js";
import type { FrontendLogicProps } from "../../../logic/types.js";

type AuthProps = FrontendLogicProps<never, "windowFocus", "me"> &
  Pick<App, "auth" | "apiAccessEvents">;
type User = InferResponseType<App["api"]["me"]["$get"], 200>["user"];
interface AuthState {
  status: "loading" | "signedOut" | "signedIn" | "error";
  user: User | null;
  busy: boolean;
  email: string;
  password: string;
  error: string | null;
}

/** Owned by the session provider. The protected backend profile decides access. */
export class AuthLogic extends Logic<AuthProps, AuthState> {
  private requestVersion = 0;
  constructor(deps: AuthProps) {
    super({
      deps,
      initialState: {
        status: "loading",
        user: null,
        busy: false,
        email: "",
        password: "",
        error: null,
      },
    });
  }
  protected async onInitialize(): Promise<void> {
    this.registerCleanup(
      this.deps.apiAccessEvents.listen(() => {
        this.requestVersion += 1;
        this.setState({
          status: "signedOut",
          user: null,
          password: "",
          error: null,
        });
      }),
    );
    this.registerCleanup(
      this.deps.services.windowFocus.listen(() => {
        void this.refresh();
      }),
    );
    await this.loadSession();
  }
  setEmail(email: string): void {
    this.setState({ email });
  }
  setPassword(password: string): void {
    this.setState({ password });
  }
  async refresh(): Promise<void> {
    if (!this.state.busy) await this.loadSession();
  }
  async signIn(): Promise<void> {
    if (this.state.busy) return;
    this.requestVersion += 1;
    this.setState({ busy: true, error: null });
    try {
      const result = await this.deps.auth.signIn.email({
        email: this.state.email.trim(),
        password: this.state.password,
        fetchOptions: { signal: this.signal },
      });
      if (result.error)
        throw new Error(result.error.message ?? "Sign-in failed");
      await this.loadSession();
    } catch (error) {
      this.setState({
        status: "signedOut",
        user: null,
        error: error instanceof Error ? error.message : "Sign-in failed",
      });
    } finally {
      this.setState({ busy: false, password: "" });
    }
  }
  async signOut(): Promise<void> {
    if (this.state.busy) return;
    this.requestVersion += 1;
    this.setState({ busy: true, error: null });
    try {
      const result = await this.deps.auth.signOut({
        fetchOptions: { signal: this.signal },
      });
      if (result.error)
        throw new Error(result.error.message ?? "Sign-out failed");
      this.setState({ status: "signedOut", user: null, password: "" });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : "Sign-out failed",
      });
    } finally {
      this.setState({ busy: false });
    }
  }
  private async loadSession(): Promise<void> {
    const version = ++this.requestVersion;
    try {
      const response = await this.deps.api.me.$get(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200)
        throw new Error("Unexpected session response");
      const { user } = await response.json();
      if (version !== this.requestVersion) return;
      this.setState({ status: "signedIn", user, error: null });
    } catch (error) {
      if (version !== this.requestVersion) return;
      const denied =
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 403);
      this.setState({
        status: denied ? "signedOut" : "error",
        user: null,
        error:
          error instanceof ApiRequestError && error.status === 401
            ? null
            : error instanceof Error
              ? error.message
              : "Unable to check your session",
      });
    }
  }
}
