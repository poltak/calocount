import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { PasskeyRegistrationOptions } from "../services/types.js";
import { ceremonyMessage } from "../utils/passkey-messages.js";

type PasskeysProps = FrontendLogicProps<never, "passkeys", "auth">;

interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** True when the passkey syncs between the devices of the owner. */
  synced: boolean;
  /** True for the passkey that signed in the session that reads the list. */
  current: boolean;
}

interface PasskeysState {
  passkeys: PasskeyInfo[];
  loadPasskeysState: TaskState;
  loadPasskeysError: string | null;
  addPasskeyState: TaskState;
  addPasskeyError: string | null;
  removePasskeyState: TaskState;
  removePasskeyError: string | null;
}

/** The passkeys of the signed-in owner, for the settings page: list, add, and remove. */
export class PasskeysLogic extends Logic<PasskeysProps, PasskeysState> {
  constructor(deps: PasskeysProps) {
    super({
      deps,
      initialState: {
        passkeys: [],
        loadPasskeysState: "pristine",
        loadPasskeysError: null,
        addPasskeyState: "pristine",
        addPasskeyError: null,
        removePasskeyState: "pristine",
        removePasskeyError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.loadPasskeys();
  }

  async loadPasskeys(): Promise<void> {
    await this.executeTask("loadPasskeys", () => this.readPasskeys());
  }

  /** Save a passkey for this device. The owner has a session, so no setup code is needed. */
  async addPasskey(): Promise<void> {
    await this.executeTask("addPasskey", async () => {
      const { register } = this.deps.api.auth;
      const init = { init: { signal: this.signal } };
      const started = await register.options.$post({ json: {} }, init);
      await requireApiSuccess(started);
      if (started.status !== 200) {
        throw new Error("Unexpected passkey response");
      }
      const {
        options,
        challengeId,
      }: { options: unknown; challengeId: string } = await started.json();
      let response;
      try {
        response = await this.deps.services.passkeys.register(
          options as PasskeyRegistrationOptions,
        );
      } catch (error) {
        throw new Error(ceremonyMessage(error), { cause: error });
      }
      const verified = await register.verify.$post(
        { json: { challengeId, response } },
        init,
      );
      await requireApiSuccess(verified);
      await this.readPasskeys();
    });
  }

  /** The backend keeps the last passkey and refuses its removal. */
  async removePasskey({ id }: { id: string }): Promise<void> {
    await this.executeTask("removePasskey", async () => {
      const response = await this.deps.api.auth.passkeys[":id"].$delete(
        { param: { id: encodeURIComponent(id) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected passkey removal response");
      }
      const { signedOut } = await response.json();
      // The session of a removed passkey ends with it, so the list is out of reach.
      if (signedOut) {
        this.setState({
          passkeys: this.state.passkeys.filter((passkey) => passkey.id !== id),
        });
        return;
      }
      await this.readPasskeys();
    });
  }

  private async readPasskeys(): Promise<void> {
    const response = await this.deps.api.auth.passkeys.$get(undefined, {
      init: { signal: this.signal },
    });
    await requireApiSuccess(response);
    if (response.status !== 200) {
      throw new Error("Unexpected passkey list response");
    }
    this.setState({ passkeys: (await response.json()).passkeys });
  }
}
