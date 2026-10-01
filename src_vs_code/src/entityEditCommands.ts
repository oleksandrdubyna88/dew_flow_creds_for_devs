import * as vscode from 'vscode';
import { hasMixedField, mixedEditRefusal } from './mixedFieldGuard';
import { PaymentFields, parsePaymentFields } from './paymentFields';
import { TreeNode } from './types';
import { McpAskPolicy, answersLadder, entriesUnder, inheritedAskFor, resolveMcpInTree } from './mcpAccess';
import { StorageManager } from './storageManager';
import { parseHostKey } from './hostKeyPin';
import { parseTotpSecret } from './totp';
import { describeTotp } from './totp';
import { showEntityForm } from './entityFormPanel';
import { folderKindOf } from './commandTargets';
import { imageMime } from './attachment';
import { buildDependencyCandidates } from './depGraph';
import { buildDependencyColorMap } from './depGraph';
import { collectJumpCandidates, collectLauncherCandidates } from './commandTargets';
import { newEntryOs } from './hostShell';
import { hostKeyFingerprint } from './hostKeyPin';
import { snapshotForRevision } from './revisionSnapshot';
import { carryThroughDetails } from './attachmentMeta';
import { addsSecret, applyAdditions, applyRemovals } from './applyFormSecrets';
import { warnIfTrackedCopy } from './configCommands';
import { applyEnvBindings } from './envApply';
import { heldEnvValues } from './envBinding';
import { showFolderForm } from './folderFormPanel';
import { isInTrash } from './trash';
import { KeyCandidate } from './entityFormPanel';
import { EntityMetadata } from './types';
import type { EntityFormOptions, EntityFormValues } from './entityFormPanel';
import { envCollection, showEnvNotice } from './envCollectionRef';
import { EDIT_WORDS, EditPrefill, openEntryForEdit, pinForSave } from './editPrefill';
import { EntryWriter, writerFor } from './entryWriter';
import { Sealing, chosenOnce, sealingAtWrite } from './sealingAtWrite';
import { protectEntity } from './entityPin';
import { parseFields } from './entityFields';
import { PinGate } from './pinGate';
import { firstLockedStored } from './pinAdmission';
import { admitEntry } from './pinPrompt';
import { firstPinFor } from './pinOnCreate';
import { parseSecondValues } from './secondValues';
import { describeError } from './describeError';

export type DoorsFor = (accountId: string, node: TreeNode) => Partial<Pick<EntityFormOptions, 'agentDoors' | 'entityTarget'>>;

/**
 * Edit an entry, or a folder.
 *
 * <p>For an entry, since the entry-PIN plan (2026-09-29, D2-D5), the sequence is a DOOR first:
 * `admitEntry` asks a protected entry's PIN once, `openEntryForEdit` opens what the form prefills
 * (a damaged value is a refusal, never text in a box), the woven-field guard sees the REAL record,
 * the form is shown, and the save seals every changed value under the same PIN before writing it,
 * carries the mark, and hands the terminal bindings the marked details. Until then Edit asked
 * nothing: the form opened over `{}` and Save deleted the card, the second values and a
 * credential's login/URL of every protected entry it touched.</p>
 */
export async function editNode(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
  onMutated: () => void,
  doorsFor: DoorsFor = () => ({}),
): Promise<void> {
  if (node.type === 'folder') {
    await editFolder(accountId, node, storage, onMutated);
    return;
  }
  if (node.details === undefined) {
    return;
  }
  await editEntry({ accountId, node, details: node.details, storage, onMutated, doorsFor });
}

/** What every step of an entry edit is handed. */
interface EditContext {
  readonly accountId: string;
  readonly node: TreeNode;
  readonly details: EntityMetadata;
  readonly storage: StorageManager;
  readonly onMutated: () => void;
  readonly doorsFor: DoorsFor;
}

/** The gate that admitted the entry, and what was opened behind it. */
interface Door {
  readonly gate: PinGate;
  readonly prefill: EditPrefill;
  /**
   * The FIRST PIN of an entry protected while empty, asked at most until it answers one: Save's gate
   * asks it (a decline keeps the form open), and the write seals with the same answer.
   */
  readonly firstPin: () => Promise<string | undefined>;
}

/**
 * Rule R1 — one door per click. Declined: nothing happens and nothing more is said. Refused — a
 * wrong PIN, or a value nothing can read (R4) — the reason is said, and the form does not open, so
 * nothing can overwrite what could not be read.
 */
async function openForEdit(ctx: EditContext): Promise<Door | undefined> {
  const gate = await admitEntry(ctx.storage, ctx.accountId, ctx.node.id, ctx.node.name, 'edit it');
  if (gate === undefined) {
    return undefined;
  }
  const opened = await whileUnsealing(ctx, () => openEntryForEdit(ctx.storage, ctx.accountId, ctx.node.id, gate));
  if (opened.kind === 'refused') {
    sayRefusal(opened.reason);
    return undefined;
  }
  return { gate, prefill: opened.prefill, firstPin: chosenOnce(() => firstPinFor(ctx.storage, ctx.accountId, ctx.node)) };
}

/**
 * Entry-PIN plan §8: a protected entry's form waits on up to seven scrypt opens of about a second
 * each, and a click that shows nothing for seconds reads as a click that did nothing — so the wait is
 * a notification. An entry with no locked value opens at once, and a notification that flashes for
 * an instant is noise, so it gets none.
 */
async function whileUnsealing<T>(ctx: EditContext, work: () => Promise<T>): Promise<T> {
  if ((await firstLockedStored(ctx.storage, ctx.accountId, ctx.node.id)) === undefined) {
    return work();
  }
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Opening "${ctx.node.name}" — unsealing its values under its PIN…` },
    work,
  );
}

/** A refusal with no words is a decline, and a decline says nothing more. */
function sayRefusal(reason: string): void {
  if (reason !== '') {
    warn(`${reason} Edit is not opened, so nothing can overwrite it.`);
  }
}

/** The door, the woven-field guard over the REAL record, the form, the save — each refusal ends it. */
async function editEntry(ctx: EditContext): Promise<void> {
  const door = await openForEdit(ctx);
  if (door === undefined) {
    return;
  }
  // A record with a woven field has no original to put in the form — editing it would weave the woven
  // value a SECOND time and destroy it, silently, one save at a time. The menu item is hidden by a
  // context token as well; this is the guarantee, because a command can also be reached from the
  // palette, a keybinding, or another extension. See `mixedFieldGuard.ts`. Asked of the OPENED record:
  // a locked one read as `{}` here and walked straight past the guard.
  const storedPayment = parsePaymentFields(door.prefill.paymentRaw);
  if (hasMixedField(storedPayment)) {
    warn(mixedEditRefusal(storedPayment));
    return;
  }
  const result = await showEntityForm(await editFormOptions(ctx, door, storedPayment));
  if (result === undefined) {
    return;
  }
  await saveEdit(ctx, door, result);
}

/** Everything the form is given — the opened values, the facts about what it is not given, the candidates. */
async function editFormOptions(ctx: EditContext, door: Door, storedPayment: PaymentFields): Promise<EntityFormOptions> {
  const { accountId, node, details, storage } = ctx;
  const { prefill } = door;
  const storedHostKey = parseHostKey(details.hostKey);
  const storedTotpDescription = totpDescriptionOf(prefill.totp);
  // ONE read, and both answers come from it: the record itself (so an untouched box keeps what is
  // stored) and the fact that a second password exists (so the form offers to CLEAR it).
  const storedSecond = parseSecondValues(prefill.secondRaw);
  return {
    initialPayment: storedPayment,
    mode: 'edit',
    entityId: node.id,
    initial: details,
    lockedKind: folderKindOf(storage, accountId, node.parentId ?? null),
    hasStoredPassword: prefill.hasPassword,
    // The record itself, because an untouched box KEEPS what is stored and the save needs to know
    // what that is. It reaches the panel and stops there: nothing stored is written into the page.
    storedSecond,
    hasStoredSecondPassword: storedSecond.password2 !== undefined,
    hasStoredPrivateKey: prefill.hasPrivateKey,
    hasStoredAttachment: (await storage.getAttachment(accountId, node.id)) !== undefined,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    hasStoredImage: (await storage.getImage(accountId, node.id)) !== undefined,
    // T27: the edit form shows WHAT is stored, not only that something is.
    imageDataUri: await imageDataUriOf(storage, accountId, details),
    hasStoredVpnConfig: prefill.hasVpnConfig,
    hasStoredDbConnection: prefill.dbConnection !== undefined,
    initialDbConnection: prefill.dbConnection,
    initialNotes: prefill.notes ?? details.notes,
    initialFields: parseFields(prefill.fieldsRaw),
    // Prefilled, unlike the password and the key: a config is a document somebody opens Edit to
    // change one line of, and a blank box would make every edit a retype from memory.
    initialConfigBody: prefill.configBody,
    hasStoredTotp: storedTotpDescription !== undefined,
    storedTotpDescription,
    keyCandidates: await collectKeyCandidates(storage, accountId, node.id),
    dependencyFolders: buildDependencyCandidates(storage.getNodes(accountId), node.id),
    dependencyColors: buildDependencyColorMap(storage.getNodes(accountId)),
    jumpCandidates: collectJumpCandidates(storage, accountId, node.id),
    launcherCandidates: collectLauncherCandidates(storage, accountId, node.id),
    hostOs: newEntryOs(vscode.env.remoteName, process.platform),
    hasStoredHostKey: storedHostKey !== undefined,
    hostKeyFingerprint: storedHostKey === undefined ? undefined : hostKeyFingerprint(storedHostKey),
    // What this entry would inherit if it answered no cadence of its own (#95) — the same helper
    // and the same one-line `byId` the folder branch uses, so the two forms cannot come to disagree
    // about one ancestry.
    inheritedAsk: named(inheritedAskFor(node, (id) => storage.getNode(accountId, id))),
    beforeSave: saveGateFor(ctx, door),
    ...ctx.doorsFor(accountId, node),
  };
}

/**
 * The form's LAST gate for a protected entry: the PIN, re-checked at Save (`pinForSave`). A decline
 * keeps the form open with everything typed. It only gates — the save fetches the PIN it seals with
 * for itself, a moment later, so a form that never ran this gate still cannot write in the clear.
 *
 * <p>An entry protected while EMPTY has no PIN to re-check: when the save stores a value, this gate
 * asks for the entry's first PIN (`firstPinFor` — typed twice, or checked against the folder's
 * protected entries), and a decline keeps the form open the same way. A save that stores nothing
 * secret asks nothing.</p>
 */
function saveGateFor(ctx: EditContext, door: Door): EntityFormOptions['beforeSave'] {
  if (door.prefill.locked) {
    return () => pinForSave(ctx.storage, door.gate, warn).then((pin) => pin !== undefined);
  }
  return protectedWhileEmpty(ctx, door) ? (values) => firstPinAgreed(values, door) : undefined;
}

/** Marked, and holding nothing when the form opened — *Protect with a PIN…* on an empty entry. */
function protectedWhileEmpty(ctx: EditContext, door: Door): boolean {
  return ctx.details.pinProtected === true && !door.prefill.held;
}

async function firstPinAgreed(values: EntityFormValues, door: Door): Promise<boolean> {
  return !(await addsSecret(values)) || (await door.firstPin()) !== undefined;
}

/** The form is told a seed exists and how it is configured — never the seed itself. */
function totpDescriptionOf(seed: string | undefined): string | undefined {
  const parsed = seed === undefined ? undefined : parseTotpSecret(seed);
  return parsed === undefined ? undefined : describeTotp(parsed.config);
}

async function imageDataUriOf(storage: StorageManager, accountId: string, details: EntityMetadata): Promise<string | undefined> {
  const b64 = await storage.getImage(accountId, details.id);
  const mime = details.imageFileName === undefined ? undefined : imageMime(details.imageFileName);
  return b64 !== undefined && mime !== undefined ? `data:${mime};base64,${b64}` : undefined;
}

function warn(message: string): void {
  void vscode.window.showWarningMessage(message);
}

/**
 * Whether this save seals, and with what, decided immediately before the first write
 * (`sealingAtWrite`): a protected entry's PIN is fetched at the moment of use — the window's grant
 * when it still opens the entry, a fresh question when it does not — and an entry whose protection
 * CHANGED while the form was open, either way, is refused with the sentence that says so. The writer
 * used to be chosen from what the entry was when Edit opened, so an entry protected meanwhile got the
 * typed value in the clear. `stopped` means the person declined, or was told why — and the form has
 * already closed, so what was typed is gone; the gate above makes that a moment's race, not the
 * ordinary road.
 */
async function sealingFor(ctx: EditContext, door: Door, result: EntityFormValues): Promise<Sealing> {
  const opened = { locked: door.prefill.locked, marked: ctx.details.pinProtected === true, held: door.prefill.held };
  return sealingAtWrite(ctx.storage, door.gate, opened, EDIT_WORDS, warn, { adds: await addsSecret(result), choose: door.firstPin });
}

async function saveEdit(ctx: EditContext, door: Door, result: EntityFormValues): Promise<void> {
  const sealing = await sealingFor(ctx, door, result);
  if (sealing.kind === 'stopped') {
    return;
  }
  // The one road to a writer (`entryWriter.writerFor`): sealing for a sealed proof, plain — re-checked under the lease — for a plain one.
  const writer = writerFor(ctx.storage, ctx.accountId, ctx.node.id, sealing, door.prefill);
  const written = await writeEdit(ctx, result, writer, sealing);
  if (written === undefined) {
    return;
  }
  await afterSave(ctx, result, written);
}

/**
 * The writes, in the one order that keeps the invariant: an orphaned secret is the only torn state
 * allowed to exist. The snapshot first — the whole point of history is being able to see what a
 * change changed, which is only knowable from the old state. Then ADDITIONS, so the node never
 * claims a value that was not written; then the node; then REMOVALS, so no node outlives a value it
 * still claims. Two rounds of the plan gate shaped this, including finding that the first version
 * of the rule destroyed data on delete and that a single `applySecrets` call cannot be right for a
 * save that both adds and clears.
 *
 * <p>For a protected entry every addition goes through the sealing writer, and `protectEntity` runs
 * afterwards as an idempotent sweep. A seal that throws part-way leaves every slot either sealed or
 * not yet written, never plaintext — which is what the sentence says.</p>
 */
async function writeEdit(
  ctx: EditContext,
  result: EntityFormValues,
  writer: EntryWriter,
  sealing: Sealing,
): Promise<EntityMetadata | undefined> {
  const { accountId, node, storage } = ctx;
  await storage.recordRevision(
    accountId,
    node.id,
    await snapshotForRevision(storage, accountId, { id: node.id, name: node.name, details: ctx.details }),
  );
  // The form's answer plus everything an edit must not lose — the PIN mark among it (D3).
  const written = carryThroughDetails(result, ctx.details, storage.getAccount(accountId)?.email, Date.now());
  try {
    await applyAdditions(writer, accountId, node.id, result);
    await storage.updateNodeFields(accountId, node.id, { name: result.details.name, details: written });
    await applyRemovals(storage, accountId, node.id, result);
    await sweepIfSealed(ctx, sealing);
  } catch (error) {
    warn(
      `Saving "${node.name}" stopped part-way: ${describeError(error)}. Nothing was stored in the clear; `
      + 'open it again to check what was saved.',
    );
    return undefined;
  }
  return written;
}

/** Idempotent, and cheap when everything is already sealed: it reads the slots and wraps only a plain one. */
async function sweepIfSealed(ctx: EditContext, sealing: Sealing): Promise<void> {
  if (sealing.kind === 'sealed') {
    await protectEntity(ctx.storage, ctx.accountId, ctx.node.id, sealing.pin);
  }
}

/**
 * After the secrets land, so the values written are the ones just saved — and FROM the values the
 * form carried, so a field the person just typed is written from what they typed, while a field
 * they left alone is read from storage and, if that value is PIN-locked, reported as withheld
 * rather than skipped (issue #48). The WRITTEN details, not the form's: the form's carry no PIN
 * mark, and the mark is what withholds a value the wrap cannot (D5). The old bindings are passed so
 * a renamed or switched-off variable is deleted, not orphaned. What was written and what was not is
 * SAID: the checkbox used to write in silence, and the person looked at an already-open terminal
 * and saw nothing.
 */
async function afterSave(ctx: EditContext, result: EntityFormValues, written: EntityMetadata): Promise<void> {
  void warnIfTrackedCopy(result.details);
  await applyDependencyColors(ctx.storage, ctx.accountId, result.dependsOnColors);
  showEnvNotice(
    await applyEnvBindings(envCollection(), ctx.storage, ctx.accountId, written, ctx.details.envBindings, heldEnvValues(result)),
  );
  ctx.onMutated();
}

/**
 * A folder's own form — its name, and the agent access its contents inherit.
 *
 * <p>This used to be `promptFolderName`, an input box with one field in it, because a folder had
 * nothing else to say. Agent access is inherited from the folder, so there is now a second thing,
 * and five permissions do not fit in a text prompt.</p>
 *
 * <p>An empty name leaves the folder alone rather than blanking it: the box comes back empty when
 * somebody clears it and saves, and a nameless folder is not a thing anyone asked for.</p>
 */
// eslint-disable-next-line complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28); it meets the ceiling when it is next touched for a reason of its own
export async function editFolder(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
  onMutated: () => void,
): Promise<void> {
  const nodes = storage.getNodes(accountId);
  const byId = (id: string): TreeNode | undefined => storage.getNode(accountId, id);
  // What this folder is subject to from above, so the form can say so instead of claiming
  // nothing here is reachable while an open parent says otherwise.
  const resolved = resolveMcpInTree(node, byId);
  const result = await showFolderForm({
    name: node.name,
    mcp: node.mcp,
    entryCount: entriesUnder(node.id, nodes),
    // `answersLadder`, not "has an mcp object": a record of just `{ ask: 'never' }` answers the
    // cadence and leaves the ladder inherited, and the form has to show what is actually in force.
    inherited:
      !answersLadder(node.mcp) && resolved.source === 'folder' && resolved.folder !== undefined
        ? { access: resolved.access, from: resolved.folder.name }
        : undefined,
    // Resolved from the PARENT rather than from this node, so the Inherit option tells the truth
    // whatever this folder says itself — see `inheritedAskFor`.
    inheritedAsk: named(inheritedAskFor(node, byId)),
    inTrash: isInTrash(node, byId),
  });
  if (result === undefined) {
    return;
  }
  await storage.updateNodeFields(accountId, node.id, {
    name: result.name.length > 0 ? result.name : node.name,
    mcp: result.mcp,
  });
  onMutated();
}

/** The resolver answers with the NODE; a form wants its name. The one line between the two. */
function named(
  answer: { ask: McpAskPolicy; from: TreeNode } | undefined,
): { ask: McpAskPolicy; from: string } | undefined {
  return answer === undefined ? undefined : { ask: answer.ask, from: answer.from.name };
}

// eslint-disable-next-line complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28); it meets the ceiling when it is next touched for a reason of its own
export async function collectKeyCandidates(
  storage: StorageManager,
  accountId: string,
  excludeEntityId: string,
): Promise<KeyCandidate[]> {
  const candidates: KeyCandidate[] = [];
  for (const node of storage.getNodes(accountId)) {
    if (node.type !== 'entity' || node.id === excludeEntityId || !node.details) {
      continue;
    }
    const hasKey =
      node.details.isSshKey === true ||
      node.details.sshKeyPath !== undefined ||
      (await storage.getPrivateKey(accountId, node.id)) !== undefined;
    if (hasKey) {
      candidates.push({ id: node.id, name: node.name });
    }
  }
  return candidates;
}

/**
 * Stamp the picked colour onto the entities this one now depends ON.
 *
 * <p>A write to a DIFFERENT record than the one being saved, and deliberately so: the colour
 * belongs to the target, which is what makes "change it once and every dependent follows" true
 * with no propagation code anywhere — the dependents do not store a colour to update. The cost
 * is this one extra write, and a crash between the two leaves the colour unset, which the next
 * save re-picks. Self-healing, and the same single-node-at-a-time shape every other mutator
 * here has.</p>
 *
 * <p>Unchanged colours are skipped rather than rewritten: a rewrite would bump the target's
 * version vector and make an untouched entity look edited to every other machine.</p>
 */
export async function applyDependencyColors(
  storage: StorageManager,
  accountId: string,
  picks: readonly { targetId: string; color: string }[],
): Promise<void> {
  for (const pick of picks) {
    const target = storage.getNode(accountId, pick.targetId);
    if (needsColor(target, pick.color)) {
      await storage.updateDetailsFields(accountId, target.id, { depColor: pick.color });
    }
  }
}

/** An entry that exists and does not already carry this colour — the only target worth a write. */
function needsColor(target: TreeNode | undefined, color: string): target is TreeNode {
  return target?.details !== undefined && target.details.depColor !== color;
}

/** Persist the password/private-key changes coming out of the form. */
/**
 * Change one config-only field on an entity, leaving everything else exactly as it was.
 *
 * <p>A read-modify-write rather than a targeted setter, because `updateNode` takes a whole node —
 * and spelling the spread at both call sites is how one of them eventually drops a field nobody
 * was thinking about.</p>
 */
export async function updateConfigDetails(
  storage: StorageManager,
  element: { accountId: string; node: TreeNode },
  change: Partial<EntityMetadata>,
): Promise<void> {
  const details = element.node.details;
  if (details === undefined) {
    return;
  }
  await storage.updateDetailsFields(element.accountId, element.node.id, change);
}
