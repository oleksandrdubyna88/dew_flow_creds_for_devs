import { TreeNode } from './types';
import { StorageManager } from './storageManager';
import { AgentDoors } from './agentDoors';
import { ViewerTab } from './viewerClicks';
import { dbDisplay } from './viewerOptions';
import { parseHostKey } from './hostKeyPin';
import { imageMime } from './attachment';
import { SecretReader, gatedSecretReader, storageSecretReader } from './viewerOptions';
import { showEntityView } from './entityViewPanel';
import { mcpFor } from './viewerOptions';
import { describeRemaining } from './entityExpiry';
import { hostKeyFingerprint } from './hostKeyPin';
import { sshLineFor } from './sshCommand';
import { secretResolver } from './viewerOptions';
import { totpViewFor } from './viewerOptions';
import { formatEntityBlock } from './dialogs';
import { saveVpnConfigToFile } from './vpnRun';
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import { envProbeCommand } from './envProbe';
import { bindableFieldReading, exposeEnv } from './envApply';
import { entityKey } from './entityFlags';
import { Revision } from './revisionHistory';
import { mcpAsOfVersion } from './viewerOptions';
import { EntityFields, parseFields } from './entityFields';
import { revisionSecretReader } from './viewerOptions';
import { saveTextAs } from './saveTextAs';
import { EntityMetadata, TreeElement } from './types';
import { envCollection, showEnvNotice } from './envCollectionRef';
import { paymentViewFor, secondViewFor } from './viewerOptions';
import { paymentCardFor } from './paymentViewMessages';
import { PaymentFields, parsePaymentFields } from './paymentFields';
import { SecondValues, parseSecondValues } from './secondValues';
import { formOf } from './paymentSaveGate';
import { openedText } from './pinAdmission';
import { admitEntry } from './pinPrompt';
import { PinGate, silentPinGate } from './pinGate';
import type { EntityViewOptions } from './entityViewPage';
import { openKeptVersion } from './revisionDoor';

/**
 * Double-click target: the read-only viewer with per-field Copy buttons.
 *
 * <p>The door, before the page. An entry protected with its own PIN is opened ONCE, here, rather
 * than field by field — the values below are read eagerly to build the page, and a value that
 * slipped past a per-field gate would reach it as envelope JSON. Declining does not open a viewer
 * full of empty boxes; it does not open a viewer.</p>
 *
 * <p>Split out of one 160-line function on 2026-09-29 (entry-PIN plan, D1): the card's SHAPE used
 * to be read through the typed getters, which parse the stored string and keep the keys they know —
 * so a protected card read as `{}` and its frame was dropped from the page while the values sat,
 * reachable, behind the gated reader two lines further down. Every read of a secret now goes
 * through that one reader (`loadEntry`).</p>
 */
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
  const gate = await admitEntry(storage, accountId, details.id, details.name, 'view it');
  if (gate === undefined) {
    return;
  }
  const ctx: ViewerContext = { accountId, node, details, storage, doors };
  const loaded = await loadEntry(ctx, gate);
  showEntityView(viewOptions(ctx, loaded), { tab, key: entityKey(accountId, details.id) });
}

/** What every helper below is handed, so the argument lists stay short and identical. */
interface ViewerContext {
  readonly accountId: string;
  readonly node: TreeNode;
  readonly details: EntityMetadata;
  readonly storage: StorageManager;
  readonly doors: AgentDoors;
}

/** Everything the page is built from, read once behind the door. */
interface LoadedEntry {
  /** The one seam every LIVE secret is read through — PIN-gated, and every miss is SAID. */
  readonly reader: SecretReader;
  readonly hasPassword: boolean;
  readonly hasPrivateKey: boolean;
  readonly hasVpnConfig: boolean;
  readonly hasTotp: boolean;
  readonly hasAttachment: boolean;
  readonly dbConnection: string | undefined;
  readonly notes: string | undefined;
  readonly fields: EntityFields;
  readonly config: string | undefined;
  /** The record for the card's SHAPE — which fields exist and which are woven; absent for a kind that has none. */
  readonly payment: PaymentFields | undefined;
  /** WHICH second values exist decides which rows are drawn; every value is read again per request. */
  readonly seconds: SecondValues;
  readonly imageB64: string | undefined;
  readonly history: Revision[];
}

/**
 * The reads, all of them through the gate. The PIN is already in this window's session by here, so
 * nothing asks again — what the gate buys is that a slot an interrupted protect-run left locked is
 * still opened rather than handed to the page as JSON. The facts (`hasPassword` and its siblings)
 * are read as facts, never as values: they decide whether a row is drawn, and the value is read per
 * press. The card's and the second values' records are read for their SHAPE and read again per
 * request through `resolvePayment` / `resolveSecond`, so a record edited while the panel is open is
 * not shown from a stale copy.
 */
async function loadEntry(ctx: ViewerContext, gate: PinGate): Promise<LoadedEntry> {
  const { accountId, details, storage } = ctx;
  const reader = gatedSecretReader(
    storageSecretReader(storage, accountId, details.id),
    gate,
    (message) => void vscode.window.showWarningMessage(message),
  );
  return {
    reader,
    hasPassword: (await storage.getPassword(accountId, details.id)) !== undefined,
    hasPrivateKey: (await storage.getPrivateKey(accountId, details.id)) !== undefined,
    hasVpnConfig: (await storage.getVpnConfig(accountId, details.id)) !== undefined,
    hasTotp: (await storage.getTotp(accountId, details.id)) !== undefined,
    hasAttachment: (await storage.getAttachment(accountId, details.id)) !== undefined,
    dbConnection: await openedText(await storage.getDbConnection(accountId, details.id), gate),
    notes: (await openedText(await storage.getNotes(accountId, details.id), gate)) ?? details.notes,
    fields: parseFields(await openedText(await storage.getFieldsRaw(accountId, details.id), gate)),
    config: await openedText(await storage.getConfigBody(accountId, details.id), gate),
    payment: details.isPayment === true ? parsePaymentFields(await reader.paymentRaw()) : undefined,
    seconds: parseSecondValues(await reader.secondRaw()),
    imageB64: await storage.getImage(accountId, details.id),
    history: await storage.getHistory(accountId, details.id),
  };
}

/** The page's options, assembled from what was loaded — no read happens here. */
function viewOptions(ctx: ViewerContext, loaded: LoadedEntry): EntityViewOptions {
  const { accountId, node, details, storage, doors } = ctx;
  const pinnedKey = parseHostKey(details.hostKey);
  return {
    details,
    ...cardOptions(details, loaded),
    cliAliases: doors.cliAliases,
    agentDoors: doors,
    mcp: mcpFor(node, (id) => storage.getNode(accountId, id), false),
    lifetime: describeRemaining(node, Date.now()),
    // Resolved for the reader: an id names nothing, and a raw host key is a wall of base64 that
    // cannot be compared with anything. A name and a SHA256 fingerprint can.
    keySourceName: nameOf(storage, accountId, details.sshKeyEntityId),
    jumpHostName: nameOf(storage, accountId, details.jumpHostEntityId),
    hostKeyFingerprint: pinnedKey === undefined ? undefined : hostKeyFingerprint(pinnedKey),
    hasPassword: loaded.hasPassword,
    hasPrivateKey: loaded.hasPrivateKey,
    hasVpnConfig: loaded.hasVpnConfig,
    hasDbConnection: loaded.dbConnection !== undefined,
    notes: loaded.notes,
    fields: loaded.fields,
    config: loaded.config,
    // Always show a port for DB entities — the type's default when not explicit.
    ...dbDisplay(loaded.dbConnection, details.dbType),
    sshCommand: sshLineFor(details),
    resolveSecret: secretResolver(loaded.reader),
    copyAllText: async () =>
      formatEntityBlock(details, await loaded.reader.password(), await loaded.reader.dbConnection(), loaded.notes, loaded.fields),
    saveVpnConfig: () => saveVpnConfigToFile(accountId, details, storage),
    hasAttachment: loaded.hasAttachment,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    history: loaded.history,
    resolveRevision: (index) => keptValueToCopy(ctx, loaded.history[index]),
    imageDataUri: imageDataUriOf(details, loaded.imageB64),
    saveAttachment: (which) => saveAttachment(ctx, which),
    checkEnv: checkEnv,
    setEnv: (field, name) => setEnv(ctx, field, name),
  };
}

/** The card and the one-time code: the frame is drawn only for a kind that has a record. */
function cardOptions(details: EntityMetadata, loaded: LoadedEntry): Partial<EntityViewOptions> {
  return {
    payment: paymentCard(details, loaded),
    resolvePayment: loaded.payment === undefined ? undefined : paymentViewFor(loaded.reader),
    resolveSecond: secondViewFor(loaded.reader),
    hasSecondPassword: loaded.seconds.password2 !== undefined,
    ...totpOptions(details, loaded),
  };
}

/** The card's SHAPE — names and woven marks, never a value — from the record read behind the door. */
function paymentCard(details: EntityMetadata, loaded: LoadedEntry): EntityViewOptions['payment'] {
  return loaded.payment === undefined
    ? undefined
    : paymentCardFor(details.id, formOf(details.paymentForm ?? ''), loaded.payment, Math.random, loaded.seconds);
}

/**
 * The seed can be edited while the panel is open, so the code is derived per request — and the
 * webview only ever receives that code, never the seed it came from.
 */
function totpOptions(details: EntityMetadata, loaded: LoadedEntry): Pick<EntityViewOptions, 'totp' | 'totpShowNext'> {
  return {
    totp: loaded.hasTotp ? totpViewFor(loaded.reader, details.totpShowNext === true) : undefined,
    totpShowNext: loaded.hasTotp && details.totpShowNext === true,
  };
}

/** A referenced entry's name, or the fact that it is gone — never a bare id. */
function nameOf(storage: StorageManager, accountId: string, id: string | undefined): string | undefined {
  return id === undefined ? undefined : (storage.getNode(accountId, id)?.name ?? '(missing entity)');
}

function imageDataUriOf(details: EntityMetadata, imageB64: string | undefined): string | undefined {
  const mime = details.imageFileName === undefined ? undefined : imageMime(details.imageFileName);
  return imageB64 !== undefined && mime !== undefined ? `data:${mime};base64,${imageB64}` : undefined;
}

/** The stored file or image, to a place the person picks. Outside the PIN, as the two slots are. */
async function saveAttachment(ctx: ViewerContext, which: 'attachment' | 'image'): Promise<void> {
  const base64 = await storedBlob(ctx, which);
  if (base64 === undefined) {
    return;
  }
  const target = await vscode.window.showSaveDialog({
    title: which === 'image' ? 'Save image' : 'Save file',
    defaultUri: vscode.Uri.file(path.join(os.homedir(), suggestedFileName(ctx.details, which))),
  });
  if (target === undefined) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(base64, 'base64'));
  void vscode.window.showInformationMessage(`Saved to ${target.fsPath}.`);
}

/** Read at the press, not at the open: a file replaced while the panel is up is the file that is saved. */
function storedBlob(ctx: ViewerContext, which: 'attachment' | 'image'): Thenable<string | undefined> {
  const { accountId, details, storage } = ctx;
  return which === 'image' ? storage.getImage(accountId, details.id) : storage.getAttachment(accountId, details.id);
}

function suggestedFileName(details: EntityMetadata, which: 'attachment' | 'image'): string {
  return which === 'image'
    ? (details.imageFileName ?? `${details.name}.png`)
    : (details.attachmentFileName ?? `${details.name}.bin`);
}

/**
 * A FRESH terminal every time: the collection applies to terminals created after the write, so
 * probing in an old one would "prove" the variable is missing.
 */
function checkEnv(name: string): void {
  const terminal = vscode.window.createTerminal({ name: `env check: ${name}` });
  terminal.show();
  terminal.sendText(envProbeCommand(vscode.env.shell, name), true);
}

/**
 * The manual half of env bindings: the automatic write happens on save, but the collection can be
 * lost with the extension's storage — this button re-sets one variable from the CURRENT stored
 * value, on this machine, right now.
 *
 * <p>One question, three answers. `absent` is said here — there is nothing to set and nothing the
 * policy refused, so "nothing stored" is the true answer. `withheld` and `value` go through the
 * SAME notice the create and edit saves show (issue #48): there IS a password, and the sentence
 * that says why it was not written is the policy's own — and the three surfaces that apply a
 * binding must say one thing, or this button keeps a second wording that drifts.</p>
 */
async function setEnv(ctx: ViewerContext, field: Parameters<typeof bindableFieldReading>[3], name: string): Promise<boolean> {
  const reading = await bindableFieldReading(ctx.storage, ctx.accountId, ctx.details, field);
  if (reading.kind === 'absent') {
    void vscode.window.showWarningMessage('Nothing stored in that field — nothing was set.');
    return false;
  }
  if (reading.kind === 'withheld') {
    showEnvNotice({ written: [], withheld: [{ name, reason: reading.reason }] });
    return false;
  }
  exposeEnv(envCollection(), name, reading.value);
  showEnvNotice({ written: [name], withheld: [] });
  return true;
}

/**
 * The read-only viewer, on a PREVIOUS version.
 *
 * <p>Every secret comes from the revision itself, never from the current entry — that is the
 * whole point of looking. Two things the current entry's viewer offers are refused here:
 * writing the value into a terminal variable (an old password into a live variable is a
 * trap with a plausible name), and the history list (a version has no history of its own).
 * Attachments are not kept in revisions, so none are shown.</p>
 *
 * <p>Behind the LIVE entry's door (entry-PIN plan, D10): until 1.12 this asked nothing, so a kept
 * version of a protected entry — a CVV from before the PIN included — opened from the history row
 * with no PIN at all, and one from after it rendered its envelopes. `revisionDoor.openKeptVersion`
 * asks, opens every value, and the page is built from the opened copy, so the card, Copy and Copy
 * All work exactly as they do for an unprotected version.</p>
 *
 * <p>Split into the page's parts on 2026-09-29: it was one 70-line function under a disable whose own
 * comment said this plan's P6 was the reason to make it meet the limits.</p>
 *
 * <p><b>Admitted once, read silently</b> (`PLAN_typed_stored_secrets.md` T3, second plan round, finding
 * 0): every field of the opened copy is read through the viewer's own `gatedSecretReader` behind a
 * SILENT gate (`keptRead`) — the road the live viewer takes, so the two cannot come to answer
 * differently. Until T3 the page read the record raw, and a woven password went to Copy as its envelope.</p>
 */
export async function openRevisionViewer(accountId: string, node: TreeNode, revision: Revision, storage: StorageManager): Promise<void> {
  const opened = await openKeptVersion(storage, accountId, node.id, revision, { door: 'see this previous version', version: 'see it' });
  if (opened !== undefined) {
    showEntityView(await revisionViewOptions(node, opened, keptRead(accountId, node, opened)));
  }
}

/** A kept version the door has opened, and how its fields are read: the viewer's gated reader behind a silent gate. */
interface KeptRead {
  readonly reader: SecretReader;
  readonly gate: PinGate;
}

/**
 * The reader over an OPENED kept version. Its fields are plain stored forms by now (`historyPin.withValues`),
 * so the silent gate opens each as `unprotected` and asks nothing; a second `admitEntry` for a version the
 * door admitted a moment ago is exactly the second question `silentPinGate` exists to prevent.
 */
function keptRead(accountId: string, node: TreeNode, opened: Revision): KeptRead {
  const gate = silentPinGate(accountId, node.id, node.name);
  return { gate, reader: gatedSecretReader(revisionSecretReader(opened), gate, (message) => void vscode.window.showWarningMessage(message)) };
}

/** The four values the page shows as text, opened through the same silent gate. */
async function keptText(revision: Revision, gate: PinGate): Promise<Record<'notes' | 'fields' | 'config' | 'dbConnection', string | undefined>> {
  const { notes, fields, config, dbConnection } = revision.secrets;
  return {
    notes: await openedText(notes, gate),
    fields: await openedText(fields, gate),
    config: await openedText(config, gate),
    dbConnection: await openedText(dbConnection, gate),
  };
}

/** The page for one opened version — every value from the version, none from the live entry. */
async function revisionViewOptions(node: TreeNode, revision: Revision, kept: KeptRead): Promise<EntityViewOptions> {
  const details = revision.details;
  const { password, privateKey, vpnConfig, dbConnection } = revision.secrets;
  const text = await keptText(revision, kept.gate);
  return {
    details: { ...details, name: revision.name },
    // Its own line, not a suffix: glued to the name it read as part of it (owner, 2026-08-27).
    subtitle: `version replaced at ${new Date(revision.at).toLocaleString()}`,
    // Only if this version decided for itself; what its folder said back then is not kept.
    mcp: mcpAsOfVersion(details.mcp),
    hasPassword: password !== undefined,
    hasPrivateKey: privateKey !== undefined,
    hasVpnConfig: vpnConfig !== undefined,
    hasDbConnection: dbConnection !== undefined,
    notes: text.notes,
    fields: parseFields(text.fields),
    config: text.config,
    ...dbDisplay(text.dbConnection, details.dbType),
    sshCommand: sshLineFor(details),
    resolveSecret: secretResolver(kept.reader),
    ...(await revisionCard(revision, kept.reader)),
    copyAllText: async () => formatEntityBlock(details, await kept.reader.password(), text.dbConnection, text.notes),
    saveVpnConfig: () => saveRevisionVpnConfig(revision, kept.reader),
    hasAttachment: false,
    createdAt: node.createdAt,
    updatedAt: revision.at,
    history: [],
    saveAttachment: () => Promise.resolve(),
    setEnv: refuseEnv,
    checkEnv: () => void refuseEnv(),
  };
}

/**
 * A kept version's code, card and second values, from the records that version carried — the
 * `SecretReader` seam is what makes this a few lines rather than a second implementation that would
 * drift from the live one.
 */
async function revisionCard(revision: Revision, reader: SecretReader): Promise<Partial<EntityViewOptions>> {
  const { totp, payment } = revision.secrets;
  const seconds = parseSecondValues(await reader.secondRaw());
  return {
    totp: totp === undefined ? undefined : totpViewFor(reader),
    payment: await revisionPaymentCard(revision, reader, seconds),
    resolvePayment: payment === undefined ? undefined : paymentViewFor(reader),
    // NOT gated on the payment record: a credential's revision can carry a second password with no
    // payment at all, and gating it there made that row uncopyable — raised by the automated
    // reviewer. A revision with no second values answers an empty record, which is the same
    // "nothing to copy" the live viewer gives.
    resolveSecond: secondViewFor(reader),
    hasSecondPassword: seconds.password2 !== undefined,
  };
}

async function revisionPaymentCard(revision: Revision, reader: SecretReader, seconds: SecondValues): Promise<EntityViewOptions['payment']> {
  const { details } = revision;
  return revision.secrets.payment === undefined
    ? undefined
    : paymentCardFor(details.id, formOf(details.paymentForm ?? ''), parsePaymentFields(await reader.paymentRaw()), Math.random, seconds);
}

async function saveRevisionVpnConfig(revision: Revision, reader: SecretReader): Promise<void> {
  const vpnConfig = await reader.vpnConfig();
  return vpnConfig === undefined
    ? undefined
    : saveTextAs('Save VPN config (previous version)', revision.details.vpnConfigFileName ?? `${revision.name}.ovpn`, vpnConfig);
}

/** The order a history row's Copy has always taken its one value in. */
const KEPT_COPY_ORDER: readonly ((reader: SecretReader) => Thenable<string | undefined>)[] = [
  (reader) => reader.password(),
  (reader) => reader.privateKey(),
  (reader) => reader.dbConnection(),
  (reader) => reader.vpnConfig(),
];

/**
 * The live viewer's history-row Copy: that version opened through `openKeptVersion` — silent, because
 * the live viewer's door admitted the entry when it opened — then its first value read through the silent
 * reader, as the revision viewer reads it (T3). Until T3 the row copied the RAW kept string, so a version
 * of a protected entry put its envelope on the clipboard.
 */
async function keptValueToCopy(ctx: ViewerContext, revision: Revision | undefined): Promise<string | undefined> {
  const opened = revision === undefined ? undefined : await openKeptVersion(ctx.storage, ctx.accountId, ctx.node.id, revision, KEPT_COPY);
  return opened === undefined ? undefined : firstKeptValue(keptRead(ctx.accountId, ctx.node, opened), opened);
}

async function firstKeptValue(kept: KeptRead, opened: Revision): Promise<string | undefined> {
  for (const read of KEPT_COPY_ORDER) {
    const value = await read(kept.reader);
    if (value !== undefined) {
      return value;
    }
  }
  return openedText(opened.secrets.notes, kept.gate);
}

const KEPT_COPY = { door: 'copy a previous version', version: 'copy it' };

function refuseEnv(): Promise<boolean> {
  void vscode.window.showWarningMessage('This is a previous version. Set terminal variables from the current entry, not from history.');
  return Promise.resolve(false);
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
// eslint-disable-next-line complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28); it meets the ceiling when it is next touched for a reason of its own
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
