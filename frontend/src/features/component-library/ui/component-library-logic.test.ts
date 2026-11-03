import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { ComponentLibraryLogic } from "./component-library-logic.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(
    params,
    () => new ComponentLibraryLogic({ storage: {}, services: {}, api: {} }),
  );
}

describe("ComponentLibraryLogic tests", () => {
  it("should afford choosing the values of the example controls", async () => {
    const { logic } = await setupTest();

    expect(logic.state.filter).toEqual("open");
    expect(logic.state.plan).toEqual("free");
    expect(logic.state.includeArchive).toEqual(true);
    expect(logic.state.channel).toEqual("email");

    logic.chooseFilter("closed");
    logic.choosePlan("team");
    logic.setIncludeArchive(false);
    logic.chooseChannel("push");
    logic.changeSearch("invoice");
    logic.setHistoryOpen(true);
    logic.chooseMenuAction("Duplicate");

    expect(logic.state.filter).toEqual("closed");
    expect(logic.state.plan).toEqual("team");
    expect(logic.state.includeArchive).toEqual(false);
    expect(logic.state.channel).toEqual("push");
    expect(logic.state.search).toEqual("invoice");
    expect(logic.state.historyOpen).toEqual(true);
    expect(logic.state.lastMenuAction).toEqual("Duplicate");
  });

  it("should afford opening and closing the example dialog", async () => {
    const { logic } = await setupTest();

    expect(logic.state.dialogOpen).toEqual(false);

    logic.openDialog();

    expect(logic.state.dialogOpen).toEqual(true);

    logic.closeDialog();

    expect(logic.state.dialogOpen).toEqual(false);
  });

  it("should refuse a form with no name, and clear the error when a name arrives", async () => {
    const { logic } = await setupTest();

    logic.changeNote("A note");
    logic.submitForm();

    expect(logic.state.nameError).toEqual("Enter a name");
    expect(logic.state.submitted).toEqual(false);

    logic.changeName("Ada");

    expect(logic.state.nameError).toEqual(null);

    logic.submitForm();

    expect(logic.state.submitted).toEqual(true);

    logic.changeNote("Another note");

    expect(logic.state.submitted).toEqual(false);
  });

  it("should clear the form when the person cancels", async () => {
    const { logic } = await setupTest();
    logic.changeName("Ada");
    logic.changeNote("A note");
    logic.submitForm();

    logic.cancelForm();

    expect(logic.state.name).toEqual("");
    expect(logic.state.note).toEqual("");
    expect(logic.state.submitted).toEqual(false);
  });
});
