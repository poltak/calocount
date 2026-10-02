import { describe, expect, it } from "vitest";
import { CounterLogic } from "./counter-logic.js";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new CounterLogic(app.frontend));
}

// This Logic only holds local state: it sends no requests and stores nothing.
describe("CounterLogic tests", () => {
  it("should count up and down, and reset to zero", async () => {
    const { logic } = await setupTest();

    expect(logic.state.count).toEqual(0);

    logic.increment();
    logic.increment();
    expect(logic.state.count).toEqual(2);

    logic.decrement();
    expect(logic.state.count).toEqual(1);

    logic.reset();
    expect(logic.state.count).toEqual(0);
  });
});
