/**
 * Lint rules for the UI Logic integration tests and the black box tests
 * described in docs/agents/testing.md. They use the standard ESLint rule API,
 * like the architecture and stack plugins.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import {
  describeFile,
  importVisitors,
  isListed,
  resolveImport,
} from "./paths.ts";
import type { FileDescription } from "./paths.ts";
import type {
  AstNode,
  CallExpression,
  MemberExpression,
  Plugin,
  Property,
  Rule,
  TestingOptions,
} from "./plugin-types.ts";

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

const BLACK_BOX_DOC = "See docs/agents/testing.md (Black box tests)";
const BLACK_BOX_ROLE = "black-box-tests";
/** The methods of Playwright that find elements. */
const LOCATOR_METHODS = [
  "getByRole",
  "getByLabel",
  "getByText",
  "getByPlaceholder",
  "getByAltText",
  "getByTitle",
  "getByTestId",
  "locator",
  "frameLocator",
  "$",
  "$$",
  "$eval",
  "$$eval",
];
/** The methods that find elements by markup, CSS, XPath, or test IDs. */
const MARKUP_LOCATOR_METHODS = [
  "getByTestId",
  "locator",
  "frameLocator",
  "$",
  "$$",
  "$eval",
  "$$eval",
];
/** The methods that change or read the page from inside. */
const INSIDE_METHODS = [
  "route",
  "routeFromHAR",
  "routeWebSocket",
  "unroute",
  "unrouteAll",
  "evaluate",
  "evaluateHandle",
  "addInitScript",
  "exposeFunction",
  "exposeBinding",
  "storageState",
];

/**
 * A `*.spec.ts` file is a black box test, unless the options exempt it. A
 * `*-page-object.ts` file is a page object. A `*.screens.ts` file takes the
 * screenshots of the UI review. It checks nothing, so it may seed rows through
 * the API, but only with the screens helper.
 */
function blackBoxKind(
  file: FileDescription,
): "test" | "screens" | "pageObject" | null {
  if (/\.spec\.[cm]?[jt]sx?$/.test(file.file)) {
    return "test";
  }
  if (/\.screens\.[cm]?[jt]sx?$/.test(file.file)) {
    return "screens";
  }
  if (file.base.endsWith("-page-object")) {
    return "pageObject";
  }
  return null;
}

/** UI Logic and its LogicPlugins live in a feature's `ui/` directory. */
function isUiLogic(file: FileDescription | null): file is FileDescription {
  return (
    file?.role === "ui" &&
    (file.base.endsWith("-logic") || file.base.endsWith("-plugin"))
  );
}

const uiLogicTested: Rule = {
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

const logicTests: Rule<TestingOptions> = {
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
    const isFixtureFile = (source: string) => {
      const target = resolveImport(filename, source);
      const described = target ? describeFile(target) : null;
      return (
        described !== null && isListed(described, [options.fixtureFile ?? ""])
      );
    };
    const isForbiddenImport = (source: string) => {
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
      MemberExpression(node: MemberExpression) {
        if (node.object.type !== "Identifier" || node.computed) {
          return;
        }
        const object = node.object.name ?? "";
        const property = node.property.name ?? "";
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

const blackBoxTests: Rule<TestingOptions> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Black box tests know only what a user sees, and only their page objects find elements.",
    },
    schema: [{ type: "object" }],
    messages: {
      location:
        "Black box tests and page objects live in a feature's black-box-tests/ directory. " +
        BLACK_BOX_DOC +
        ".",
      folder:
        "A black-box-tests/ directory holds only black box tests (*.spec.ts), page objects (*-page-object.ts), and screens (*.screens.ts). Put another test beside the file that it tests. " +
        BLACK_BOX_DOC +
        ".",
      fixture:
        "A black box test must take `test` from {{fixture}}, so that each test gets its own backend. " +
        BLACK_BOX_DOC +
        ".",
      import:
        "A black box test or page object must not import '{{source}}'. It knows only what a user sees, so it imports only @playwright/test, the black box fixture, and page objects. " +
        BLACK_BOX_DOC +
        ".",
      check:
        "A page object does not check. The test checks with `expect`, and a step that must wait uses `waitFor()`. " +
        BLACK_BOX_DOC +
        ".",
      pageObject:
        "A black box test does not find elements. Call '{{name}}' in the page object of the page, and use its steps and locators here. " +
        BLACK_BOX_DOC +
        ".",
      markup:
        "Find elements by role, label, or text, as a user does. '{{name}}' depends on the page's markup or on test IDs. " +
        BLACK_BOX_DOC +
        ".",
      inside:
        "'{{name}}' changes or reads the page from inside, which a user cannot do. " +
        BLACK_BOX_DOC +
        ".",
      wait:
        "Do not wait for a fixed time. Wait for what a user waits for, such as the heading of the next page. " +
        BLACK_BOX_DOC +
        ".",
      api:
        "A black box test does not call the backend API. Make the data and check the result through the UI. " +
        BLACK_BOX_DOC +
        ".",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const filename = context.filename ?? context.getFilename();
    const file = describeFile(filename);
    const fixture = options.fixtureFile ?? "";
    const screensHelper = options.screensFile ?? "";
    if (
      !file ||
      isListed(file, options.exemptFiles ?? []) ||
      isListed(file, [fixture])
    ) {
      return {};
    }
    const kind = blackBoxKind(file);
    if (!kind) {
      return file.role === BLACK_BOX_ROLE
        ? {
            Program(node) {
              context.report({ node, messageId: "folder" });
            },
          }
        : {};
    }

    let usesFixture = false;
    let reportedFixture = false;
    return {
      Program(node) {
        if (file.role !== BLACK_BOX_ROLE) {
          context.report({ node, messageId: "location" });
        }
      },
      ...importVisitors((node, source, names) => {
        if (source === "@playwright/test") {
          if (kind !== "pageObject" && (names ?? []).includes("test")) {
            context.report({ node, messageId: "fixture", data: { fixture } });
            reportedFixture = true;
          }
          if (kind === "pageObject" && (names ?? []).includes("expect")) {
            context.report({ node, messageId: "check" });
          }
          return;
        }
        const target = resolveImport(filename, source);
        const described = target ? describeFile(target) : null;
        if (described && isListed(described, [fixture])) {
          if ((names ?? []).includes("test")) {
            usesFixture = true;
          }
          return;
        }
        if (described && blackBoxKind(described) === "pageObject") {
          return;
        }
        if (
          kind === "screens" &&
          described &&
          isListed(described, [screensHelper])
        ) {
          return;
        }
        context.report({ node, messageId: "import", data: { source } });
      }),
      CallExpression(node: CallExpression) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) {
          return;
        }
        const name = callee.property?.name ?? "";
        if (name === "waitForTimeout") {
          context.report({ node, messageId: "wait" });
        } else if (INSIDE_METHODS.includes(name)) {
          context.report({ node, messageId: "inside", data: { name } });
        } else if (kind !== "pageObject" && LOCATOR_METHODS.includes(name)) {
          context.report({ node, messageId: "pageObject", data: { name } });
        } else if (MARKUP_LOCATOR_METHODS.includes(name)) {
          context.report({ node, messageId: "markup", data: { name } });
        }
      },
      // `page.request`, `context.request`, and the `request` fixture.
      MemberExpression(node: MemberExpression) {
        if (!node.computed && node.property.name === "request") {
          context.report({ node, messageId: "api" });
        }
      },
      Property(node: Property) {
        if (
          node.parent?.type === "ObjectPattern" &&
          !node.computed &&
          node.key.name === "request"
        ) {
          context.report({ node, messageId: "api" });
        }
      },
      "Program:exit"(node) {
        if (kind !== "pageObject" && !usesFixture && !reportedFixture) {
          context.report({ node, messageId: "fixture", data: { fixture } });
        }
      },
    };
  },
};

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
/** "Nov 8", "November 8, 2026", "8 Nov", "2026-11-08", and "11/08/2026". */
const CALENDAR_DATE = new RegExp(
  `\\b${MONTH}\\.?\\s+\\d{1,2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b`,
);
const CLOCK_METHODS = ["install", "setFixedTime", "setSystemTime"];

/** `expect(x)`, `expect.soft(x)`, and `expect.poll(x)`, with any chain of `.not` or `.resolves`. */
function isExpectChain(node: AstNode | undefined): boolean {
  let current = node;
  while (current?.type === "MemberExpression") {
    current = current.object;
  }
  if (current?.type !== "CallExpression") {
    return false;
  }
  const callee = current.callee;
  return (
    (callee?.type === "Identifier" && callee.name === "expect") ||
    (callee?.type === "MemberExpression" &&
      callee.object?.name === "expect" &&
      ["soft", "poll"].includes(callee.property?.name ?? ""))
  );
}

/** The static text of a string or a template literal, with a NUL where a value goes. */
function staticText(node: AstNode): string | null {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral") {
    return (node.quasis ?? []).map((part) => part.value.raw).join("\0");
  }
  return null;
}

const noFixedDateInExpect: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A black box or API test builds the date in an expected value from its clock or date helpers.",
    },
    schema: [],
    messages: {
      fixed:
        "Build the expected date from the test's clock or date helpers. A fixed date passes only on the day it was written. " +
        BLACK_BOX_DOC +
        ".",
    },
  },
  create(context) {
    if (
      !/\.(?:api-)?spec\.[cm]?[jt]sx?$/.test(
        context.filename ?? context.getFilename(),
      )
    ) {
      return {};
    }

    const dates: AstNode[] = [];
    let freezesClock = false;
    return {
      CallExpression(node: CallExpression) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) {
          return;
        }
        const name = callee.property?.name ?? "";
        if (
          CLOCK_METHODS.includes(name) &&
          callee.object?.type === "MemberExpression" &&
          callee.object.property?.name === "clock"
        ) {
          freezesClock = true;
        }
        if (!isExpectChain(callee.object)) {
          return;
        }
        for (const argument of node.arguments) {
          const text = staticText(argument);
          if (text !== null && CALENDAR_DATE.test(text)) {
            dates.push(argument);
          }
        }
      },
      // A test that freezes the clock knows the date that the page shows.
      "Program:exit"() {
        if (!freezesClock) {
          for (const node of dates) {
            context.report({ node, messageId: "fixed" });
          }
        }
      },
    };
  },
};

const plugin: Plugin = {
  meta: { name: "testing" },
  rules: {
    "ui-logic-tested": uiLogicTested,
    "logic-tests": logicTests,
    "black-box-tests": blackBoxTests,
    "no-fixed-date-in-expect": noFixedDateInExpect,
  },
};

export default plugin;
