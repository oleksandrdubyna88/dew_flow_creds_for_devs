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

export function envAppliedNotice(result: EnvApplyResult): EnvNotice {
  return {
    ...(result.written.length > 0 ? { info: writtenSentence(result.written) } : {}),
    ...(result.withheld.length > 0 ? { warning: result.withheld.map(withheldSentence).join(' ') } : {}),
  };
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
