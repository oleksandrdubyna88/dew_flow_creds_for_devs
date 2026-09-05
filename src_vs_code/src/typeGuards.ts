import { isBurnPolicy } from './entityExpiry';
import { hasValidConfigFields } from './configFormat';
import { hasValidPaymentFields } from './paymentForm';
import { DB_TYPES, ENTITY_KINDS, VPN_TYPES } from './types';
import type { BackupBundle } from './backupBundleType';
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

// eslint-disable-next-line complexity
export function isShareItem(value: unknown): value is ShareItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  // `fromEmail` is authoritative; legacy items carry only `from`.
  const fromEmail =
    typeof v.fromEmail === 'string'
      ? v.fromEmail
      : isStoredAccount(v.from)
        ? v.from.email
        : undefined;
  if (fromEmail === undefined) {
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

export type { BackupBundle };

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

// eslint-disable-next-line complexity
export function isEntityMetadata(value: unknown): value is EntityMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.isSshEnabled === 'boolean' &&
    // An unknown kind is not a reason to reject the record — a vault written by a NEWER
    // build may carry one, and dropping the whole entity would lose data this build can
    // still show. `resolveKind` falls back to the flags for anything it does not know.
    (v.kind === undefined || typeof v.kind === 'string') &&
    (v.host === undefined || typeof v.host === 'string') &&
    (v.user === undefined || typeof v.user === 'string') &&
    (v.port === undefined || typeof v.port === 'number') &&
    (v.sshKeyPath === undefined || typeof v.sshKeyPath === 'string') &&
    (v.publicKey === undefined || typeof v.publicKey === 'string') &&
    (v.sshKeyEntityId === undefined || typeof v.sshKeyEntityId === 'string') &&
    (v.jumpHostEntityId === undefined || typeof v.jumpHostEntityId === 'string') &&
    (v.portForwards === undefined || isPortForwardArray(v.portForwards)) &&
    (v.agentForward === undefined || typeof v.agentForward === 'boolean') &&
    (v.hostKey === undefined || typeof v.hostKey === 'string') &&
    (v.tags === undefined || (Array.isArray(v.tags) && v.tags.every((t) => typeof t === 'string'))) &&
    hasValidKindFlags(v) &&
    (v.dbType === undefined ||
      (typeof v.dbType === 'string' && (DB_TYPES as readonly string[]).includes(v.dbType))) &&
    (v.vpnType === undefined ||
      (typeof v.vpnType === 'string' && (VPN_TYPES as readonly string[]).includes(v.vpnType))) &&
    (v.vpnConfigFileName === undefined || typeof v.vpnConfigFileName === 'string') &&
    hasValidConfigFields(v) &&
    (v.configKeyHash === undefined || typeof v.configKeyHash === 'string') &&
    hasValidPaymentFields(v) &&
    (v.scriptLanguage === undefined || typeof v.scriptLanguage === 'string') &&
    (v.script === undefined || typeof v.script === 'string') &&
    (v.scriptVars === undefined || isCommandArgArray(v.scriptVars)) &&
    (v.command === undefined || typeof v.command === 'string') &&
    (v.commandNote === undefined || typeof v.commandNote === 'string') &&
    (v.commandArgs === undefined || isCommandArgArray(v.commandArgs)) &&
    (v.expiresAt === undefined || typeof v.expiresAt === 'number') &&
    (v.burnPolicy === undefined || isBurnPolicy(v.burnPolicy)) &&
    (v.envBindings === undefined || isEnvBindings(v.envBindings)) &&
    (v.attachmentFileName === undefined || typeof v.attachmentFileName === 'string') &&
    (v.imageFileName === undefined || typeof v.imageFileName === 'string') &&
    (v.sshAgent === undefined || typeof v.sshAgent === 'boolean') &&
    (v.hasTotp === undefined || typeof v.hasTotp === 'boolean') &&
    (v.passwordWoven === undefined || typeof v.passwordWoven === 'boolean') &&
    (v.pinProtected === undefined || typeof v.pinProtected === 'boolean') &&
    (v.pinAskOnImport === undefined || typeof v.pinAskOnImport === 'boolean') &&
    hasValidRelations(v) &&
    // Loose on purpose, for the same reason `kind` above is: a colour key minted by a NEWER
    // build must not make this one reject the whole entity. `isDepColorKey` (depColors.ts) is
    // the strict gate, and it is applied where the value is USED, not where it is admitted.
    (v.notes === undefined || typeof v.notes === 'string')
  );
}

/**
 * The folder-only fields: whether this is the trash, how long it keeps things, and what an agent
 * may do with what is inside. Without these three the flags are stripped by every sync and
 * import, and the trash would arrive on the second machine as an ordinary folder full of things
 * somebody thought they had deleted.
 */
// eslint-disable-next-line complexity -- one clause per optional field, as every guard here is
function hasValidFolderExtras(v: Record<string, unknown>): boolean {
  return (
    (v.isTrash === undefined || typeof v.isTrash === 'boolean') &&
    (v.trashRetentionDays === undefined || typeof v.trashRetentionDays === 'number') &&
    (v.mcp === undefined || isMcpAccess(v.mcp))
  );
}

// eslint-disable-next-line complexity
export function isTreeNode(value: unknown): value is TreeNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') {
    return false;
  }
  if (v.type !== 'folder' && v.type !== 'entity') {
    return false;
  }
  if (v.parentId !== undefined && v.parentId !== null && typeof v.parentId !== 'string') {
    return false;
  }
  if (v.createdAt !== undefined && typeof v.createdAt !== 'number') {
    return false;
  }
  if (v.updatedAt !== undefined && typeof v.updatedAt !== 'number') {
    return false;
  }
  if (v.v !== undefined) {
    if (typeof v.v !== 'object' || v.v === null) {
      return false;
    }
    if (!Object.values(v.v as Record<string, unknown>).every((n) => typeof n === 'number')) {
      return false;
    }
  }
  if (v.sortOrder !== undefined && typeof v.sortOrder !== 'number') {
    return false;
  }
  // Without these two the trash flag and its retention are stripped by every sync, import and
  // sealed-slot read — the folder would arrive on the second machine as an ordinary folder full
  // of things somebody thought they had deleted.
  if (!hasValidFolderExtras(v)) {
    return false;
  }
  if (
    v.folderType !== undefined &&
    !(typeof v.folderType === 'string' &&
      ([...ENTITY_KINDS, 'any', 'project'] as string[]).includes(v.folderType))
  ) {
    return false;
  }
  if (v.type === 'entity' && !isEntityMetadata(v.details)) {
    return false;
  }
  return true;
}
