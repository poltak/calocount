import {
  Logic,
  type TaskFieldErrors,
  type TaskState,
} from "@app/common/features/core/logic/logic";
import {
  ApiRequestError,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { App } from "../../core/types.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { LatestRequest } from "../../core/logic/latest-request.js";

type AuthProps = FrontendLogicProps<
  never,
  "windowFocus",
  "me" | "session" | "sign-up"
> &
  Pick<App, "apiAccessEvents">;
interface AuthState {
  isSignedIn: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  /** The fields that the sign-in form and the sign-up form share. */
  email: string;
  password: string;
  signUpName: string;
  isSignUpOpen: boolean;
  loadSessionState: TaskState;
  loadSessionError: string | null;
  loadSignUpStatusState: TaskState;
  loadSignUpStatusError: string | null;
  signInState: TaskState;
  signInError: string | null;
  signInFieldErrors: TaskFieldErrors | null;
  signUpState: TaskState;
  signUpError: string | null;
  signUpFieldErrors: TaskFieldErrors | null;
  signOutState: TaskState;
  signOutError: string | null;
}

const SIGNED_OUT = {
  isSignedIn: false,
  userId: null,
  userEmail: null,
  userName: null,
} satisfies Partial<AuthState>;

/** Owned by the session provider. The protected backend profile decides access. */
export class AuthLogic extends Logic<AuthProps, AuthState> {
  private readonly sessionChecks = new LatestRequest(this.signal);

  constructor(deps: AuthProps) {
    super({
      deps,
      initialState: {
        ...SIGNED_OUT,
        email: "",
        password: "",
        signUpName: "",
        isSignUpOpen: false,
        loadSessionState: "pristine",
        loadSessionError: null,
        loadSignUpStatusState: "pristine",
        loadSignUpStatusError: null,
        signInState: "pristine",
        signInError: null,
        signInFieldErrors: null,
        signUpState: "pristine",
        signUpError: null,
        signUpFieldErrors: null,
        signOutState: "pristine",
        signOutError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.listen(this.deps.apiAccessEvents, () => {
      this.sessionChecks.cancel();
      this.setState({ ...SIGNED_OUT, password: "" });
    });
    this.registerCleanup(
      this.deps.services.windowFocus.listen(() => {
        // Only an open session can end while the user is away.
        if (this.state.isSignedIn) {
          void this.refresh();
        }
      }),
    );
    await Promise.all([this.refresh(), this.loadSignUpStatus()]);
  }

  setEmail(email: string): void {
    this.setState({ email });
  }

  setPassword(password: string): void {
    this.setState({ password });
  }

  setSignUpName(signUpName: string): void {
    this.setState({ signUpName });
  }

  async refresh(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("loadSession", () => this.checkSession());
  }

  async signIn(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("signIn", async () => {
      this.sessionChecks.cancel();
      try {
        const response = await this.deps.api.session.$post(
          {
            json: {
              email: this.state.email.trim(),
              password: this.state.password,
            },
          },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        await this.checkSession();
        if (!this.state.isSignedIn) {
          throw new Error("Sign-in did not start a session");
        }
      } finally {
        this.setState({ password: "" });
      }
    });
  }

  async loadSignUpStatus(): Promise<void> {
    await this.executeTask("loadSignUpStatus", async () => {
      const response = await this.deps.api["sign-up"].$get(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected sign-up status response");
      }
      const { isOpen } = await response.json();
      this.setState({ isSignUpOpen: isOpen });
    });
  }

  /** Make an account from the form's fields. The backend also starts its session. */
  async signUp(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("signUp", async () => {
      this.sessionChecks.cancel();
      const response = await this.deps.api["sign-up"].$post(
        {
          json: {
            name: this.state.signUpName.trim(),
            email: this.state.email.trim(),
            password: this.state.password,
          },
        },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      await this.checkSession();
      if (!this.state.isSignedIn) {
        throw new Error("Sign-up did not start a session");
      }
      // After a refusal the fields stay, so the user corrects only one of them.
      this.setState({ signUpName: "", password: "" });
    });
  }

  async signOut(): Promise<void> {
    if (this.isChangingSession()) {
      return;
    }
    await this.executeTask("signOut", async () => {
      this.sessionChecks.cancel();
      const response = await this.deps.api.session.$delete(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      this.setState({ ...SIGNED_OUT, password: "" });
    });
  }

  /** Sign-in, sign-up, and sign-out each replace the session, so none overlaps another. */
  private isChangingSession(): boolean {
    return (
      this.state.signInState === "running" ||
      this.state.signUpState === "running" ||
      this.state.signOutState === "running"
    );
  }

  /**
   * Ask the backend who is signed in and store the answer. A cancelled check
   * stores nothing, because the action that cancelled it owns the result.
   */
  private async checkSession(): Promise<void> {
    const signal = this.sessionChecks.start();
    try {
      const response = await this.deps.api.me.$get(undefined, {
        init: { signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected session response");
      }
      const { user } = await response.json();
      if (signal.aborted) {
        return;
      }
      this.setState({
        isSignedIn: true,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
      });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      this.setState(SIGNED_OUT);
      // Having no session is an answer, not a failure.
      if (error instanceof ApiRequestError && error.status === 401) {
        return;
      }
      throw error;
    }
  }
}
