/**
 * Which machine will actually run the command this window composes.
 *
 * <p><b>Why this exists.</b> `extensionKind: ["ui"]` pins the extension host to the local computer,
 * so in a window attached to WSL, a Remote-SSH host or a container, the extension runs on Windows
 * while the integrated terminal runs somewhere else. Everything on the SSH connect path was
 * composed from `process.platform` — the host's — and posted into that other machine's shell, which
 * is why a WSL window was handed `ssh -i "c:\Users\…\keys\<pid>\<guid>.key"` and answered
 * <i>not accessible: No such file or directory</i>.</p>
 *
 * <p>Before this module `vscode.env.remoteName` was read in exactly one place in the extension
 * (`keyringWarningHost.ts`) and its consumer ignored the field, so the product had never asked the
 * question at all.</p>
 *
 * <p><b>The distro is a ladder, not a lookup</b>, because one workspace folder is not a reliable
 * source: a multi-root workspace can span two distributions, and a window opened on a single file
 * or on nothing has no folder at all. Guessing there would point `SSH_AUTH_SOCK` at whichever
 * socket was found first.</p>
 *
 * <p><b>And the spelling is load-bearing.</b> VS Code records the authority lower-cased —
 * `wsl+ubuntu`, measured on every occurrence under `%APPDATA%\Code` — while `wsl -l -q` answers
 * `Ubuntu`. `WslRelayManager.socketPathFor` is an exact-key `Map.get`, so handing it the
 * authority's spelling would never find a relay keyed by the configured one. Every comparison here
 * is case-insensitive and the answer is the CONFIGURED spelling, never the authority's.</p>
 *
 * <p>Pure, and imports no `vscode`: the caller reads `env.remoteName`, the workspace folders and
 * the settings, per the repository rule that the testable half of the extension stays free of it.</p>
 */

/** The `vscode-remote://` authority prefix a WSL window carries. */
const WSL_AUTHORITY = 'wsl+';

/** Why a WSL window could not be tied to ONE distribution. Absent when it could. */
export type DistroProblem = 'ambiguous' | 'unknown';

export type WindowSide =
  | { kind: 'local' }
  | { kind: 'wsl'; distro: string; problem?: DistroProblem }
  | { kind: 'other'; remoteName: string };

/**
 * Which side this window's terminal is on.
 *
 * @param remoteName `vscode.env.remoteName` — `undefined` locally, else `wsl`, `ssh-remote`,
 *   `dev-container`, `attached-container`, `codespaces`.
 * @param authorities every workspace folder's `uri.authority`, in the order VS Code gives them.
 * @param configuredDistros `credSshManager.wslRelayDistros`.
 * @param servingDistros `WslRelayManager.serving()` — the keys a socket can actually be found under.
 */
export function windowSide(
  remoteName: string | undefined,
  authorities: readonly string[],
  configuredDistros: readonly string[] = [],
  servingDistros: readonly string[] = [],
): WindowSide {
  return (
    sideWithoutADistribution(remoteName) ?? {
      kind: 'wsl',
      ...resolveDistro(authorities, configuredDistros, servingDistros),
    }
  );
}

/** The two answers that need no distribution — or `undefined`, meaning this window has one. */
function sideWithoutADistribution(remoteName: string | undefined): WindowSide | undefined {
  if (remoteName === undefined || remoteName.length === 0) {
    return { kind: 'local' };
  }
  return remoteName === 'wsl' ? undefined : { kind: 'other', remoteName };
}

/**
 * The platform whose SHELL will parse the composed line — or `undefined` when NOTHING may be
 * composed for this window.
 *
 * <p>The host platform is passed in rather than read here, so the module stays pure.</p>
 *
 * <p><b>Why `undefined` rather than a guess.</b> The first version answered `linux` for every
 * non-local window, reasoning that the route refuses the other kinds before composing. The code
 * review was right that this hard-codes one caller's policy into a general function: a Remote-SSH
 * host can be Windows, and a WSL window whose distribution could not be resolved has no shell to
 * name either. An answer that is only correct because somebody else remembered to refuse first is
 * the shape of defect this whole plan is about. So the type carries the refusal: a caller cannot
 * compose a line for a window this function will not name a platform for.</p>
 */
export function terminalPlatform(
  side: WindowSide,
  hostPlatform: NodeJS.Platform,
): NodeJS.Platform | undefined {
  if (side.kind === 'local') {
    return hostPlatform;
  }
  return side.kind === 'wsl' && side.problem === undefined ? 'linux' : undefined;
}

/** The four rungs, in order. */
function resolveDistro(
  authorities: readonly string[],
  configured: readonly string[],
  serving: readonly string[],
): { distro: string; problem?: DistroProblem } {
  const named = distinct(authorities.map(distroOfAuthority).filter((name) => name.length > 0));
  if (named.length > 1) {
    // Two distributions in one window. Connecting through an arbitrary one of them would be a
    // guess about which agent socket serves this key.
    return { distro: '', problem: 'ambiguous' };
  }
  if (named.length === 1) {
    return { distro: preferredSpelling(named[0], configured, serving) };
  }
  return withoutAFolder(configured, serving);
}

/**
 * Rungs 3 and 4: a window with no folder, so nothing names the distribution.
 *
 * <p>A RUNNING relay is consulted before the configured list, and that order was a review finding
 * rather than the first draft: someone with two distributions configured and a relay started in the
 * one they are working in was refused and sent to a picker, while the socket they wanted was the
 * only one that existed. A running relay is the least ambiguous fact available — it is a socket
 * that is actually there.</p>
 */
function withoutAFolder(
  configured: readonly string[],
  serving: readonly string[],
): { distro: string; problem?: DistroProblem } {
  if (serving.length === 1) {
    return { distro: serving[0] };
  }
  const known = distinct([...configured, ...serving]);
  if (known.length === 1) {
    // Through `preferredSpelling` like every other rung: `distinct` keeps the FIRST spelling it
    // saw, which is the configured one, and an exact-key `socketPathFor` would then miss a relay
    // serving the same distribution under another case.
    return { distro: preferredSpelling(known[0], configured, serving) };
  }
  if (known.length === 0) {
    // Nothing configured and nothing running. '' is `WslRelayManager`'s own "whatever WSL calls
    // default" sentinel, and it deliberately carries NO problem: the person here has never set the
    // relay up, so the honest message is the relay's own ("it is off"), not a distribution picker.
    // Naming it `unknown` would send them to choose between distributions for a feature they have
    // not switched on — the circle `wslRelayReadiness` exists to avoid.
    return { distro: '' };
  }
  return { distro: '', problem: 'unknown' };
}

/** `vscode-remote://wsl+ubuntu/home/me` → `ubuntu`; anything else → `''`. */
function distroOfAuthority(authority: string): string {
  return authority.startsWith(WSL_AUTHORITY) ? authority.slice(WSL_AUTHORITY.length) : '';
}

/**
 * The spelling a relay is keyed under, preferred over the authority's lower-cased one.
 *
 * <p>`serving` first, because that is the map the socket is actually looked up in; `configured`
 * second, because that is what the person wrote and what a relay will be keyed by once it starts.</p>
 */
function preferredSpelling(
  name: string,
  configured: readonly string[],
  serving: readonly string[],
): string {
  return matching(name, serving) ?? matching(name, configured) ?? name;
}

function matching(name: string, candidates: readonly string[]): string | undefined {
  return candidates.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
}

/** Case-insensitively distinct, keeping the first spelling seen. */
function distinct(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    const isNew = !seen.has(key);
    seen.add(key);
    return isNew;
  });
}
