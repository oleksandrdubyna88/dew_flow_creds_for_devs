/**
 * The corpus of hostile lines that two files share and neither copies: `remoteLaunchDelivery.test.ts` (real shells) and `remoteLaunch.test.ts`
 * (the unit rows). It holds no test and imports nothing, so a pure suite can read it.
 */

/** What a person might store: shell syntax, quotes of every kind, a leading `--`, an option look-alike, unicode, a tab. */
export const CORPUS: readonly string[] = [
  'echo hi; echo there',
  'a && b | c',
  `printf '%s|' a\\ b "c;d" '$(x)' && echo; echo "$HOME"`,
  '`id`',
  'back\\slash\\',
  '100% !bang *glob',
  'tab\there',
  'ünïcode €',
  `it's 'quoted' "and" $(sub)`,
  '--',
  '-oProxyCommand=id',
  'trail # comment',
  'echo a &',
  "x'",
  `'"'"'`,
  // PowerShell reads U+2018, U+2019, U+201A and U+201B as single quotes: unescaped, one of them ends the literal.
  'it’s ‘x’ ‚y‛',
];
