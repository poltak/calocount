import { Logic } from "@shadow/common/features/core/logic/logic";
import type { FrontendLogicProps } from "../../core/logic/types.js";

/** Local state example. It has no API or persistence operations. */
export class CounterLogic extends Logic<FrontendLogicProps, { count: number }> {
  constructor(deps: FrontendLogicProps) {
    super({ deps, initialState: { count: 0 } });
  }

  increment(): void {
    this.setState({ count: this.state.count + 1 });
  }

  decrement(): void {
    this.setState({ count: this.state.count - 1 });
  }

  reset(): void {
    this.setState({ count: 0 });
  }
}
