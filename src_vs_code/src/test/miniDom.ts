/**
 * A DOM small enough to RUN a page-script fragment, so a painter can be asserted by what it makes.
 *
 * <p><b>Why this exists.</b> Issue #51 was a painting bug: the password example was drawn without
 * the `.weaveEx` block every colour rule is scoped under, by a painter that was a near-verbatim copy
 * of one that worked. Every test in this repository reads the GENERATED SOURCE of a page script and
 * matches strings against it — and every one of them passed, because the source did say
 * `exTok first`. A string assertion cannot see that the ancestor the colours need is missing.</p>
 *
 * <p>So this runs the fragment. It is deliberately tiny: the four or five DOM APIs these fragments
 * actually use, and a `querySelector` that understands exactly the selector shapes they pass. It is
 * not a browser and must never grow into one — the moment a test needs something real, the answer is
 * a real integration test, not another hundred lines here.</p>
 *
 * <p>Nothing in it is async and nothing touches `vscode`, so a fragment runs to completion inside one
 * assertion.</p>
 */

/** One element: the properties these page scripts read and write, and nothing else. */
export class MiniElement {
  readonly children: MiniElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  private readonly listeners: Record<string, ((event: unknown) => void)[]> = {};
  className = '';
  checked = false;
  hidden = false;
  value = '';
  parent: MiniElement | undefined = undefined;
  private ownText = '';

  constructor(readonly tag: string, readonly id: string = '') {}

  get textContent(): string {
    return this.children.length === 0 ? this.ownText : this.children.map((c) => c.textContent).join('');
  }

  /** Assigning text CLEARS the children, exactly as the real one does — which is how a repaint works. */
  set textContent(text: string) {
    this.children.length = 0;
    this.ownText = text;
  }

  appendChild(child: MiniElement): MiniElement {
    child.parent = this;
    this.ownText = '';
    this.children.push(child);
    return child;
  }

  getAttribute(name: string): string | undefined {
    return name.startsWith('data-') ? this.dataset[camel(name.slice(5))] : undefined;
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }

  /** Fires what a person's click or keystroke would fire, so a test can drive the real handler. */
  fire(type: string, event: unknown = {}): void {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }
  }

  /** The nearest ancestor of this tag, or nothing — `closest('fieldset')` is the only caller. */
  closest(tag: string): MiniElement | undefined {
    let at: MiniElement | undefined = this.parent;
    while (at !== undefined && at.tag !== tag) {
      at = at.parent;
    }
    return at;
  }

  querySelector(selector: string): MiniElement | undefined {
    return this.descendants().find((one) => matches(one, selector));
  }

  querySelectorAll(selector: string): MiniElement[] {
    return this.descendants().filter((one) => matches(one, selector));
  }

  descendants(): MiniElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

/** A document with the handful of methods a fragment calls. */
export class MiniDocument {
  readonly root = new MiniElement('body');

  createElement(tag: string): MiniElement {
    return new MiniElement(tag);
  }

  /** Registers an element under an id so a fragment can find it. */
  place(id: string, tag = 'div', into: MiniElement = this.root): MiniElement {
    const made = new MiniElement(tag, id);
    into.appendChild(made);
    return made;
  }

  getElementById(id: string): MiniElement | null {
    return this.root.descendants().find((one) => one.id === id) ?? null;
  }

  querySelector(selector: string): MiniElement | undefined {
    return this.root.querySelector(selector);
  }

  querySelectorAll(selector: string): MiniElement[] {
    return this.root.querySelectorAll(selector);
  }
}

/**
 * Runs a page-script fragment against a mini document and hands back what it defined.
 *
 * <p>`names` are the functions to lift out of the fragment. A `vscode` stub is passed in because
 * every one of these fragments posts messages, and collecting them is half of what a test wants to
 * assert.</p>
 */
export function runFragment(
  fragment: string,
  document: MiniDocument,
  names: readonly string[],
  posted: unknown[] = [],
  window: MiniWindow = new MiniWindow(),
): Record<string, (...args: never[]) => unknown> {
  const vscode = { postMessage: (message: unknown): void => { posted.push(message); } };
  // Immediate rather than deferred: these fragments debounce their host requests, and a test that
  // has to wait for a timer is a test that will one day be flaky for a reason nobody can see.
  const setTimeout = (run: () => void): number => { run(); return 0; };
  const built = new Function(
    'document',
    'vscode',
    'window',
    'setTimeout',
    'clearTimeout',
    `${fragment}\nreturn { ${names.join(', ')} };`,
  ) as (
    d: MiniDocument,
    v: unknown,
    w: MiniWindow,
    s: unknown,
    c: unknown,
  ) => Record<string, (...args: never[]) => unknown>;
  return built(document, vscode, window, setTimeout, () => undefined);
}

/** The page's `window`: what it listens on, and the one message kind these fragments answer. */
export class MiniWindow {
  private readonly listeners: ((event: unknown) => void)[] = [];

  addEventListener(type: string, handler: (event: unknown) => void): void {
    if (type === 'message') {
      this.listeners.push(handler);
    }
  }

  /** Delivers one host answer to every listener, exactly as `postMessage` into the webview does. */
  deliver(data: unknown): void {
    for (const handler of this.listeners) {
      handler({ data });
    }
  }
}

/** `.weaveEx`, `.weaveEx[data-field="x"]`, `[data-field="x"]` and a bare tag — nothing else. */
function matches(element: MiniElement, selector: string): boolean {
  const attribute = selector.match(/\[data-([a-z-]+)="([^"]*)"\]/);
  const classes = selector.replace(/\[[^\]]*\]/g, '').split('.').filter((part) => part.length > 0);
  const classOk = classes.every((one) => element.className.split(' ').includes(one));
  const attributeOk = attribute === null || element.dataset[camel(attribute[1])] === attribute[2];
  return classOk && attributeOk;
}

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase());
}
