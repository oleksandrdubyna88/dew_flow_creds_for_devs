import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { runBounded } from './sshExecRunner';
import { materializedKeysDir } from './materializedKeys';
import { lockToOwner } from './materializedKeys';
import {
  HostKey,
  formatHostKey,
  hostKeyFingerprint,
  knownHostsLine,
  parseHostKey,
  parseKeyscan,
  pinVerdict,
  preferredKey,
} from './hostKeyPin';
import { DEFAULT_SSH_PORT, isSafeSshHost } from './sshCommand';
import { EntityMetadata } from './types';

/**
 * The running half of host-key pinning (audit **B10**): ask the host what key it has, show the
 * fingerprint to a person, and write the answer where `ssh` will enforce it.
 *
 * <p>The decisions all live in `hostKeyPin.ts`, which is pure and tested. What is here is the
 * three things that cannot be: spawning `ssh-keyscan`, opening a modal, and writing a file.</p>
 */

const KEYSCAN_TIMEOUT_MS = 10_000;

/** Ask a host for its keys. `undefined` means it did not answer — which is not a mismatch. */
// eslint-disable-next-line complexity -- a flat list of independent field checks (argv assembly, one clause per optional flag); splitting reads worse
export async function scanHostKey(
  host: string,
  port: number | undefined,
  signal?: AbortSignal,
): Promise<HostKey | undefined> {
  if (!isSafeSshHost(host)) {
    return undefined;
  }
  const portArgv = port !== undefined && port !== DEFAULT_SSH_PORT ? ['-p', String(port)] : [];
  const argv = ['-T', '5', ...portArgv];
  // `--` for the same reason every other ssh invocation here has it: a host beginning with a
  // dash is a FLAG to getopt, not a destination.
  argv.push('--', host);
  try {
    const outcome = await runBounded('ssh-keyscan', argv, false, {
      env: process.env,
      timeoutMs: KEYSCAN_TIMEOUT_MS,
      signal,
    });
    return preferredKey(parseKeyscan(outcome.stdout));
  } catch {
    // ssh-keyscan absent, or the host unreachable. Both mean "nothing learned".
    return undefined;
  }
}

/** Where this window keeps the known_hosts file for one entity. Purged with every other key material. */
function knownHostsPath(storageDir: string, entityId: string): string {
  return path.join(materializedKeysDir(storageDir), `known_hosts-${entityId}`);
}

/**
 * Write the pinned key where ssh will read it, and return the path.
 *
 * <p>In the per-window `keys/<pid>/` directory, so the purge on activate and deactivate covers it
 * exactly as it covers a materialized private key — a pin is not secret, but a stale one left on
 * disk would be a file claiming to be authoritative about a host.</p>
 */
export function materializeKnownHosts(
  storageDir: string,
  entity: EntityMetadata,
): string | undefined {
  const key = parseHostKey(entity.hostKey);
  if (key === undefined || entity.host === undefined) {
    return undefined;
  }
  const line = knownHostsLine(entity.host, entity.port, key);
  if (line === undefined) {
    return undefined;
  }
  const file = knownHostsPath(storageDir, entity.id);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, line, { mode: 0o600 });
  lockToOwner(file);
  return file;
}

export interface TrustOutcome {
  /** Whether the connection may go ahead. */
  proceed: boolean;
  /** A key the caller should store on the entity, when the person accepted a new one. */
  pin?: string;
}

/**
 * Decide, with the person, whether this host is the one they mean.
 *
 * <p>Three outcomes, three different conversations — the reason `pinVerdict` has three states
 * rather than a boolean:</p>
 *
 * <ul>
 *   <li><b>match</b> — nothing is said. The overwhelmingly common case, and a dialog here would
 *       be the kind of prompt people learn to dismiss.</li>
 *   <li><b>first-contact</b> — the fingerprint, and a Trust button. This is the moment
 *       `accept-new` used to pass over in silence.</li>
 *   <li><b>mismatch</b> — a refusal by default. The wording says what it means, because "the
 *       host key changed" is also what a reinstalled server looks like, and a person who knows
 *       they rebuilt it needs a way through that is not the same click as "yes, whatever".</li>
 * </ul>
 */
export async function confirmHostKey(
  entity: EntityMetadata,
  scanned: HostKey | undefined,
): Promise<TrustOutcome> {
  const verdict = pinVerdict(entity.hostKey, scanned);
  // Nothing to say: the key is the one already trusted, or the host answered nothing at all —
  // and a host that is down is not a host that changed its key. A pin that exists is still
  // enforced by the known_hosts file, so neither case is a way past one.
  if (verdict === 'match' || verdict === 'unreachable') {
    return { proceed: true };
  }
  const key = scanned as HostKey;
  return verdict === 'first-contact' ? askFirstContact(entity, key) : askMismatch(entity, key);
}

/** The question accept-new never asked: this host is new, and here is its fingerprint. */
async function askFirstContact(entity: EntityMetadata, key: HostKey): Promise<TrustOutcome> {
  const choice = await vscode.window.showWarningMessage(
    `First connection to "${entity.name}" (${entity.host}).\n\n` +
      `${key.algorithm}\n${hostKeyFingerprint(key)}\n\n` +
      'Compare this fingerprint with the one your server printed when it was set up. Trusting ' +
      'it pins the key: if it ever changes, the connection will refuse rather than warn.',
    { modal: true },
    'Trust and connect',
  );
  return choice === 'Trust and connect' ? { proceed: true, pin: formatHostKey(key) } : { proceed: false };
}

/**
 * The alarm — and the way through it, which has to exist and has to be a DIFFERENT click.
 *
 * <p>"The host key changed" is what an interception looks like and also what a rebuilt server
 * looks like. Offering one button for both would train people to press it.</p>
 */
async function askMismatch(entity: EntityMetadata, key: HostKey): Promise<TrustOutcome> {
  const choice = await vscode.window.showErrorMessage(
    `THE HOST KEY FOR "${entity.name}" HAS CHANGED.\n\n` +
      `Now offering: ${key.algorithm}\n${hostKeyFingerprint(key)}\n\n` +
      'This is what a machine-in-the-middle looks like. It is also what a rebuilt or migrated ' +
      'server looks like — so if you rebuilt it, replacing the pin is correct. If you did not, ' +
      'do not connect and do not type anything into that session.',
    { modal: true },
    'I rebuilt it — replace the pin',
  );
  return choice === 'I rebuilt it — replace the pin'
    ? { proceed: true, pin: formatHostKey(key) }
    : { proceed: false };
}
