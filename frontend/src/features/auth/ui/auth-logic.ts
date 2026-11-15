import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  ApiRequestError,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { App } from "../../core/types.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { LatestRequest } from "../../core/logic/latest-request.js";
import type {
  PasskeyRegistrationOptions,
  PasskeySignInOptions,
} from "../services/types.js";
import type { AuthEvent } from "../types.js";
import {
  CHECK_FAILED_MESSAGE,
  ceremonyMessage,
  PromptError,
  serverMessage,
  UNREACHABLE_MESSAGE,
} from "../utils/passkey-messages.js";

type AuthProps = FrontendLogicProps<never, "passkeys" | "windowFocus", "auth"> &
  Pick<App, "apiAccessEvents">;

type SetupCodeState = "missing" | "too_short" | "ready";

interface AuthState {
  isSignedIn: boolean;
  /** `false` on a new instance, which the page then sets up with the setup code. */
  hasPasskeys: boolean;
  setupCodeState: SetupCodeState;
  /** The form that the sign-in page shows. */
  view: "sign-in" | "setup";
  /** True when the owner has a passkey and uses the setup code to add another one. */
  recovery: boolean;
  setupCode: string;
  loadSessionState: TaskState;
  loadSessionError: string | null;
  signInState: TaskState;
  signInError: string | null;
  createPasskeyState: TaskState;
  createPasskeyError: string | null;
  signOutState: TaskState;
  signOutError: string | null;
}

const SIGNED_OUT = {
  isSignedIn: false,
  view: "sign-in",
  recovery: false,
} satisfies Partial<AuthState>;

/** Owned by the session provider. The backend decides who is signed in. */
export class AuthLogic extends Logic<AuthProps, AuthState, AuthEvent> {
  private readonly sessionChecks = new LatestRequest(this.signal);

  constructor(deps: AuthProps) {
    super({
      deps,
      initialState: {
        ...SIGNED_OUT,
        hasPasskeys: true,
        setupCodeState: "ready",
        setupCode: "",
        loadSessionState: "pristine",
        loadSessionError: null,
        signInState: "pristine",
        signInError: null,
        createPasskeyState: "pristine",
        createPasskeyError: null,
        signOutState: "pristine",
        signOutError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.listen(this.deps.apiAccessEvents, () => {
      this.sessionChecks.cancel();
      this.setState({ ...SIGNED_OUT, setupCode: "" });
    });
    this.registerCleanup(
      this.deps.services.windowFocus.listen(() => {
        // Only an open session can end while the user is away.
        if (this.state.isSignedIn) {
          void this.refresh();
        }
      }),
    );
    await this.refresh();
  }

  /** The sign-in page offers a passkey only in a browser that has them. */
  get canUsePasskeys(): boolean {
    return this.deps.services.passkeys.isSupported();
  }

  setSetupCode(setupCode: string): void {
    this.setState({ setupCode });
  }

  /** Lost passkey: add one for this device with the setup code. */
  showRecovery(): void {
    this.setState({ view: "setup", recovery: true, ...this.pristineTasks() });
  }

  showSignIn(): void {
    this.setState({
      view: "sign-in",
      recovery: false,
      ...this.pristineTasks(),
    });
  }

  async refresh(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("loadSession", () => this.checkSession());
  }

  /** Sign in with a passkey. The browser shows its own prompt. */
  async signIn(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("signIn", async () => {
      this.sessionChecks.cancel();
      const { auth } = this.deps.api;
      const init = { init: { signal: this.signal } };
      try {
        const started = await auth.login.options.$post(undefined, init);
        await requireApiSuccess(started);
        if (started.status !== 200) {
          throw new Error("Unexpected sign-in response");
        }
        const {
          options,
          challengeId,
        }: { options: unknown; challengeId: string } = await started.json();
        const response = await this.askPasskey(() =>
          this.deps.services.passkeys.authenticate(
            options as PasskeySignInOptions,
          ),
        );
        const verified = await auth.login.verify.$post(
          { json: { challengeId, response } },
          init,
        );
        await requireApiSuccess(verified);
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          error.code === "SETUP_REQUIRED"
        ) {
          // The passkeys are gone since the page loaded.
          this.setState({ view: "setup", recovery: false, hasPasskeys: false });
        }
        throw this.failureOf(error);
      }
      await this.requireSession();
    });
  }

  /**
   * Save a passkey with the setup code. On a new instance this is the first
   * passkey. With a passkey already saved, it is the recovery of a lost one.
   * The backend starts the session of the new passkey.
   */
  async createPasskey(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("createPasskey", async () => {
      const setupCode = this.state.setupCode.trim();
      if (!setupCode) {
        throw new Error("Type the setup code.");
      }
      this.sessionChecks.cancel();
      const { auth } = this.deps.api;
      const init = { init: { signal: this.signal } };
      try {
        const started = await auth.register.options.$post(
          { json: { setupCode } },
          init,
        );
        await requireApiSuccess(started);
        if (started.status !== 200) {
          throw new Error("Unexpected setup response");
        }
        const {
          options,
          challengeId,
        }: { options: unknown; challengeId: string } = await started.json();
        const response = await this.askPasskey(() =>
          this.deps.services.passkeys.register(
            options as PasskeyRegistrationOptions,
          ),
        );
        const verified = await auth.register.verify.$post(
          { json: { challengeId, response } },
          init,
        );
        await requireApiSuccess(verified);
      } catch (error) {
        throw this.failureOf(error);
      }
      await this.requireSession();
      this.setState({ setupCode: "" });
    });
  }

  async signOut(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("signOut", async () => {
      this.sessionChecks.cancel();
      const response = await this.deps.api.auth.logout.$post(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      // Before the state change, which unmounts the pages whose Logic
      // listens.
      this.events.emitDetached({ type: "signedOut" });
      this.setState({ ...SIGNED_OUT, setupCode: "" });
    });
  }

  /** Sign-in, setup, and sign-out each replace the session, so none overlaps another. */
  private isChangingSession(): boolean {
    return (
      this.state.signInState === "running" ||
      this.state.createPasskeyState === "running" ||
      this.state.signOutState === "running"
    );
  }

  private pristineTasks() {
    return {
      signInState: "pristine",
      signInError: null,
      createPasskeyState: "pristine",
      createPasskeyError: null,
    } satisfies Partial<AuthState>;
  }

  /** The browser's prompt fails for many reasons, and its message is for developers. */
  private async askPasskey<Answer>(prompt: () => Promise<Answer>) {
    try {
      return await prompt();
    } catch (error) {
      throw new PromptError(ceremonyMessage(error), { cause: error });
    }
  }

  /** The text for a failed ceremony. */
  private failureOf(error: unknown): Error {
    if (error instanceof PromptError) {
      return error;
    }
    if (error instanceof ApiRequestError) {
      return new Error(serverMessage(error.code));
    }
    return new Error(UNREACHABLE_MESSAGE, { cause: error });
  }

  private async requireSession(): Promise<void> {
    await this.checkSession();
    if (!this.state.isSignedIn) {
      throw new Error(serverMessage(undefined));
    }
  }

  /**
   * Ask the backend whether the cookie holds a live session, and store the
   * answer. A cancelled check stores nothing, because the action that
   * cancelled it owns the result.
   */
  private async checkSession(): Promise<void> {
    const signal = this.sessionChecks.start();
    try {
      const response = await this.deps.api.auth.status.$get(undefined, {
        init: { signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected session response");
      }
      const { signedIn, hasPasskeys, setupCode } = await response.json();
      if (signal.aborted) {
        return;
      }
      this.setState({
        isSignedIn: signedIn,
        hasPasskeys,
        setupCodeState: setupCode,
        // A later session expiry must keep returnTo after an earlier sign-out.
        signOutState: "pristine",
        ...(signedIn
          ? {}
          : { view: hasPasskeys ? "sign-in" : "setup", recovery: false }),
      });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      // A failed check says nothing about the session, so a signed-in user
      // stays signed in, and the open page keeps its state.
      throw new Error(CHECK_FAILED_MESSAGE, { cause: error });
    }
  }
}
