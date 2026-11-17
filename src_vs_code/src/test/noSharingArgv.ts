/**
 * What the tests of G2 ask of an `ssh` argv (`PLAN_bridge_no_connection_sharing.md` §7.2): where the two no-sharing options stand,
 * and which other words name connection sharing. Shared by `sshExecCommand.test.ts`, `sshBridge.test.ts` and
 * `noConnectionSharing.test.ts`, so the three ask the same question.
 *
 * <p>These say what is SENT. What the options do is asked of a real `ssh` (`noConnectionSharing.test.ts`, the client alone) and
 * of a real `ssh` against a real `sshd` (section 9 of `scripts/ssh-agent-itest.cjs`).</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** The two options, spelled out once more here on purpose: the constant of `sshExecCommand.ts` is pinned to this, not to itself. */
export const TWO: readonly string[] = ['-o', 'ControlPath=none', '-o', 'ControlMaster=no'];

/** Every index where the pair `-o <value>` stands. The value is compared whole, so `ControlMaster=auto` is no `ControlMaster=no`. */
export const pairAt = (argv: readonly string[], value: string): number[] => argv.flatMap((arg, i) => (arg === '-o' && argv[i + 1] === value ? [i] : []));

/** The first of `words` in the argv, or its length when none is there. */
const firstOf = (argv: readonly string[], words: readonly string[]): number =>
  Math.min(argv.length, ...words.map((word) => argv.indexOf(word)).filter((at) => at !== -1));

/** Each of the two pairs stands exactly once, side by side in the order of `TWO`, and both stand before every one of `before`. */
export function saysNoSharingBefore(argv: readonly string[], before: readonly string[]): boolean {
  const path = pairAt(argv, TWO[1]);
  const master = pairAt(argv, TWO[3]);
  return path.length === 1 && master.length === 1 && master[0] === path[0] + 2 && master[0] + 2 <= firstOf(argv, before);
}

/** The argv with every pair of `TWO` taken out: what the builder sent before G2. */
export function withoutTheTwo(argv: readonly string[]): string[] {
  const gone = new Set([...pairAt(argv, TWO[1]), ...pairAt(argv, TWO[3])].flatMap((at) => [at, at + 1]));
  return argv.filter((_, i) => !gone.has(i));
}

const NAMES_SHARING = /control(master|path|persist)/i;
/** `-S <path>`, `-M` and `-O <command>`, also with the value written into the same word. */
const SHARING_FLAG = /^-[SMO]/;

/**
 * The words before `--` that name connection sharing, in any letter case and in the one-word spelling (`-oControlPath=/x`), the two
 * pairs of `TWO` left out. `skip` holds the indexes of the words a CALLER passed (the `extra` of a bridge): those are the caller's.
 */
export function sharingWords(argv: readonly string[], skip: readonly number[] = []): string[] {
  const fixed = new Set([...pairAt(argv, TWO[1]), ...pairAt(argv, TWO[3])].map((at) => at + 1));
  const named = (word: string): boolean => NAMES_SHARING.test(word) || SHARING_FLAG.test(word);
  return argv.slice(0, firstOf(argv, ['--'])).filter((word, i) => !fixed.has(i) && !skip.includes(i) && named(word));
}
