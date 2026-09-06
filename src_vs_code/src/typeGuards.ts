import { isBurnPolicy } from './entityExpiry';
import { hasValidConfigFields } from './configFormat';
import { hasValidPaymentFields } from './paymentForm';
import { DB_TYPES, ENTITY_KINDS, VPN_TYPES } from './types';
export type { BackupBundle } from './backupBundleType';
import type {
  AuthProvider,
  CommandArg,
  EntityMetadata,
  PortForward,
  SentShare,
  ShareItem,
  SharePayload,
  StoredAccount,
  TreeNode,
} from './types';

/**
 * The small shape checks `isEntityMetadata` and `isTreeNode` are built from.
 *
 * <p>Here rather than in `types.ts` for the plainest of reasons: that file reached 835 lines
 * against the 800-line ceiling when the MCP switches were added, and these are the part of it
 * nothing outside ever imported. None of them was exported, so moving them is invisible to every
 * other module.</p>
 *
 * <p>They stay together because they share one discipline: a field a guard does not know about
 * is stripped by every sync, import and sealed-slot read, so each of these is the difference
 * between a stored value and a silently discarded one.</p>
 *
 * <p>2026-09-05: the BIG guards joined them — `isEntityMetadata`, `isTreeNode`, `isShareItem` and
 * the rest — when `types.ts` reached the ceiling a second time and a new field had nowhere to go.
 * They were always built from the small ones below; the only thing keeping them apart was which file
 * they had been typed into. `types.ts` re-exports them, so no caller moved.</p>
 */


// eslint-disable-next-line complexity -- a flat list of independent field checks (every clause is one field of a forwarding rule); splitting reads worse
export function hasForwardShape(r: Record<string, unknown>): boolean {
  return (
    (r.kind === 'local' || r.kind === 'remote') &&
    typeof r.bindPort === 'number' &&
    typeof r.hostPort === 'number' &&
    typeof r.host === 'string'
  );
}

// eslint-disable-next-line complexity -- a flat list of independent field checks (every clause is one optional field of a forwarding rule); splitting reads worse
export function hasForwardExtras(r: Record<string, unknown>): boolean {
  return (
    (r.bindAddress === undefined || typeof r.bindAddress === 'string') &&
    (r.disabled === undefined || typeof r.disabled === 'boolean') &&
    (r.note === undefined || typeof r.note === 'string')
  );
}

export function isPortForwardRow(row: unknown): boolean {
  if (typeof row !== 'object' || row === null) {
    return false;
  }
  const r = row as Record<string, unknown>;
  return hasForwardShape(r) && hasForwardExtras(r);
}

export function isPortForwardArray(value: unknown): value is PortForward[] {
  return Array.isArray(value) && value.every((row) => isPortForwardRow(row));
}

export function isCommandArgArray(value: unknown): value is CommandArg[] {
  return (
    Array.isArray(value) &&
    // eslint-disable-next-line complexity
    value.every((row) => {
      if (typeof row !== 'object' || row === null) {
        return false;
      }
      const r = row as Record<string, unknown>;
      return (
        typeof r.value === 'string' &&
        (r.name === undefined || typeof r.name === 'string') &&
        (r.note === undefined || typeof r.note === 'string') &&
        (r.disabled === undefined || typeof r.disabled === 'boolean')
      );
    })
  );
}

/**
 * Binding NAMES are refused at the door when they are not variable names. The value
 * side is a name too (the variable), never a secret — secrets never travel here.
 * Rejecting the whole entity is deliberate: a binding name that cannot be a variable
 * has no honest origin, and the import is the last place it can be judged cheaply.
 */
function allStringRecord(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

export function isEnvBindings(value: unknown): value is Record<string, string> {
  if (!allStringRecord(value)) {
    return false;
  }
  return Object.values(value as Record<string, string>).every(
    (name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name),
  );
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * The MCP switches, every field optional.
 *
 * <p>Optional on purpose: a record from a NEWER build carrying a switch this one has never heard
 * of is accepted rather than rejected — the same forward-compatibility rule `kind` follows. The
 * ladder in `mcpAccess.ts` decides what the known ones mean; an unknown delete scope resolves to
 * no deleting there, which is the only safe reading.</p>
 */
// eslint-disable-next-line complexity -- a flat list of independent optional-field checks
export function isMcpAccess(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    (v.view === undefined || typeof v.view === 'boolean') &&
    (v.use === undefined || typeof v.use === 'boolean') &&
    (v.edit === undefined || typeof v.edit === 'boolean') &&
    (v.create === undefined || typeof v.create === 'boolean') &&
    (v.delete === undefined || v.delete === 'any' || v.delete === 'own')
  );
}

const KIND_FLAGS = ['isSshKey', 'isVpn', 'isDb', 'isTerminal', 'isScript'] as const;

/**
 * The legacy kind flags that have no feature module of their own, checked together.
 *
 * <p>Five independent optional booleans that `isEntityMetadata` listed one per line. `isConfig`
 * and `isPayment` are absent on purpose: each travels with the rest of its feature's fields, in
 * `hasValidConfigFields` and `hasValidPaymentFields` — the better unit once a feature owns more
 * than a flag.</p>
 *
 * <p>Extracted while the `payment` kind was being added, for exactly the reason this file exists:
 * one more clause put `isEntityMetadata` at 51 lines against a 50-line limit and `types.ts` at 815
 * against 800. The ceiling is not raised — `sizeRatchet.ts` says why a limit that can be raised is
 * advice.</p>
 */
export function hasValidKindFlags(v: Record<string, unknown>): boolean {
  return KIND_FLAGS.every((flag) => v[flag] === undefined || typeof v[flag] === 'boolean');
}

/** Field and type, as a table: five `&&` in a row is where a missing one hides. */
const SENT_SHARE_FIELDS: readonly (readonly [string, string])[] = [
  ['id', 'string'],
  ['toEmail', 'string'],
  ['entityName', 'string'],
  ['entityKind', 'string'],
  ['createdAt', 'number'],
];

export function isSentShare(value: unknown): value is SentShare {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return SENT_SHARE_FIELDS.every(([key, type]) => typeof v[key] === type);
}

/**
 * Who sent it — from the authoritative field, or from the legacy account object.
 *
 * <p>`fromEmail` is what a share carries today; items sealed by older builds carry only `from`.
 * Its own function because it answers one question, and because two ternaries in a row is where a
 * reader stops being sure which branch produced the answer.</p>
 */
function senderEmail(v: Record<string, unknown>): string | undefined {
  if (typeof v.fromEmail === 'string') {
    return v.fromEmail;
  }
  return isStoredAccount(v.from) ? v.from.email : undefined;
}

// eslint-disable-next-line complexity
export function isShareItem(value: unknown): value is ShareItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (senderEmail(v) === undefined) {
    return false;
  }
  return (
    typeof v.id === 'string' &&
    // `null` counts as absent, not as malformed. JSON has no `undefined`, so a serializer
    // that writes nulls would otherwise make this guard DROP the item — and a dropped share
    // leaves an inbox that reads as empty instead of one that explains itself.
    (v.format === undefined || v.format === null || typeof v.format === 'number') &&
    typeof v.entityName === 'string' &&
    typeof v.entityKind === 'string' &&
    (ENTITY_KINDS as readonly string[]).includes(v.entityKind) &&
    typeof v.createdAt === 'number' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.tag === 'string' &&
    typeof v.data === 'string'
  );
}

// eslint-disable-next-line complexity
export function isSharePayload(value: unknown): value is SharePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (!isTreeNode(v.node) || (v.node as TreeNode).type !== 'entity') {
    return false;
  }
  if (typeof v.secrets !== 'object' || v.secrets === null) {
    return false;
  }
  if (
    v.folderPath !== undefined &&
    !(Array.isArray(v.folderPath) &&
      v.folderPath.every(
        (seg) =>
          typeof seg === 'object' &&
          seg !== null &&
          typeof (seg as Record<string, unknown>).name === 'string',
      ))
  ) {
    return false;
  }
  return Object.values(v.secrets as Record<string, unknown>).every(
    (x) => x === undefined || typeof x === 'string',
  );
}


export function isAuthProvider(value: unknown): value is AuthProvider {
  return value === 'microsoft' || value === 'google';
}

// eslint-disable-next-line complexity
export function isStoredAccount(value: unknown): value is StoredAccount {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.accountId === 'string' &&
    typeof v.email === 'string' &&
    isAuthProvider(v.provider)
  );
}


/**
 * The relationship and agent-permission half, split out only because the whole conjunction
 * outgrew the per-function line budget. A field missing from here is stripped by every sync and
 * import, so the split is bookkeeping and never a place to stop checking.
 */
// eslint-disable-next-line complexity -- one clause per field, as above
function hasValidRelations(v: Record<string, unknown>): boolean {
  return (
    (v.dependsOn === undefined || isStringArray(v.dependsOn)) &&
    (v.depColor === undefined || typeof v.depColor === 'string') &&
    (v.mcp === undefined || isMcpAccess(v.mcp)) &&
    (v.mcpCreatedByAgent === undefined || typeof v.mcpCreatedByAgent === 'boolean')
  );
}

/**
 * The three fields every entity has, whatever kind it is.
 *
 * <p>`kind` is loose on purpose: a vault written by a NEWER build may carry one this build has
 * never heard of, and dropping the whole entity would lose data it can still show. `resolveKind`
 * falls back to the flags for anything it does not know.</p>
 */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidIdentity(v: Record<string, unknown>): boolean {
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.isSshEnabled === 'boolean' &&
    (v.kind === undefined || typeof v.kind === 'string')
  );
}

/** Where and how to CONNECT: the host, the key, the jump host, the forwards. */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidSshFields(v: Record<string, unknown>): boolean {
  return (
    (v.host === undefined || typeof v.host === 'string') &&
    (v.user === undefined || typeof v.user === 'string') &&
    (v.port === undefined || typeof v.port === 'number') &&
    (v.sshKeyPath === undefined || typeof v.sshKeyPath === 'string') &&
    (v.publicKey === undefined || typeof v.publicKey === 'string') &&
    (v.sshKeyEntityId === undefined || typeof v.sshKeyEntityId === 'string') &&
    (v.jumpHostEntityId === undefined || typeof v.jumpHostEntityId === 'string') &&
    (v.portForwards === undefined || isPortForwardArray(v.portForwards)) &&
    (v.agentForward === undefined || typeof v.agentForward === 'boolean') &&
    (v.hostKey === undefined || typeof v.hostKey === 'string')
  );
}

/** The kind discriminants that come from a closed list, plus the config key's hash. */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidKindDiscriminants(v: Record<string, unknown>): boolean {
  return (
    (v.dbType === undefined ||
      (typeof v.dbType === 'string' && (DB_TYPES as readonly string[]).includes(v.dbType))) &&
    (v.vpnType === undefined ||
      (typeof v.vpnType === 'string' && (VPN_TYPES as readonly string[]).includes(v.vpnType))) &&
    (v.vpnConfigFileName === undefined || typeof v.vpnConfigFileName === 'string') &&
    (v.configKeyHash === undefined || typeof v.configKeyHash === 'string')
  );
}

/** What an entity RUNS: a script with its variables, or a command with its arguments. */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidRunFields(v: Record<string, unknown>): boolean {
  return (
    (v.scriptLanguage === undefined || typeof v.scriptLanguage === 'string') &&
    (v.script === undefined || typeof v.script === 'string') &&
    (v.scriptVars === undefined || isCommandArgArray(v.scriptVars)) &&
    (v.command === undefined || typeof v.command === 'string') &&
    (v.commandNote === undefined || typeof v.commandNote === 'string') &&
    (v.commandArgs === undefined || isCommandArgArray(v.commandArgs))
  );
}

/**
 * The marks that describe the SECRETS rather than the connection — and the two files.
 *
 * <p>Every one of these is a claim about a stored value: that it expires, that it is woven, that it
 * is wrapped under a PIN, that the far end should be asked for one. A field a guard does not know
 * about is stripped by every sync and import, which is why each mark is listed here by name rather
 * than admitted by a loose object check.</p>
 */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidSecretMarks(v: Record<string, unknown>): boolean {
  return (
    (v.expiresAt === undefined || typeof v.expiresAt === 'number') &&
    (v.burnPolicy === undefined || isBurnPolicy(v.burnPolicy)) &&
    (v.envBindings === undefined || isEnvBindings(v.envBindings)) &&
    (v.attachmentFileName === undefined || typeof v.attachmentFileName === 'string') &&
    (v.imageFileName === undefined || typeof v.imageFileName === 'string') &&
    (v.sshAgent === undefined || typeof v.sshAgent === 'boolean') &&
    (v.hasTotp === undefined || typeof v.hasTotp === 'boolean') &&
    (v.passwordWoven === undefined || typeof v.passwordWoven === 'boolean') &&
    (v.pinProtected === undefined || typeof v.pinProtected === 'boolean') &&
    (v.pinAskOnImport === undefined || typeof v.pinAskOnImport === 'boolean')
  );
}

/**
 * Everything an entity may carry, checked by GROUP.
 *
 * <p>The groups are the point. This was one flat list of thirty-five field checks — every clause
 * independent, which is what a guard has to be, and completely opaque to a reader looking for
 * whether a particular field is admitted. Named by feature, a missing field is now missing from a
 * short list with a heading instead of from a wall. The two loose fields (`kind`, `notes`) say why
 * they are loose where they sit.</p>
 */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
export function isEntityMetadata(value: unknown): value is EntityMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    hasValidIdentity(v) &&
    hasValidSshFields(v) &&
    (v.tags === undefined || (Array.isArray(v.tags) && v.tags.every((t) => typeof t === 'string'))) &&
    hasValidKindFlags(v) &&
    hasValidKindDiscriminants(v) &&
    hasValidConfigFields(v) &&
    hasValidPaymentFields(v) &&
    hasValidRunFields(v) &&
    hasValidSecretMarks(v) &&
    hasValidRelations(v) &&
    // Loose on purpose, for the same reason `kind` is: a colour key minted by a NEWER build must
    // not make this one reject the whole entity. `isDepColorKey` (depColors.ts) is the strict
    // gate, and it is applied where the value is USED, not where it is admitted.
    (v.notes === undefined || typeof v.notes === 'string')
  );
}

/**
 * The folder-only fields: whether this is the trash, how long it keeps things, what an agent may do
 * with what is inside, and whether entries created here are asked for a PIN. Without these four the
 * flags are stripped by every sync and import — the trash would arrive on the second machine as an
 * ordinary folder full of things somebody thought they had deleted, and a folder protected while it
 * was EMPTY would lose the one record of that fact, so the next entry created there would be stored
 * with no PIN and no question asked. (Two reviewers, one finding.)
 */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidFolderExtras(v: Record<string, unknown>): boolean {
  return (
    (v.isTrash === undefined || typeof v.isTrash === 'boolean') &&
    (v.trashRetentionDays === undefined || typeof v.trashRetentionDays === 'number') &&
    (v.folderAsksForPin === undefined || typeof v.folderAsksForPin === 'boolean') &&
    (v.projectId === undefined || typeof v.projectId === 'string') &&
    (v.mcp === undefined || isMcpAccess(v.mcp))
  );
}

/** Identity and place: what it is, what it is called, and which folder holds it. */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidNodeIdentity(v: Record<string, unknown>): boolean {
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    (v.type === 'folder' || v.type === 'entity') &&
    (v.parentId === undefined || v.parentId === null || typeof v.parentId === 'string')
  );
}

/**
 * What SYNC reads: the two timestamps, the per-device version vector, the manual order.
 *
 * <p>The vector is a record of numbers rather than a shape, because a device id this build has
 * never seen is a normal thing to receive and must not make the node invalid.</p>
 */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidSyncFields(v: Record<string, unknown>): boolean {
  return (
    (v.createdAt === undefined || typeof v.createdAt === 'number') &&
    (v.updatedAt === undefined || typeof v.updatedAt === 'number') &&
    (v.sortOrder === undefined || typeof v.sortOrder === 'number') &&
    isVersionVector(v.v)
  );
}

/** Absent, or an object whose every value is a number. */
function isVersionVector(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every((n) => typeof n === 'number');
}

/** Absent, or one of the entity kinds plus the two folder-only ones. */
function isFolderType(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && ([...ENTITY_KINDS, 'any', 'project'] as string[]).includes(value))
  );
}

/**
 * A node of the tree, checked by GROUP for the same reason `isEntityMetadata` is.
 *
 * <p>`hasValidFolderExtras` is not a formality: without it the trash flag, its retention and the
 * folder's PIN preference are stripped by every sync, import and sealed-slot read — the trash
 * would arrive on the second machine as an ordinary folder full of things somebody thought they
 * had deleted.</p>
 */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
export function isTreeNode(value: unknown): value is TreeNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    hasValidNodeIdentity(v) &&
    hasValidSyncFields(v) &&
    hasValidFolderExtras(v) &&
    isFolderType(v.folderType) &&
    (v.type !== 'entity' || isEntityMetadata(v.details))
  );
}
