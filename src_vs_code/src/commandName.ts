/**
 * `{name}` in a terminal command — the token, and the one list of names allowed to take its place.
 *
 * <p>A command line is typed into a shell, and a name arrives from a vault that sync and Accept Share fill
 * from elsewhere: it is not something this machine's user typed. A name that became part of a shell line
 * could become shell syntax (`a;touch x`, `$(x)`, a newline, a quote). So the name is REFUSED, not quoted:
 * the quoting rules differ per shell (`hostShell.ts` `quoteFor`) and a quote that is right for one is syntax
 * for another, while a name made only of letters, digits and `. _ -` needs no quoting in any of them. The
 * same choice, for the same reason, as `isValidAlias` in `cliAliases.ts`.</p>
 *
 * <p>An accepted name starts with a letter, a digit or `_` (so it is never an option: no `-x`, and no hidden
 * `.x` or `..`), holds no invisible or look-alike character (a typographic quote, a hangul filler, a
 * right-to-left override), and is in NFC, so what was written is what reaches the shell byte for byte.</p>
 *
 * <p>Pure: imports nothing, so the webview's form preview can run the same patterns (`commandPreviewScript.ts`).</p>
 */

const NAME_TOKEN = /(?<![$#%{])\{name\}(?!\})/gu;
const NAME_SHAPE = /^(?:\p{L}\p{M}*|\p{Nd}|_)(?:\p{L}\p{M}*|\p{Nd}|[._-])*$/u;
const NAME_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;

/** The patterns' sources, for the page script. */
export const NAME_PATTERNS = Object.freeze({
  token: NAME_TOKEN.source,
  shape: NAME_SHAPE.source,
  ignorable: NAME_IGNORABLE.source,
});

/** The one sentence every road says. It names no entry: the caller does. */
export const NAME_REFUSAL =
  "this entry's name cannot stand in for {name}, because only letters, digits and . _ - are allowed, starting with a letter, a digit or _, so that no name can become shell syntax. Rename the entry; to keep a literal {name}, write {na''me} (in bash, outside double quotes).";

/** `search` ignores and restores `lastIndex`, so the `g` flag keeps no state here. Never `.test` this regex. */
export function usesNameToken(text: string): boolean {
  return text.search(NAME_TOKEN) !== -1;
}

function acceptedName(name: string): boolean {
  return NAME_SHAPE.test(name) && !NAME_IGNORABLE.test(name) && name === name.normalize('NFC');
}

/** Why `name` may not be substituted, or `undefined` when it may. */
export function nameRefusal(name: string): string | undefined {
  return acceptedName(name) ? undefined : NAME_REFUSAL;
}

/** Single pass; a replacement FUNCTION, so `$&` means nothing. It does not judge: `resolveCommand` does, before calling it. */
export function substituteName(text: string, name: string): string {
  return text.replace(NAME_TOKEN, () => name);
}
