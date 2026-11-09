import { useMemo } from "react";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { useAuth } from "./auth-context.js";
import { PasskeysLogic } from "./passkeys-logic.js";

function formatDate(value: number | null): string {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "never";
}

/** The sign-in part of the settings: the passkeys of the owner, and sign-out. */
export function AccountSection() {
  const app = useFrontendApp();
  const auth = useAuth();
  const deps = useMemo(
    () => ({
      storage: {},
      services: {
        passkeys: app.services.passkeys,
        dialogs: app.services.dialogs,
      },
      api: { auth: app.api.auth },
    }),
    [app],
  );
  const { logic, state } = useLogic({ LogicClass: PasskeysLogic, deps });
  const busy =
    state.addPasskeyState === "running" ||
    state.removePasskeyState === "running" ||
    auth.state.signOutState === "running";
  const onlyPasskey = state.passkeys.length <= 1;
  const error =
    state.loadPasskeysError ??
    state.addPasskeyError ??
    state.removePasskeyError ??
    auth.state.signOutError;

  return (
    <section
      className="settings-section account-settings"
      aria-labelledby="account-title"
    >
      <div className="settings-section-heading">
        <div>
          <strong id="account-title">Sign-in</strong>
          <span>Your passkeys</span>
        </div>
      </div>
      <h3 className="account-subheading">Passkeys</h3>
      <ul className="account-list">
        {state.passkeys.map((passkey) => (
          <li key={passkey.id}>
            <div>
              <strong>
                {passkey.name}
                {passkey.current && (
                  <span className="account-tag">This device</span>
                )}
              </strong>
              <small>
                {`Added ${formatDate(passkey.createdAt)} · Last used ${formatDate(passkey.lastUsedAt)}${passkey.synced ? " · Synced" : ""}`}
              </small>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || onlyPasskey}
              title={
                onlyPasskey
                  ? "Add another passkey before you remove this one."
                  : undefined
              }
              aria-label={`Remove passkey ${passkey.name}`}
              onClick={() =>
                void logic
                  .removePasskey({ id: passkey.id })
                  // The session of a removed passkey ends with it.
                  .then(() => auth.logic.refresh())
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="account-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void logic.addPasskey()}
        >
          Add a passkey on this device
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void auth.logic.signOut()}
        >
          Sign out
        </button>
      </div>
      {error && (
        <p className="account-feedback error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
