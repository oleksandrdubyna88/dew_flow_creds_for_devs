import * as ts from 'typescript';

/**
 * The scanner behind `storedSecretFunnel.test.ts` — the syntax half of the typed-secrets plan's funnel
 * (`PLAN_typed_stored_secrets.md` §3 item 1), over the TypeScript syntax tree as `readerScan.ts` is.
 *
 * <p>Three questions, each asked of one file's source:</p>
 *
 * <ul>
 *   <li><b>Which funnel functions does it use?</b> A reference to a binding IMPORTED from the module that
 *       defines it — `readSecret` from `./secretEnvelope`, `sealValue` from `./sealValue` or `./entityPin`,
 *       `stored`/`carried` from `./storedSecret` — called or handed on, aliased or through a namespace
 *       import; and every `as StoredSecret`. By import rather than by name, because the vault has a local
 *       `stored(` (`cardFormFields.ts`) and a local `carried(` (`envBinding.ts`) that parse nothing.</li>
 *   <li><b>Is it a reader of kept versions, and does it open one with a click opener?</b> — the rule the
 *       second plan round's finding 0 wrote: a kept version is admitted once, by
 *       `revisionDoor.openKeptVersion`, and read through a silent gate after that.</li>
 *   <li><b>Does it write a slot through the storage itself?</b> — the permanent stored-form rule: the
 *       type (T5) refuses text there, and this refuses a stored form copied around the writer and the
 *       lease (`storage.set<Slot>(`, `slot.write(storage`, `slot.store(storage`) outside its allowlist.</li>
 * </ul>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** One finding: where, and what was seen. */
export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly what: string;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function at(file: string, node: ts.Node, what: string): Finding {
  return { file, line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1, what };
}

/** Every node of the tree, depth first. */
function nodesOf(source: ts.SourceFile): ts.Node[] {
  const all: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    all.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return all;
}

/** The module a relative import names, without its directory: `'../secretEnvelope'` → `secretEnvelope`. */
function moduleName(declaration: ts.ImportDeclaration): string {
  const spec = declaration.moduleSpecifier;
  return ts.isStringLiteral(spec) ? (spec.text.split('/').at(-1) ?? '') : '';
}

/** What a file imports from the funnel's modules among the funnel's names: local name → original, and namespaces. */
interface Imported {
  readonly named: Map<string, string>;
  readonly namespaces: Set<string>;
}

function importsFrom(source: ts.SourceFile, modules: ReadonlySet<string>, names: ReadonlySet<string>): Imported {
  const imported: Imported = { named: new Map(), namespaces: new Set() };
  const declarations = source.statements.filter(ts.isImportDeclaration).filter((statement) => modules.has(moduleName(statement)));
  for (const declaration of declarations) {
    collectBindings(declaration.importClause, names, imported);
  }
  return imported;
}

function collectBindings(clause: ts.ImportClause | undefined, names: ReadonlySet<string>, imported: Imported): void {
  const bindings = clause === undefined ? undefined : clause.namedBindings;
  if (bindings === undefined) {
    return;
  }
  if (ts.isNamespaceImport(bindings)) {
    imported.namespaces.add(bindings.name.text);
    return;
  }
  collectNamed(bindings, names, imported);
}

function collectNamed(bindings: ts.NamedImports, names: ReadonlySet<string>, imported: Imported): void {
  for (const element of bindings.elements) {
    const original = (element.propertyName ?? element.name).text;
    if (names.has(original)) {
      imported.named.set(element.name.text, original);
    }
  }
}

function insideImport(node: ts.Node): boolean {
  return ts.findAncestor(node, ts.isImportDeclaration) !== undefined;
}

/** `x.readSecret` or `{ readSecret: … }` — a member's NAME, which is not the imported binding. */
function isMemberName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent)) {
    return parent.name === node;
  }
  return ts.isPropertyAssignment(parent) && parent.name === node;
}

/** A plain reference to an imported binding — `readSecret(raw)`, `.map(readSecret)`, `seal.bind(…)`. */
function namedReference(node: ts.Node, imported: Imported): string | undefined {
  if (!ts.isIdentifier(node) || isMemberName(node)) {
    return undefined;
  }
  return insideImport(node) ? undefined : imported.named.get(node.text);
}

/** `env.readSecret` through a namespace import. */
function namespaceReference(node: ts.Node, imported: Imported, names: ReadonlySet<string>): string | undefined {
  const access = namespaceAccess(node, imported);
  return access !== undefined && names.has(access.name.text) ? access.name.text : undefined;
}

function namespaceAccess(node: ts.Node, imported: Imported): ts.PropertyAccessExpression | undefined {
  if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) {
    return undefined;
  }
  return imported.namespaces.has(node.expression.text) ? node : undefined;
}

/** `x as StoredSecret` / `<StoredSecret>x` — a cast to the phantom, which no import is needed for. */
function castToStored(node: ts.Node): boolean {
  const type = ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ? node.type : undefined;
  return type !== undefined && isTypeNamed(type, 'StoredSecret');
}

function isTypeNamed(type: ts.Node, name: string): boolean {
  return ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === name;
}

function funnelFinding(file: string, node: ts.Node, imported: Imported, names: ReadonlySet<string>): Finding[] {
  const name = namedReference(node, imported) ?? namespaceReference(node, imported, names);
  if (name !== undefined) {
    return [at(file, node, `${name}(`)];
  }
  return castToStored(node) ? [at(file, node, 'as StoredSecret')] : [];
}

/**
 * Every use of a funnel function imported from one of `modules`, and every cast to `StoredSecret`.
 * `modules` are module names without a directory (`secretEnvelope`, `storedSecret`, …).
 */
export function funnelUses(file: string, text: string, names: readonly string[], modules: readonly string[]): Finding[] {
  const source = parse(file, text);
  const wanted = new Set(names);
  const imported = importsFrom(source, new Set(modules), wanted);
  return nodesOf(source).flatMap((node) => funnelFinding(file, node, imported, wanted));
}

/** Every reference to `name` imported from `module` — `clickOpener` from `pinClick`, say. */
export function importedUses(file: string, text: string, name: string, module: string): Finding[] {
  return funnelUses(file, text, [name], [module]).filter((finding) => finding.what !== 'as StoredSecret');
}

function calls(node: ts.Node, name: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name;
}

function keptVersionRead(file: string, node: ts.Node): Finding[] {
  if (calls(node, 'getHistory')) {
    return [at(file, node, 'getHistory(')];
  }
  return isTypeNamed(node, 'Revision') ? [at(file, node, 'Revision')] : [];
}

/**
 * Whether a file READS KEPT VERSIONS: it fetches them (`getHistory(`) or names their type (`Revision`).
 * Those are the two ways a kept version's `secrets` reach a module, and `openKeptVersion` is the one
 * door that may open them.
 */
export function readsKeptVersions(file: string, text: string): Finding[] {
  return nodesOf(parse(file, text)).flatMap((node) => keptVersionRead(file, node));
}

/** `storage`, `ctx.storage`, `this.deps.storage` — the expression the vault's storage manager goes by. */
function isStorage(node: ts.Node | undefined): boolean {
  return node !== undefined && nameOf(node) === 'storage';
}

/** An identifier's text, or a property access's member name — `storage` in both `storage` and `ctx.storage`. */
function nameOf(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}

/** The member a call invokes on an object — `storage.setPassword(…)` → the access — or nothing. */
function memberCall(node: ts.Node): ts.PropertyAccessExpression | undefined {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) ? node.expression : undefined;
}

/**
 * `storage.setPassword(a, e, value)` for a slot setter — a value written by the storage itself. A call
 * whose value is the literal `undefined` is a DELETION (`setNotes(a, e, undefined)` removes the note),
 * which writes nothing in the clear: Rule A's removals pass (`applyRemovals`) and an import's undo make
 * those on the storage, and `writeOrderPaths.test.ts` holds their names and order.
 */
function slotSetterCall(node: ts.Node, setters: ReadonlySet<string>): string | undefined {
  const access = writingSetter(node, setters);
  return access !== undefined && isStorage(access.expression) ? `storage.${access.name.text}(` : undefined;
}

/** A slot setter called with a value — not a deletion. */
function writingSetter(node: ts.Node, setters: ReadonlySet<string>): ts.PropertyAccessExpression | undefined {
  const access = memberCall(node);
  if (access === undefined || !setters.has(access.name.text)) {
    return undefined;
  }
  return deletes(access.parent) ? undefined : access;
}

function deletes(call: ts.Node): boolean {
  const value = ts.isCallExpression(call) ? call.arguments[2] : undefined;
  return value !== undefined && ts.isIdentifier(value) && value.text === 'undefined';
}

/**
 * `store: storage`, `let store = this.deps.storage`, `const vault = storage` — the storage bound to another
 * name. A setter called through the alias (`vault.setPassword(a, e, stored)`) is not `storage.set<Slot>(`,
 * so the binding itself is the finding. A binding NAMED `storage` (`{ storage: this.storage }`) only hands
 * the storage on under its own name, where every later call is still seen.
 */
function storageAlias(node: ts.Node): string | undefined {
  const named = bindingOf(node);
  if (named === undefined || !isStorage(named.initializer)) {
    return undefined;
  }
  const name = named.name.getText();
  return name === 'storage' ? undefined : `${name}: storage`;
}

function bindingOf(node: ts.Node): ts.PropertyAssignment | ts.VariableDeclaration | undefined {
  return ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node) ? node : undefined;
}

function storageWrite(file: string, node: ts.Node, setters: ReadonlySet<string>): Finding[] {
  const what = slotSetterCall(node, setters) ?? storageAlias(node);
  return what === undefined ? [] : [at(file, node, what)];
}

/**
 * Every slot setter called on the storage itself, and every binding of the storage to another name (an
 * alias a setter could be called through) — a STORED form written with nothing between it and the
 * keychain. Permanent (typed-secrets plan §3, *what the type does not catch*): since T5 the type refuses
 * text there, but a `StoredSecret` cannot say whether it is plain or sealed, so a plain stored form copied
 * into a protected entry would still type-check. `setters` are the slot setters' names.
 *
 * <p>T4's interim rule also refused `applyAdditions(storage` — the storage handed to the additions pass as a
 * PLAINTEXT writer. The type refuses it since T5 (the storage satisfies no `EntryWriter`;
 * `fixtures/typed/storage_is_not_a_writer.ts`), so that pattern was retired with T5's eleventh commit. Its
 * `store: storage` binding pattern was retired with it and RESTORED, widened to any name, after E3's
 * test-diff check: an alias of the storage carries a stored form past `storage.set<Slot>(` as easily as text.</p>
 */
export function storageWrites(file: string, text: string, setters: readonly string[]): Finding[] {
  const names = new Set(setters);
  return nodesOf(parse(file, text)).flatMap((node) => storageWrite(file, node, names));
}

/** The name of the function a node sits in — a declaration, a method, or an arrow bound to a name. */
function enclosingName(node: ts.Node): string {
  const fn = ts.findAncestor(node.parent, (up) => ts.isFunctionDeclaration(up) || ts.isMethodDeclaration(up) || ts.isArrowFunction(up) || ts.isFunctionExpression(up));
  return fn === undefined ? '(top level)' : functionName(fn);
}

function functionName(fn: ts.Node): string {
  const named = declaredName(fn);
  if (named !== undefined) {
    return named.getText();
  }
  return ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText() : enclosingName(fn);
}

function declaredName(fn: ts.Node): ts.Node | undefined {
  return ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn) ? fn.name : undefined;
}

/** The table's two writing columns: `write` (plaintext, through a writer) and `store` (a stored form, T5). */
const SLOT_WRITES = new Set(['write', 'store']);

/** `slot.write(storage, …)` / `slot.store(storage, …)` — a slot table row's writer handed the storage itself. */
function slotWriteOverStorage(file: string, node: ts.Node): Finding[] {
  const access = memberCall(node);
  if (access === undefined || !SLOT_WRITES.has(access.name.text)) {
    return [];
  }
  return isStorage((node as ts.CallExpression).arguments[0]) ? [at(file, node, `slot.${access.name.text}(storage in ${enclosingName(node)}`)] : [];
}

/**
 * Every slot table row's `write` or `store` handed the storage itself — a value stored with no writer
 * between it and the keychain, so no lease and no re-check (the E2 security review, finding 2: Restore's
 * plain path). Each finding names the function it sits in, which is what the allowlist is keyed by. Since
 * T5 the storage is no `write` sink at all (its raw setters take `StoredSecret`), so the three allowlisted
 * writers hand it to `store` — and `store` is still a road around the lease, so it is held to the same list.
 */
export function slotWritesOverStorage(file: string, text: string): Finding[] {
  return nodesOf(parse(file, text)).flatMap((node) => slotWriteOverStorage(file, node));
}
