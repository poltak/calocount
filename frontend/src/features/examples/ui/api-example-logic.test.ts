import { describe, expect, it } from "vitest";
import { ApiExampleLogic } from "./api-example-logic.js";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";

const NOT_IMPLEMENTED =
  "Encounter lifecycle operations are not implemented yet";

function setupTest({
  encounterId = "enc-42",
  ...params
}: LogicTestParams & { encounterId?: string } = {}) {
  return setupLogicTest(
    params,
    (app) => new ApiExampleLogic({ ...app.frontend, encounterId }),
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
    expect(logic.state.runError).toEqual(NOT_IMPLEMENTED);
    expect(logic.state.operation).toEqual("start");
    expect(logic.state.completed).toEqual(0);
  });

  it("should reach the encounter route when the id has reserved characters", async () => {
    const { logic } = await setupTest({ encounterId: "enc/part?tag=#%" });

    expect(logic.state.runState).toEqual("pristine");

    const runP = logic.run({ operation: "start" });
    expect(logic.state.runState).toEqual("running");
    await runP;

    // An id that was not encoded would miss the route or fail validation.
    // Assert that the backend stored this exact id once it stores encounters.
    expect(logic.state.runState).toEqual("error");
    expect(logic.state.runError).toEqual(NOT_IMPLEMENTED);
    expect(logic.state.completed).toEqual(0);
  });

  it("should set the error state when the encounter id is blank", async () => {
    const { logic } = await setupTest({ encounterId: " " });

    expect(logic.state.runState).toEqual("pristine");

    const runP = logic.run({ operation: "start" });
    expect(logic.state.runState).toEqual("running");
    await runP;

    expect(logic.state.runState).toEqual("error");
    expect(logic.state.runError).toEqual("The request is invalid");
    expect(logic.state.completed).toEqual(0);
  });

  it("should set the error state when nobody is signed in", async () => {
    const { logic } = await setupTest({ authenticated: false });

    expect(logic.state.runState).toEqual("pristine");

    const runP = logic.run({ operation: "start" });
    expect(logic.state.runState).toEqual("running");
    await runP;

    expect(logic.state.runState).toEqual("error");
    expect(logic.state.runError).toEqual("Sign in to continue");
    expect(logic.state.completed).toEqual(0);
  });

  it("should set the error state when a gateway answers instead of the backend", async () => {
    const { logic, transport } = await setupTest();
    transport.failNextRequestAtGateway(503);

    expect(logic.state.runState).toEqual("pristine");

    const runP = logic.run({ operation: "start" });
    expect(logic.state.runState).toEqual("running");
    await runP;

    expect(logic.state.runState).toEqual("error");
    expect(logic.state.runError).toEqual("Request failed with status 503");
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
