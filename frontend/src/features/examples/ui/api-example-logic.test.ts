import { describe, expect, it } from "vitest";
import { ApiExampleLogic } from "./api-example-logic.js";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(
    params,
    (app) => new ApiExampleLogic({ ...app.frontend, encounterId: "enc-42" }),
  );
}

// Encounter operations store nothing yet, so these tests have no database
// state to assert. Add those assertions when the backend implements them.
describe("ApiExampleLogic tests", () => {
  it("should set the error state while encounter operations are not implemented", async () => {
    const { logic } = await setupTest();

    expect(logic.state.runState).toEqual("pristine");
    expect(logic.state.runError).toEqual(null);
    expect(logic.state.operation).toEqual(null);
    expect(logic.state.completed).toEqual(0);

    const runP = logic.run({ operation: "start" });
    expect(logic.state.runState).toEqual("running");
    expect(logic.state.operation).toEqual("start");
    await runP;

    expect(logic.state.runState).toEqual("error");
    expect(logic.state.runError).toEqual(
      "Encounter lifecycle operations are not implemented yet",
    );
    expect(logic.state.operation).toEqual("start");
    expect(logic.state.completed).toEqual(0);
  });

  it("should ignore a second command while the first is running", async () => {
    const { logic, transport } = await setupTest();
    const held = transport.holdNextRequest();

    const firstP = logic.run({ operation: "start" });
    const secondP = logic.run({ operation: "stop" });
    await held.reached;
    expect(logic.state.runState).toEqual("running");
    expect(logic.state.operation).toEqual("start");

    held.release();
    await Promise.all([firstP, secondP]);

    expect(logic.state.runState).toEqual("error");
    expect(logic.state.operation).toEqual("start");
  });
});
