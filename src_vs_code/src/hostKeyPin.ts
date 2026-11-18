import { keyFingerprintOf } from './sshKeyParse';
import type { PinClient, ReadablePinClient } from './pinClient';
import { DEFAULT_SSH_PORT, isSafeSshHost } from './sshCommand';

/**
 * Pinning a host's key, so first contact is a decision rather than a silence (audit **B10**).
 *
 * <p><b>What was wrong.</b> Both connect paths passed `StrictHostKeyChecking=accept-new`, which
 * does exactly what it says: the first key a host offers is accepted, written down, and never
 * mentioned. That is the one moment a man in the middle is cheap — before anything is known — and
 * the extension said nothing at all. Every connection manager people compare this to (Termius,
 * Royal TS) shows the fingerprint and asks.</p>
 *
 * <p><b>What replaces it.</b> The key is fetched with `ssh-keyscan` BEFORE connecting, its
 * fingerprint is shown, and a person says yes. From then on the pin is stored on the entity and
 * enforced with `StrictHostKeyChecking=yes` against a known_hosts file built from it alone — so a
 * changed key fails the connection instead of printing a warning into a scrollback nobody reads.</p>
 *
 * <p>"Built from it alone" is what the calls without a terminal ask of `ssh`, off a bridge: {@link hostKeyWords} names the pin file as
 * BOTH known-hosts files. A bridged exec says it in its `-F` file instead: the pin as its known-hosts file and `GlobalKnownHostsFile none`
 * (`bridgedSshConfig.ts`). The line of a Connect terminal (`sshCommand.ts`) names it as the person's file only, so there `ssh` still
 * reads the system-wide files beside it.</p>
 *
 * <p>Pure and `vscode`-free. The fingerprint is `SHA256:…`, the same string `ssh-keygen -lf` and
 * the server's own logs print, because a fingerprint nobody can compare against anything is
 * decoration.</p>
 */

/** One key a host offers. `base64` is the wire-format public blob. */
export interface HostKey {
  algorithm: string;
  base64: string;
}

/**
 * Which key types to trust from a scan, best first.
 *
 * <p>Ed25519 before the NIST curves before RSA — the order OpenSSH itself prefers. `ssh-dss` is
 * absent deliberately: it is 1024-bit by specification, disabled in OpenSSH for years, and
 * pinning one would be recording something already broken.</p>
 */
export const PREFERRED_HOST_KEY_TYPES: readonly string[] = [
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'rsa-sha2-512',
  'rsa-sha2-256',
  'ssh-rsa',
];

/**
 * A key body is base64 AND substantial.
 *
 * <p>The character check alone is not enough, and its own test said so: `not` is valid base64
 * characters, so a malformed line was being accepted as a pin. The smallest real host key blob
 * (Ed25519) is 51 base64 characters; 32 refuses noise without arguing about key sizes.</p>
 */
const MIN_KEY_BODY = 32;

function isKeyBody(body: string): boolean {
  return body.length >= MIN_KEY_BODY && /^[A-Za-z0-9+/]+={0,2}$/.test(body);
}

function isKeyType(algorithm: string): boolean {
  return (PREFERRED_HOST_KEY_TYPES as readonly string[]).includes(algorithm);
}

/**
 * Read `ssh-keyscan` output.
 *
 * <p>Its comment lines begin with `#`, and a line is `host keytype base64`. The host column is
 * ignored on purpose: what is being pinned is the KEY, and the caller knows which host it asked
 * about — trusting the column would let the answer name a different host than the question.</p>
 */
/** One scan line as a key, or nothing — a comment, a blank, or something that is not a key. */
// eslint-disable-next-line complexity -- a flat list of independent field checks (one clause per field of a keyscan line); splitting reads worse
function keyFromScanLine(line: string): HostKey | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return undefined;
  }
  const parts = trimmed.split(/\s+/);
  const ok = parts.length >= 3 && isKeyType(parts[1]) && isKeyBody(parts[2]);
  return ok ? { algorithm: parts[1], base64: parts[2] } : undefined;
}

export function parseKeyscan(text: string): HostKey[] {
  return text
    .split(/\r?\n/)
    .map((line) => keyFromScanLine(line))
    .filter((key): key is HostKey => key !== undefined);
}

/** The best key from a scan, by the preference order above. */
export function preferredKey(keys: readonly HostKey[]): HostKey | undefined {
  for (const algorithm of PREFERRED_HOST_KEY_TYPES) {
    const found = keys.find((k) => k.algorithm === algorithm);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** `<algorithm> <base64>` — what is stored on the entity. */
export function formatHostKey(key: HostKey): string {
  return `${key.algorithm} ${key.base64}`;
}

/** Read a stored pin back. `undefined` when it is not a key line at all. */
// eslint-disable-next-line complexity -- a flat list of independent field checks (one clause per field of a stored key line); splitting reads worse
export function parseHostKey(stored: string | undefined): HostKey | undefined {
  const parts = (stored ?? '').trim().split(/\s+/);
  const ok = parts.length >= 2 && isKeyType(parts[0]) && isKeyBody(parts[1]);
  return ok ? { algorithm: parts[0], base64: parts[1] } : undefined;
}

/** `SHA256:…`, exactly as `ssh-keygen -lf` and the server's logs print it. */
export function hostKeyFingerprint(key: HostKey): string {
  return keyFingerprintOf(Buffer.from(key.base64, 'base64'));
}

/**
 * The known_hosts line for this host.
 *
 * <p>A non-default port is written `[host]:port` — the bracketed form is not decoration, it is
 * how known_hosts records a port at all, and a line without it silently fails to match.</p>
 */
export function knownHostsLine(host: string, port: number | undefined, key: HostKey): string | undefined {
  if (!isSafeSshHost(host)) {
    return undefined;
  }
  const target = port !== undefined && port !== DEFAULT_SSH_PORT ? `[${host}]:${port}` : host;
  return `${target} ${key.algorithm} ${key.base64}\n`;
}

/**
 * Why the path of a pin file cannot be written as the value of the two known-hosts options: the name of each kind, and the words that
 * sentence E says for it. `ssh` reads the value of both options as a line of a config file, and each of these makes it read another
 * file, two files, or no file at all.
 */
export const PIN_PATH_KINDS = {
  control: 'a control character',
  quote: 'a double quote',
  doubleBackslash: 'two backslashes in a row (a network path)',
  backslashApostrophe: 'a backslash before an apostrophe',
  lastBackslash: 'a backslash at its end',
  percent: 'a percent sign',
  variable: 'the characters ${',
  tilde: 'a tilde at its start',
} as const;

export type PinPathKind = keyof typeof PIN_PATH_KINDS;

/** The refused kinds, in the order they are asked: the first that holds is the answer. */
const REFUSED_PIN_PATHS: readonly (readonly [PinPathKind, (file: string) => boolean])[] = [
  ['control', (file) => /[\u0000-\u001f\u007f]/.test(file)],
  ['quote', (file) => file.includes('"')],
  ['doubleBackslash', (file) => file.includes('\\\\')],
  ['backslashApostrophe', (file) => file.includes("\\'")],
  ['lastBackslash', (file) => file.endsWith('\\')],
  ['percent', (file) => file.includes('%')],
  ['variable', (file) => file.includes('${')],
  ['tilde', (file) => file.startsWith('~')],
];

/**
 * The rule of the path of a pin file (G1, §3.11), its refusing half: the kind of the first thing in `file` that keeps `ssh` from
 * reading it as the one file it is, or `undefined` when the path can be written. It is asked BEFORE a pin file is written, of the
 * whole path.
 *
 * <p><b>Measured 2026-11-18</b>, OpenSSH 10.2p1, `ssh -G -F /dev/null` with the word as both options, the client alone (no login).
 * A double quote, bare or inside double quotes: `invalid quotes`, the client ends. Two backslashes are read as one, bare and in
 * double quotes, so a network path names another path. A backslash before an apostrophe is dropped, bare and in double quotes. A
 * backslash at the end of a word in double quotes: `invalid quotes`. `%h` and `${HOME}` are expanded in the person's list and not in
 * the system-wide one, so the two words name two files, and `%Z` ends the client. A tilde at the start is expanded in the person's
 * list only. A tab splits a bare word in two; every control character is refused, as the rule of the bridged file does
 * (`unsafeSshConfigValue`). No spelling was found that every client reads as the one file in BOTH words, so such a path gets no
 * word.</p>
 *
 * <p>Not measured: a login; a client older than 8.7, which reads such a value with another tokenizer; Windows' `ssh.exe` beyond the
 * rows of the spec of E1.S1 (K8).</p>
 */
export function pinPathRefusal(file: string): PinPathKind | undefined {
  return REFUSED_PIN_PATHS.find(([, holds]) => holds(file))?.[0];
}

declare const checkedPinBrand: unique symbol;

/**
 * The pin file of one call, CHECKED: the only thing the words of a pinned call are written from. Only {@link checkedPin} makes one
 * (the brand is not exported), so a raw path cannot reach {@link hostKeyWords}, and a path that the rule refuses has no value to give.
 */
export interface CheckedPin {
  readonly [checkedPinBrand]: true;
  /** The path of the file as it was written to the disk: for the delete, and for the match of `ssh`'s own lines. Never a word of an argv. */
  readonly file: string;
  /** The path as the value of both known-hosts options: as it is, or in double quotes. */
  readonly word: string;
  /** Whether the client of this call knows `KnownHostsCommand` (OpenSSH 8.5 or newer). */
  readonly knowsKnownHostsCommand: boolean;
}

export type PinCheck = { readonly ok: true; readonly pin: CheckedPin } | { readonly ok: false; readonly kind: PinPathKind };

/**
 * The rule of the path and the client's answer, made into the one value that the words take. A path that the rule refuses answers its
 * kind and no value. A path with white space or an apostrophe goes in double quotes; every other path is written as it is, byte for
 * byte. `client` is a version that was READ: a client that cannot be read is no argument of this function, so its call gets no words.
 *
 * <p><b>Measured 2026-11-18</b> as in {@link pinPathRefusal}. A pair of apostrophes, bare, resolves ANOTHER path in both lists (the
 * apostrophes are dropped), and one apostrophe, bare, ends the client (`invalid quotes`). In double quotes both resolve to themselves,
 * as do a path with a space, one with ` #`, and one with a space and an apostrophe together.</p>
 */
export function checkedPin(file: string, client: ReadablePinClient): PinCheck {
  const kind = pinPathRefusal(file);
  if (kind !== undefined) {
    return { ok: false, kind };
  }
  const word = /[\s']/.test(file) ? `"${file}"` : file;
  return { ok: true, pin: { file, word, knowsKnownHostsCommand: client.kind === 'knows' } as CheckedPin };
}

/**
 * The words that tell `ssh` how to check the host's key, on a call the extension starts with no terminal, OFF a bridge. The one place
 * they are written on the command line: both argv builders call it (`buildSshExecArgv` for an exec call that is not bridged,
 * `buildBridgeArgv`), and `hostKeyWords.test.ts` holds the list. A bridged exec call does not ask it: its `-F` file holds the pin and
 * says `GlobalKnownHostsFile none` (`bridgedSshConfig.ts`), and its argv carries the one word of strictness (`execHostKeyWords`).
 *
 * <p><b>No pin:</b> `accept-new`, as before, and no other word. <b>A checked pin:</b> the call ASKS `ssh` to take the pin file as its
 * only source of host keys, and to print a refusal:</p>
 *
 * <ul>
 * <li>strict checking, and the pin file as the person's known-hosts file AND as the system-wide one (G1, P1): `UserKnownHostsFile`
 *     alone leaves `/etc/ssh/ssh_known_hosts` read beside it;</li>
 * <li>`VerifyHostKeyDNS=no`: with `yes` in a config, a key that matches a signed DNS record is trusted;</li>
 * <li>`KnownHostsCommand=none`, for a client that knows the option (8.5 or newer): a config's command prints more keys. An older
 *     client has no such option and ends at the word, so it gets none (`pinClient.ts`);</li>
 * <li>`LogLevel=ERROR`: under a config's `LogLevel QUIET` a refused key prints nothing, and no caller could tell it from a host that
 *     is down.</li>
 * </ul>
 *
 * <p><b>Measured.</b> 2026-11-17, OpenSSH 10.2p1 against a real `sshd` on the loopback, by hand: the pin file held ANOTHER key and a
 * config named a system-wide file with the host's real key; with the first two options the login was accepted, with all three it
 * ended with `Host key verification failed.`, exit code 255. 2026-11-18, `ssh -G` of the same client, under a config that says
 * `KnownHostsCommand /bin/echo x`, `VerifyHostKeyDNS yes` and `LogLevel QUIET`: with these words it resolves `verifyhostkeydns false`,
 * `loglevel ERROR` and no `knownhostscommand` line; without the `KnownHostsCommand` word that line stays. What a client resolves is
 * asked of the PATH's `ssh -G` in the tests. No test of the suite asks a real `sshd`, and that a login is refused with DNS on was not
 * measured (the plan's E3).</p>
 *
 * <p><b>What these words do NOT reach:</b> the nested `ssh` of a jump host, which gets none of them; and the line of a Connect
 * terminal (`sshCommand.ts`), which writes its own words, the pin as the person's file only (candidate C4 of the plan).</p>
 *
 * <p>It always answers words, and with a pin always strict ones: there is no answer that a caller could read as "no pin".</p>
 */
export function hostKeyWords(pin: CheckedPin | undefined): string[] {
  if (pin === undefined) {
    return ['-o', 'StrictHostKeyChecking=accept-new'];
  }
  const command = pin.knowsKnownHostsCommand ? ['-o', 'KnownHostsCommand=none'] : [];
  return [
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${pin.word}`, '-o', `GlobalKnownHostsFile=${pin.word}`,
    '-o', 'VerifyHostKeyDNS=no', ...command, '-o', 'LogLevel=ERROR',
  ];
}

/**
 * Sentence E: the path of the pin file cannot be written for `ssh`, so the call did not start. It names the kind and echoes no path.
 * The three roads of the person open it with `Cannot reach "<name>": ` or `Cannot bridge to "<name>": `; the agent's exec and Run
 * with Secrets say it as it is.
 */
export function pinPathSentence(name: string, kind: PinPathKind): string {
  return `The saved host key of "${name}" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with ${PIN_PATH_KINDS[kind]}, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.`;
}

/**
 * Sentence F: the `ssh` program could not be asked for its version, so the pinned call did not start. It holds the exit code and no
 * other part of the program's output.
 */
export function pinClientSentence(name: string, exitCode: number | null): string {
  const how = exitCode === null ? 'it did not start, or did not end in time' : `exit code ${exitCode}`;
  return `CredsForDevs could not read the version of the ssh program on this computer (${how}), so it did not start a connection that has to check the saved host key of "${name}". Nothing was sent to that host. The reason is the ssh program here, not the host.`;
}

/** Which thing a refusal of sentence E or F is about: the path of the pin file, or the `ssh` program of this computer. Never a value. */
export type PinRefusalField = 'known-hosts-file' | 'ssh-program';

/** The pin of a call whose file was written BEFORE (Run with Secrets: Connect's options made it): the checked value, or sentence E or F. */
export type ExistingPin = { readonly ok: true; readonly pin?: CheckedPin } | { readonly ok: false; readonly field: PinRefusalField; readonly message: string };

/** A pinned call whose client was not asked is refused as one that cannot be read. */
const NOT_ASKED: PinClient = { kind: 'unreadable', exitCode: null };

/**
 * Check a pin file that exists already. No file: the call is unpinned, and `client` is not read. A file: the rule of its path first,
 * then the client's answer (`undefined`, not asked, is refused as unreadable). Pure: it writes and deletes nothing; the caller's own
 * cleanup deletes the file, as before.
 */
export function checkExistingPin(name: string, file: string | undefined, client: PinClient | undefined): ExistingPin {
  if (file === undefined) {
    return { ok: true };
  }
  const kind = pinPathRefusal(file);
  return kind === undefined ? withClient(name, file, client ?? NOT_ASKED) : { ok: false, field: 'known-hosts-file', message: pinPathSentence(name, kind) };
}

function withClient(name: string, file: string, client: PinClient): ExistingPin {
  if (client.kind === 'unreadable') {
    return { ok: false, field: 'ssh-program', message: pinClientSentence(name, client.exitCode) };
  }
  const checked = checkedPin(file, client);
  return checked.ok ? { ok: true, pin: checked.pin } : { ok: false, field: 'known-hosts-file', message: pinPathSentence(name, checked.kind) };
}

/** The line that `ssh` ends with when the host's key did not pass its check. */
const HOST_KEY_REFUSED_LINE = 'Host key verification failed.';

/**
 * Whether one run of a PINNED call ended because `ssh` refused the host's key (G1, sentence C). Two things must both hold: the call
 * named a pin file, and `ssh` printed the line `Host key verification failed.` on its stderr, as a whole line.
 *
 * <p><b>Why "pinned" is half of it.</b> An unpinned call has no saved key to speak of: whatever its `ssh` printed, the person is
 * shown the sentences of before. A caller hands in the `knownHostsFile` of its call, which is there only for a pinned entry.</p>
 *
 * <p><b>Measured 2026-11-17</b>, OpenSSH 10.2p1 against a real `sshd` on the loopback, with the words of {@link hostKeyWords}. A
 * host with another key: exit code 255, 15 lines, the last one this line. A pin file that holds no key for the host: two lines, the
 * last one this line. `ssh` ends its own lines with CR LF, also on Linux, so the text is split at both. A host that is down
 * (`Connection refused`), a host that does not answer (`Connection timed out`) and a refused login (`Permission denied`) print no
 * such line. Windows' `ssh.exe` was not measured.</p>
 *
 * <p><b>What it cannot tell apart</b> (measured the same day): a hop of the person's own `ProxyJump` whose key `ssh` refused prints
 * the same line, and a host that passed the check can print it itself. Both read as a refused key of the entry. And it misses a
 * refusal when the person's config says `LogLevel QUIET`: `ssh` then prints nothing. A miss shows the sentences of before; it never
 * says that a host is the saved one.</p>
 */
export function hostKeyRefused(pin: CheckedPin | undefined, stderr: string): boolean {
  return pin !== undefined && stderr.split(/\r?\n/).includes(HOST_KEY_REFUSED_LINE);
}

/**
 * Sentence C: `ssh` refused the host's key on a pinned entry. *Install creds on host* shows it as it is; the bridge socket check
 * opens it with `The bridge to "<name>" is not open: `. Its advice cannot end in an unchecked connection: with a saved key that
 * parses, Connect SSH keeps enforcing it, and asks before it replaces it.
 */
export function refusedHostKeySentence(name: string): string {
  return `"${name}" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.`;
}

export type PinVerdict = 'first-contact' | 'match' | 'mismatch' | 'unreachable';

/**
 * What the scan means for what is stored.
 *
 * <p>The three outcomes are deliberately not two. `first-contact` is an ordinary state that
 * deserves a question; `mismatch` is the state that deserves an alarm; and `unreachable` — the
 * scan answered nothing — is neither, because a host that is down is not a host that changed its
 * key, and treating it as one would train people to click through the alarm.</p>
 */
export function pinVerdict(pinned: string | undefined, scanned: HostKey | undefined): PinVerdict {
  if (scanned === undefined) {
    return 'unreachable';
  }
  const current = parseHostKey(pinned);
  if (current === undefined) {
    return 'first-contact';
  }
  return sameKey(current, scanned) ? 'match' : 'mismatch';
}

function sameKey(a: HostKey, b: HostKey): boolean {
  return a.algorithm === b.algorithm && a.base64 === b.base64;
}
