/**
 * Lint rules for the UI Logic integration tests described in
 * docs/agents/testing.md. They use the standard ESLint rule API, like the
 * architecture and stack plugins.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import {
  describeFile,
  importVisitors,
  isListed,
  resolveImport,
} from "./paths.mjs";

const DOC = "See docs/agents/testing.md";
const TEST_DOUBLES = [
  "mock",
  "doMock",
  "unmock",
  "spyOn",
  "fn",
  "mocked",
  "hoisted",
  "stubGlobal",
  "stubEnv",
];
const TEST_FUNCTIONS = ["it", "test", "describe"];

/** UI Logic and its LogicPlugins live in a feature's `ui/` directory. */
function isUiLogic(file) {
  return (
    file?.role === "ui" &&
    (file.base.endsWith("-logic") || file.base.endsWith("-plugin"))
  );
}

const uiLogicTested = {
  meta: {
    type: "problem",
    docs: {
      description: "Every UI Logic and LogicPlugin file has a test beside it.",
    },
    schema: [],
    messages: {
      missing:
        "'{{file}}' has no test. Add '{{test}}' beside it, with a test for each operation's success and each anticipated failure. " +
        DOC +
        ".",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const file = describeFile(filename);
    if (!isUiLogic(file) || file.isTest) {
      return {};
    }

    return {
      Program(node) {
        const test = `${file.base}.test.ts`;
        if (!existsSync(path.join(path.dirname(filename), test))) {
          context.report({
            node,
            messageId: "missing",
            data: { file: file.file, test },
          });
        }
      },
    };
  },
};

const logicTests = {
  meta: {
    type: "problem",
    docs: {
      description:
        "UI Logic tests run against the full application, without test doubles, rendering, or concurrent tests.",
    },
    schema: [{ type: "object" }],
    messages: {
      double:
        "Do not use vi.{{name}} in a UI Logic test. Run the real backend through the fixture, and use its transport controls for timing and connection failures. " +
        DOC +
        ".",
      concurrent:
        "Do not run UI Logic tests concurrently. The fixture's automatic cleanup needs one test at a time in a file. " +
        DOC +
        ".",
      import:
        "A UI Logic test must not import '{{source}}'. Build the application and the Logic with {{fixture}}. " +
        DOC +
        ".",
      fixture:
        "A UI Logic test must build its Logic with {{fixture}}. " + DOC + ".",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const filename = context.filename ?? context.getFilename();
    const file = describeFile(filename);
    if (!isUiLogic(file) || !file.isTest) {
      return {};
    }

    const fixture = options.fixtureName ?? "setupLogicTest";
    const isFixtureFile = (source) => {
      const target = resolveImport(filename, source);
      const described = target ? describeFile(target) : null;
      return (
        described !== null && isListed(described, [options.fixtureFile ?? ""])
      );
    };
    const isForbiddenImport = (source) => {
      if ((options.forbiddenPackages ?? []).includes(source)) {
        return true;
      }
      const target = resolveImport(filename, source);
      const described = target ? describeFile(target) : null;
      return (
        described !== null && isListed(described, options.forbiddenFiles ?? [])
      );
    };

    let usesFixture = false;
    return {
      ...importVisitors((node, source, names) => {
        if (isFixtureFile(source) && (names ?? []).includes(fixture)) {
          usesFixture = true;
        }
        if (isForbiddenImport(source)) {
          context.report({
            node,
            messageId: "import",
            data: { source, fixture },
          });
        }
      }),
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || node.computed) {
          return;
        }
        const object = node.object.name;
        const property = node.property.name;
        if (object === "vi" && TEST_DOUBLES.includes(property)) {
          context.report({
            node,
            messageId: "double",
            data: { name: property },
          });
        }
        if (TEST_FUNCTIONS.includes(object) && property === "concurrent") {
          context.report({ node, messageId: "concurrent" });
        }
      },
      "Program:exit"(node) {
        if (!usesFixture) {
          context.report({ node, messageId: "fixture", data: { fixture } });
        }
      },
    };
  },
};

export default {
  meta: { name: "testing" },
  rules: {
    "ui-logic-tested": uiLogicTested,
    "logic-tests": logicTests,
  },
};
