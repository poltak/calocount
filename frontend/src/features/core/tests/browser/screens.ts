import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { BACKEND_ORIGIN } from "./origins.js";

/**
 * A page for the UI review: `route` is the pattern in the route table, such
 * as `/notes/:noteId`, and `url` is the address to open. A route can have
 * more than one screen, such as the empty and the full list.
 */
export interface Screen {
  route: string;
  url: string;
  contentRoot?: string;
  /** Tells two screens of one route apart, such as `empty`. */
  state?: string | undefined;
  offlineBeforeSteps?: boolean;
  steps?: readonly {
    role?: Parameters<Page["getByRole"]>[0];
    name: string;
    action: "click" | "focus" | "waitFor";
    width?: "desktop" | "phone";
  }[];
}

interface ScreensRequest {
  outputDirectory: string;
  /** The routes to take. Empty means each route. */
  routes: string[];
}

// `scripts/ui-screens.mjs` writes this file before it starts Playwright.
// A file, not the environment, because the frontend lint forbids
// `process.env`.
const REQUEST_FILE = path.resolve(".browser-test/screens/request.json");

const WIDTHS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

const THEMES = ["light", "dark"] as const;

/**
 * Adds a row through the API, as the signed-in owner, and returns the answer.
 * A screen file seeds its rows with this. A black box test may not, because
 * it makes its data through the UI.
 */
export async function seedThroughApi<Answer>(
  page: Page,
  apiPath: string,
  data: unknown,
): Promise<Answer> {
  const response = await page.request.post(`${BACKEND_ORIGIN}${apiPath}`, {
    data,
  });
  if (!response.ok()) {
    throw new Error(`Seeding ${apiPath} failed: ${response.status()}`);
  }
  return (await response.json()) as Answer;
}

async function readRequest(): Promise<ScreensRequest> {
  return JSON.parse(await readFile(REQUEST_FILE, "utf8")) as ScreensRequest;
}

function fileStem(screen: Screen): string {
  // The route `*` is the page that no other route matches.
  const route = screen.route
    .replace("*", "not-found")
    .replace(/^\//, "")
    .replace(/[/:]+/g, "-")
    .replace(/-+$/, "");
  return [route || "root", screen.state].filter(Boolean).join("--");
}

/**
 * Takes a full-page screenshot of each screen at each width in each theme,
 * and writes what the browser measured next to it. Only the routes that the
 * request names are taken. The data must be fake: the test backend has only
 * the rows that the calling test seeded.
 */
export async function captureScreens(
  page: Page,
  screens: readonly Screen[],
): Promise<void> {
  const request = await readRequest();
  const wanted = screens.filter(
    (screen) =>
      request.routes.length === 0 || request.routes.includes(screen.route),
  );
  await mkdir(request.outputDirectory, { recursive: true });
  for (const screen of wanted) {
    const stem = fileStem(screen);
    const results = [];
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme });
      for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(screen.url);
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        if (screen.offlineBeforeSteps) {
          await page.context().setOffline(true);
        }
        for (const step of screen.steps ?? []) {
          if (step.width && step.width !== size.name) {
            continue;
          }
          const target = step.role
            ? page.getByRole(step.role, { name: step.name, exact: true })
            : page.getByText(step.name, { exact: true });
          if (step.action === "focus") {
            await target.press("Shift+Tab");
            await page.keyboard.press("Tab");
          } else {
            await target[step.action]();
            if (step.action === "waitFor") {
              await target.scrollIntoViewIfNeeded();
            }
          }
        }
        const file = `${stem}.${size.name}.${theme}.png`;
        await page.screenshot({
          path: path.join(request.outputDirectory, file),
          fullPage: true,
          animations: "disabled",
          caret: "hide",
        });
        results.push({
          file,
          theme,
          width: size.name,
          measurements: await page.evaluate(measurePage, screen.contentRoot),
        });
        if (screen.offlineBeforeSteps) {
          await page.context().setOffline(false);
        }
      }
    }
    await writeFile(
      path.join(request.outputDirectory, `${stem}.json`),
      `${JSON.stringify({ ...screen, results }, null, 2)}\n`,
    );
  }
}

/**
 * Runs in the browser. The UI review reads these numbers to compare a page
 * with its sibling pages: heading sizes, the gaps between blocks, the content
 * width, and the left edges.
 */
function measurePage(contentRoot?: string) {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright sends only the source of measurePage to the page, so a helper outside it does not exist there.
  const box = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright sends only the source of measurePage to the page, so a helper outside it does not exist there.
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  };
  const root = document.querySelector(contentRoot ?? "main");
  if (!root) {
    throw new Error("A screen without main must set contentRoot.");
  }
  // The content column is the first element under `main` that has more than
  // one child. Its children are the blocks of the page.
  let column: Element = root;
  while (column.children.length === 1 && column.firstElementChild) {
    column = column.firstElementChild;
  }
  const blocks = [...column.children].filter(isVisible).map((element) => ({
    tag: element.tagName.toLowerCase(),
    slot: element.getAttribute("data-slot"),
    ...box(element),
  }));
  const gaps = blocks.slice(1).map((block, index) => {
    const previous = blocks[index];
    return previous ? block.y - (previous.y + previous.height) : 0;
  });
  const headings = [
    ...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]"),
  ]
    .filter(isVisible)
    .map((element) => {
      const style = getComputedStyle(element);
      return {
        level:
          /^H(\d)$/.exec(element.tagName)?.[1] ??
          element.getAttribute("aria-level"),
        text: (element.textContent ?? "").trim().slice(0, 80),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        ...box(element),
      };
    });
  // How many text and control elements start at each x. One page should have
  // few left edges.
  const leftEdges: Record<string, number> = {};
  for (const element of root.querySelectorAll(
    "h1, h2, h3, h4, p, label, li, input, textarea, select, button, a, table",
  )) {
    if (isVisible(element)) {
      const x = String(Math.round(element.getBoundingClientRect().left));
      leftEdges[x] = (leftEdges[x] ?? 0) + 1;
    }
  }
  const page = document.documentElement;
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: { width: page.scrollWidth, height: page.scrollHeight },
    horizontalOverflow: page.scrollWidth > window.innerWidth,
    main: box(root),
    column: box(column),
    headings,
    blocks,
    gaps,
    leftEdges,
  };
}
