/**
 * "How do I read this from code?" — answered in the viewer, per language, with the code.
 *
 * <p>There is no NuGet package behind this and deliberately so. .NET already ships the half a
 * package would have wrapped: `IConfigurationBuilder.AddJsonStream` takes a stream, so what was
 * missing is "run the CLI and hand over the bytes" — about ten lines. Publishing a package to
 * carry ten lines would have bought a fifth release line, a public API and a version story, and
 * a snippet covers every language instead of one.</p>
 *
 * <p><b>No snippet ever contains the key.</b> It cannot: the vault keeps only a SHA-256 of it
 * (see `configKey.ts`), so there is nothing to interpolate. That is the right shape anyway — a
 * snippet is pasted into a repository, and a key baked into one would be precisely the leak this
 * whole feature exists to end. Every snippet reads the key from the environment, and a test
 * asserts that none of them does anything else.</p>
 *
 * <p><b>Depth is stated rather than implied.</b> Three languages plug into their platform's own
 * configuration stack; the rest hand you a parsed document and let you do what you like with it.
 * Both are useful and they are not the same thing, so the panel says which one it is showing
 * instead of letting twenty entries look equally deep.</p>
 *
 * <p>Free of `vscode`, so what the panel offers is a unit test rather than twenty things to click.</p>
 */

import { SNIPPET_BODIES } from './configSnippetBodies';

/** What the snippet actually gets you. */
export type SnippetDepth =
  /** Wired into the platform's own configuration system — `IConfiguration` here really has it. */
  | 'framework'
  /** The document, parsed, in a variable. Correct, and it is then yours to use. */
  | 'parse';

export interface SnippetVariant {
  readonly id: string;
  readonly label: string;
}

export interface SnippetLanguage {
  readonly id: string;
  readonly label: string;
  /**
   * Which highlighter grammar draws it.
   *
   * <p>`scriptRender` knows a handful of grammars, not twenty, so each language is mapped to the
   * nearest one that gets its comments and strings right — C-like languages to `javascript`,
   * hash-comment languages to `bash`. That is honest colouring rather than accurate parsing, and
   * at snippet length it is indistinguishable.</p>
   */
  readonly highlightAs: string;
  readonly depth: SnippetDepth;
  /** More than one ONLY where the code genuinely differs. A version picker with identical code
   *  behind both entries is a promise with nothing behind it. */
  readonly variants: readonly SnippetVariant[];
}

export interface SnippetContext {
  /** The environment variable the key is read from. */
  readonly envVar: string;
  /** What a shell snippet writes the config to. Already safe for a path — see `configFile.ts`. */
  readonly fileName: string;
}

export interface Snippet {
  readonly code: string;
  readonly highlightAs: string;
  readonly depth: SnippetDepth;
  /** Where this goes. */
  readonly where: string;
  /** What it does, in one sentence, for somebody deciding whether to paste it. */
  readonly does: string;
}

const ONE: readonly SnippetVariant[] = [{ id: 'default', label: '' }];

/**
 * The twenty, in the order the picker offers them.
 *
 * <p>.NET first because that is where this started; then the JVM, then the rest by how often a
 * service is written in them. The order is a judgement and nothing depends on it.</p>
 */
export const SNIPPET_LANGUAGES: readonly SnippetLanguage[] = [
  {
    id: 'csharp',
    label: 'C#',
    highlightAs: 'javascript',
    depth: 'framework',
    variants: [
      { id: 'net6', label: '.NET 6+' },
      { id: 'netfx', label: '.NET Framework 4.x' },
    ],
  },
  { id: 'fsharp', label: 'F#', highlightAs: 'javascript', depth: 'framework', variants: ONE },
  { id: 'vbnet', label: 'VB.NET', highlightAs: 'javascript', depth: 'framework', variants: ONE },
  { id: 'java', label: 'Java', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'kotlin', label: 'Kotlin', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'scala', label: 'Scala', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'python', label: 'Python', highlightAs: 'python', depth: 'parse', variants: ONE },
  {
    id: 'javascript',
    label: 'JavaScript (Node)',
    highlightAs: 'javascript',
    depth: 'parse',
    variants: [
      { id: 'esm', label: 'ES modules (import)' },
      { id: 'cjs', label: 'CommonJS (require)' },
    ],
  },
  { id: 'typescript', label: 'TypeScript', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'go', label: 'Go', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'rust', label: 'Rust', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'php', label: 'PHP', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'ruby', label: 'Ruby', highlightAs: 'bash', depth: 'parse', variants: ONE },
  { id: 'cpp', label: 'C++', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'swift', label: 'Swift', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'dart', label: 'Dart', highlightAs: 'javascript', depth: 'parse', variants: ONE },
  { id: 'elixir', label: 'Elixir', highlightAs: 'bash', depth: 'parse', variants: ONE },
  { id: 'perl', label: 'Perl', highlightAs: 'bash', depth: 'parse', variants: ONE },
  { id: 'bash', label: 'Bash / sh', highlightAs: 'bash', depth: 'parse', variants: ONE },
  { id: 'powershell', label: 'PowerShell', highlightAs: 'powershell', depth: 'parse', variants: ONE },
];

export function snippetLanguage(id: string): SnippetLanguage | undefined {
  return SNIPPET_LANGUAGES.find((language) => language.id === id);
}

/** The first language, and the one the panel opens on. */
export const DEFAULT_SNIPPET_LANGUAGE = SNIPPET_LANGUAGES[0].id;

/**
 * The snippet for one language and variant.
 *
 * <p>An unknown language falls back to the default rather than throwing: this is reached from a
 * `<select>` in a webview, and a value from there is untrusted input like any other.</p>
 */
export function snippetFor(languageId: string, variantId: string, context: SnippetContext): Snippet {
  const language = snippetLanguage(languageId) ?? SNIPPET_LANGUAGES[0];
  const variant = language.variants.some((one) => one.id === variantId)
    ? variantId
    : language.variants[0].id;
  return builtSnippet(language, variant, context);
}

const DOES_FRAMEWORK =
  'Adds the vault config as a configuration source, so everything that already reads configuration picks it up with no other change.';

const DOES_PARSE =
  'Runs the CLI, which asks the VS Code window holding the vault for this config, and hands you the parsed document.';

function builtSnippet(
  language: SnippetLanguage,
  variantId: string,
  context: SnippetContext,
): Snippet {
  const body = SNIPPET_BODIES[`${language.id}:${variantId}`] ?? '';
  return {
    code: body.replace(/__ENV__/g, context.envVar).replace(/__FILE__/g, context.fileName),
    highlightAs: language.highlightAs,
    depth: language.depth,
    where: WHERE[language.id] ?? 'Wherever your program starts up, before it reads configuration.',
    does: language.depth === 'framework' ? DOES_FRAMEWORK : DOES_PARSE,
  };
}

/** Where each one goes, in the words of that ecosystem. */
const WHERE: Record<string, string> = {
  csharp: 'Program.cs, before builder.Build().',
  fsharp: 'Program.fs, before the host is built.',
  vbnet: 'Program.vb, before the host is built.',
  javascript: 'Your entry file, before anything reads config.',
  typescript: 'Your entry file, before anything reads config.',
  python: 'Your settings module, or the top of the entry point.',
  bash: 'Your run script, before the program starts.',
  powershell: 'Your run script, before the program starts.',
};
