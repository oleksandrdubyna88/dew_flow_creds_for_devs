/**
 * The names the `{name}` allow-list accepts and refuses, in ONE list, so the pure table test and the
 * real-shell test read the same names. Not named `*.test.ts`, so the runner never treats it as a suite.
 *
 * <p>Typographic and invisible characters are written as escapes: an editor or a formatter must not be able
 * to normalise them away and leave a test passing on a different name.</p>
 */

/** Names a person might give an entry. Each one reaches a shell byte for byte. */
export const ACCEPTED: readonly string[] = [
  'billing-api-design',
  'orders-mockups',
  'admin-panel-mockups',
  'a.b',
  '_x',
  'x1',
  '1x',
  'Пётр',
  '日本語',
  'a..b',
];

/** Names that are shell syntax, a path, an invisible character, a look-alike, or not NFC. */
export const REFUSED: readonly string[] = [
  '-x',
  '.x',
  '..',
  'a b',
  'a;b',
  '$(x)',
  'a`b',
  'a\nb',
  'a\u2019b', // right single quotation mark
  'a\u2013b', // en dash
  'a\u3164b', // hangul filler
  'a\u034fb', // combining grapheme joiner
  'a\ufe0fb', // variation selector 16
  'a\u202eb', // right-to-left override
  '~',
  'a/b',
  'a:b',
  'e\u0301x', // NFD, not NFC
];

/** More refusals: the empty name, the tokens themselves, quotes, a tab, and the shell's expansion characters. */
export const REFUSED_MORE: readonly string[] = ['', '{name}', '{config}', "a'b", 'a\tb', 'a%b', 'a$b'];

/** Texts where the token stands as itself, and texts where it does not (`$`, `#`, `%`, `{` before; `}` after). */
export const TOKEN_ROWS: readonly string[] = [
  '{name}',
  'user@{name}',
  '{name}.{name}',
  '{name}{name}',
  'x{name}y',
  "'={name}'",
  '"{name}"',
  '{config} {name}',
  'creds://me/{name}/password',
  '${name}',
  '$${name}',
  '{{name}}',
  '#{name}',
  '%{name}',
  '{name}}',
  '{ name }',
  "{na''me}",
  '{NAME}',
];

