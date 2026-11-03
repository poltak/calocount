import { Logic } from "@app/common/features/core/logic/logic";
import type { FrontendLogicProps } from "../../logic/types.js";

interface TabsScrollState {
  hiddenBefore: boolean;
  hiddenAfter: boolean;
}

/** A browser can round a scroll position, so the end can be 1 pixel short. */
const SCROLL_END_TOLERANCE = 1;

export class TabsScrollLogic extends Logic<
  FrontendLogicProps,
  TabsScrollState
> {
  constructor(deps: FrontendLogicProps) {
    super({ deps, initialState: { hiddenBefore: false, hiddenAfter: false } });
  }

  measure({
    scrollLeft,
    clientWidth,
    scrollWidth,
  }: {
    scrollLeft: number;
    clientWidth: number;
    scrollWidth: number;
  }): void {
    this.setState({
      hiddenBefore: scrollLeft > SCROLL_END_TOLERANCE,
      hiddenAfter:
        scrollLeft + clientWidth < scrollWidth - SCROLL_END_TOLERANCE,
    });
  }
}
