import { TreeNode } from '../types';
import { AgentDoors } from '../agentDoors';
import { StorageManager } from '../storageManager';
import { VaultKeys } from '../vaultKeys';
import { asElement } from '../commandTargets';
import * as vscode from 'vscode';
import { nodeAt } from '../entityViewerCommands';
import { buildCommandLine } from '../commandLine';
import { describeCommand } from '../commandLine';
import { openEntityViewer } from '../entityViewerCommands';
import { copySecret } from '../secretClipboard';
import { copiedMessage } from '../secretClipboard';
import { totpSnapshot } from '../totp';
import { runHygieneScan } from '../hygieneScan';
import { generatePassphrase } from '../secretGenerator';
import { DEFAULT_PASSPHRASE } from '../secretGenerator';
import { generatePassword } from '../secretGenerator';
import { DEFAULT_PASSWORD } from '../secretGenerator';
import { installKeyToSystem } from '../keyInstaller';
import { removeInstalledKey } from '../keyInstaller';
import { saveVpnConfigToFile } from '../vpnRun';
import { runVpn } from '../vpnRun';
import { withoutPassword } from '../dbConnString';
import { openInDbExtension } from '../dbLauncher';
import { TrustStore } from '../commandTrust';
import { openEntrySite } from '../openSite';
import { EntityMetadata } from '../types';
import { SlotRead, clickedSecret, outsidePinNote } from '../pinClick';
import type { OpenedSecret } from '../secretOpener';
import type { RotationSlot } from '../secretRotation';
export interface EntityCommandsHost {
  readonly doorsAt: (accountId: string, node: TreeNode) => AgentDoors;
  readonly mutated: () => void;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly vaultKeys: VaultKeys;
  readonly trust: TrustStore;
}

/**
 * The entity commands, registered in four families. Until the entry-PIN plan this was one function
 * registering every closure, moved verbatim out of `extension.ts` under a file-level exemption; the
 * handlers that hand a stored value to a sink were rewritten for D6 (each reads through
 * `pinClick.clickedSecret` now), and the families that were not touched carry their exemption per
 * function until they are.
 */
export function registerEntityCommands(host: EntityCommandsHost): void {
  registerCommandLines(host);
  registerSecretCopies(host);
  registerTools(host);
  registerFiles(host);
}

/** The clicked row as an entry of an account, or nothing for a folder, a header or a stale target. */
function clickedEntry(target: unknown): { accountId: string; details: EntityMetadata } | undefined {
  const element = asElement(target);
  if (element?.kind !== 'node' || element.node.details === undefined) {
    return undefined;
  }
  return { accountId: element.accountId, details: element.node.details };
}

/**
 * One stored value of the clicked entry, opened for the click (rule R1) — or nothing, when there is no
 * entry, the person declined the PIN, or a refusal has already been said. `missing` is said when the
 * entry opened and holds no such value.
 */
async function clickedValue(
  host: EntityCommandsHost,
  target: unknown,
  read: SlotRead,
  purpose: string,
  missing: (name: string) => string,
  slot: RotationSlot | undefined,
): Promise<{ details: EntityMetadata; value: string } | undefined> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const entry = clickedEntry(target);
  if (entry === undefined) {
    return undefined;
  }
  return presentValue(await clickedSecret(host.storage, entry.accountId, entry.details, read, purpose, slot), entry.details, missing);
}

/** An opened value that is there; an absent one is said, a stopped one has been said already. */
function presentValue(
  opened: OpenedSecret,
  details: EntityMetadata,
  missing: (name: string) => string,
): { details: EntityMetadata; value: string } | undefined {
  if (opened.kind !== 'open') {
    return undefined;
  }
  if (opened.value === undefined) {
    void vscode.window.showWarningMessage(missing(details.name));
    return undefined;
  }
  return { details, value: opened.value };
}

/** A value on the clipboard, with the TTL promise the notice makes. */
async function copied(value: string, notice: string): Promise<void> {
  await copySecret(vscode.env.clipboard, value);
  void vscode.window.showInformationMessage(notice);
}

const readPassword: SlotRead = (s, a, e) => s.getPassword(a, e);
const readDb: SlotRead = (s, a, e) => s.getDbConnection(a, e);
const readTotp: SlotRead = (s, a, e) => s.getTotp(a, e);
const readKey: SlotRead = (s, a, e) => s.getPrivateKey(a, e);

/** Every click that copies or hands over a stored value — each through the entry's door (D6). */
function registerSecretCopies(host: EntityCommandsHost): void {
  host.register('credSshManager.copyPassword', async (target) => {
    const got = await clickedValue(host, target, readPassword, 'copy its password', (name) => `"${name}" has no stored password.`, 'password');
    if (got !== undefined) {
      await copied(got.value, copiedMessage(`Password of "${got.details.name}"`));
    }
  });
  // The current one-time code, computed from the stored seed at this moment. The seed itself never
  // leaves SecretStorage; what lands on the clipboard expires twice — once when the period ends, once
  // when the clipboard TTL clears it.
  host.register('credSshManager.copyTotpCode', (target) => copyTotpCode(host, target));
  host.register('credSshManager.copyDbConnectionNoPassword', async (target) => {
    const got = await clickedValue(host, target, readDb, 'copy its connection string', () => 'No connection string stored for this entry.', 'dbConnection');
    if (got !== undefined) {
      await copied(withoutPassword(got.value), 'Connection string copied WITHOUT the password. It clears from the clipboard shortly.');
    }
  });
  // Open a database entity in the matching DB extension — which says itself when there is no string.
  host.register('credSshManager.connectDb', (target) => connectDb(host, target));
  host.register('credSshManager.copyDbConnection', async (target) => {
    const got = await clickedValue(host, target, readDb, 'copy its connection string', (name) => `"${name}" has no stored connection string.`, 'dbConnection');
    if (got !== undefined) {
      await copied(got.value, copiedMessage(`Connection string of "${got.details.name}"`));
    }
  });
}

async function connectDb(host: EntityCommandsHost, target: unknown): Promise<void> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const entry = clickedEntry(target);
  if (entry === undefined) {
    return;
  }
  const opened = await clickedSecret(host.storage, entry.accountId, entry.details, readDb, 'connect', 'dbConnection');
  if (opened.kind === 'open') {
    await openInDbExtension(entry.details, opened.value);
  }
}

/**
 * The code, from the seed opened for the click. The "open Edit" hint in the refusal is safe to give
 * now that Edit is gated too — until 1.12 a protected seed read as "no seed" here, and the hint steered
 * the person into the one action that deleted it (D2).
 */
async function copyTotpCode(host: EntityCommandsHost, target: unknown): Promise<void> {
  const noSeed = (name: string): string =>
    `"${name}" has no one-time code seed — open Edit and paste the otpauth:// URI or the base32 secret.`;
  const got = await clickedValue(host, target, readTotp, 'copy its one-time code', noSeed, undefined);
  if (got === undefined) {
    return;
  }
  const now = Date.now();
  const snapshot = totpSnapshot(got.value, now);
  if (snapshot === undefined) {
    // A seed that opened and does not parse is "no seed", in the same words.
    void vscode.window.showWarningMessage(noSeed(got.details.name));
    return;
  }
  const secondsLeft = Math.ceil((snapshot.validUntil - now) / 1000);
  await copied(snapshot.code, copiedMessage(`One-time code of "${got.details.name}" (valid for ${secondsLeft} s more)`));
}

/**
 * The commands that write a stored value OUT — to `~/.ssh`, to a file of the person's choosing, to a
 * tunnel. Each file written from a protected value says it is outside the PIN (`outsidePinNote`).
 */
function registerFiles(host: EntityCommandsHost): void {
  const { register, storage, storageDir, vaultKeys, trust } = host;
  register('credSshManager.installSshKey', (target) => installSshKey(host, target));
  register('credSshManager.removeInstalledKey', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const entry = clickedEntry(target);
    if (entry !== undefined) {
      await removeInstalledKey(entry.details);
    }
  });
  // Write the stored VPN config back out as a file.
  register('credSshManager.saveVpnConfig', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const entry = clickedEntry(target);
    if (entry !== undefined) {
      await saveVpnConfigToFile(entry.accountId, entry.details, storage);
    }
  });
  // Start and Stop side by side (Stop used to live in extension.ts). `trust` is the per-line record
  // a launcher's command and a dependency chain are confirmed against (issue #103). No start gate: the
  // person clicked, and no client's departure can cancel what they asked for (E4.S3).
  register('credSshManager.startVpn', (target) => runVpn(target, 'start', storage, storageDir, vaultKeys, trust, undefined));
  register('credSshManager.stopVpn', (target) => runVpn(target, 'stop', storage, storageDir, vaultKeys, trust, undefined));
}

/**
 * The key into `~/.ssh`. An ABSENT private key still goes on — a key entity with only its public half
 * installs that half — so only a stopped door ends it here.
 */
async function installSshKey(host: EntityCommandsHost, target: unknown): Promise<void> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const entry = clickedEntry(target);
  if (entry === undefined) {
    return;
  }
  const opened = await clickedSecret(host.storage, entry.accountId, entry.details, readKey, 'install its key', undefined);
  if (opened.kind === 'open') {
    await installKeyToSystem(entry.details, opened.value, outsidePinNote(opened));
  }
}

/** A stored command line, copied or shown, the viewer and the site. Untouched since they moved out of extension.ts. */
function registerCommandLines(host: EntityCommandsHost): void {
  const { doorsAt, register, storage, vaultKeys } = host;

  // eslint-disable-next-line complexity -- moved verbatim (roadmap A1); split when next touched
  register('credSshManager.copyCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const line = buildCommandLine(d?.command ?? '', d?.commandArgs);
    if (line.length === 0) {
      void vscode.window.showWarningMessage(`"${element.node.name}" has no command yet.`);
      return;
    }
    // Not a secret, so it does not expire the way a password copy does.
    await vscode.env.clipboard.writeText(line);
    void vscode.window.showInformationMessage(`Copied: ${line}`);
  });

  // eslint-disable-next-line complexity -- moved verbatim (roadmap A1); split when next touched
  register('credSshManager.showCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const text = describeCommand(d?.command ?? '', d?.commandArgs, d?.commandNote);
    const document = await vscode.workspace.openTextDocument({
      content: text.length > 0 ? text : 'This entry has no command yet.',
      language: 'shellscript',
    });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  register('credSshManager.viewDetails', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    // The viewer, not the old QuickPick: that one knew only the SSH fields, so a VPN, database,
    // script or command entity opened as "Host —, Password not set" and read as broken.
    await openEntityViewer(element.accountId, element.node, storage, doorsAt(element.accountId, element.node));
  });

  // Issue #104: the entry's stored URL in the default browser — http/https only (`siteUrl.ts`),
  // read through the PIN gate, re-judged now rather than trusted from the menu's hint.
  register('credSshManager.openSiteInBrowser', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind === 'node' && element.node.details !== undefined) {
      await openEntrySite(storage, element.accountId, element.node.details);
    }
  });
}

/** The switch, the health report and the generator. Untouched since they moved out of extension.ts. */
function registerTools(host: EntityCommandsHost): void {
  const { mutated, register, storage, vaultKeys } = host;

  // Per-entry SSH on/off switch (default is off for new entities).
  // eslint-disable-next-line complexity -- moved verbatim (roadmap A1); split when next touched
  register('credSshManager.toggleSsh', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = { ...element.node.details, isSshEnabled: !element.node.details.isSshEnabled };
    await storage.updateDetailsFields(element.accountId, element.node.id, details);
    mutated();
    void vscode.window.showInformationMessage(
      `SSH ${details.isSshEnabled ? 'enabled' : 'disabled'} for "${element.node.name}".`,
    );
  });

  register('credSshManager.healthReport', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'CredsForDevs: checking…',
        // Cancellable because the optional breach check makes network calls: without this the
        // only way out of a long scan is reloading the window.
        cancellable: true,
      },
      (_progress, token) => runHygieneScan(storage, token),
    );
    const document = await vscode.workspace.openTextDocument({
      content: result.markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  register('credSshManager.generateSecret', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const kind = await vscode.window.showQuickPick(
      [
        { label: '$(key) Password', detail: '32 characters, mixed sets — for a field, not for typing', id: 'password' },
        { label: '$(comment) Passphrase', detail: '6 words — for a PIN, or anything said aloud', id: 'passphrase' },
      ],
      { title: 'Generate a secret', ignoreFocusOut: true },
    );
    if (kind === undefined) {
      return;
    }
    const made = kind.id === 'passphrase'
      ? generatePassphrase(DEFAULT_PASSPHRASE)
      : generatePassword(DEFAULT_PASSWORD);
    await copySecret(vscode.env.clipboard, made.value);
    void vscode.window.showInformationMessage(`${made.description} ${copiedMessage('It')}`);
  });
}
