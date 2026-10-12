/**
 * The DOM helpers of the dashboard. There is no rendering library: a view is a
 * function that builds nodes, and a slot swaps the nodes when its inputs change.
 */

export type Child = Node | string | number | boolean | null | undefined | Child[];
export type Props = Record<string, unknown>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function appendChildren(parent: Node, children: Child[]) {
  for (const child of children) {
    if (Array.isArray(child)) appendChildren(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else if (typeof child === "string" || typeof child === "number") parent.appendChild(document.createTextNode(String(child)));
  }
}

function applyProps(element: Element, props: Props) {
  for (const [name, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (name.startsWith("on")) {
      element.addEventListener(name.slice(2), value as EventListener);
    } else if (name === "style" && typeof value === "object") {
      const style = (element as HTMLElement | SVGElement).style;
      for (const [property, entry] of Object.entries(value)) {
        if (entry !== null && entry !== undefined) style.setProperty(property, String(entry));
      }
    } else if (name === "checked") {
      (element as HTMLInputElement).checked = Boolean(value);
    } else if (typeof value === "boolean") {
      // An ARIA state needs its value written out. Other boolean attributes are present or absent.
      if (name.startsWith("aria-")) element.setAttribute(name, String(value));
      else if (value) element.setAttribute(name, "");
    } else {
      element.setAttribute(name, String(value));
    }
  }
}

function build(element: Element, props: Props | null | undefined, children: Child[]) {
  const { value, ...rest } = props ?? {};
  applyProps(element, rest);
  appendChildren(element, children);
  if (value === null || value === undefined) return element;
  // A select finds its option only after the options exist.
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) element.value = String(value);
  else element.setAttribute("value", String(value));
  return element;
}

/** Build an HTML element. `class`, `style`, attributes and `on<event>` listeners come from `props`. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  return build(document.createElement(tag), props, children) as HTMLElementTagNameMap[K];
}

/** Build an SVG element. Attribute names are the SVG ones, such as `stroke-width`. */
export function svg(tag: string, props?: Props | null, ...children: Child[]): SVGElement {
  return build(document.createElementNS(SVG_NAMESPACE, tag), props, children) as SVGElement;
}

/** Join the class names that are set. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** Remember the last result of `compute` and reuse it while the arguments stay the same. */
export function memo<Args extends unknown[], Result>(compute: (...args: Args) => Result): (...args: Args) => Result {
  let lastArgs: Args | null = null;
  let lastResult: Result;
  return (...args) => {
    if (lastArgs && sameValues(lastArgs, args)) return lastResult;
    lastResult = compute(...args);
    lastArgs = args;
    return lastResult;
  };
}

export function sameValues(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function flatten(content: Child, into: Node[] = []): Node[] {
  if (Array.isArray(content)) for (const child of content) flatten(child, into);
  else if (content instanceof Node) into.push(content);
  else if (typeof content === "string" || typeof content === "number") into.push(document.createTextNode(String(content)));
  return into;
}

/** The position of `element` below one of `roots`, as child indexes. */
function pathFrom(roots: readonly Node[], element: Element): number[] | null {
  const path: number[] = [];
  let node: Node = element;
  while (!roots.includes(node)) {
    const parent: Node | null = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return [roots.indexOf(node), ...path];
}

function nodeAt(roots: readonly Node[], path: readonly number[]): Node | null {
  let node: Node | undefined = roots[path[0]];
  for (const index of path.slice(1)) node = node?.childNodes[index];
  return node ?? null;
}

function focusSelector(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `#${CSS.escape(element.id)}`;
  const name = element.getAttribute("name");
  if (name) return `${tag}[name="${CSS.escape(name)}"]`;
  const label = element.getAttribute("aria-label");
  return label ? `${tag}[aria-label="${CSS.escape(label)}"]` : null;
}

function detailsIn(nodes: readonly Node[]): HTMLDetailsElement[] {
  return nodes.flatMap((node) => node instanceof Element
    ? [...(node instanceof HTMLDetailsElement ? [node] : []), ...node.querySelectorAll("details")]
    : []);
}

/** Name a disclosure by its nearest labelled ancestor and its summary, so it can be found again after a swap. */
function detailsKeys(nodes: readonly Node[]): Map<HTMLDetailsElement, string> {
  const counts = new Map<string, number>();
  const keys = new Map<HTMLDetailsElement, string>();
  for (const details of detailsIn(nodes)) {
    const scope = details.parentElement?.closest("[id], [aria-labelledby]");
    const base = `${scope?.id || scope?.getAttribute("aria-labelledby") || ""}|${details.querySelector("summary")?.textContent ?? ""}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    keys.set(details, `${base}|${count}`);
  }
  return keys;
}

export type Slot = {
  /** The two comment nodes that mark the slot. Put them in a parent element. */
  anchors: [Comment, Comment];
  /** Build new content and swap it in. Focus and open disclosures move to the new nodes. */
  render: (build: () => Child) => void;
  /** Call `build` and swap only when `deps` differ from the last call. */
  update: (deps: readonly unknown[], build: () => Child) => void;
};

/**
 * A place in the page whose nodes are replaced as one unit. A swap makes new
 * nodes, so the slot carries over what the user would lose: the focused
 * control and each open disclosure.
 */
export function slot(): Slot {
  const start = document.createComment("");
  const end = document.createComment("");
  let lastDeps: readonly unknown[] | null = null;

  function current(): ChildNode[] {
    const nodes: ChildNode[] = [];
    for (let node = start.nextSibling; node && node !== end; node = node.nextSibling) nodes.push(node);
    return nodes;
  }

  function render(buildContent: () => Child) {
    const old = current();
    const active = document.activeElement;
    const focused = active instanceof HTMLElement || active instanceof SVGElement
      ? old.some((node) => node.contains(active)) ? active : null
      : null;
    const focusPath = focused ? pathFrom(old, focused) : null;
    const selector = focused ? focusSelector(focused) : null;
    const openKeys = new Set<string>();
    for (const [details, key] of detailsKeys(old)) if (details.open) openKeys.add(key);

    // Building can move a kept node, such as an open form, out of the old nodes.
    const next = flatten(buildContent());
    for (const node of old) if (!next.includes(node)) node.remove();
    end.before(...next);

    if (openKeys.size > 0) {
      for (const [details, key] of detailsKeys(next)) if (openKeys.has(key)) details.open = true;
    }
    if (!focused) return;
    if (focused.isConnected) {
      if (document.activeElement !== focused) focused.focus({ preventScroll: true });
      return;
    }
    const samePlace = focusPath ? nodeAt(next, focusPath) : null;
    const tag = focused.tagName;
    const matches = (node: Node | null): node is HTMLElement | SVGElement =>
      (node instanceof HTMLElement || node instanceof SVGElement) && node.tagName === tag;
    let target: HTMLElement | SVGElement | null = null;
    if (matches(samePlace) && (!selector || samePlace.matches(selector))) target = samePlace;
    if (!target && selector) {
      for (const node of next) {
        if (!(node instanceof Element)) continue;
        const found = node.matches(selector) ? node : node.querySelector(selector);
        if (matches(found)) {
          target = found;
          break;
        }
      }
    }
    if (!target && matches(samePlace)) target = samePlace;
    target?.focus({ preventScroll: true });
  }

  return {
    anchors: [start, end],
    render,
    update(deps, buildContent) {
      if (lastDeps && sameValues(lastDeps, deps)) return;
      lastDeps = deps;
      render(buildContent);
    },
  };
}

export type Component<P> = {
  /** The root element. It stays the same node for the life of the component. */
  el: HTMLElement;
  /** Give the component new inputs. It builds its content again only when an input changed. */
  update: (props: P) => void;
};

/**
 * A view with state of its own. `view` builds the content of `el` from the
 * inputs; call `rerender` after a change to the local state.
 */
export function component<P extends object>(el: HTMLElement, view: (props: P) => Child): Component<P> & { rerender: () => void } {
  const content = slot();
  el.append(...content.anchors);
  let props: P | null = null;
  const rerender = () => {
    if (props) content.render(() => view(props as P));
  };
  return {
    el,
    rerender,
    update(next) {
      if (props) {
        const previous = props as Record<string, unknown>;
        const keys = Object.keys(next);
        if (keys.length === Object.keys(previous).length && keys.every((key) => Object.is(previous[key], (next as Record<string, unknown>)[key]))) return;
      }
      props = next;
      rerender();
    },
  };
}
