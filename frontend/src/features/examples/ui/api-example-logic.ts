import { Logic } from "@shadow/common/features/core/logic/logic";
import { encodeApiParam, requireApiSuccess } from "../../../api/client.js";
import type { FrontendLogicProps } from "../../../logic/types.js";

type ApiExampleProps = FrontendLogicProps<never, never, "encounters"> & {
  encounterId: string;
};

interface ApiExampleState {
  busy: boolean;
  completed: number;
  message: string;
  error: string | null;
}

/** A UI-only example. Backend encounter behavior remains a stub. */
export class ApiExampleLogic extends Logic<ApiExampleProps, ApiExampleState> {
  constructor(props: ApiExampleProps) {
    super({
      deps: props,
      initialState: {
        busy: false,
        completed: 0,
        message: "No command sent yet.",
        error: null,
      },
    });
  }

  async run({
    operation,
  }: {
    operation: "start" | "pause" | "stop";
  }): Promise<void> {
    if (this.state.busy) return;
    this.setState({
      busy: true,
      error: null,
      message: `Sending ${operation}…`,
    });
    try {
      const response = await this.deps.api.encounters[":encounterId"][
        operation
      ].$post(
        { param: { encounterId: encodeApiParam(this.deps.encounterId) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.setState({
        completed: this.state.completed + 1,
        message: `${operation} completed.`,
      });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : "The command failed.",
        message: "Command failed.",
      });
    } finally {
      this.setState({ busy: false });
    }
  }
}
