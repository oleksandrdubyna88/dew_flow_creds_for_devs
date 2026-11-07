import * as ts from 'typescript';

/**
 * The runtime imports of a module, followed to the end (R2 of the Remote Bridge boundary).
 *
 * <p>A module that imports no editor itself can still reach one through a module it imports, and a test that read only
 * the listed files said "pure" of a file that could not be `require`d without a stub (E1.3 epoch 3, A.1). This walks
 * `import ... from './x'`, `export ... from './x'`, a bare `import './x'` and `require('./x')`, skips the `type`
 * forms (erased by the compiler: they load nothing), and answers the chain to the first module that reaches `vscode`.
 * Not a test file: `node:test` is pointed at `*.test.js` only.</p>
 */

const EDITOR = /\b(?:from\s+|import\s+|require\(\s*)['"]vscode['"]/;
const RELATIVE = /(?:^|[\s;])(?:(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s+|import\s+|require\(\s*)['"](\.\/[^'"]+)['"]/g;

/** A `/` after one of these is a division, not the start of a regular expression. */
const ENDS_AN_EXPRESSION: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.ThisKeyword,
]);

/** Blank `text` between `from` and `to` with spaces, keeping its line breaks (a reported line stays the source's). */
function blank(text: string, from: number, to: number): string {
  return text.slice(0, from) + text.slice(from, to).replace(/[^\r\n]/g, ' ') + text.slice(to);
}

const BRACE_DELTA: ReadonlyMap<ts.SyntaxKind, number> = new Map([
  [ts.SyntaxKind.OpenBraceToken, 1],
  [ts.SyntaxKind.CloseBraceToken, -1],
]);

const COMMENTS: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia]);
const TRIVIA: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.WhitespaceTrivia, ts.SyntaxKind.NewLineTrivia]);

/**
 * What the scanner cannot know alone: a `}` that closes a template substitution continues the template, and a `/` where an
 * expression cannot end starts a regular expression. Told by the brace depth and the token before.
 */
class Rescan {
  private readonly open: number[] = [];
  private braces = 0;
  private previous = ts.SyntaxKind.Unknown;

  /** The token as it really is, and the state moved past it. */
  next(scanner: ts.Scanner, token: ts.SyntaxKind): ts.SyntaxKind {
    const kind = this.rescanned(scanner, token);
    this.track(kind);
    this.previous = kind;
    return kind;
  }

  private rescanned(scanner: ts.Scanner, token: ts.SyntaxKind): ts.SyntaxKind {
    if (token === ts.SyntaxKind.CloseBraceToken && this.open.at(-1) === this.braces) {
      return scanner.reScanTemplateToken(false);
    }
    return this.startsRegex(token) ? scanner.reScanSlashToken() : token;
  }

  private startsRegex(token: ts.SyntaxKind): boolean {
    return (token === ts.SyntaxKind.SlashToken || token === ts.SyntaxKind.SlashEqualsToken) && !ENDS_AN_EXPRESSION.has(this.previous);
  }

  private track(kind: ts.SyntaxKind): void {
    if (kind === ts.SyntaxKind.TemplateHead) {
      this.open.push(this.braces);
    } else if (kind === ts.SyntaxKind.TemplateTail) {
      this.open.pop();
    } else {
      this.braces += BRACE_DELTA.get(kind) ?? 0;
    }
  }
}

/** The span of every comment in a source, by the compiler's own scanner. */
function commentSpans(source: string): ReadonlyArray<readonly [number, number]> {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const rescan = new Rescan();
  const spans: Array<readonly [number, number]> = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (COMMENTS.has(token)) {
      spans.push([scanner.getTokenStart(), scanner.getTokenEnd()]);
    } else if (!TRIVIA.has(token)) {
      rescan.next(scanner, token);
    }
  }
  return spans;
}

/**
 * Source with its comments blanked, read as SYNTAX: a string, a template or a regular expression that holds `/*` or `//` is not a
 * comment, so it cannot blank the import after it, and a comment after code on a line is blanked like any other.
 */
export function withoutComments(source: string): string {
  return commentSpans(source).reduce((text, [from, to]) => blank(text, from, to), source);
}

/** The sibling modules a source loads at run time, as names without extension. */
export function runtimeImports(source: string): string[] {
  const code = withoutComments(source);
  return [...code.matchAll(RELATIVE)].map((match) => match[1].replace(/^\.\//, '').replace(/\.(?:js|ts)$/, ''));
}

/** Whether a source reaches the editor itself. */
export function reachesEditor(source: string): boolean {
  return EDITOR.test(withoutComments(source));
}

/**
 * The chain from `start` to the first module that imports or requires `vscode` (`['a', 'b', 'vscode']`), or `undefined`
 * when none does. `read` answers a module's source by name, `undefined` when there is none such (an unknown module ends
 * a branch; the caller's own test says the walk found real files).
 */
export function chainToEditor(start: string, read: (name: string) => string | undefined): string[] | undefined {
  return chainFrom(start, [], read, new Set());
}

function chainFrom(name: string, via: string[], read: (name: string) => string | undefined, seen: Set<string>): string[] | undefined {
  const source = seen.has(name) ? undefined : read(name);
  seen.add(name);
  if (source === undefined) {
    return undefined;
  }
  const here = [...via, name];
  return reachesEditor(source) ? [...here, 'vscode'] : firstChain(runtimeImports(source), here, read, seen);
}

function firstChain(names: string[], here: string[], read: (name: string) => string | undefined, seen: Set<string>): string[] | undefined {
  for (const next of names) {
    const found = chainFrom(next, here, read, seen);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Every module the walk visited from `start`, for a test that wants to say the walk really walked. */
export function closureOf(start: string, read: (name: string) => string | undefined): string[] {
  const seen = new Set<string>();
  const walk = (name: string): void => {
    const source = seen.has(name) ? undefined : read(name);
    seen.add(name);
    for (const next of source === undefined ? [] : runtimeImports(source)) {
      walk(next);
    }
  };
  walk(start);
  return [...seen];
}
