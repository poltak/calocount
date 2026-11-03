import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../tests/full-application.js";
import { TabsScrollLogic } from "./tabs-scroll-logic.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(
    params,
    () => new TabsScrollLogic({ storage: {}, services: {}, api: {} }),
  );
}

describe("TabsScrollLogic tests", () => {
  it("should say nothing is hidden when all tabs fit", async () => {
    const { logic } = await setupTest();

    logic.measure({ scrollLeft: 0, clientWidth: 500, scrollWidth: 500 });

    expect(logic.state).toEqual({ hiddenBefore: false, hiddenAfter: false });
  });

  it("should say which sides hide tabs at each scroll position", async () => {
    const { logic } = await setupTest();

    logic.measure({ scrollLeft: 0, clientWidth: 500, scrollWidth: 1200 });
    expect(logic.state).toEqual({ hiddenBefore: false, hiddenAfter: true });

    logic.measure({ scrollLeft: 300, clientWidth: 500, scrollWidth: 1200 });
    expect(logic.state).toEqual({ hiddenBefore: true, hiddenAfter: true });

    // A rounded position stops 1 pixel before the end.
    logic.measure({ scrollLeft: 699, clientWidth: 500, scrollWidth: 1200 });
    expect(logic.state).toEqual({ hiddenBefore: true, hiddenAfter: false });
  });
});
