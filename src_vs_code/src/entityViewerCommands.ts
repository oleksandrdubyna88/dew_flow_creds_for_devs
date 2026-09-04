/* eslint-disable complexity, max-lines-per-function -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
import { TreeNode } from './types';
import { StorageManager } from './storageManager';
import { AgentDoors } from './agentDoors';
import { ViewerTab } from './viewerClicks';
import { dbDisplay } from './viewerOptions';
import { parseHostKey } from './hostKeyPin';
import { imageMime } from './attachment';
import { storageSecretReader } from './viewerOptions';
import { showEntityView } from './entityViewPanel';
import { mcpFor } from './viewerOptions';
import { describeRemaining } from './entityExpiry';
import { hostKeyFingerprint } from './hostKeyPin';
import { buildSshCommand } from './terminalManager';
import { secretResolver } from './viewerOptions';
import { totpViewFor } from './viewerOptions';
import { formatEntityBlock } from './dialogs';
import { saveVpnConfigToFile } from './vpnRun';
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import { envProbeCommand } from './envProbe';
import { automaticRefusal, bindableFieldValue } from './envApply';
import { entityKey } from './entityFlags';
import { Revision } from './revisionHistory';
import { mcpAsOfVersion } from './viewerOptions';
import { parseFields } from './entityFields';
import { revisionSecretReader } from './viewerOptions';
import { saveTextAs } from './saveTextAs';
import { TreeElement } from './types';
import { envCollection } from './envCollectionRef';
import { paymentViewFor } from './viewerOptions';
import { paymentCardFor } from './paymentViewMessages';
import { parsePaymentFields } from './paymentFields';
import { formOf } from './paymentSaveGate';
/** Double-click target: the read-only viewer with per-field Copy buttons. */
export async function openEntityViewer(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
  /** Every agent door to this entry (T23a/T24b) — resolved by the caller, which holds the sources. */
  doors: AgentDoors,
  /** Asked once the entry is loaded: the shared preview tab, a tab of its own, or nothing (superseded). */
  tab: () => ViewerTab | 'stale' = () => 'pinned',
): Promise<void> {
  const details = node.details;
  if (!details) {
    return;
  }
  const hasPassword = (await storage.getPassword(accountId, details.id)) !== undefined;
  const hasPrivateKey = (await storage.getPrivateKey(accountId, details.id)) !== undefined;
  const hasVpnConfig = (await storage.getVpnConfig(accountId, details.id)) !== undefined;
  const dbConnection = await storage.getDbConnection(accountId, details.id);
  const notes = (await storage.getNotes(accountId, details.id)) ?? details.notes;
  const fields = await storage.getFields(accountId, details.id);
  // Always show a port for DB entities — the type's default when not explicit.
  const db = dbDisplay(dbConnection, details.dbType);
  const keySourceName =
    details.sshKeyEntityId !== undefined
      ? (storage.getNode(accountId, details.sshKeyEntityId)?.name ?? '(missing entity)')
      : undefined;
  // Resolved for the reader: an id names nothing, and a raw host key is a wall of base64 that
  // cannot be compared with anything. A name and a SHA256 fingerprint can.
  const jumpHostName =
    details.jumpHostEntityId !== undefined
      ? (storage.getNode(accountId, details.jumpHostEntityId)?.name ?? '(missing entity)')
      : undefined;
  const pinnedKey = parseHostKey(details.hostKey);
  const imageB64 = await storage.getImage(accountId, details.id);
  const imageMimeType = details.imageFileName !== undefined ? imageMime(details.imageFileName) : undefined;
  // The seed can be edited while the panel is open, so the code is derived per request — and
  // the webview only ever receives that code, never the seed it came from.
  const totpReader = storageSecretReader(storage, accountId, details.id);
  const hasTotp = (await storage.getTotp(accountId, details.id)) !== undefined;
  // Read once, for the card's SHAPE — which fields exist and which are woven. Every value is read
  // again per request through `resolvePayment`, so a record edited while the panel is open is not
  // shown from a stale copy.
  const payment = details.isPayment === true ? await storage.getPayment(accountId, details.id) : undefined;
  showEntityView({
    details,
    payment:
      payment === undefined
        ? undefined
        : paymentCardFor(details.id, formOf(details.paymentForm ?? ''), payment, Math.random),
    resolvePayment: payment === undefined ? undefined : paymentViewFor(totpReader),
    cliAliases: doors.cliAliases,
    agentDoors: doors,
    mcp: mcpFor(node, (id) => storage.getNode(accountId, id), false),
    lifetime: node === undefined ? undefined : describeRemaining(node, Date.now()),
    keySourceName,
    jumpHostName,
    hostKeyFingerprint: pinnedKey === undefined ? undefined : hostKeyFingerprint(pinnedKey),
    hasPassword,
    hasPrivateKey,
    hasVpnConfig,
    hasDbConnection: dbConnection !== undefined,
    notes,
    fields,
    config: await storage.getConfigBody(accountId, details.id),
    ...db,
    sshCommand: buildSshCommand(details),
    resolveSecret: secretResolver(totpReader),
    totp: hasTotp ? totpViewFor(totpReader) : undefined,
    copyAllText: async () =>
      formatEntityBlock(
        details,
        await storage.getPassword(accountId, details.id),
        await storage.getDbConnection(accountId, details.id),
        notes,
        fields,
      ),
    saveVpnConfig: () => saveVpnConfigToFile(accountId, details, storage),
    hasAttachment: (await storage.getAttachment(accountId, details.id)) !== undefined,
    createdAt: node?.createdAt,
    updatedAt: node?.updatedAt,
    history: await storage.getHistory(accountId, details.id),
    imageDataUri:
      imageB64 !== undefined && imageMimeType !== undefined
        ? `data:${imageMimeType};base64,${imageB64}`
        : undefined,
    saveAttachment: async (which) => {
      const base64 =
        which === 'image'
          ? await storage.getImage(accountId, details.id)
          : await storage.getAttachment(accountId, details.id);
      if (base64 === undefined) {
        return;
      }
      const suggested =
        which === 'image'
          ? (details.imageFileName ?? `${details.name}.png`)
          : (details.attachmentFileName ?? `${details.name}.bin`);
      const target = await vscode.window.showSaveDialog({
        title: which === 'image' ? 'Save image' : 'Save file',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), suggested)),
      });
      if (target === undefined) {
        return;
      }
      await vscode.workspace.fs.writeFile(target, Buffer.from(base64, 'base64'));
      void vscode.window.showInformationMessage(`Saved to ${target.fsPath}.`);
    },
    // The manual half of env bindings: the automatic write happens on save, but the
    // collection can be lost with the extension's storage — this button re-sets one
    // variable from the CURRENT stored value, on this machine, right now.
    // A FRESH terminal every time: the collection applies to terminals created after
    // the write, so probing in an old one would "prove" the variable is missing.
    checkEnv: (name) => {
      const terminal = vscode.window.createTerminal({ name: `env check: ${name}` });
      terminal.show();
      terminal.sendText(envProbeCommand(vscode.env.shell, name), true);
    },
    setEnv: async (field, name) => {
      // Said rather than reported as emptiness: there IS a password, and "nothing stored" would be
      // a false answer to a person who can see it on the card.
      const refusal = automaticRefusal(details, field);
      if (refusal !== '') {
        void vscode.window.showWarningMessage(refusal);
        return false;
      }
      const value = await bindableFieldValue(storage, accountId, details, field);
      if (value === undefined || value.length === 0) {
        void vscode.window.showWarningMessage('Nothing stored in that field — nothing was set.');
        return false;
      }
      envCollection().replace(name, value);
      envCollection().description = 'CredsForDevs: secrets exposed as terminal variables';
      void vscode.window.showInformationMessage(
        `$${name} is set for NEW integrated terminals. Already-open terminals keep their old environment.`,
      );
      return true;
    },
  }, { tab, key: entityKey(accountId, details.id) });
}

/**
 * The read-only viewer, on a PREVIOUS version.
 *
 * <p>Every secret comes from the revision itself, never from the current entry — that is the
 * whole point of looking. Two things the current entry's viewer offers are refused here:
 * writing the value into a terminal variable (an old password into a live variable is a
 * trap with a plausible name), and the history list (a version has no history of its own).
 * Attachments are not kept in revisions, so none are shown.</p>
 */
export function openRevisionViewer(node: TreeNode, revision: Revision): void {
  const details = revision.details;
  const { password, privateKey, vpnConfig, dbConnection, notes } = revision.secrets;
  const db = dbDisplay(dbConnection, details.dbType);
  const refuseEnv = (): Promise<boolean> => {
    void vscode.window.showWarningMessage(
      'This is a previous version. Set terminal variables from the current entry, not from history.',
    );
    return Promise.resolve(false);
  };
  showEntityView({
    details: {
      ...details,
      name: revision.name,
    },
    // Its own line, not a suffix: glued to the name it read as part of it (owner, 2026-08-27).
    subtitle: `version replaced at ${new Date(revision.at).toLocaleString()}`,
    // Only if this version decided for itself; what its folder said back then is not kept.
    mcp: mcpAsOfVersion(details.mcp),
    hasPassword: password !== undefined,
    hasPrivateKey: privateKey !== undefined,
    hasVpnConfig: vpnConfig !== undefined,
    hasDbConnection: dbConnection !== undefined,
    notes,
    fields: parseFields(revision.secrets.fields),
    config: revision.secrets.config,
    ...db,
    sshCommand: buildSshCommand(details),
    resolveSecret: secretResolver(revisionSecretReader(revision)),
    totp:
      revision.secrets.totp === undefined
        ? undefined
        : totpViewFor(revisionSecretReader(revision)),
    // A kept version's card, from the record that version carried — the `SecretReader` seam is what
    // makes this one line rather than a second implementation that would drift from the live one.
    payment:
      revision.secrets.payment === undefined
        ? undefined
        : paymentCardFor(
            details.id,
            formOf(details.paymentForm ?? ''),
            parsePaymentFields(revision.secrets.payment),
            Math.random,
          ),
    resolvePayment:
      revision.secrets.payment === undefined
        ? undefined
        : paymentViewFor(revisionSecretReader(revision)),
    copyAllText: () => Promise.resolve(formatEntityBlock(details, password, dbConnection, notes)),
    saveVpnConfig: () =>
      vpnConfig === undefined
        ? Promise.resolve()
        : saveTextAs(
            'Save VPN config (previous version)',
            details.vpnConfigFileName ?? `${revision.name}.ovpn`,
            vpnConfig,
          ),
    hasAttachment: false,
    createdAt: node.createdAt,
    updatedAt: revision.at,
    history: [],
    saveAttachment: () => Promise.resolve(),
    setEnv: refuseEnv,
    checkEnv: () => void refuseEnv(),
  });
}

/**
 * The entity a row stands for — the current one, or the version it was at a point in time.
 *
 * <p>A revision row resolves to a node element carrying THAT version's name and metadata, so
 * Run, Copy Command, Show Command and Clone need no second code path: they act on "the
 * entity as it was" through the same shape they already take. The revision itself is read
 * from SecretStorage here rather than carried on the element — the tree caches heads only,
 * so an old password is never resident in the extension host longer than one action.</p>
 */
export async function nodeAt(
  element: TreeElement | undefined,
  storage: StorageManager,
): Promise<(Extract<TreeElement, { kind: 'node' }> & { revision?: Revision }) | undefined> {
  if (element?.kind === 'node') {
    return element;
  }
  if (element?.kind !== 'revision') {
    return undefined;
  }
  const revision = (await storage.getHistory(element.accountId, element.node.id))[element.index];
  if (revision === undefined) {
    void vscode.window.showWarningMessage('That version is no longer kept.');
    return undefined;
  }
  return {
    kind: 'node',
    accountId: element.accountId,
    node: { ...element.node, name: revision.name, details: revision.details, children: undefined },
    revision,
  };
}
