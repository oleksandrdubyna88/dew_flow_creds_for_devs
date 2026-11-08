import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { TopDeclaration, topDeclarationOf } from './promptSiteScan';

/**
 * The caller walk of `promptSites.test.ts`: whether a prompt site can be reached from the broker, by REFERENCE PATH.
 *
 * <p>The broker's roots are derived from `extension.ts` by syntax, not listed here: every function called inside the arguments of a
 * `useActions.register(...)` and of `new CredsAgentServer(...)`, plus those a variable used there is built from one hop away (`sshDeps`,
 * `agentDeps`, `rotateDeps`). A site is reached when walking its top symbol's callers, through the language service's references,
 * arrives at one of those names, at a broker file (`credsAgentServer.ts` and the `broker*.ts` modules it imports), or at a reference
 * that sits inside that wiring itself.</p>
 *
 * <p><b>What it cannot see, and so proves nothing about:</b> a reference path is not run-time truth (a reached site may be gated, an
 * unreached one reached); the walk sees no IPC (the signing modal arrives through the agent's socket), no `executeCommand` by string, no
 * timer or event hop, and no child process's prompt. It shows that a new site gets classified, never that its class is right.</p>
 */

export interface BrokerRoots {
  /** The function and class names the broker is built from. */
  readonly names: ReadonlySet<string>;
  /** Source ranges of `extension.ts` that are broker wiring: a reference inside one is a hit. */
  readonly ranges: ReadonlyArray<readonly [number, number]>;
}

const isRegisterCall = (node: ts.Node): boolean => ts.isCallExpression(node) && node.expression.getText() === 'useActions.register';

const isServerConstruction = (node: ts.Node): boolean => ts.isNewExpression(node) && node.expression.getText() === 'CredsAgentServer';

/** Every identifier called inside `node`, however deep, spreads and arrow bodies included. */
function calledNames(node: ts.Node, into: Set<string>): void {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    into.add(node.expression.text);
  }
  ts.forEachChild(node, (child) => calledNames(child, into));
}

function identifiersIn(node: ts.Node, into: Set<string>): void {
  if (ts.isIdentifier(node)) {
    into.add(node.text);
  }
  ts.forEachChild(node, (child) => identifiersIn(child, into));
}

const isUsedInitializer = (node: ts.Node, used: ReadonlySet<string>): node is ts.VariableDeclaration & { initializer: ts.Expression } =>
  ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && used.has(node.name.text) && node.initializer !== undefined;

/** The initializers of the variables named inside `node`, anywhere in the file: one hop from what the broker is handed to what it is built from. */
function initializersOf(node: ts.Node, tree: ts.SourceFile): ts.Node[] {
  const used = new Set<string>();
  identifiersIn(node, used);
  const initializers: ts.Node[] = [];
  const collect = (n: ts.Node): void => {
    if (isUsedInitializer(n, used)) {
      initializers.push(n.initializer);
    }
    ts.forEachChild(n, collect);
  };
  collect(tree);
  return initializers;
}

function wiringIn(tree: ts.SourceFile): ts.Node[] {
  const wiring: ts.Node[] = [];
  const find = (node: ts.Node): void => {
    if (isRegisterCall(node) || isServerConstruction(node)) {
      wiring.push(node);
    }
    ts.forEachChild(node, find);
  };
  find(tree);
  return wiring;
}

/** The broker's roots, from the text of `extension.ts`. */
export function rootsOf(extensionSource: string): BrokerRoots {
  const tree = ts.createSourceFile('extension.ts', extensionSource, ts.ScriptTarget.ES2022, true);
  const wiring = wiringIn(tree);
  const names = new Set<string>();
  for (const node of wiring) {
    calledNames(node, names);
    initializersOf(node, tree).forEach((initializer) => calledNames(initializer, names));
  }
  return { names, ranges: wiring.map((node) => [node.getStart(tree), node.getEnd()] as const) };
}

/** `credsAgentServer.ts` and the `broker*.ts` modules it imports: the broker's own files. */
export function brokerFilesOf(serverSource: string): ReadonlySet<string> {
  const imported = [...serverSource.matchAll(/from '\.\/(broker[A-Za-z]*)'/g)].map((match) => `${match[1]}.ts`);
  return new Set(['credsAgentServer.ts', ...imported]);
}

export interface Walker {
  readonly roots: BrokerRoots;
  /** Whether the broker can reach the node at `position` of `file` by reference. */
  reachesBroker(file: string, position: number): boolean;
}

const MAX_NODES = 1500;
const TEST_FOLDER = `${path.sep}test${path.sep}`;

interface Caller {
  readonly top: TopDeclaration | undefined;
  readonly file: string;
  /** The reference sits inside the broker's wiring. */
  readonly hit: boolean;
}

function isImportOrExport(node: ts.Node): boolean {
  const chain: ts.Node[] = [];
  for (let up: ts.Node | undefined = node; up !== undefined; up = up.parent) {
    chain.push(up);
  }
  return chain.some((link) => ts.isImportDeclaration(link) || ts.isExportDeclaration(link) || ts.isImportEqualsDeclaration(link));
}

function nodeAt(sourceFile: ts.SourceFile, position: number): ts.Node {
  const find = (node: ts.Node): ts.Node => ts.forEachChild(node, (child) => (child.getStart(sourceFile) <= position && position < child.getEnd() ? find(child) : undefined)) ?? node;
  return find(sourceFile);
}

const isSource = (reference: ts.ReferencedSymbolEntry): boolean => !reference.isDefinition && !reference.fileName.includes(TEST_FOLDER) && !reference.fileName.includes('node_modules');

/** The language service over every non-test source of the project. */
function serviceOver(srcRoot: string, projectRoot: string): ts.LanguageService {
  const config = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(projectRoot, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, projectRoot);
  const files = config.fileNames.filter((file) => file.startsWith(srcRoot + path.sep) && !file.includes(TEST_FOLDER));
  return ts.createLanguageService({
    getScriptFileNames: () => files,
    getScriptVersion: () => '1',
    getScriptSnapshot: (file) => (fs.existsSync(file) ? ts.ScriptSnapshot.fromString(fs.readFileSync(file, 'utf8')) : undefined),
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => config.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  });
}

class Search {
  private readonly extension: string;
  private readonly program: ts.Program | undefined;

  constructor(
    private readonly service: ts.LanguageService,
    private readonly srcRoot: string,
    readonly roots: BrokerRoots,
    private readonly brokerFiles: ReadonlySet<string>,
  ) {
    this.extension = path.join(srcRoot, 'extension.ts');
    this.program = service.getProgram();
  }

  private relative(file: string): string {
    return path.relative(this.srcRoot, file).split(path.sep).join('/');
  }

  isRoot(top: TopDeclaration | undefined, file: string): boolean {
    return top !== undefined && (this.roots.names.has(top.name.split('.')[0]) || this.brokerFiles.has(this.relative(file)));
  }

  private insideWiring(reference: ts.ReferenceEntry): boolean {
    const at = reference.textSpan.start;
    return reference.fileName === this.extension && this.roots.ranges.some(([from, to]) => from <= at && at < to);
  }

  private callerOf(reference: ts.ReferenceEntry): Caller[] {
    const token = this.tokenOf(reference);
    return token === undefined || isImportOrExport(token) ? [] : [{ top: topDeclarationOf(token), file: reference.fileName, hit: this.insideWiring(reference) }];
  }

  private tokenOf(reference: ts.ReferenceEntry): ts.Node | undefined {
    const sourceFile = this.program?.getSourceFile(reference.fileName);
    return sourceFile === undefined ? undefined : nodeAt(sourceFile, reference.textSpan.start);
  }

  /** Whether a caller ends the search: it is in the broker's wiring, or in a root or a broker file. */
  ends(caller: Caller): boolean {
    return caller.hit || this.isRoot(caller.top, caller.file);
  }

  callers(file: string, position: number): Caller[] {
    const references = (this.service.findReferences(file, position) ?? []).flatMap((group) => group.references);
    return references.filter(isSource).flatMap((reference) => this.callerOf(reference));
  }

  startOf(file: string, position: number): TopDeclaration | undefined {
    const sourceFile = this.program?.getSourceFile(file);
    return sourceFile === undefined ? undefined : topDeclarationOf(nodeAt(sourceFile, position));
  }
}

interface Place {
  readonly file: string;
  readonly position: number;
}

/** The callers not seen before, as places to search next. */
/** Where a declaration's name starts, `-1` for one with no name (nothing can refer to it). */
const nameStartOf = (top: TopDeclaration | undefined): number => top?.nameNode?.getStart() ?? -1;

function unseen(caller: Caller, seen: Set<string>): Place[] {
  const at = nameStartOf(caller.top);
  const key = `${caller.file}:${at}`;
  if (at < 0 || seen.has(key)) {
    return [];
  }
  seen.add(key);
  return [{ file: caller.file, position: at }];
}

/** The next places up from one, or `'hit'` when a caller ends the search. */
function expand(search: Search, place: Place, seen: Set<string>): Place[] | 'hit' {
  const next: Place[] = [];
  for (const caller of search.callers(place.file, place.position)) {
    if (search.ends(caller)) {
      return 'hit';
    }
    next.push(...unseen(caller, seen));
  }
  return next;
}

/** Breadth-first up the callers; true on the first root, broker file or wiring reference. */
function reaches(search: Search, file: string, start: TopDeclaration): boolean {
  const seen = new Set<string>();
  const queue: Place[] = [{ file, position: nameStartOf(start) }];
  while (queue.length > 0 && seen.size < MAX_NODES) {
    const found = expand(search, queue.shift() as Place, seen);
    if (found === 'hit') {
      return true;
    }
    queue.push(...found);
  }
  return false;
}

/** A walker over every non-test source of `srcRoot`, through the TypeScript language service. */
export function walkerOver(srcRoot: string, projectRoot: string): Walker {
  const read = (file: string): string => fs.readFileSync(path.join(srcRoot, file), 'utf8');
  const roots = rootsOf(read('extension.ts'));
  const search = new Search(serviceOver(srcRoot, projectRoot), srcRoot, roots, brokerFilesOf(read('credsAgentServer.ts')));
  return {
    roots,
    reachesBroker: (file, position) => {
      const start = search.startOf(file, position);
      return start !== undefined && start.nameNode !== undefined && (search.isRoot(start, file) || reaches(search, file, start));
    },
  };
}
