/**
 * The DOM helpers of the dashboard. There is no rendering library. A view is
 * a function that builds nodes. A slot then changes the nodes in the page to
 * match the built nodes, and keeps each node that is still correct.
 */

export type Child = Node | string | number | boolean | null | undefined | Child[];
export type Props = Record<string, unknown>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HANDLERS = Symbol("handlers");

type Handlers = Record<string, EventListener>;
type Handled = Element & { [HANDLERS]?: Handlers };

// A kept node goes into the page as it is. A slot never changes it to match a built node.
const kept = new WeakSet<Node>();
// A built tree has a marker in the place of a kept node, so a build does not take the kept node out of the page.
const markers = new WeakMap<Node, Node>();
// The kept nodes whose own markers are already replaced.
const placed = new WeakSet<Node>();
// The `key` of an element tells it apart from its siblings when a list changes.
const keys = new WeakMap<Element, string>();
// An absent optional child leaves a hole, so the children after it keep their positions.
const holes = new WeakSet<Node>();
// The form controls that a build gave a value. The value of each other control is the user's.
const controlled = new WeakSet<Element>();

function hole(): Comment {
  const node = document.createComment("");
  holes.add(node);
  return node;
}

/**
 * Mark a node that the caller holds and changes by itself, such as an open
 * form. A slot puts the node in the page as it is and does not look inside it.
 */
export function keep<T extends Node>(node: T): T {
  kept.add(node);
  return node;
}

/** The one listener of an element. It calls the handler that the last build gave for the event. */
function dispatch(this: Handled, event: Event) {
  this[HANDLERS]?.[event.type]?.call(this, event);
}

function appendChildren(parent: Node, children: Child[]) {
  for (const child of children) {
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child instanceof Node) {
      if (kept.has(child)) {
        const marker = document.createComment("");
        markers.set(marker, child);
        parent.appendChild(marker);
      } else {
        parent.appendChild(child);
      }
    } else if (typeof child === "string" || typeof child === "number") {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(hole());
    }
  }
}

function applyProps(element: Element, props: Props) {
  for (const [name, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (name === "key") {
      keys.set(element, String(value));
    } else if (name.startsWith("on")) {
      ((element as Handled)[HANDLERS] ??= {})[name.slice(2)] = value as EventListener;
      element.addEventListener(name.slice(2), dispatch);
    } else if (name === "style" && typeof value === "object") {
      const style = (element as HTMLElement | SVGElement).style;
      for (const [property, entry] of Object.entries(value)) {
        if (entry !== null && entry !== undefined) style.setProperty(property, String(entry));
      }
    } else if (name === "checked") {
      (element as HTMLInputElement).checked = Boolean(value);
      controlled.add(element);
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
  controlled.add(element);
  // A select finds its option only after the options exist.
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) element.value = String(value);
  else element.setAttribute("value", String(value));
  return element;
}

/**
 * Build an HTML element. `class`, `style`, attributes and `on<event>` handlers
 * come from `props`. A `key` names the element among its siblings.
 */
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
  else into.push(hole());
  return into;
}

/** The node that a built node stands for. For a marker, that is its kept node. */
function target(node: Node): Node {
  return markers.get(node) ?? node;
}

/** A kept node and a slot anchor are used as they are. Other nodes can change to match a built node. */
function fixed(node: Node): boolean {
  return kept.has(node) || (node.nodeType === Node.COMMENT_NODE && !holes.has(node));
}

/** True when the node in the page can change to match the built node. */
function alike(old: Node, next: Node): boolean {
  if (old.nodeType !== next.nodeType) return false;
  if (!(old instanceof Element) || !(next instanceof Element)) return old.nodeType === Node.TEXT_NODE || (holes.has(old) && holes.has(next));
  return old.tagName === next.tagName
    && old.namespaceURI === next.namespaceURI
    && keys.get(old) === keys.get(next)
    && (old.tagName !== "INPUT" || old.getAttribute("type") === next.getAttribute("type"));
}

/** Put each kept node of a new subtree in the place that the build marked for it. */
function place(node: Node) {
  if (kept.has(node)) {
    if (placed.has(node)) return;
    placed.add(node);
  }
  if (!(node instanceof Element)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT);
  const found: Comment[] = [];
  while (walker.nextNode()) if (markers.has(walker.currentNode)) found.push(walker.currentNode as Comment);
  for (const marker of found) {
    const keptNode = markers.get(marker) as Node;
    marker.replaceWith(keptNode);
    place(keptNode);
  }
}

/**
 * Change the nodes `old` of `parent` to match the built nodes `next`. A node
 * that is still correct stays in the page, so it keeps its focus, its scroll
 * position and its finished animations. New nodes go in before `before`.
 */
function patchChildren(parent: Node, old: readonly Node[], next: readonly Node[], before: Node | null) {
  const targets = next.map(target);
  let at = 0;
  // A node of `old` can be out of `parent`, if a build moved it. Then it cannot be the reference of an insertion.
  const insert = (node: Node) => {
    let reference = before;
    for (let index = at; index < old.length; index++) {
      if (old[index].parentNode === parent) {
        reference = old[index];
        break;
      }
    }
    parent.insertBefore(node, reference);
    place(node);
  };
  const drop = (node: Node) => {
    if (node.parentNode === parent) parent.removeChild(node);
  };
  const laterAlike = (node: Node) => {
    for (let index = at + 1; index < old.length; index++) if (!fixed(old[index]) && alike(old[index], node)) return index;
    return -1;
  };

  targets.forEach((node, index) => {
    for (;;) {
      const current = old[at];
      if (current === node) {
        at++;
        return;
      }
      if (fixed(node)) {
        const later = old.indexOf(node, at);
        if (later !== -1) {
          while (at < later) drop(old[at++]);
          at++;
          return;
        }
        // The kept node is new here. It takes the position of a hole, if one is there.
        if (current !== undefined && holes.has(current)) {
          drop(current);
          at++;
        }
        return insert(node);
      }
      if (current === undefined) return insert(node);
      if (fixed(current)) {
        if (targets.includes(current, index + 1)) return insert(node);
        drop(current);
        at++;
        // A hole takes the position of a kept node that went away.
        if (holes.has(node)) return insert(node);
        continue;
      }
      if (alike(current, node)) {
        patch(current, node);
        at++;
        return;
      }
      if (holes.has(current) || holes.has(node)) {
        // An optional node came or went. Only this position changes.
        drop(current);
        at++;
        return insert(node);
      }
      if (node instanceof Element && keys.has(node)) {
        // A keyed node matches only its own old node. The old nodes before that one are not in the list now.
        const later = laterAlike(node);
        if (later === -1) return insert(node);
        while (at < later) drop(old[at++]);
        continue;
      }
      if (current instanceof Element && keys.has(current) && !targets.some((later, position) => position > index && alike(current, later))) {
        // The item of this keyed node is not in the list now.
        drop(current);
        at++;
        continue;
      }
      // The lists differ here. Look one node ahead to see if a node was added or removed.
      const followingOld = old[at + 1];
      const followingNew = targets[index + 1];
      if (followingNew !== undefined && !fixed(followingNew) && alike(current, followingNew)) return insert(node);
      drop(current);
      at++;
      if (followingOld !== undefined && !fixed(followingOld) && alike(followingOld, node)) continue;
      return insert(node);
    }
  });
  while (at < old.length) drop(old[at++]);
}

/**
 * Change the node `old` in the page to match the built node `next`: its
 * attributes, its handlers, its children and the state of a form control.
 */
export function patch(old: Node, next: Node) {
  if (!(old instanceof Element) || !(next instanceof Element)) {
    if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
    return;
  }
  for (const name of old.getAttributeNames()) {
    // The browser sets `open` when the user opens a disclosure. That state stays with the node.
    if (!next.hasAttribute(name) && !(name === "open" && old instanceof HTMLDetailsElement)) old.removeAttribute(name);
  }
  for (const name of next.getAttributeNames()) {
    const value = next.getAttribute(name) as string;
    if (old.getAttribute(name) !== value) old.setAttribute(name, value);
  }
  const from = (old as Handled)[HANDLERS] ?? {};
  const to = (next as Handled)[HANDLERS] ?? {};
  for (const type of Object.keys(from)) if (!(type in to)) old.removeEventListener(type, dispatch);
  for (const type of Object.keys(to)) if (!(type in from)) old.addEventListener(type, dispatch);
  (old as Handled)[HANDLERS] = to;

  patchChildren(old, [...old.childNodes], [...next.childNodes], null);

  if (!controlled.has(next)) return;
  if (old instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    if (old.type !== "file" && old.value !== next.value) old.value = next.value;
    if (old.checked !== next.checked) old.checked = next.checked;
  } else if (
    (old instanceof HTMLSelectElement && next instanceof HTMLSelectElement)
    || (old instanceof HTMLTextAreaElement && next instanceof HTMLTextAreaElement)
  ) {
    if (old.value !== next.value) old.value = next.value;
  }
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

export type Slot = {
  /** The two comment nodes that mark the slot. Put them in a parent element. */
  anchors: [Comment, Comment];
  /** Build new content and change the page to match it. */
  render: (build: () => Child) => void;
  /** Call `build` and change the page only when `deps` differ from the last call. */
  update: (deps: readonly unknown[], build: () => Child) => void;
};

/**
 * A part of the page that is built again when its inputs change. The slot
 * does not replace the nodes in the page. It changes them to match the built
 * nodes. A node that stays does not play its entry animation again, an open
 * disclosure stays open, and the focus stays on the same control.
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
    const parent = start.parentNode;
    if (!parent) return;
    const before = current();
    const active = document.activeElement;
    const focused = (active instanceof HTMLElement || active instanceof SVGElement) && before.some((node) => node.contains(active))
      ? active
      : null;
    const focusPath = focused ? pathFrom(before, focused) : null;
    const selector = focused ? focusSelector(focused) : null;

    const next = flatten(buildContent());
    patchChildren(parent, current(), next, end);

    if (!focused) return;
    if (focused.isConnected) {
      if (document.activeElement !== focused) focused.focus({ preventScroll: true });
      return;
    }
    // The focused control is gone. Give the focus to the control that took its place.
    const shown = current();
    const samePlace = focusPath ? nodeAt(shown, focusPath) : null;
    const tag = focused.tagName;
    const matches = (node: Node | null): node is HTMLElement | SVGElement =>
      (node instanceof HTMLElement || node instanceof SVGElement) && node.tagName === tag;
    let replacement: HTMLElement | SVGElement | null = null;
    if (matches(samePlace) && (!selector || samePlace.matches(selector))) replacement = samePlace;
    if (!replacement && selector) {
      for (const node of shown) {
        if (!(node instanceof Element)) continue;
        const found = node.matches(selector) ? node : node.querySelector(selector);
        if (matches(found)) {
          replacement = found;
          break;
        }
      }
    }
    if (!replacement && matches(samePlace)) replacement = samePlace;
    replacement?.focus({ preventScroll: true });
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
  keep(el);
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
