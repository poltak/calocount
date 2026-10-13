import { expect, test, type Page } from "@playwright/test";

// The parts of app/ui/dom.ts that these tests use. The module is in the browser program, so its types are not imported here.
type Slot = { anchors: [Comment, Comment]; render: (build: () => unknown) => void };
type Dom = {
  h: (tag: string, props?: Record<string, unknown> | null, ...children: unknown[]) => HTMLElement;
  keep: <T extends Node>(node: T) => T;
  slot: () => Slot;
};

// The test page loads the helper module from its source file.
const DOM_MODULE = `/@fs${new URL("../../app/ui/dom.ts", import.meta.url).pathname}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/dom.html");
});

/** Run `scenario` in the page with the DOM helpers and an empty slot in `#root`. */
function inPage<Result>(page: Page, scenario: (dom: Dom, root: HTMLElement, slot: Slot) => Result | Promise<Result>) {
  return page.evaluate(async ([url, source]) => {
    const dom = await import(/* @vite-ignore */ url) as Dom;
    const root = document.getElementById("root") as HTMLElement;
    const slot = dom.slot();
    for (const anchor of slot.anchors) root.appendChild(anchor);
    const run = new Function(`return (${source})`)() as (dom: Dom, root: HTMLElement, slot: Slot) => unknown;
    return run(dom, root, slot);
  }, [DOM_MODULE, scenario.toString()] as const) as Promise<Result>;
}

test("a slot changes text and attributes on the nodes that stay", async ({ page }) => {
  const result = await inPage(page, ({ h }, root, list) => {
    const view = (total: number, over: boolean) => h("p", { class: over ? "total over" : "total", title: over ? "Over" : undefined }, "Total ", h("strong", null, total));
    list.render(() => view(500, false));
    const paragraph = root.querySelector("p");
    const strong = root.querySelector("strong");
    list.render(() => view(650, true));
    return {
      sameNodes: root.querySelector("p") === paragraph && root.querySelector("strong") === strong,
      html: root.querySelector("p")?.outerHTML,
    };
  });
  expect(result).toEqual({ sameNodes: true, html: '<p class="total over" title="Over">Total <strong>650</strong></p>' });
});

test("an optional child that comes or goes does not replace the children after it", async ({ page }) => {
  const result = await inPage(page, ({ h }, root, panel) => {
    const view = (showNote: boolean) => h("section", null, h("h2", null, "Entries"), showNote ? h("div", { class: "note" }, "Saving") : null, h("div", { class: "list" }, "Two entries"));
    panel.render(() => view(false));
    const list = root.querySelector(".list");
    panel.render(() => view(true));
    const withNote = root.querySelector("section")?.textContent;
    const keptWithNote = root.querySelector(".list") === list;
    panel.render(() => view(false));
    return { withNote, keptWithNote, keptWithoutNote: root.querySelector(".list") === list, notes: root.querySelectorAll(".note").length };
  });
  expect(result).toEqual({ withNote: "EntriesSavingTwo entries", keptWithNote: true, keptWithoutNote: true, notes: 0 });
});

test("a keyed item keeps its node when the list gets or loses items", async ({ page }) => {
  const result = await inPage(page, ({ h }, root, list) => {
    const view = (days: string[]) => h("ol", null, days.map((day) => h("li", { key: day }, day)), h("li", { class: "total" }, `${days.length} days`));
    list.render(() => view(["Mon", "Tue", "Wed"]));
    const wednesday = [...root.querySelectorAll("li")].find((item) => item.textContent === "Wed");
    const total = root.querySelector(".total");
    // A day goes in at the front and a day goes out in the middle.
    list.render(() => view(["Sun", "Mon", "Wed"]));
    const items = [...root.querySelectorAll("li")];
    return {
      text: items.map((item) => item.textContent),
      sameWednesday: items[2] === wednesday,
      sameTotal: root.querySelector(".total") === total,
    };
  });
  expect(result).toEqual({ text: ["Sun", "Mon", "Wed", "3 days"], sameWednesday: true, sameTotal: true });
});

test("a kept node stays in the page while the nodes around it change", async ({ page }) => {
  const result = await inPage(page, async ({ h, keep }, root, panel) => {
    const input = h("input", { name: "name" }) as HTMLInputElement;
    const form = keep(h("form", null, input));
    const view = (count: number, open: boolean) => h("section", null, h("h2", null, `Entries ${count}`), open ? form : null, h("p", null, "Footer"));
    panel.render(() => view(1, true));
    input.value = "Soup";
    input.focus();
    const removed: Node[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) removed.push(...record.removedNodes);
    });
    observer.observe(root, { childList: true, subtree: true });
    panel.render(() => view(2, true));
    await Promise.resolve();
    observer.disconnect();
    const whileOpen = { heading: root.querySelector("h2")?.textContent, formRemoved: removed.includes(form), value: input.value, focused: document.activeElement === input };
    panel.render(() => view(2, false));
    return { ...whileOpen, formsAfterClose: root.querySelectorAll("form").length, footer: root.querySelector("p")?.textContent };
  });
  expect(result).toEqual({ heading: "Entries 2", formRemoved: false, value: "Soup", focused: true, formsAfterClose: 0, footer: "Footer" });
});

test("a click calls the handler of the last render one time", async ({ page }) => {
  const result = await inPage(page, ({ h }, root, control) => {
    const calls: string[] = [];
    const view = (label: string, withHandler = true) => h("button", { type: "button", onclick: withHandler ? () => calls.push(label) : undefined }, label);
    control.render(() => view("first"));
    control.render(() => view("second"));
    root.querySelector("button")?.click();
    control.render(() => view("none", false));
    root.querySelector("button")?.click();
    return calls;
  });
  expect(result).toEqual(["second"]);
});

test("a control keeps the user's text unless the render gives it a value", async ({ page }) => {
  const result = await inPage(page, ({ h }, root, form) => {
    const view = (draft: string, unit: string) => h("div", null,
      h("input", { name: "free" }),
      h("input", { name: "draft", value: draft }),
      h("select", { name: "unit", value: unit }, h("option", { value: "g" }, "g"), h("option", { value: "mg" }, "mg")),
      h("input", { name: "agree", type: "checkbox", checked: unit === "mg" }),
    );
    form.render(() => view("70", "g"));
    const field = (name: string) => root.querySelector(`[name="${name}"]`) as HTMLInputElement;
    field("free").value = "typed by the user";
    field("draft").value = "71";
    form.render(() => view("72", "mg"));
    return { free: field("free").value, draft: field("draft").value, unit: field("unit").value, agree: field("agree").checked };
  });
  expect(result).toEqual({ free: "typed by the user", draft: "72", unit: "mg", agree: true });
});
