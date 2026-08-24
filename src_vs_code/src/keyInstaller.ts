import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { askpassScript } from './sshAskpass';

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
  const confirmed = await vscode.window.showWarningMessage(
    existing.length > 0
      ? `Install key "${entity.name}" to ~/.ssh? This OVERWRITES: ${existing.map((p) => path.basename(p)).join(', ')}.`
      : `Install key "${entity.name}" to ~/.ssh as "${base}"${publicKey ? ` + "${base}.pub"` : ''}?`,
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
    }
    if (publicKey) {
      fs.writeFileSync(publicPath, ensureTrailingNewline(publicKey), { mode: 0o644 });
      fs.chmodSync(publicPath, 0o644);
    }
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Installing the key failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  void vscode.window.showInformationMessage(
    `Installed to ${willWrite.join(' and ')}.` +
      (privateKey !== undefined ? ` Use it with: ssh -i "${privatePath}" …` : ''),
  );
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
  const keysDir = path.join(storageDir, 'keys');
  fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(keysDir, `${entityId}.key`);
  fs.writeFileSync(keyPath, ensureTrailingNewline(content), { mode: 0o600 });
  fs.chmodSync(keyPath, 0o600);
  return keyPath;
}

/**
 * Write a stored VPN config into the same private storage, under the file name the tool
 * expects. `wg-quick` takes the interface name from the FILE name, which is why the
 * caller passes one instead of us using the entity id: a tunnel called `a1b2c3.key`
 * would not come up.
 *
 * <p>It lands in the same `keys/` directory on purpose, so the existing purge on
 * activate and deactivate covers it too. One thing to be honest about: on Windows the
 * 0600 mode is advisory at best — NTFS ACLs are what matter there, and the directory is
 * inside the extension's own storage under the user profile.</p>
 */
export function materializeVpnConfig(
  storageDir: string,
  fileName: string,
  content: string,
): string {
  const keysDir = path.join(storageDir, 'keys');
  fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const configPath = path.join(keysDir, fileName);
  fs.writeFileSync(configPath, ensureTrailingNewline(content), { mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
  return configPath;
}

/**
 * Write the static askpass helper script (it names an env variable, it holds
 * no secret) into the same purged `keys/` directory and return its path.
 * Idempotent — the content never varies, so every caller shares one file.
 */
export function writeAskpassScriptFile(storageDir: string, platform: NodeJS.Platform): string {
  const script = askpassScript(platform);
  const keysDir = path.join(storageDir, 'keys');
  fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const scriptPath = path.join(keysDir, script.name);
  fs.writeFileSync(scriptPath, script.content, { mode: 0o700 });
  return scriptPath;
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
 * Delete every materialized private key. Called on activate and deactivate
 * so decrypted key material never outlives the VS Code session (they are
 * re-materialized on demand at the next connect).
 */
export function purgeMaterializedKeys(storageDir: string): void {
  try {
    fs.rmSync(path.join(storageDir, 'keys'), { recursive: true, force: true });
  } catch {
    // nothing to purge
  }
}
