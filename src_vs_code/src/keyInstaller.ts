import { describeError } from './describeError';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { askpassScript } from './sshAskpass';
import { deadPidSubdirs } from './keysPurge';
import { lockToOwner, materializedKeysDir, safeFileComponent } from './materializedKeys';

// lockToOwner and materializedKeysDir are vscode-free and live in materializedKeys.ts so the
// agent broker (which runs partly under plain node) can use them; re-exported here so this
// module's existing callers are unchanged.
export { lockToOwner, materializedKeysDir, safeFileComponent };

/**
 * Writing SSH key material to disk:
 *  - "Install to system" puts a key entity's pair into ~/.ssh with the
 *    permissions ssh expects (dir 0700, private 0600, public 0644).
 *  - materializePrivateKey() writes a stored key into the extension's
 *    private storage so `ssh -i` can use it for a connection.
 */

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function sanitizeKeyFileName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base.length > 0 ? base : 'key';
}

/**
 * Install a key entity into ~/.ssh: `<name>` (private, 0600) and
 * `<name>.pub` (public, 0644). Asks before overwriting existing files.
 */
// eslint-disable-next-line complexity, max-lines-per-function
export async function installKeyToSystem(
  entity: EntityMetadata,
  privateKey: string | undefined,
): Promise<void> {
  const publicKey = entity.publicKey;
  if (privateKey === undefined && (publicKey === undefined || publicKey.length === 0)) {
    void vscode.window.showWarningMessage(
      `"${entity.name}" has no stored key content — open Edit and paste the private/public key first.`,
    );
    return;
  }

  const sshDir = path.join(os.homedir(), '.ssh');
  const base = sanitizeKeyFileName(entity.name);
  const privatePath = path.join(sshDir, base);
  const publicPath = path.join(sshDir, `${base}.pub`);

  const willWrite = [
    ...(privateKey !== undefined ? [privatePath] : []),
    ...(publicKey ? [publicPath] : []),
  ];
  const existing = willWrite.filter((p) => fs.existsSync(p));
  // Say what makes this different from every other place the extension writes key
  // material: this copy is permanent and outside the extension's own housekeeping.
  const permanence =
    ' Unlike everywhere else CredsForDevs writes key material, this copy is PERMANENT:' +
    ' it is not tracked and never purged — remove it with "Remove Installed Key…".';
  const confirmed = await vscode.window.showWarningMessage(
    (existing.length > 0
      ? `Install key "${entity.name}" to ~/.ssh? This OVERWRITES: ${existing.map((p) => path.basename(p)).join(', ')}.`
      : `Install key "${entity.name}" to ~/.ssh as "${base}"${publicKey ? ` + "${base}.pub"` : ''}?`) + permanence,
    { modal: true },
    'Install',
  );
  if (confirmed !== 'Install') {
    return;
  }

  try {
    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    if (privateKey !== undefined) {
      fs.writeFileSync(privatePath, ensureTrailingNewline(privateKey), { mode: 0o600 });
      fs.chmodSync(privatePath, 0o600);
  lockToOwner(privatePath);
    }
    if (publicKey) {
      fs.writeFileSync(publicPath, ensureTrailingNewline(publicKey), { mode: 0o644 });
      fs.chmodSync(publicPath, 0o644);
    }
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Installing the key failed: ${describeError(error)}`,
    );
    return;
  }
  void vscode.window.showInformationMessage(
    `Installed to ${willWrite.join(' and ')}.` +
      (privateKey !== undefined ? ` Use it with: ssh -i "${privatePath}" …` : ''),
  );
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 tests existence without touching the process
    return true;
  } catch (error) {
    // ESRCH = gone; EPERM = exists but not ours to signal, i.e. still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Write a stored private key into the extension's private storage
 * (dir 0700, file 0600) and return its path for `ssh -i`.
 */
export function materializePrivateKey(
  storageDir: string,
  entityId: string,
  content: string,
): string {
  const keysDir = materializedKeysDir(storageDir);
  fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  // The id comes from the vault, and import/restore write an envelope's ids verbatim.
  const keyPath = path.join(keysDir, `${safeFileComponent(entityId)}.key`);
  fs.writeFileSync(keyPath, ensureTrailingNewline(content), { mode: 0o600 });
  fs.chmodSync(keyPath, 0o600);
  lockToOwner(keyPath);
  return keyPath;
}

/**
 * Write a stored VPN config into the same private storage, under the file name the tool
 * expects. `wg-quick` takes the interface name from the FILE name, which is why the
 * caller passes one instead of us using the entity id: a tunnel called `a1b2c3.key`
 * would not come up.
 *
 * <p>It lands in the same `keys/` directory on purpose, so the existing purge on
 * activate and deactivate covers it too. On Windows the 0600 mode alone would be nearly
 * meaningless — NTFS ACLs are what decide access there, and the inherited ones grant
 * SYSTEM and the local Administrators group full control. `lockToOwner` breaks that
 * inheritance so the file belongs to its owner alone, which matters exactly on the
 * machines where the operator is not the administrator.</p>
 */
export function materializeVpnConfig(
  storageDir: string,
  fileName: string,
  content: string,
): string {
  const keysDir = materializedKeysDir(storageDir);
  fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const configPath = path.join(keysDir, safeFileComponent(fileName));
  fs.writeFileSync(configPath, ensureTrailingNewline(content), { mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
  lockToOwner(configPath);
  return configPath;
}

/**
 * Write the static askpass helper script (it names an env variable, it holds
 * no secret) into the same purged `keys/` directory and return its path.
 * Idempotent — the content never varies, so every caller shares one file.
 */
export function writeAskpassScriptFile(storageDir: string, platform: NodeJS.Platform): string {
  const script = askpassScript(platform);
  const keysDir = materializedKeysDir(storageDir);
  fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const scriptPath = path.join(keysDir, script.name);
  fs.writeFileSync(scriptPath, script.content, { mode: 0o700 });
  return scriptPath;
}

/**
 * Take an installed key back out of `~/.ssh` — the inverse of `installKeyToSystem`,
 * deleting exactly the files that function would have written.
 *
 * <p>It exists because the install is deliberately permanent: without a way back, the
 * only honest thing the install dialog could say was "this is forever".</p>
 */
// eslint-disable-next-line complexity
export async function removeInstalledKey(entity: EntityMetadata): Promise<void> {
  const base = sanitizeKeyFileName(entity.name);
  const sshDir = path.join(os.homedir(), '.ssh');
  const candidates = [path.join(sshDir, base), path.join(sshDir, `${base}.pub`)].filter((p) =>
    fs.existsSync(p),
  );
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      `Nothing to remove — no "${base}" in ~/.ssh. (Only files this extension would have written are considered.)`,
    );
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `Delete from ~/.ssh: ${candidates.map((p) => path.basename(p)).join(', ')}? The key stays in the vault.`,
    { modal: true },
    'Delete',
  );
  if (confirmed !== 'Delete') {
    return;
  }
  for (const file of candidates) {
    try {
      fs.rmSync(file, { force: true });
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not delete ${file}: ${describeError(error)}`,
      );
      return;
    }
  }
  void vscode.window.showInformationMessage(`Removed ${candidates.length} file(s) from ~/.ssh.`);
}

/** Best-effort delete of one materialized key (after the SSH session ends). */
export function forgetMaterializedKey(keyPath: string): void {
  try {
    fs.rmSync(keyPath, { force: true });
  } catch {
    // already gone / locked — nothing to do
  }
}

/**
 * Delete this window's materialized key material, and sweep leftovers from windows that
 * crashed without disposing — but never a directory a LIVE window is still using.
 *
 * <p>Called on activate and deactivate so decrypted material never outlives the session
 * that made it (everything is re-materialized on demand at the next connect). It purges
 * only `keys/<own-pid>/`, then removes sibling `keys/<pid>/` directories whose process is
 * gone; a live window's subdir is left untouched, which is the whole point of the split.</p>
 */
// eslint-disable-next-line complexity
export function purgeMaterializedKeys(storageDir: string): void {
  try {
    fs.rmSync(materializedKeysDir(storageDir), { recursive: true, force: true });
  } catch {
    // nothing of our own to purge
  }
  const root = path.join(storageDir, 'keys');
  let names: string[];
  try {
    names = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return; // no keys directory yet
  }
  for (const name of deadPidSubdirs(names, processAlive)) {
    try {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    } catch {
      // best effort — a leftover directory is weaker cleanup, not a broken feature
    }
  }
}
