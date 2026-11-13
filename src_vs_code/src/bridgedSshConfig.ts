import * as net from 'node:net';
import { DEFAULT_SSH_PORT, isSafeSshHost, isSafeSshUser } from './sshCommand';

/**
 * The per-call `ssh_config` of a bridged `ssh:exec` (parent §4.9, the E1.6 spec §S6.3): what each leg of the call offers, and to whom.
 *
 * <p>Pure: no `vscode`, no `fs`, no environment. The text is built from the values the caller hands in and from `BRIDGED_LOCKDOWN`, and from
 * nothing else: a hop block carries exactly three keywords, the destination block exactly two, and `Host *` the lock-down. A hop block comes
 * BEFORE `Host *` because the first obtained value wins for every scalar keyword while `IdentityFile` accumulates.</p>
 *
 * <p>Every value that reaches the file is asked the same questions here, by ONE function for every path (`unsafeSshConfigValue`) and one more
 * for a key path that `ssh` expands (`%`). The writer asks them first, to say why; this module asks them again, so no caller can get a file
 * that holds a value the rules refuse.</p>
 */

/** How a leg trusts its host: the entry's pin alone, or first contact (recorded in `bridges/known_hosts`). */
export type HostCheck = { readonly pinnedFile: string } | { readonly firstContact: true };

export interface HopBlock {
  /** The host as the entry holds it (brackets allowed); the `Host` word is made from it. */
  readonly host: string;
  /** The hop's key file: a file this call wrote, or the typed path (`typedKeyPath`). */
  readonly identityFile: string;
  /** The path is the person's own text: written as typed, and `%` in it is refused. */
  readonly typedKeyPath: boolean;
  readonly check: HostCheck;
}

export interface ConfigInput {
  /** In the order `ssh` contacts them. */
  readonly hops: readonly HopBlock[];
  readonly destination: { readonly host: string; readonly pinnedFile?: string };
  /** `materializedKeyPath(storageDir, 'no-default-identity')`: the sentinel; the file is never made. */
  readonly noDefaultIdentity: string;
  /** `<storageDir>/bridges/known_hosts`. */
  readonly firstContactFile: string;
  /** `<injected home>/.ssh/known_hosts`. */
  readonly personKnownHosts: string;
}

export type ConfigText = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly field: string };

/**
 * The sixteen lines of `Host *` that hold no path, in order. The two that hold one are written between them by `bridgedConfigText`:
 * `IdentityFile` after `IdentitiesOnly`, `UserKnownHostsFile` before `GlobalKnownHostsFile`. A caller hands in no keyword of its own.
 */
export const BRIDGED_LOCKDOWN: ReadonlyArray<readonly [keyword: string, value: string]> = [
  ['BatchMode', 'yes'],
  ['PasswordAuthentication', 'no'],
  ['KbdInteractiveAuthentication', 'no'],
  ['IdentityAgent', 'none'],
  ['IdentitiesOnly', 'yes'],
  ['ForwardAgent', 'no'],
  ['ControlMaster', 'no'],
  ['ControlPath', 'none'],
  ['ClearAllForwardings', 'yes'],
  ['ForwardX11', 'no'],
  ['Tunnel', 'no'],
  ['PermitLocalCommand', 'no'],
  ['ProxyCommand', 'none'],
  ['ConnectTimeout', '10'],
  ['StrictHostKeyChecking', 'yes'],
  ['GlobalKnownHostsFile', 'none'],
];

/**
 * The words that make a password destination ask for its password, on the command line (they bind the outer leg only: a nested `-J` command
 * gets `-l`, `-p`, `-F`, `-W` and the host, nothing else). With `-o NumberOfPasswordPrompts=1` first, these are the four of parent §4.9.
 */
export const BRIDGED_ASKPASS_OPTIONS: readonly string[] = [
  '-o', 'BatchMode=no',
  '-o', 'PasswordAuthentication=yes',
  '-o', 'KbdInteractiveAuthentication=yes',
];

/**
 * True when the value cannot be written into the file, or handed to `ssh` as a path: empty, a quote, a code point below 0x20 or 0x7F (a line
 * break ends the line whatever quotes it stands in: D15), the two characters `${` (`ssh` puts an environment variable into a path: X1), or a
 * last backslash (it makes `invalid quotes`: X5). The ONE check of every path of a bridged call.
 */
export function unsafeSshConfigValue(value: string): boolean {
  return value.length === 0 || /["\u0000-\u001f\u007f]/.test(value) || value.includes('${') || value.endsWith('\\');
}

/**
 * True when a user that an entry holds cannot go into a bridged argv: it fails `isSafeSshUser`, or holds `$` or a backslash (a `-J` user reaches
 * a shell on some builds, and a Windows login `CORP\alice` is refused: the E1.6 spec's H7a). An absent user is not asked.
 */
export function unsafeBridgedUser(user: string): boolean {
  return !isSafeSshUser(user) || user.includes('$') || user.includes('\\');
}

/** What is wrong with a key path that `ssh` is given (`-i`, or a hop's `IdentityFile` typed by the person), or `undefined`. A `%` token is expanded by `ssh` (X2), and `-i` checks the text as written and loads the text as expanded (X1a). */
export function bridgedKeyPathProblem(value: string): 'value' | 'percent' | undefined {
  if (unsafeSshConfigValue(value)) {
    return 'value';
  }
  return value.includes('%') ? 'percent' : undefined;
}

/**
 * The `Host` word of a leg: the host with its brackets off and its letter case kept (a `Host` pattern is compared with the host as typed: X3),
 * or `undefined` when a bridge does not take the host. A host with no `:`, `[` or `]` is its own word. Any other host must be an IPv6 address,
 * alone or with one pair of brackets around all of it; a hop needs the brackets (`-J` does not take a bare address: X8), the destination may
 * have them or not. `gw:2201`, `[gw]` and a bracket anywhere else are refused; a zone id fails `isSafeSshHost`.
 */
export function bridgedHostWord(host: string, leg: 'hop' | 'destination'): string | undefined {
  if (!isSafeSshHost(host)) {
    return undefined;
  }
  return /[:[\]]/.test(host) ? ipv6Word(host, leg) : host;
}

/** The address of a host that holds `:` or a bracket: an IPv6 address, in brackets for a hop and with or without them for the destination. */
function ipv6Word(host: string, leg: 'hop' | 'destination'): string | undefined {
  const address = unbracketed(host, leg);
  return address !== undefined && net.isIPv6(address) ? address : undefined;
}

/** The text that must be an IPv6 address: the inside of one pair of brackets round all of the host, or (the destination only) the host itself. */
function unbracketed(host: string, leg: 'hop' | 'destination'): string | undefined {
  if (/^\[[^\]]*\]$/.test(host)) {
    return host.slice(1, -1);
  }
  return leg === 'destination' ? host : undefined;
}

/** The name `ssh` looks a leg up by in a known-hosts file: the `Host` word in lower case, as `[name]:port` for a port that is not 22 (X12). */
export function knownHostsName(hostWord: string, port: number | undefined): string {
  const name = hostWord.toLowerCase();
  return port !== undefined && port !== DEFAULT_SSH_PORT ? `[${name}]:${port}` : name;
}

/** A path of ours as the file spells it: in quotes (a Windows folder may hold a space), each `%` written `%%` (X2). Backslashes are written once. */
function ownPath(value: string): string {
  return `"${value.replace(/%/g, '%%')}"`;
}

/** A hop's typed key path, as typed: it has passed the value rule and the `%` rule. */
function typedPath(value: string): string {
  return `"${value}"`;
}

const keyword = (name: string, value: string): string => `  ${name} ${value}`;

function hopBlock(word: string, hop: HopBlock, input: ConfigInput): string[] {
  const trusted = 'pinnedFile' in hop.check
    ? [keyword('StrictHostKeyChecking', 'yes'), keyword('UserKnownHostsFile', ownPath(hop.check.pinnedFile))]
    : [keyword('StrictHostKeyChecking', 'accept-new'), keyword('UserKnownHostsFile', `${ownPath(input.firstContactFile)} ${ownPath(input.personKnownHosts)}`)];
  return [`Host ${word}`, keyword('IdentityFile', hop.typedKeyPath ? typedPath(hop.identityFile) : ownPath(hop.identityFile)), ...trusted];
}

function destinationBlock(word: string, pinnedFile: string | undefined): string[] {
  return pinnedFile === undefined ? [] : [`Host ${word}`, keyword('StrictHostKeyChecking', 'yes'), keyword('UserKnownHostsFile', ownPath(pinnedFile))];
}

function lockdownBlock(input: ConfigInput): string[] {
  const lines = BRIDGED_LOCKDOWN.flatMap(([name, value]) => {
    const own = name === 'IdentitiesOnly'
      ? [keyword('IdentityFile', ownPath(input.noDefaultIdentity))]
      : [];
    const before = name === 'GlobalKnownHostsFile'
      ? [keyword('UserKnownHostsFile', `${ownPath(input.firstContactFile)} ${ownPath(input.personKnownHosts)}`)]
      : [];
    return [...before, keyword(name, value), ...own];
  });
  return ['Host *', ...lines];
}

/** The first refusal among the hosts, or `undefined`: a host the bridge does not take, or two legs with one `Host` word (compared in lower case). */
function hostRefusal(input: ConfigInput, words: readonly (string | undefined)[]): string | undefined {
  const bad = words.findIndex((word) => word === undefined);
  if (bad !== -1) {
    return bad === input.hops.length ? 'destination:host' : `hop:${bad}:host`;
  }
  const lower = words.map((word) => (word as string).toLowerCase());
  return new Set(lower).size === lower.length ? undefined : 'hosts';
}

/** A hop's key file: a typed path is asked the `%` rule too; a file this call wrote only the value rule (its `%` is written `%%`). */
function hopKeyProblem(hop: HopBlock): 'value' | 'percent' | undefined {
  if (hop.typedKeyPath) {
    return bridgedKeyPathProblem(hop.identityFile);
  }
  return unsafeSshConfigValue(hop.identityFile) ? 'value' : undefined;
}

/** The first path of a hop that fails: its key file, then its pin file. */
function hopPathRefusal(hop: HopBlock, at: number): string | undefined {
  if (hopKeyProblem(hop) !== undefined) {
    return `hop:${at}:key`;
  }
  return 'pinnedFile' in hop.check && unsafeSshConfigValue(hop.check.pinnedFile) ? `hop:${at}:pin` : undefined;
}

function pathRefusal(input: ConfigInput): string | undefined {
  const checks: ReadonlyArray<readonly [string, string | undefined]> = [
    ['destination:pin', input.destination.pinnedFile],
    ['keys', input.noDefaultIdentity],
    ['known-hosts', input.firstContactFile],
    ['known-hosts', input.personKnownHosts],
  ];
  return input.hops.map((hop, at) => hopPathRefusal(hop, at)).find((field) => field !== undefined)
    ?? checks.find(([, value]) => value !== undefined && unsafeSshConfigValue(value))?.[0];
}

/**
 * The file, or the name of the first field that failed a rule (`hop:<n>:host`, `hop:<n>:key`, `hop:<n>:pin`, `destination:host`,
 * `destination:pin`, `keys`, `known-hosts`, `hosts`). It echoes no value. It refuses two legs with one `Host` word itself, so no caller can
 * get a file in which two legs are one block (X7: the destination would get the hop's key and the hop's pin file).
 */
export function bridgedConfigText(input: ConfigInput): ConfigText {
  const hopWords = input.hops.map((hop) => bridgedHostWord(hop.host, 'hop'));
  const words = [...hopWords, bridgedHostWord(input.destination.host, 'destination')];
  const refused = hostRefusal(input, words) ?? pathRefusal(input);
  if (refused !== undefined) {
    return { ok: false, field: refused };
  }
  const lines = [
    ...input.hops.flatMap((hop, at) => hopBlock(hopWords[at] as string, hop, input)),
    ...destinationBlock(words[words.length - 1] as string, input.destination.pinnedFile),
    ...lockdownBlock(input),
  ];
  return { ok: true, text: `${lines.join('\n')}\n` };
}
