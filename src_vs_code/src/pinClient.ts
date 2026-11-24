import { CLIENT_CHECK_TIMEOUT_MS, ClientRunner, Version, versionTokenOf } from './bridgedSshClient';
import { bridgedSshEnv } from './bridgedSshEnv';
import { runSshExec } from './sshExecRunner';

/**
 * What the `ssh` program says of itself, read for a PINNED call that the extension starts with no terminal, off a bridge (G1, E2: the
 * plan's §3.10). A pinned call must ask no source of host keys but its pin file. One such source, `KnownHostsCommand`, can be turned off
 * on the command line only from OpenSSH 8.5; an older client ends with `Bad configuration option` when it is given the word. So the
 * client is asked what it is, and there are three answers:
 *
 * <ul>
 * <li>`knows`: a version at or above 8.5. The words of the call turn the option off (`hostKeyWords`).</li>
 * <li>`older`: a version below 8.5. Such a client has no `KnownHostsCommand`, so the word is left out. This is a success of its own, but it is not kept.</li>
 * <li>`unreadable`: no version could be read. The pinned call is refused before it starts (sentence F, `hostKeyPin.ts`).</li>
 * </ul>
 *
 * <p><b>Where the reading comes from.</b> The token is the bridged road's, `versionTokenOf` of `bridgedSshClient.ts`: an OpenSSH token at
 * the very start of the stderr of `ssh -V`, after an exit code of 0. A version on stdout, or later in a line, is no version. Nothing else of
 * that module's rule applies here: any OpenSSH build counts on every platform (the portable one on Windows too), and there is no floor
 * below which a call is refused.</p>
 *
 * <p><b>What it does not decide:</b> whether a call is pinned (an unpinned call is never asked), what the words are (`hostKeyWords`), and
 * what a person is told. It does not prove that the program that answered is the one that then runs: it asks with the same program word,
 * folder and `PATH` as the call, a moment before it.</p>
 */

/** The first OpenSSH that knows `KnownHostsCommand` (read in its release notes; no older client was run: E3's M11). */
export const KNOWN_HOSTS_COMMAND_SINCE: Version = [8, 5];

export type PinClient =
  | { readonly kind: 'knows'; readonly token: string }
  | { readonly kind: 'older'; readonly token: string }
  | { readonly kind: 'unreadable'; readonly exitCode: number | null };

/** A client whose version was read, on either side of 8.5: the only kind the words of a pinned call can be written for. */
export type ReadablePinClient = Exclude<PinClient, { kind: 'unreadable' }>;

/** The one answer that is kept: a client that knows the option cannot become a client that does not, short of being replaced by an older one. */
type KnowsPinClient = Extract<PinClient, { kind: 'knows' }>;

/** Whether `version` is at or above `since`: major and minor compared as numbers. */
function atOrAbove(version: Version, since: Version): boolean {
  return version[0] > since[0] || (version[0] === since[0] && version[1] >= since[1]);
}

/** Reads one answer of `ssh -V`. `token` is the matched text (`OpenSSH_8.4`), and no other part of the output is kept. */
export function pinClientOf(exitCode: number | null, stderr: string): PinClient {
  const token = exitCode === 0 ? versionTokenOf(stderr) : undefined;
  if (token === undefined) {
    return { kind: 'unreadable', exitCode };
  }
  return { kind: atOrAbove(token.version, KNOWN_HOSTS_COMMAND_SINCE) ? 'knows' : 'older', token: token.text };
}

// ---- the spawn that asks -------------------------------------------------------------------------------------------------------------

/** One question: the program the call will start, the folder it will start in (absent: the window's own), and the environment it will get. */
export interface PinClientCall {
  readonly program: string;
  readonly cwd?: string;
  readonly env: NodeJS.ProcessEnv;
}

export type PinClientAsk = (call: PinClientCall) => Promise<PinClient>;

/** What the asker is built from; every part is for a test to say. */
export interface PinClientParts {
  readonly run?: ClientRunner;
  readonly platform?: NodeJS.Platform;
  readonly timeoutMs?: number;
}

/**
 * The asker of one window: `ssh -V` through the runner, under its time limit. It is started as the call will be: the same program word,
 * the same folder, and the names of the call's environment that decide which program a bare word finds (`bridgedSshEnv`: `PATH` and
 * `HOME`, or the Windows names). Nothing else of that environment goes to the child: no askpass password, no agent socket.
 *
 * <p>Only the newer answer (`knows`) is kept, for this asker's life, per program word, folder and `PATH`. An `older` answer is used for its
 * call and not kept, so the next pinned call asks again: a client that was replaced by a newer one while the window is open is read as
 * newer at the next call, and a config's `KnownHostsCommand` is never left on by a stale answer. `unreadable` is never kept either. It never throws: a runner that fails is `unreadable` with no exit
 * code. It is given no signal of a request or of the window: the time limit ends the child, and the call's own run refuses a request
 * that has gone, as before.</p>
 */
export function pinClientAsker(given: PinClientParts = {}): PinClientAsk {
  const parts = { run: runSshExec, platform: process.platform, timeoutMs: CLIENT_CHECK_TIMEOUT_MS, ...given };
  // Replaced, never changed in place (the coding style's immutability rule); read after the await, so two calls at once lose no answer.
  let kept: ReadonlyMap<string, KnowsPinClient> = new Map();
  return async (call) => {
    const env = bridgedSshEnv(call.env, parts.platform);
    const key = keptUnder(call, env);
    const read = kept.get(key) ?? (await asked(parts, call, env));
    if (read.kind === 'knows') {
      kept = new Map([...kept, [key, read]]);
    }
    return read;
  };
}

/** What an answer is kept under: the program word, the folder and the `PATH`, which together decide which program a call starts. */
function keptUnder(call: PinClientCall, env: NodeJS.ProcessEnv): string {
  return [call.program, call.cwd ?? '', env.PATH ?? ''].join('\0');
}

/** One run of `ssh -V`, read; a runner that fails is a client that did not answer. */
async function asked(parts: Required<PinClientParts>, call: PinClientCall, env: NodeJS.ProcessEnv): Promise<PinClient> {
  const where = call.cwd === undefined ? {} : { cwd: call.cwd };
  try {
    const outcome = await parts.run(['-V'], { program: call.program, env, timeoutMs: parts.timeoutMs, ...where });
    return pinClientOf(outcome.exitCode, outcome.stderr);
  } catch {
    return { kind: 'unreadable', exitCode: null };
  }
}

/** The asker of this window: one per extension host, and a version that was read is kept in it (an older answer is asked again on every call). */
export const windowPinClient: PinClientAsk = pinClientAsker();
