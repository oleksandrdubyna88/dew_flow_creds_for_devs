import { runInNewContext } from 'node:vm';

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
    const forType = this.listeners[type] ?? [];
    forType.push(handler);
    this.listeners[type] = forType;
  }

  /** Fires what a person's click or keystroke would fire, so a test can drive the real handler. */
  fire(type: string, event: unknown = {}): void {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }
  }

  /**
   * The nearest ancestor of this tag, or NULL — `closest('fieldset')` is the only caller.
   *
   * <p>Null, not undefined, and that is not pedantry: page scripts compare against `null` because
   * that is what the real DOM answers, and a harness that returns `undefined` makes every such
   * guard pass silently. One of this file's own tests was green for exactly that reason before the
   * mismatch was found.</p>
   */
  closest(tag: string): MiniElement | null {
    let at: MiniElement | undefined = this.parent;
    while (at !== undefined && at.tag !== tag) {
      at = at.parent;
    }
    return at ?? null;
  }

  /** Null on a miss, for the reason `closest` is. */
  querySelector(selector: string): MiniElement | null {
    return this.descendants().find((one) => matches(one, selector)) ?? null;
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

  /** Null on a miss, exactly as the real one answers — see `MiniElement.closest`. */
  querySelector(selector: string): MiniElement | null {
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
  const sandbox = {
    document,
    vscode,
    window,
    // Immediate rather than deferred: these fragments debounce their host requests, and a test that
    // has to wait for a timer is a test that will one day be flaky for a reason nobody can see.
    setTimeout: (run: () => void): number => { run(); return 0; },
    clearTimeout: () => undefined,
    lifted: {} as Record<string, (...args: never[]) => unknown>,
  };
  // `node:vm`, not `new Function`: the context is EXPLICIT — these six names and nothing else, not
  // even this file's own scope — which is both what a page script actually gets in a webview and the
  // sanctioned way to run a string of code in Node. The string is the page script this build just
  // generated from its own source; nothing here reads input.
  runInNewContext(`${fragment}\nlifted = { ${names.join(', ')} };`, sandbox, { timeout: 5000 });
  return marshalled(sandbox.lifted);
}

/**
 * The lifted functions, with their results brought back into THIS realm.
 *
 * <p>A context of its own is a realm of its own, so an array a fragment builds has that realm's
 * `Array.prototype` — and `assert.deepEqual` compares prototypes. Without this, a test asserting
 * `['iban']` fails against a result printing as `['iban']`, which is a confusing half-hour for
 * whoever writes the next one. `Array.isArray` reads the internal slot and so answers correctly
 * across realms, which is what makes the copy safe to do blindly.</p>
 */
function marshalled(
  lifted: Record<string, (...args: never[]) => unknown>,
): Record<string, (...args: never[]) => unknown> {
  return Object.fromEntries(
    Object.entries(lifted).map(([name, fn]) => [
      name,
      (...args: never[]): unknown => {
        const answer = fn(...args);
        return Array.isArray(answer) ? [...answer] : answer;
      },
    ]),
  );
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
  const at = selector.indexOf('[');
  const classes = (at < 0 ? selector : selector.slice(0, at)).split('.').filter((part) => part.length > 0);
  const classOk = classes.every((one) => element.className.split(' ').includes(one));
  return classOk && attributeOk(element, at < 0 ? '' : selector.slice(at));
}

/** The one attribute shape these selectors use, read by index rather than by a nested pattern. */
function attributeOk(element: MiniElement, bracketed: string): boolean {
  const found = ATTRIBUTE.exec(bracketed);
  return found === null || element.dataset[camel(found[1])] === found[2];
}

const ATTRIBUTE = /^\[data-([a-z-]+)="([^"]*)"\]$/;

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase());
}
