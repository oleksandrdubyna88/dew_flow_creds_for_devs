/**
 * What the tests of G1 ask of an `ssh` argv about the host's key (`PLAN_person_roads_pin_host_key.md` §3.9 and §5, test 13): which
 * words say how the key is checked, and which file they name. Shared by `hostKeyWords.test.ts` and `sshExecCommand.test.ts`, so
 * they ask the same question.
 *
 * <p>These say what is SENT. What the client resolves from the words is asked of a real `ssh -G` (`hostKeyWords.test.ts`). What a
 * real `sshd` then gets is not asked by any test that uses this file.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** The three options of a host-key check, in the order a pinned call says them. */
export const HOST_KEY_OPTIONS: readonly string[] = ['StrictHostKeyChecking', 'UserKnownHostsFile', 'GlobalKnownHostsFile'];

/** One `Name=value` that an argv gives `ssh` with `-o`, and where its first word stands. */
interface OptionWord {
  readonly at: number;
  readonly words: readonly string[];
  readonly text: string;
}

/** The words before `--`: behind it stand the destination and the remote command, which are no options. */
const beforeTheTarget = (argv: readonly string[]): readonly string[] => argv.slice(0, argv.includes('--') ? argv.indexOf('--') : argv.length);

/** Every `-o Name=value` before `--`, also in the one-word spelling (`-oName=value`). */
function optionWords(argv: readonly string[]): OptionWord[] {
  const words = beforeTheTarget(argv);
  return words.flatMap((word, i): OptionWord[] => {
    if (words[i - 1] === '-o') {
      return [{ at: i - 1, words: ['-o', word], text: word }];
    }
    return word.startsWith('-o') && word.length > 2 ? [{ at: i, words: [word], text: word.slice(2) }] : [];
  });
}

/** `ssh` reads an option's name without regard to case. */
const names = (text: string, name: string): boolean => text.toLowerCase().startsWith(`${name.toLowerCase()}=`);

/** Every value the argv gives the option `name`, in the order of the argv. `ssh` takes the first. */
export const valuesOf = (argv: readonly string[], name: string): string[] =>
  optionWords(argv).filter((option) => names(option.text, name)).map((option) => option.text.slice(name.length + 1));

/** The words of the argv that name one of the three options, in the order of the argv. */
export const hostKeyWordsOf = (argv: readonly string[]): string[] =>
  optionWords(argv).filter((option) => HOST_KEY_OPTIONS.some((name) => names(option.text, name))).flatMap((option) => [...option.words]);

/** Where the last word of the host-key words stands, or -1 when the argv has none. */
export const lastHostKeyWordAt = (argv: readonly string[]): number =>
  Math.max(-1, ...optionWords(argv).filter((option) => HOST_KEY_OPTIONS.some((name) => names(option.text, name))).map((option) => option.at + option.words.length - 1));

/** The argv with every `GlobalKnownHostsFile` word taken out: what a builder sent before G1. */
export function withoutGlobal(argv: readonly string[]): string[] {
  const gone = new Set(optionWords(argv).filter((option) => names(option.text, 'GlobalKnownHostsFile')).flatMap((option) => option.words.map((_, i) => option.at + i)));
  return argv.filter((_, i) => !gone.has(i));
}
