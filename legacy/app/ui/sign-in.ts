import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { component, h } from "./dom";

type AuthStatus = {
  mode: "passkey" | "access" | "local";
  signedIn?: boolean;
  hasPasskeys?: boolean;
  setupCode?: "missing" | "too_short" | "ready";
};

type View = "loading" | "unsupported" | "unavailable" | "sign-in" | "setup";

type State = {
  view: View;
  /** True when the owner has a passkey and uses the setup code to add another one. */
  recovery: boolean;
  setupCodeState: AuthStatus["setupCode"];
  setupCode: string;
  busy: boolean;
  error: string | null;
};

type ApiResult = { ok: boolean; status: number; body: Record<string, unknown> | null };

const brandMark = () => h("span", { class: "brand-mark auth-brand", "aria-hidden": "true" }, h("span"), h("span"), h("span"));

/**
 * Only a path on this site. Anything else could send the owner to another site
 * after sign-in. Browsers remove tabs and line breaks from addresses, and some
 * treat a backslash as a slash, so those characters are refused too.
 */
function safeReturnTo(value: string | undefined): string {
  return value && /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : "/owner";
}

async function postJson(path: string, body: unknown = {}): Promise<ApiResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const parsed = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, body: parsed };
}

function errorCode(result: ApiResult): string | null {
  const error = result.body?.error;
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : null;
}

function serverMessage(code: string | null): string {
  switch (code) {
    case "invalid_setup_code": return "This setup code is not correct.";
    case "too_many_attempts": return "Too many wrong setup codes. Wait 15 minutes, then try again.";
    case "setup_code_missing": return "This Calocount has no setup code yet. Add the secret CALOCOUNT_SETUP_CODE to the Worker, then try again.";
    case "setup_code_too_short": return "The setup code of this Calocount is too short. Change the secret CALOCOUNT_SETUP_CODE to at least 12 characters, then try again.";
    case "challenge_expired": return "The request expired. Try again.";
    case "passkey_unknown": return "This passkey does not belong to this Calocount. Use another passkey, or add one with the setup code.";
    case "passkey_exists": return "This device already has a passkey for this Calocount. Sign in with it.";
    case "passkey_invalid": return "The passkey could not be checked. Try again.";
    default: return "Sign-in did not work. Try again.";
  }
}

/** A message for a failed browser passkey request. The browser library keeps the name of the DOM error. */
function ceremonyMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "The passkey request was cancelled or timed out. Try again.";
  if (name === "InvalidStateError") return "This device already has a passkey for this Calocount. Sign in with it.";
  if (name === "SecurityError") return "This address cannot use passkeys. Open Calocount at its HTTPS address.";
  return "The passkey request did not work. Try again.";
}

/**
 * The sign-in page of a passkey instance. It signs in with a passkey, or saves
 * the first passkey with the setup code. After sign-in, it opens `returnTo`.
 */
export function mountSignIn(root: HTMLElement): void {
  const returnTo = safeReturnTo(root.dataset.returnTo);
  const notice = root.dataset.notice ?? null;
  const panel = root.querySelector<HTMLElement>(".auth-panel") ?? root.appendChild(h("section", { class: "auth-panel", "aria-live": "polite" }));
  panel.replaceChildren();
  const state: State = { view: "loading", recovery: false, setupCodeState: "ready", setupCode: "", busy: false, error: null };
  const ui = component(panel, () => view());
  const update = (changes: Partial<State>) => {
    Object.assign(state, changes);
    ui.rerender();
  };
  ui.update({});

  const done = () => window.location.replace(returnTo);

  async function load() {
    if (!browserSupportsWebAuthn()) {
      update({ view: "unsupported" });
      return;
    }
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status");
      const status = await response.json() as AuthStatus;
      if (status.mode !== "passkey" || status.signedIn) {
        done();
        return;
      }
      update({ view: status.hasPasskeys ? "sign-in" : "setup", setupCodeState: status.setupCode ?? "ready", error: null });
    } catch {
      update({ view: "unavailable", error: "Calocount could not check the sign-in. Try again." });
    }
  }

  async function signIn() {
    update({ busy: true, error: null });
    try {
      const options = await postJson("/api/auth/login/options");
      if (!options.ok) {
        if (errorCode(options) === "setup_required") update({ view: "setup", recovery: false, busy: false });
        else update({ busy: false, error: serverMessage(errorCode(options)) });
        return;
      }
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options.body?.options as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      } catch (error) {
        update({ busy: false, error: ceremonyMessage(error) });
        return;
      }
      const verified = await postJson("/api/auth/login/verify", { challengeId: options.body?.challengeId, response });
      if (!verified.ok) {
        update({ busy: false, error: serverMessage(errorCode(verified)) });
        return;
      }
      done();
    } catch {
      update({ busy: false, error: "Calocount could not be reached. Try again." });
    }
  }

  async function createPasskey() {
    const setupCode = state.setupCode.trim();
    if (!setupCode) {
      update({ error: "Type the setup code." });
      return;
    }
    update({ busy: true, error: null });
    try {
      const options = await postJson("/api/auth/register/options", { setupCode });
      if (!options.ok) {
        update({ busy: false, error: serverMessage(errorCode(options)) });
        return;
      }
      let response;
      try {
        response = await startRegistration({ optionsJSON: options.body?.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      } catch (error) {
        update({ busy: false, error: ceremonyMessage(error) });
        return;
      }
      const verified = await postJson("/api/auth/register/verify", { challengeId: options.body?.challengeId, response });
      if (!verified.ok) {
        update({ busy: false, error: serverMessage(errorCode(verified)) });
        return;
      }
      done();
    } catch {
      update({ busy: false, error: "Calocount could not be reached. Try again." });
    }
  }

  function errorLine() {
    return state.error ? h("p", { class: "auth-error", role: "alert" }, state.error) : null;
  }

  function setupBody() {
    if (state.setupCodeState === "missing") {
      return [h("p", { class: "auth-error", role: "alert" }, serverMessage("setup_code_missing"))];
    }
    if (state.setupCodeState === "too_short") {
      return [h("p", { class: "auth-error", role: "alert" }, serverMessage("setup_code_too_short"))];
    }
    return [
      h("form", {
        class: "auth-form",
        onsubmit: (event: Event) => {
          event.preventDefault();
          void createPasskey();
        },
      },
      h("label", null, "Setup code",
        h("input", {
          name: "setup-code",
          type: "password",
          autocomplete: "off",
          autocapitalize: "off",
          spellcheck: false,
          value: state.setupCode,
          disabled: state.busy,
          oninput: (event: Event) => {
            state.setupCode = (event.target as HTMLInputElement).value;
          },
        })),
      h("button", { class: "primary-button", type: "submit", disabled: state.busy, "aria-busy": state.busy }, state.busy ? "Waiting for your device…" : "Create passkey"),
      ),
    ];
  }

  function view() {
    switch (state.view) {
      case "loading":
        return [brandMark(), h("h1", null, "Sign in to Calocount"), h("p", { class: "auth-status" }, "Checking sign-in…")];
      case "unsupported":
        return [brandMark(), h("h1", null, "This browser cannot use passkeys"), h("p", null, "Open Calocount in a current version of Safari, Chrome, Edge or Firefox.")];
      case "unavailable":
        return [
          brandMark(),
          h("h1", null, "Sign-in is unavailable"),
          errorLine(),
          h("div", { class: "auth-actions" }, h("button", { class: "primary-button", type: "button", onclick: () => window.location.reload() }, "Try again")),
        ];
      case "sign-in":
        return [
          brandMark(),
          h("h1", null, "Sign in to Calocount"),
          notice ? h("p", { class: "auth-notice" }, notice) : null,
          h("p", null, "Use your passkey. Your device asks for your face, fingerprint or screen lock."),
          h("div", { class: "auth-actions" },
            h("button", { class: "primary-button", type: "button", onclick: () => void signIn(), disabled: state.busy, "aria-busy": state.busy }, state.busy ? "Waiting for your device…" : "Sign in with passkey"),
          ),
          errorLine(),
          h("button", { class: "auth-link", type: "button", disabled: state.busy, onclick: () => update({ view: "setup", recovery: true, error: null }) }, "Lost your passkey? Use your setup code"),
        ];
      case "setup":
        return [
          brandMark(),
          h("h1", null, state.recovery ? "Add a passkey" : "Set up Calocount"),
          notice ? h("p", { class: "auth-notice" }, notice) : null,
          h("p", null, state.recovery
            ? "Type your setup code. Then this device saves a new passkey."
            : "Type the setup code that you chose when you deployed Calocount. Then this device saves a passkey, and you sign in with your face, fingerprint or screen lock."),
          ...setupBody(),
          errorLine(),
          state.recovery
            ? h("button", { class: "auth-link", type: "button", disabled: state.busy, onclick: () => update({ view: "sign-in", recovery: false, error: null }) }, "Back to sign-in")
            : null,
        ];
    }
  }

  void load();
}
