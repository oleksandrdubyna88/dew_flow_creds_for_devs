import * as ts from 'typescript';

/**
 * The prompt-site scan of `promptSites.test.ts` (the parent's §7, the prompt-site ledger), over the TypeScript syntax tree.
 *
 * <p>A PROMPT SITE is a place where this extension can put a question on a person's screen: `window.show{Information,Warning,Error}Message`
 * called with two or more arguments (the second is a modal option or a button), `showInputBox`, `showQuickPick`, `showOpenDialog`,
 * `showSaveDialog`, `createInputBox`, `createQuickPick`, `createWebviewPanel`, `authentication.getSession`, and any bare REFERENCE to one
 * of those names (`const ask = vscode.window.showQuickPick`, a callback). Each has an identity that holds no line number:
 * `file#TopSymbol#kind#ordinal`, the ordinal counting the sites of one kind inside one top symbol in source order.</p>
 *
 * <p>The scan finds sites by their SPELLING, `<editor>.window.<name>`, so a `window` that is read any other way hides them: an alias
 * (`const w = vscode.window`), a destructure (`const { window } = vscode`, `const { showQuickPick } = vscode.window`), a named import
 * (`import { window } from 'vscode'`) or an element access (`vscode['window']`). Each is reported BY NAME (a {@link WindowRead}) and fails
 * the test, rather than being followed. A variable or a property that is merely called `window` is not the editor's.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export interface PromptSite {
  /** `file#TopSymbol#kind#ordinal`. */
  readonly id: string;
  readonly file: string;
  readonly top: string;
  /** The member's name, `ref:` before it for a bare reference. */
  readonly kind: string;
  readonly line: number;
  /** The offset of the site in its file, for a reference search. */
  readonly position: number;
}

/** A way of reading `window` that the scan cannot follow. */
export interface WindowRead {
  readonly file: string;
  readonly line: number;
  readonly form: 'alias' | 'destructure' | 'named-import' | 'element-access';
}

type Editor = ReadonlySet<string>;
type Found = Omit<PromptSite, 'id'>;

const WINDOWS = new Set(['showInputBox', 'showQuickPick', 'showOpenDialog', 'showSaveDialog', 'createInputBox', 'createQuickPick', 'createWebviewPanel']);
const MESSAGES = new Set(['showInformationMessage', 'showWarningMessage', 'showErrorMessage']);
const VSCODE_REQUIRE = /^require\(\s*['"]vscode['"]\s*\)$/;

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

/* ----------------------------------------------------------------------------------------------------------------
 * The editor's module, by the names a file gives it
 * ------------------------------------------------------------------------------------------------------------- */

const isEditorImport = (node: ts.Node): node is ts.ImportDeclaration => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'vscode';

const namespaceName = (bindings: ts.NamedImportBindings | undefined): ts.Identifier | undefined => (bindings !== undefined && ts.isNamespaceImport(bindings) ? bindings.name : undefined);

const clauseNames = (clause: ts.ImportClause | undefined): ts.Identifier[] => (clause === undefined ? [] : [clause.name, namespaceName(clause.namedBindings)].filter(isDefined));

const initializerText = (declaration: ts.VariableDeclaration): string => declaration.initializer?.getText() ?? '';

const requiredAs = (node: ts.Node): ts.Identifier[] => (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && VSCODE_REQUIRE.test(initializerText(node)) ? [node.name] : []);

/** The names a file gives the editor's module: `import * as vscode from 'vscode'`, `import vscode from 'vscode'`, `const vscode = require('vscode')`. */
function editorNames(tree: ts.SourceFile): Editor {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    const here = isEditorImport(node) ? clauseNames(node.importClause) : requiredAs(node);
    here.forEach((name) => names.add(name.text));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return names;
}

const isEditorIdentifier = (node: ts.Node, editor: Editor): boolean => ts.isIdentifier(node) && editor.has(node.text);

/** `<editor>.<name>`: `vscode.window`, `vscode.authentication`. */
const isEditorMember = (node: ts.Node, name: string, editor: Editor): node is ts.PropertyAccessExpression =>
  ts.isPropertyAccessExpression(node) && node.name.text === name && isEditorIdentifier(node.expression, editor);

/* ----------------------------------------------------------------------------------------------------------------
 * The ledger's name of the top symbol a node sits in
 * ------------------------------------------------------------------------------------------------------------- */

/** The outermost named declaration a node sits in, as the ledger names it: `Class.method`, a function, a variable, a class. */
export interface TopDeclaration {
  readonly name: string;
  readonly declaration: ts.Node;
  /** What a reference search is aimed at: the declaration's name, or the class's. */
  readonly nameNode: ts.Node | undefined;
}

type ClassMember = (ts.MethodDeclaration | ts.ConstructorDeclaration | ts.PropertyDeclaration | ts.GetAccessorDeclaration) & { parent: ts.ClassDeclaration };

const MEMBER_KINDS = [ts.isMethodDeclaration, ts.isConstructorDeclaration, ts.isPropertyDeclaration, ts.isGetAccessor];

const memberOfClass = (node: ts.Node): node is ClassMember => MEMBER_KINDS.some((is) => is(node)) && ts.isClassDeclaration(node.parent);

const className = (member: ClassMember): string => member.parent.name?.text ?? '?';

const memberName = (member: ClassMember): string => member.name?.getText() ?? 'constructor';

const memberDeclaration = (member: ClassMember): TopDeclaration => ({ name: `${className(member)}.${memberName(member)}`, declaration: member, nameNode: member.name ?? member.parent.name });

const isNamedDeclaration = (node: ts.Node): node is ts.FunctionDeclaration | ts.ClassDeclaration => ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node);

function variableDeclaration(statement: ts.VariableStatement): TopDeclaration {
  const declared = statement.declarationList.declarations[0].name;
  return { name: declared.getText(), declaration: statement, nameNode: declared };
}

const anonymousDeclaration = (statement: ts.Node): TopDeclaration => ({ name: `<top:${ts.SyntaxKind[statement.kind]}>`, declaration: statement, nameNode: undefined });

const namedDeclaration = (statement: ts.FunctionDeclaration | ts.ClassDeclaration): TopDeclaration => ({ name: statement.name?.text ?? '<anonymous>', declaration: statement, nameNode: statement.name });

function statementDeclaration(statement: ts.Node): TopDeclaration {
  if (isNamedDeclaration(statement)) {
    return namedDeclaration(statement);
  }
  return ts.isVariableStatement(statement) ? variableDeclaration(statement) : anonymousDeclaration(statement);
}

/** The nodes from `node` up to (not including) the source file. */
function ancestors(node: ts.Node): ts.Node[] {
  const chain: ts.Node[] = [];
  for (let up: ts.Node = node; !ts.isSourceFile(up); up = up.parent) {
    chain.push(up);
  }
  return chain;
}

export function topDeclarationOf(node: ts.Node): TopDeclaration | undefined {
  const chain = ancestors(node);
  const top = chain.at(-1);
  const member = chain.find(memberOfClass);
  if (top === undefined) {
    return undefined;
  }
  return member === undefined ? statementDeclaration(top) : memberDeclaration(member);
}

/** The ledger's name of the top symbol a node sits in. */
export const topSymbolOf = (node: ts.Node): string => topDeclarationOf(node)?.name ?? '<top>';

/* ----------------------------------------------------------------------------------------------------------------
 * The sites
 * ------------------------------------------------------------------------------------------------------------- */

/** The call a property access is the callee of, if it is. */
function calledBy(access: ts.PropertyAccessExpression): ts.CallExpression | undefined {
  return ts.isCallExpression(access.parent) && access.parent.expression === access ? access.parent : undefined;
}

const isWindowMember = (name: string): boolean => WINDOWS.has(name) || MESSAGES.has(name);

/** A message call is a question only with a second argument (a modal option or a button); the other names are, called or not. */
const isQuestion = (name: string, call: ts.CallExpression): boolean => WINDOWS.has(name) || call.arguments.length >= 2;

/** The kind of site `<editor>.window.<name>` is: the name for a call that asks, `ref:<name>` for a bare reference, nothing otherwise. */
function windowKind(access: ts.PropertyAccessExpression): string | undefined {
  const name = access.name.text;
  const call = calledBy(access);
  if (!isWindowMember(name)) {
    return undefined;
  }
  if (call === undefined) {
    return `ref:${name}`;
  }
  return isQuestion(name, call) ? name : undefined;
}

function authenticationKind(access: ts.PropertyAccessExpression): string | undefined {
  if (access.name.text !== 'getSession') {
    return undefined;
  }
  return calledBy(access) === undefined ? 'ref:getSession' : 'getSession';
}

function kindOf(access: ts.PropertyAccessExpression, editor: Editor): string | undefined {
  if (isEditorMember(access.expression, 'window', editor)) {
    return windowKind(access);
  }
  return isEditorMember(access.expression, 'authentication', editor) ? authenticationKind(access) : undefined;
}

function siteOf(access: ts.PropertyAccessExpression, tree: ts.SourceFile, file: string, editor: Editor): Found[] {
  const kind = kindOf(access, editor);
  const start = access.getStart(tree);
  return kind === undefined ? [] : [{ file, top: topSymbolOf(access), kind, line: tree.getLineAndCharacterOfPosition(start).line + 1, position: start }];
}

/* ----------------------------------------------------------------------------------------------------------------
 * The `window`s the scan cannot follow
 * ------------------------------------------------------------------------------------------------------------- */

const isDestructureOfEditor = (declaration: ts.Node, editor: Editor): boolean =>
  ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined && isEditorIdentifier(declaration.initializer, editor);

const bindsWindow = (element: ts.BindingElement): boolean => (element.propertyName ?? element.name).getText() === 'window';

const namesWindow = (specifier: ts.ImportSpecifier): boolean => (specifier.propertyName ?? specifier.name).text === 'window';

const importsFromEditor = (specifier: ts.ImportSpecifier): boolean => isEditorImport(specifier.parent.parent.parent);

const indexesWindow = (access: ts.ElementAccessExpression, editor: Editor): boolean =>
  ts.isStringLiteralLike(access.argumentExpression) && access.argumentExpression.text === 'window' && isEditorIdentifier(access.expression, editor);

const isObjectOfMember = (access: ts.PropertyAccessExpression): boolean => ts.isPropertyAccessExpression(access.parent) && access.parent.expression === access;

const destructuresIt = (parent: ts.Node): boolean => ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name);

/** `<editor>.window` as anything but the object of a further member access: an alias, or the source of a destructure. */
function formOfPropertyRead(access: ts.PropertyAccessExpression, editor: Editor): WindowRead['form'] | undefined {
  if (!isEditorMember(access, 'window', editor) || isObjectOfMember(access)) {
    return undefined;
  }
  return destructuresIt(access.parent) ? 'destructure' : 'alias';
}

const destructuredWindow = (element: ts.BindingElement, editor: Editor): WindowRead['form'] | undefined => (bindsWindow(element) && isDestructureOfEditor(element.parent.parent, editor) ? 'destructure' : undefined);

const importedWindow = (specifier: ts.ImportSpecifier): WindowRead['form'] | undefined => (namesWindow(specifier) && importsFromEditor(specifier) ? 'named-import' : undefined);

const indexedWindow = (node: ts.Node, editor: Editor): WindowRead['form'] | undefined => (ts.isElementAccessExpression(node) && indexesWindow(node, editor) ? 'element-access' : undefined);

function formOfOther(node: ts.Node, editor: Editor): WindowRead['form'] | undefined {
  if (ts.isBindingElement(node)) {
    return destructuredWindow(node, editor);
  }
  return ts.isImportSpecifier(node) ? importedWindow(node) : indexedWindow(node, editor);
}

function formOf(node: ts.Node, editor: Editor): WindowRead['form'] | undefined {
  return ts.isPropertyAccessExpression(node) ? formOfPropertyRead(node, editor) : formOfOther(node, editor);
}

/* ----------------------------------------------------------------------------------------------------------------
 * The scan
 * ------------------------------------------------------------------------------------------------------------- */

/** Ordinals by (file, top, kind) in source order. */
function withIdentity(found: Found[]): PromptSite[] {
  const counts = new Map<string, number>();
  return [...found]
    .sort((a, b) => a.position - b.position)
    .map((site) => {
      const key = `${site.file}#${site.top}#${site.kind}`;
      const ordinal = (counts.get(key) ?? 0) + 1;
      counts.set(key, ordinal);
      return { ...site, id: `${key}#${ordinal}` };
    });
}

function readOf(node: ts.Node, tree: ts.SourceFile, file: string, editor: Editor): WindowRead[] {
  const form = formOf(node, editor);
  return form === undefined ? [] : [{ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, form }];
}

/** The sites and the unreadable `window`s of one source file. */
export function scanSource(source: string, file: string): { sites: PromptSite[]; windowReads: WindowRead[] } {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const editor = editorNames(tree);
  const found: Found[] = [];
  const windowReads: WindowRead[] = [];
  const visit = (node: ts.Node): void => {
    found.push(...(ts.isPropertyAccessExpression(node) ? siteOf(node, tree, file, editor) : []));
    windowReads.push(...readOf(node, tree, file, editor));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { sites: withIdentity(found), windowReads };
}
