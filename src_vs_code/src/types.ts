export type AuthProvider = 'microsoft' | 'google';

export type NodeType = 'folder' | 'entity';

/** Account profile as persisted (folders are derived from stored nodes). */
export interface StoredAccount {
  accountId: string;
  email: string;
  provider: AuthProvider;
}

/** Full profile shape used on the backup wire format. */
export interface AccountProfile extends StoredAccount {
  folders: TreeNode[];
}

/**
 * One argument of a CLI command, on its own row.
 *
 * <p>A row rather than a word in a string, because the thing people forget is not the
 * command — it is which value belongs to which environment and why. `note` is that
 * explanation; `disabled` keeps a flag you are not using now but will want back, instead
 * of making you retype it from memory.</p>
 */
export interface CommandArg {
  value: string;
  note?: string;
  disabled?: boolean;
}

export interface EntityMetadata {
  id: string;
  name: string;
  host?: string;
  user?: string;
  port?: number;
  sshKeyPath?: string;
  /** Public key content — non-sensitive, kept in globalState metadata. */
  publicKey?: string;
  /**
   * Id of another entity (same account) whose key is used for SSH.
   * Takes priority over this entity's own key/path when connecting.
   */
  sshKeyEntityId?: string;
  isSshEnabled: boolean;
  /** Marks this entity as an SSH key pair (enables "Install to system"). */
  isSshKey?: boolean;
  /** Marks this entity as a VPN (type + uploaded config file). */
  isVpn?: boolean;
  vpnType?: VpnType;
  /** Marks this entity as a database (type + connection string secret). */
  isDb?: boolean;
  dbType?: DbType;
  /** Original filename of the uploaded VPN config (content is a secret). */
  vpnConfigFileName?: string;
  /** Marks this entity as a CLI command (the `terminal` kind). */
  isTerminal?: boolean;
  /** The base command, e.g. `aws sso login`. Arguments live in `commandArgs`. */
  command?: string;
  /** Arguments, one per row, each with an optional explanation. */
  commandArgs?: CommandArg[];
  /** What the command is for, shown under the input. */
  commandNote?: string;
  /** Secret field -> terminal env variable NAME (values never travel; see envBinding.ts). */
  envBindings?: Record<string, string>;
  /** Display name of the encrypted attachment (content in SecretStorage). */
  attachmentFileName?: string;
  /** Display name of the encrypted image (content in SecretStorage). */
  imageFileName?: string;
  notes?: string;
}

export type VpnType = 'openvpn' | 'wireguard' | 'ikev2' | 'l2tp' | 'other';

/** The five entity kinds the form's Type selector offers. */
export type EntityKind = 'credential' | 'ssh' | 'sshkey' | 'vpn' | 'db' | 'terminal';

export const ENTITY_KINDS: readonly EntityKind[] = [
  'credential',
  'ssh',
  'sshkey',
  'vpn',
  'db',
  'terminal',
];

/**
 * How each kind is named and iconed in the UI.
 *
 * One table, because there were three: the entity form's type selector, the folder-type
 * picker, and the tree's icon chooser each carried their own copy. Adding `terminal`
 * reached two of them and the folder picker kept offering five types — so a folder of the
 * new kind could not be created at all, and the feature was unreachable for anyone whose
 * account already existed and therefore never got the new default folder.
 */
export const ENTITY_KIND_LABELS: Readonly<Record<EntityKind, { label: string; icon: string }>> = {
  credential: { label: 'Credential', icon: 'lock' },
  ssh: { label: 'SSH connection', icon: 'remote' },
  sshkey: { label: 'SSH key', icon: 'key' },
  vpn: { label: 'VPN', icon: 'shield' },
  db: { label: 'Database', icon: 'database' },
  terminal: { label: 'Terminal command', icon: 'terminal' },
};

/** A folder's declared content type; 'any' = unrestricted. */
/** `project` is a folder-only type: a folder that carries the whole default set inside. */
export type FolderType = EntityKind | 'any' | 'project';

/** The kind an entity's flags map to (priority: terminal > db > vpn > key > ssh). */
export function kindOf(d: EntityMetadata | undefined): EntityKind {
  // First, because a command entry has none of the other flags and every other kind
  // would otherwise fall through to 'credential' and lose its identity in the tree.
  if (d?.isTerminal) {
    return 'terminal';
  }
  if (d?.isDb) {
    return 'db';
  }
  if (d?.isVpn) {
    return 'vpn';
  }
  if (d?.isSshKey) {
    return 'sshkey';
  }
  if (d?.isSshEnabled) {
    return 'ssh';
  }
  return 'credential';
}

export type DbType = 'postgres' | 'mysql' | 'mssql' | 'mongodb';

export const DB_TYPES: readonly DbType[] = ['postgres', 'mysql', 'mssql', 'mongodb'];

export const VPN_TYPES: readonly VpnType[] = [
  'openvpn',
  'wireguard',
  'ikev2',
  'l2tp',
  'other',
];

/**
 * One node of a profile's credentials tree. Nodes are persisted FLAT in
 * `globalState` (no `children` written to storage); the tree shape is
 * derived from `parentId` at render time.
 */
export interface TreeNode {
  id: string;
  name: string;
  type: NodeType;
  parentId?: string | null;
  details?: EntityMetadata;
  children?: TreeNode[];
  /** Last modification time (ms epoch) — tiebreak for concurrent edits. */
  updatedAt?: number;
  /** Version vector (deviceId -> seq) — causal conflict resolution. */
  v?: Record<string, number>;
  /** Folders only: the entity kind this folder holds ('any' = unrestricted). */
  folderType?: FolderType;
  /** Manual position among siblings (folders); lower comes first. */
  sortOrder?: number;
}

/** A person discovered on a vault location (folder or server). */
/**
 * Everyone in a team list except the account whose team is being shown.
 *
 * The list a transport returns is every vault owner it can see, INCLUDING the caller —
 * neither the server's `/api/team` nor the folder scan excludes you, because neither of
 * them knows which of your accounts is being looked at. So the account you are looking
 * at appeared under its own Team, offering to share a credential with itself.
 *
 * Your OTHER accounts deliberately stay. Sending a credential from a work vault to a
 * personal one is a real thing people do, and it is the only way to move one between
 * them; they keep `isSelf`, so the UI still marks them "(you)".
 *
 * Matched on the account id OR on email+provider, and both are needed: the folder
 * transport reports the real local account id, while the server transport keys members
 * by email and reports THAT as the id, so the ids never line up for it. Email alone
 * would be wrong in the other direction — the same address signed in through two
 * providers is two vaults, not one.
 */
export function teamOthers(account: StoredAccount, members: TeamMember[]): TeamMember[] {
  const sameEmail = (other: StoredAccount) =>
    other.email.toLowerCase() === account.email.toLowerCase();

  return members.filter(
    (m) =>
      m.account.accountId !== account.accountId &&
      !(sameEmail(m.account) && m.account.provider === account.provider),
  );
}

export interface TeamMember {
  account: StoredAccount;
  /** Vault file name — folder transport only. */
  fileName?: string;
  /** The location (folder path or server URL) this member was found in. */
  location: string;
  /**
   * What a share to this person is cryptographically bound to:
   * the accountId (folder transport) or the email (server transport).
   */
  shareKeyId: string;
  isSelf: boolean;
}

/** A pending share addressed to one of MY accounts. */
export interface OwnedShare {
  /** The LOCAL account profile an accepted item is imported into. */
  accountId: string;
  /** The value the item's encryption is bound to (see TeamMember). */
  shareKeyId: string;
  item: ShareItem;
}

/** Element type of the sidebar tree. */
export type TreeElement =
  | { kind: 'account'; account: StoredAccount }
  | { kind: 'node'; accountId: string; node: TreeNode }
  | { kind: 'teamScope'; account: StoredAccount }
  | { kind: 'teamMember'; member: TeamMember; viaAccountId: string }
  | { kind: 'sharedRoot' }
  | { kind: 'sharedSender'; email: string }
  | { kind: 'sharedItem'; share: OwnedShare };

/** One entity shared to this vault's owner (lives PLAINTEXT in the
 * envelope's `shares` array; salt/iv/tag/data encrypt the SharePayload
 * with scrypt(recipientAccountId + one-time share PIN)). */
export interface ShareItem {
  id: string;
  /** Sender email — stamped by the server, or taken from `from` on folders. */
  fromEmail: string;
  fromName?: string;
  /** Full sender account (folder transport; absent on server items). */
  from?: StoredAccount;
  entityName: string;
  entityKind: EntityKind;
  createdAt: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
  /** scrypt params of the sealed payload; absent = legacy N=2^15. */
  kdfN?: number;
  kdfR?: number;
  kdfP?: number;
}

/** What a share item decrypts to. */
export interface SharePayload {
  node: TreeNode;
  secrets: {
    password?: string;
    privateKey?: string;
    vpnConfig?: string;
    dbConnection?: string;
    notes?: string;
  };
  /** Folder chain (shared folder inclusive) recreated on accept. */
  folderPath?: Array<{ name: string; folderType?: FolderType }>;
}

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

/** The decrypted payload of a per-profile .enc backup file. */
export interface BackupBundle {
  nodes: TreeNode[];
  /** entityId -> password. Only entities that had a stored password appear. */
  passwords: Record<string, string>;
  /** entityId -> private key content. Absent in pre-0.5 backups. */
  privateKeys?: Record<string, string>;
  /** entityId -> VPN config file content. Absent in pre-0.8 backups. */
  vpnConfigs?: Record<string, string>;
  /** entityId -> DB connection string. Absent in pre-0.9 backups. */
  dbConnections?: Record<string, string>;
  /** entityId -> attachment content, base64. Absent in older backups. */
  attachments?: Record<string, string>;
  /** entityId -> image content, base64. Absent in older backups. */
  images?: Record<string, string>;
  /** entityId -> notes. Moved out of plaintext metadata in 0.20. */
  notes?: Record<string, string>;
  /**
   * nodeId -> tombstone. Since 0.22 an object `{ deletedAt, v }`; pre-0.22
   * backups carry a bare ms-epoch number, normalized in on read.
   */
  tombstones?: Record<string, { deletedAt: number; v: Record<string, number> } | number>;
  /** Per-profile version-vector horizon (max seq per device). Since 0.22. */
  horizon?: Record<string, number>;
  /** When this bundle was written (ms epoch). Since 0.6. */
  exportedAt?: number;
}

export function isAuthProvider(value: unknown): value is AuthProvider {
  return value === 'microsoft' || value === 'google';
}

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

function isCommandArgArray(value: unknown): value is CommandArg[] {
  return (
    Array.isArray(value) &&
    value.every((row) => {
      if (typeof row !== 'object' || row === null) {
        return false;
      }
      const r = row as Record<string, unknown>;
      return (
        typeof r.value === 'string' &&
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
function isEnvBindings(value: unknown): value is Record<string, string> {
  if (!allStringRecord(value)) {
    return false;
  }
  return Object.values(value as Record<string, string>).every(
    (name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name),
  );
}

function allStringRecord(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

export function isEntityMetadata(value: unknown): value is EntityMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.isSshEnabled === 'boolean' &&
    (v.host === undefined || typeof v.host === 'string') &&
    (v.user === undefined || typeof v.user === 'string') &&
    (v.port === undefined || typeof v.port === 'number') &&
    (v.sshKeyPath === undefined || typeof v.sshKeyPath === 'string') &&
    (v.publicKey === undefined || typeof v.publicKey === 'string') &&
    (v.sshKeyEntityId === undefined || typeof v.sshKeyEntityId === 'string') &&
    (v.isSshKey === undefined || typeof v.isSshKey === 'boolean') &&
    (v.isVpn === undefined || typeof v.isVpn === 'boolean') &&
    (v.isDb === undefined || typeof v.isDb === 'boolean') &&
    (v.dbType === undefined ||
      (typeof v.dbType === 'string' && (DB_TYPES as readonly string[]).includes(v.dbType))) &&
    (v.vpnType === undefined ||
      (typeof v.vpnType === 'string' && (VPN_TYPES as readonly string[]).includes(v.vpnType))) &&
    (v.vpnConfigFileName === undefined || typeof v.vpnConfigFileName === 'string') &&
    (v.isTerminal === undefined || typeof v.isTerminal === 'boolean') &&
    (v.command === undefined || typeof v.command === 'string') &&
    (v.commandNote === undefined || typeof v.commandNote === 'string') &&
    (v.commandArgs === undefined || isCommandArgArray(v.commandArgs)) &&
    (v.envBindings === undefined || isEnvBindings(v.envBindings)) &&
    (v.attachmentFileName === undefined || typeof v.attachmentFileName === 'string') &&
    (v.imageFileName === undefined || typeof v.imageFileName === 'string') &&
    (v.notes === undefined || typeof v.notes === 'string')
  );
}

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

export function isBackupBundle(value: unknown): value is BackupBundle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.nodes) || !v.nodes.every(isTreeNode)) {
    return false;
  }
  const allStrings = (record: unknown): boolean =>
    typeof record === 'object' &&
    record !== null &&
    Object.values(record as Record<string, unknown>).every((p) => typeof p === 'string');
  if (!allStrings(v.passwords)) {
    return false;
  }
  if (v.privateKeys !== undefined && !allStrings(v.privateKeys)) {
    return false;
  }
  if (v.vpnConfigs !== undefined && !allStrings(v.vpnConfigs)) {
    return false;
  }
  if (v.dbConnections !== undefined && !allStrings(v.dbConnections)) {
    return false;
  }
  if (v.attachments !== undefined && !allStrings(v.attachments)) {
    return false;
  }
  if (v.images !== undefined && !allStrings(v.images)) {
    return false;
  }
  if (v.exportedAt !== undefined && typeof v.exportedAt !== 'number') {
    return false;
  }
  if (v.tombstones !== undefined) {
    if (typeof v.tombstones !== 'object' || v.tombstones === null) {
      return false;
    }
    // Each tombstone is a legacy ms-epoch number OR an object { deletedAt, v }.
    const okTomb = Object.values(v.tombstones as Record<string, unknown>).every(
      (t) =>
        typeof t === 'number' ||
        (typeof t === 'object' && t !== null && typeof (t as { deletedAt?: unknown }).deletedAt === 'number'),
    );
    if (!okTomb) {
      return false;
    }
  }
  if (v.horizon !== undefined) {
    if (typeof v.horizon !== 'object' || v.horizon === null) {
      return false;
    }
    if (!Object.values(v.horizon as Record<string, unknown>).every((n) => typeof n === 'number')) {
      return false;
    }
  }
  return true;
}
