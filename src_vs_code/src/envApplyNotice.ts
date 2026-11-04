/**
 * What a save SAYS about the env bindings it applied — one sentence for what was written, and one
 * per name that was not, with the reason (issue #48).
 *
 * <p>Two defects this closes. The form's checkbox wrote the variable on save and said nothing, so
 * somebody looked at the terminal that was already open, saw nothing there, and filed "does not
 * work on Linux" — the mechanism is VS Code's environment collection, which reaches only terminals
 * opened AFTERWARDS, in this window, and nothing else on any platform. And a value the policy
 * withholds — a woven password, a PIN-locked field — was skipped in silence, so an entry created
 * with a PIN and a binding wrote nothing and said nothing. The viewer's `ENV` button already had
 * the right sentence; it lives here now so the three surfaces that apply a binding say ONE thing,
 * and a withheld name is reported in the policy's own words rather than dropped.</p>
 *
 * <p>Pure and `vscode`-free, so the sentences are tested as sentences; `envApply.showEnvNotice` is
 * the thin edge that hands them to `window`.</p>
 */

import { windowKind } from './hostShell';

/** A bound name the policy refused to write, and the sentence that says why. */
export interface EnvWithheld {
  readonly name: string;
  readonly reason: string;
}

/** What `applyEnvBindings` did: the names it wrote, and the names it could not. */
export interface EnvApplyResult {
  readonly written: readonly string[];
  readonly withheld: readonly EnvWithheld[];
}

/** The two sentences a save shows — either may be absent, never empty. */
export interface EnvNotice {
  readonly info?: string;
  readonly warning?: string;
}

/**
 * @param remoteName `vscode.env.remoteName`, when the caller knows it. Absent reads as a local window,
 *   so every caller written before the argument existed says what it said.
 */
export function envAppliedNotice(result: EnvApplyResult, remoteName?: string): EnvNotice {
  const warning = [...result.withheld.map(withheldSentence), ...reachSentences(result.written, remoteName)].join(' ');
  return {
    ...(result.written.length > 0 ? { info: writtenSentence(result.written) } : {}),
    ...(warning.length > 0 ? { warning } : {}),
  };
}

/**
 * The warning for a window whose terminals run on ANOTHER computer (E1.1 of the scoped remote bridge).
 *
 * <p>The environment collection is applied to the terminals of the window, and in a Remote-SSH or a
 * container window those run on the remote side: the value is written into the environment of every
 * new terminal there, where any process of the person's login can read it. It is still written — the
 * person chose the binding — and the person is told where it goes and how to take it back. A WSL
 * window is this machine's own side (`windowKind` says `wsl`), so it says nothing.</p>
 */
function reachSentences(written: readonly string[], remoteName: string | undefined): string[] {
  return written.length > 0 && windowKind(remoteName) === 'other' ? [reachSentence(written, remoteName ?? '')] : [];
}

function reachSentence(written: readonly string[], remoteName: string): string {
  const list = written.map((name) => `$${name}`).join(', ');
  const [reaches, values, takeBack] =
    written.length > 1
      ? ['reach', 'the values in their environment', 'a value']
      : ['reaches', 'the value in its environment', 'the value'];
  return (
    `${list} ${reaches} another computer: the new terminals of this window run there (${remoteName}), ` +
      `so each one starts on that computer with ${values}, where any process of your login can read it. ` +
      `To take ${takeBack} back, remove its binding from the entry; terminals already open keep it until they close.`
  );
}

/** The viewer's own sentence, widened to several names — "in this window" added, because that is the boundary the report missed. */
function writtenSentence(names: readonly string[]): string {
  const list = names.map((name) => `$${name}`).join(', ');
  const verb = names.length === 1 ? 'is' : 'are';
  return `${list} ${verb} set for NEW integrated terminals in this window. Already-open terminals keep their old environment.`;
}

function withheldSentence(item: EnvWithheld): string {
  return `$${item.name} was not written: ${item.reason}`;
}
