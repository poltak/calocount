import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";

type ConnectionsProps = FrontendLogicProps<never, "dialogs", "auth">;

interface Connection {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface ConnectionsState {
  connections: Connection[];
  loadConnectionsState: TaskState;
  loadConnectionsError: string | null;
  removeConnectionState: TaskState;
  removeConnectionError: string | null;
}

/** The apps that the owner connected to the MCP endpoint, such as ChatGPT: list, and disconnect. */
export class ConnectionsLogic extends Logic<
  ConnectionsProps,
  ConnectionsState
> {
  constructor(deps: ConnectionsProps) {
    super({
      deps,
      initialState: {
        connections: [],
        loadConnectionsState: "pristine",
        loadConnectionsError: null,
        removeConnectionState: "pristine",
        removeConnectionError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.loadConnections();
  }

  async loadConnections(): Promise<void> {
    await this.executeTask("loadConnections", () => this.readConnections());
  }

  /** Ask first. A no leaves the app connected. The app stops working at once after a yes. */
  async removeConnection({ id }: { id: string }): Promise<void> {
    const target = this.state.connections.find(
      (candidate) => candidate.id === id,
    );
    if (
      target &&
      !this.deps.services.dialogs.confirm(
        `Disconnect ${target.name}? It stops working until you connect it again.`,
      )
    ) {
      return;
    }
    await this.executeTask("removeConnection", async () => {
      const response = await this.deps.api.auth.connections[":id"].$delete(
        { param: { id: encodeURIComponent(id) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      await this.readConnections();
    });
  }

  private async readConnections(): Promise<void> {
    const response = await this.deps.api.auth.connections.$get(undefined, {
      init: { signal: this.signal },
    });
    await requireApiSuccess(response);
    if (response.status !== 200) {
      throw new Error("Unexpected connections response");
    }
    this.setState({ connections: (await response.json()).connections });
  }
}
