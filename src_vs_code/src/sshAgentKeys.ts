import * as fs from 'node:fs';
import { AgentKey } from './sshAgentServer';
import { ParsedSshKey, parseSshPrivateKey } from './sshKeyParse';
import { materializedKeyPath } from './materializedKeys';

/**
 * What the SSH agent's manager keeps about the keys it serves and the files around them (#197, E3.3: moved out of
 * `sshAgentManager.ts`, which the longer windows brought to its size limit). `vscode`-free, no state: the manager owns
 * the map of loaded keys; this holds the shape of one, the parse of a stored one and the tidy-up of the socket file.
 */

/**
 * Best-effort removal of the POSIX socket file. Windows named pipes have no file to remove,
 * and on POSIX the directory `purgeMaterializedKeys` sweeps covers it anyway — this just makes
 * the common case tidy rather than waiting for the next activate.
 */
export function removeSocketFile(storageDir: string): void {
  if (process.platform === 'win32') {
    return;
  }
  try {
    fs.rmSync(materializedKeyPath(storageDir, 'agent.sock'), { force: true });
  } catch {
    // best effort — the purge covers it
  }
}

/** The opened key, parsed — or the reason it cannot be served, in the words the person is told. */
export function parsedKey(content: string | undefined, name: string): { ok: true; key: ParsedSshKey } | { ok: false; reason: string } {
  if (content === undefined || content.trim().length === 0) {
    return {
      ok: false,
      reason: `"${name}" has no private key stored in the vault. Open Edit and paste it, or point the entity at a key file (which the agent cannot serve).`,
    };
  }
  const parsed = parseSshPrivateKey(content, name);
  return parsed.ok ? { ok: true, key: parsed.key } : { ok: false, reason: `"${name}" cannot be served: ${parsed.reason}` };
}

export interface LoadedKey extends AgentKey {
  accountId: string;
  publicLine: string;
  /**
   * Which load of this entity this object is (#197, I2): a number from `serve`, never reused. A window is
   * granted to one generation and covers no other, so a key re-loaded under the same id inherits nothing.
   */
  generation: number;
  /**
   * End this object's right to sign, for good (#197, I1). Called when the key is unloaded, replaced by a
   * later `load` of the same entity, or the manager is disposed — so a holder that kept the object (a
   * prompt that was open meanwhile) cannot sign with it, whatever it was answered. By object, never by
   * public bytes: a replacement with identical bytes is a different object and revokes the old one.
   */
  revoke(): void;
}
