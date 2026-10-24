import { startRegistration } from "@simplewebauthn/browser";
import { component, h } from "./dom";

type Passkey = { id: string; name: string; createdAt: number; lastUsedAt: number | null; synced: boolean; current: boolean };
type Connection = { id: string; name: string; createdAt: number; lastUsedAt: number | null };

type State = {
  /** Null until the status loads. The section shows only for a passkey instance. */
  mode: string | null;
  passkeys: Passkey[];
  connections: Connection[];
  busy: boolean;
  message: string | null;
  error: string | null;
};

export type AccountSettings = {
  el: HTMLElement;
  /** Load the passkeys and connections again, for example when the settings open. */
  refresh: () => void;
};

function formatDate(value: number | null): string {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never";
}

function errorMessage(body: unknown, fallback: string): string {
  const error = body && typeof body === "object" ? (body as { error?: { code?: unknown; message?: unknown } }).error : null;
  if (error?.code === "last_passkey") return "Add another passkey before you remove this one.";
  return typeof error?.message === "string" ? error.message : fallback;
}

async function request(path: string, init: RequestInit = {}): Promise<{ ok: boolean; body: unknown }> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init.headers } });
  return { ok: response.ok, body: await response.json().catch(() => null) };
}

/**
 * The passkeys of the owner, the apps that use the MCP endpoint, and sign-out.
 * It shows nothing when Cloudflare Access protects the instance.
 */
export function createAccountSettings(): AccountSettings {
  const el = h("section", { class: "settings-section account-settings", "aria-labelledby": "account-title" });
  const state: State = { mode: null, passkeys: [], connections: [], busy: false, message: null, error: null };
  const ui = component(el, () => view());
  const update = (changes: Partial<State>) => {
    Object.assign(state, changes);
    el.hidden = state.mode !== "passkey";
    ui.rerender();
  };
  ui.update({});
  el.hidden = true;

  async function refresh() {
    try {
      const status = await request("/api/auth/status");
      const mode = (status.body as { mode?: string } | null)?.mode ?? null;
      if (mode !== "passkey") {
        update({ mode });
        return;
      }
      const [passkeys, connections] = await Promise.all([request("/api/auth/passkeys"), request("/api/auth/connections")]);
      update({
        mode,
        passkeys: passkeys.ok ? (passkeys.body as { passkeys: Passkey[] }).passkeys : state.passkeys,
        connections: connections.ok ? (connections.body as { connections: Connection[] }).connections : state.connections,
        error: passkeys.ok && connections.ok ? null : "The sign-in settings could not be loaded.",
      });
    } catch {
      update({ error: "The sign-in settings could not be loaded." });
    }
  }

  async function addPasskey() {
    update({ busy: true, message: null, error: null });
    try {
      const options = await request("/api/auth/register/options", { method: "POST", body: "{}" });
      if (!options.ok) {
        update({ busy: false, error: errorMessage(options.body, "A passkey could not be added.") });
        return;
      }
      const { options: optionsJSON, challengeId } = options.body as { options: Parameters<typeof startRegistration>[0]["optionsJSON"]; challengeId: string };
      let response;
      try {
        response = await startRegistration({ optionsJSON });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        update({
          busy: false,
          error: name === "InvalidStateError" ? "This device already has a passkey for this Calocount." : "The passkey was not added. Try again.",
        });
        return;
      }
      const verified = await request("/api/auth/register/verify", { method: "POST", body: JSON.stringify({ challengeId, response }) });
      if (!verified.ok) {
        update({ busy: false, error: errorMessage(verified.body, "The passkey could not be saved.") });
        return;
      }
      update({ busy: false, message: "Passkey added." });
      await refresh();
    } catch {
      update({ busy: false, error: "Calocount could not be reached. Try again." });
    }
  }

  async function removePasskey(passkey: Passkey) {
    const warning = passkey.current
      ? `Remove the passkey "${passkey.name}"? You signed in with it, so this device signs out.`
      : `Remove the passkey "${passkey.name}"? Devices that signed in with it sign out.`;
    if (!window.confirm(warning)) return;
    update({ busy: true, message: null, error: null });
    const result = await request(`/api/auth/passkeys/${encodeURIComponent(passkey.id)}`, { method: "DELETE" }).catch(() => null);
    if (!result?.ok) {
      update({ busy: false, error: errorMessage(result?.body, "The passkey could not be removed.") });
      return;
    }
    if ((result.body as { signedOut?: boolean }).signedOut) {
      window.location.replace("/owner");
      return;
    }
    update({ busy: false, message: "Passkey removed." });
    await refresh();
  }

  async function disconnect(connection: Connection) {
    if (!window.confirm(`Disconnect ${connection.name}? It stops working until you connect it again.`)) return;
    update({ busy: true, message: null, error: null });
    const result = await request(`/api/auth/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE" }).catch(() => null);
    if (!result?.ok) {
      update({ busy: false, error: errorMessage(result?.body, "The app could not be disconnected.") });
      return;
    }
    update({ busy: false, message: `${connection.name} disconnected.` });
    await refresh();
  }

  async function signOut() {
    update({ busy: true, message: null, error: null });
    await request("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => null);
    window.location.replace("/owner");
  }

  function view() {
    const onlyPasskey = state.passkeys.length <= 1;
    return [
      h("div", { class: "settings-section-heading" },
        h("div", null, h("strong", { id: "account-title" }, "Sign-in"), h("span", null, "Your passkeys and the apps that you connected")),
      ),
      h("h3", { class: "account-subheading" }, "Passkeys"),
      h("ul", { class: "account-list" },
        state.passkeys.map((passkey) => h("li", { key: passkey.id },
          h("div", null,
            h("strong", null, passkey.name, passkey.current ? h("span", { class: "account-tag" }, "This device") : null),
            h("small", null, `Added ${formatDate(passkey.createdAt)} · Last used ${formatDate(passkey.lastUsedAt)}${passkey.synced ? " · Synced" : ""}`),
          ),
          h("button", {
            class: "secondary-button",
            type: "button",
            disabled: state.busy || onlyPasskey,
            title: onlyPasskey ? "Add another passkey before you remove this one." : undefined,
            onclick: () => void removePasskey(passkey),
            "aria-label": `Remove passkey ${passkey.name}`,
          }, "Remove"),
        )),
      ),
      h("div", { class: "account-actions" },
        h("button", { class: "secondary-button", type: "button", disabled: state.busy, onclick: () => void addPasskey() }, "Add a passkey on this device"),
        h("button", { class: "secondary-button", type: "button", disabled: state.busy, onclick: () => void signOut() }, "Sign out"),
      ),
      h("h3", { class: "account-subheading" }, "Connected apps"),
      state.connections.length === 0
        ? h("p", { class: "account-empty" }, "No apps are connected. ChatGPT shows here after you connect it.")
        : h("ul", { class: "account-list" },
          state.connections.map((connection) => h("li", { key: connection.id },
            h("div", null,
              h("strong", null, connection.name),
              h("small", null, `Connected ${formatDate(connection.createdAt)} · Last used ${formatDate(connection.lastUsedAt)}`),
            ),
            h("button", {
              class: "secondary-button",
              type: "button",
              disabled: state.busy,
              onclick: () => void disconnect(connection),
              "aria-label": `Disconnect ${connection.name}`,
            }, "Disconnect"),
          )),
        ),
      state.error ? h("p", { class: "account-feedback error", role: "alert" }, state.error) : null,
      state.message ? h("p", { class: "account-feedback", role: "status" }, state.message) : null,
    ];
  }

  void refresh();
  return { el, refresh: () => void refresh() };
}
