import * as ts from 'typescript';

/**
 * The reader boundary's scanner (`pinReaderBoundary.test.ts`), over the TypeScript syntax tree rather
 * than over text.
 *
 * <p>The first version was a regular expression for `.getX(` and a per-FILE check that a door or
 * refusal primitive appeared somewhere in the file. The review of 2026-09-30 named what walked past
 * it: `const read = storage.getPassword.bind(storage)`, `storage['getPassword']`, a getter passed as a
 * value — none of them is `.getX(` — and a classified file with one gated function and one ungated one,
 * which passed because the file as a whole contained the primitive. So a read is now any property
 * access, element access by a string literal, or destructured binding of a getter name — called or not
 * — and the primitive is looked for in the NEAREST enclosing function of each read, not in the file.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** One reference to a slot getter: where it is, and the function it sits in. */
export interface SlotRead {
  readonly file: string;
  readonly line: number;
  readonly getter: string;
  /** The nearest enclosing function-like node's name, or `<module>` — what a failure names. */
  readonly within: string;
  /** That function's source, comments removed — where its primitive must appear. */
  readonly body: string;
  /** The read is `(await x.getY(…)) !== undefined` — the one shape a presence reader may use. */
  readonly presence: boolean;
}

/**
 * Every read of `getters` in one file. `walksTable` adds the slot table's own `.read(…)` calls, for a
 * file that imports `entitySlots` — each row reads through a getter this scan cannot see by name.
 */
export function slotReads(file: string, text: string, getters: readonly string[], walksTable = false): SlotRead[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set(getters);
  const found: SlotRead[] = [];
  const visit = (node: ts.Node): void => {
    const getter = getterNamed(node, names) ?? tableRead(node, walksTable);
    if (getter !== undefined) {
      found.push(readAt(file, source, node, getter));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The getter a node names — `x.getY`, `x['getY']`, `{ getY } = x` — or `undefined`. */
function getterNamed(node: ts.Node, names: ReadonlySet<string>): string | undefined {
  const name = accessedName(node);
  return name !== undefined && names.has(name) ? name : undefined;
}

function accessedName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node)) {
    return literalKey(node);
  }
  return isObjectBinding(node) ? bindingName(node) : undefined;
}

/** `x['getY']` — a key the scan can read; a computed one it cannot, and says nothing about. */
function literalKey(node: ts.ElementAccessExpression): string | undefined {
  return ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
}

function isObjectBinding(node: ts.Node): node is ts.BindingElement {
  return ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent);
}

/** `{ getPassword }` and `{ getPassword: read }` both take the getter out of the storage. */
function bindingName(node: ts.BindingElement): string | undefined {
  const named = node.propertyName ?? node.name;
  return ts.isIdentifier(named) || ts.isStringLiteral(named) ? named.text : undefined;
}

/** A `.read(…)` CALL, in a file that walks the slot table. */
function tableRead(node: ts.Node, walksTable: boolean): string | undefined {
  return walksTable && ts.isCallExpression(node) && calledName(node) === 'read' ? 'slot.read' : undefined;
}

function calledName(call: ts.CallExpression): string | undefined {
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;
}

function readAt(file: string, source: ts.SourceFile, node: ts.Node, getter: string): SlotRead {
  const owner = enclosingFunction(node);
  return {
    file,
    line: lineOf(node),
    getter,
    within: owner === undefined ? '<module>' : functionName(owner),
    body: gateText(owner, source),
    presence: isPresenceShape(node),
  };
}

/**
 * Where a read's primitive may appear: its own function — and, for a callback handed STRAIGHT to a call
 * (`clickedSecret(storage, …, (s, a, e) => s.getConfigBody(a, e), …)`), the callee it is handed to,
 * which is where the value goes. A callback that is returned, stored or called is judged by its own
 * body alone.
 */
function gateText(owner: ts.SignatureDeclaration | undefined, source: ts.SourceFile): string {
  const own = withoutComments(owner ?? source, source);
  const receiver = owner === undefined ? undefined : receivingCall(owner);
  return receiver === undefined ? own : `${withoutComments(receiver.expression, source)}( ${own}`;
}

function receivingCall(owner: ts.SignatureDeclaration): ts.CallExpression | undefined {
  const parent = owner.parent;
  return ts.isCallExpression(parent) && parent.arguments.some((argument) => argument === owner) ? parent : undefined;
}

function enclosingFunction(node: ts.Node): ts.SignatureDeclaration | undefined {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (ts.isFunctionLike(at)) {
      return at;
    }
  }
  return undefined;
}

/** A name a person can find: the declaration's own, the variable or property it is assigned to, or its line. */
function functionName(owner: ts.SignatureDeclaration): string {
  return identifierText(owner.name) ?? assignedName(owner.parent) ?? `the function at line ${lineOf(owner)}`;
}

function assignedName(parent: ts.Node): string | undefined {
  return ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ? identifierText(parent.name) : undefined;
}

function identifierText(name: ts.Node | undefined): string | undefined {
  return name !== undefined && ts.isIdentifier(name) ? name.text : undefined;
}

function lineOf(node: ts.Node): number {
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

/** The node's text with every comment removed — a primitive named in a comment is not a primitive. */
function withoutComments(node: ts.Node, source: ts.SourceFile): string {
  const printer = ts.createPrinter({ removeComments: true });
  return printer.printNode(ts.EmitHint.Unspecified, node, source);
}

/** `(await x.getY(…)) !== undefined`, climbing the call, the `await` and the parentheses. */
function isPresenceShape(access: ts.Node): boolean {
  const call = access.parent;
  return ts.isCallExpression(call) && call.expression === access && awaitedAndCompared(call);
}

/** Up through `await` and parentheses — at least one `await` — to a `!== undefined`. */
function awaitedAndCompared(call: ts.CallExpression): boolean {
  let at: ts.Node = call.parent;
  let awaited = false;
  while (isWrapper(at)) {
    awaited = awaited || ts.isAwaitExpression(at);
    at = at.parent;
  }
  return awaited && comparedWithUndefined(at);
}

function isWrapper(node: ts.Node): boolean {
  return ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node);
}

function comparedWithUndefined(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) {
    return false;
  }
  return [node.left, node.right].some((side) => ts.isIdentifier(side) && side.text === 'undefined');
}

/**
 * The reads of one classified file that break its classes' rule: for `door` and `automatic`, a read
 * whose nearest function contains none of that class's primitives; for `presence`, any read that is
 * not the presence shape. A file of two classes needs each read to satisfy one of them.
 */
export function ungated(reads: readonly SlotRead[], rules: readonly ((read: SlotRead) => boolean)[]): SlotRead[] {
  return reads.filter((read) => !rules.some((rule) => rule(read)));
}

/** The rule a door or automatic read must meet: its own function contains one of `primitives`. */
export function containsOneOf(primitives: readonly string[]): (read: SlotRead) => boolean {
  return (read) => primitives.some((primitive) => read.body.includes(primitive));
}

/**
 * The file's own functions that hold one of `primitives` — each becomes a primitive for that file,
 * as `name(`. A read whose function hands the stored string to such a helper (`judgedText(body)`,
 * `present(…, value)`) is gated one call away, which the scan can see without following values.
 * One level, never transitive: a helper of a helper is a claim the reader must make out loud.
 */
export function localGates(file: string, text: string, primitives: readonly string[]): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const gates: string[] = [];
  const visit = (node: ts.Node): void => {
    const name = ts.isFunctionLike(node) ? functionName(node) : undefined;
    if (name !== undefined && primitives.some((primitive) => withoutComments(node, source).includes(primitive))) {
      gates.push(`${name}(`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return gates;
}
