import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  encodeApiParam,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";

type ApiExampleProps = FrontendLogicProps<never, never, "encounters"> & {
  encounterId: string;
};

type Operation = "start" | "pause" | "stop";

interface ApiExampleState {
  runState: TaskState;
  runError: string | null;
  /** The operation the latest run sent, whatever its outcome. */
  operation: Operation | null;
  completed: number;
}

/** A UI-only example. Backend encounter behavior remains a stub. */
export class ApiExampleLogic extends Logic<ApiExampleProps, ApiExampleState> {
  constructor(deps: ApiExampleProps) {
    super({
      deps,
      initialState: {
        runState: "pristine",
        runError: null,
        operation: null,
        completed: 0,
      },
    });
  }

  async run({ operation }: { operation: Operation }): Promise<void> {
    await this.executeTask("run", async () => {
      this.setState({ operation });
      const response = await this.deps.api.encounters[":encounterId"][
        operation
      ].$post(
        { param: { encounterId: encodeApiParam(this.deps.encounterId) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      this.setState({ completed: this.state.completed + 1 });
    });
  }
}
