/**
 * What has to be true before the WSL relay can work, said in words, and checked afterwards.
 *
 * <p><b>Why this exists.</b> An operator installed `creds` in WSL with the script this extension
 * hands out, installed `creds.exe` with the button this extension provides, ran the setup command
 * — and got `error fetching identities: communication with agent failed` from `ssh-add`. Every
 * piece was in place except one, the command said nothing either way, and the only description of
 * the problem was a line in a log nobody had reason to open.</p>
 *
 * <p>So the command now says what is missing BEFORE it starts anything, and — the half people
 * actually asked for — says <b>OK</b> when it worked, with the fingerprint as evidence rather
 * than a claim. A setup that ends in silence is one you have to go and test yourself, which is
 * what the setup was for.</p>
 *
 * <p>Pure: the checks are performed by the caller, which has the filesystem and the child
 * processes. What lives here is the wording, and the rule for turning a list of results into one
 * sentence a person can act on.</p>
 */

export interface ReadinessCheck {
  /** What was checked, phrased as the thing that must be true. */
  readonly label: string;
  readonly ok: boolean;
  /** What to do about it. Only read when `ok` is false. */
  readonly fix: string;
}

/** The checks that failed, in the order they were made. */
export function failed(checks: readonly ReadinessCheck[]): ReadinessCheck[] {
  return checks.filter((check) => !check.ok);
}

/**
 * One message naming everything that is missing, and what to do about each.
 *
 * <p>All of them, not the first: someone who has installed neither half should be told that once
 * rather than discovering the second after fixing the first.</p>
 */
export function whatIsMissing(distro: string, checks: readonly ReadinessCheck[]): string {
  const problems = failed(checks);
  const where = distro.length > 0 ? ` in ${distro}` : '';
  return [
    `The SSH agent relay${where} cannot work yet — ${problems.length} thing(s) missing:`,
    ...problems.map((check) => `• ${check.label} — ${check.fix}`),
  ].join('\n');
}

/**
 * What to say when the relay is up and the agent answered through it.
 *
 * <p>The fingerprint is the point. "Set up successfully" is a claim about our own actions; a key
 * listed through the socket is the thing the person came for, observed.</p>
 */
export function itWorks(distro: string, socketPath: string, fingerprint: string): string {
  const where = distro.length > 0 ? distro : 'your default distribution';
  return (
    `Working in ${where}: ${socketPath} answered with ${fingerprint}. ` +
    'Open a new terminal there and `ssh-add -l` will show it.'
  );
}

/**
 * What to say when everything was in place but the agent did not answer.
 *
 * <p>Distinct from the missing-pieces message on purpose: the pieces being present and the thing
 * still not working is a different problem, and telling someone to install what they already have
 * sends them in a circle.</p>
 */
export function itDidNotAnswer(distro: string, detail: string): string {
  const where = distro.length > 0 ? distro : 'your default distribution';
  return (
    `The relay is running in ${where}, but the agent did not answer through it: ${detail.trim()}. ` +
    'See the "CredsForDevs: Diagnostics" channel for what the relay reported.'
  );
}
