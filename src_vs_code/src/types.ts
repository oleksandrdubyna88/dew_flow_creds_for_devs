import { BurnPolicy, isBurnPolicy } from './entityExpiry';
import type { BackupBundle } from './backupBundleType';
import { ConfigFormat, hasValidConfigFields } from './configFormat';
import { McpAccess } from './mcpAccess';
import {
  isCommandArgArray,
  isEnvBindings,
  isMcpAccess,
  isPortForwardArray,
  isStringArray,
} from './typeGuards';
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
  /** Script variables name their row (`${NAME}` in the body); terminal args have none. */
  name?: string;
  value: string;
  note?: string;
  disabled?: boolean;
}

/**
 * One port-forwarding rule — a ROW, like a command argument, for the same reason: it can be
 * kept and switched off without being retyped from memory next week.
 *
 * <p>`local` is ssh's `-L` (a port here reaches a service there); `remote` is `-R`
 * (a port there reaches a service here).</p>
 */
export interface PortForward {
  kind: 'local' | 'remote';
  /** Which local interface to bind. Absent means ssh's default (loopback). */
  bindAddress?: string;
  bindPort: number;
  host: string;
  hostPort: number;
  /** Kept, but not part of the connection. */
  disabled?: boolean;
  note?: string;
}

export interface EntityMetadata {
  id: string;
  name: string;
  /**
   * What this entity IS — the discriminant (audit A4). Optional in the type only because
   * records written before it existed do not carry it; every write stamps it, and
   * `resolveKind` in `entityKind.ts` is the one place allowed to fall back to the flags
   * below. Read it through `resolveKind`, never directly.
   */
  kind?: EntityKind;
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
  /**
   * Id of another entity (same account) reached FIRST, as ssh's `-J`.
   *
   * <p>A typed reference rather than a `ProxyCommand` string, deliberately: a hostname that
   * can carry `-oProxyCommand=` is the injection `sshCommand.ts` exists to refuse.</p>
   */
  jumpHostEntityId?: string;
  /** `-L` / `-R` rules, each a row that can be switched off. */
  portForwards?: PortForward[];
  /** `-A`: let the remote host use this machine's SSH agent. */
  agentForward?: boolean;
  /**
   * The pinned host key, as `<algorithm> <base64>` (audit B10).
   *
   * <p>Its presence is what turns `StrictHostKeyChecking` from `accept-new` — which accepts
   * an impostor silently on first contact — into `yes` against a known_hosts file built from
   * exactly this line.</p>
   */
  hostKey?: string;
  /** Free labels, shown on the row and matched by the filter. */
  tags?: string[];
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
  /** Marks this entity as a stored script (the `script` kind). */
  isScript?: boolean;
  /** The script's language, for highlighting. */
  scriptLanguage?: string;
  /** The script body; `${NAME}` placeholders reference `scriptVars`. */
  script?: string;
  /** The changeable parts, pulled out of the body — named rows. */
  scriptVars?: CommandArg[];
  /** Marks this entity as a stored configuration file (the `config` kind). */
  isConfig?: boolean;
  /** What it is validated and assembled as — see `configFormat.ts` for why a format, not a language. */
  configFormat?: ConfigFormat;
  /** What materialising it writes, e.g. `appsettings.Development.json`. The body is a SECRET. */
  configFileName?: string;
  /**
   * SHA-256 of the key an application uses to read this config, or absent when nobody has opened
   * it to code. Never the key itself — see `configKey.ts` for why only the hash is kept.
   */
  configKeyHash?: string;
  /** The base command, e.g. `aws sso login`. Arguments live in `commandArgs`. */
  command?: string;
  /** Arguments, one per row, each with an optional explanation. */
  commandArgs?: CommandArg[];
  /** What the command is for, shown under the input. */
  commandNote?: string;
  /**
   * When this entry stops existing (ms epoch). Absent means it lives until deleted.
   *
   * <p>Expiry is a real delete when it comes — tombstone, every SecretStorage key, the
   * revision history — never a flag that leaves the secret in place. See entityExpiry.ts.</p>
   */
  expiresAt?: number;
  /** What ends this entry's life: a clock, one agent use, or this window closing. */
  burnPolicy?: BurnPolicy;
  /** Secret field -> terminal env variable NAME (values never travel; see envBinding.ts). */
  envBindings?: Record<string, string>;
  /** Display name of the encrypted attachment (content in SecretStorage). */
  attachmentFileName?: string;
  /** Write-time stamps (T27) — they move only when the FILE does; see attachmentMeta.ts. */
  attachmentSize?: number; attachmentChangedAt?: number; attachmentChangedBy?: string;
  imageSize?: number; imageWidth?: number; imageHeight?: number;
  imageChangedAt?: number; imageChangedBy?: string;
  /** Display name of the encrypted image (content in SecretStorage). */
  imageFileName?: string;
  /**
   * Serve this key through the extension's own SSH agent, so `ssh` and `git` can use it
   * without it ever being written to disk. A PREFERENCE, not a secret — it syncs, so a key
   * marked on one machine is served on the next one that unlocks it.
   */
  sshAgent?: boolean;
  /**
   * Whether a TOTP seed is stored for this entity (the seed itself is in SecretStorage).
   * A plaintext flag so the tree can offer *Copy One-Time Code* without a keychain read
   * per row — the same trade `isVpn` and `isDb` make for their menus.
   */
  hasTotp?: boolean;
  /**
   * Same-account entities this one DEPENDS ON — an SSH host that is unreachable without a VPN,
   * a password that belongs to a database behind one.
   *
   * <p>A typed reference like `jumpHostEntityId`, and unlike the two above it belongs to no
   * particular kind: anything can depend on anything. Ids arrive by sync, import and accepted
   * shares, so an entry here CAN dangle and a pair CAN point at each other. Nothing walks it
   * more than one hop, which is why there is no depth cap the way `resolveJumpChain` needs one;
   * a target that no longer exists is skipped at render time, never thrown on.</p>
   */
  dependsOn?: string[];
  /**
   * The shared tint, stamped on the entity that is DEPENDED ON — never on the edge, and never
   * on the dependent.
   *
   * <p>That placement IS the feature's central promise: pointing a second entity at this one
   * inherits the colour with nothing to choose, and changing it once changes every row that
   * refers here — because there is no second copy to go and update. One of
   * `DEP_COLOR_KEYS` (depColors.ts); a value this build does not recognise is ignored when
   * painting rather than rejected, so a vault written by a newer one still opens.</p>
   */
  depColor?: string;
  /**
   * What an agent may do with this entry through MCP. See `mcpAccess.ts` for the ladder.
   *
   * <p>Absence and emptiness mean different things and the difference is load-bearing: the field
   * being ABSENT means "ask the folder", an object with everything off means "decided here, and
   * the answer is nothing". An entry closed on purpose must not start obeying its folder again
   * the next time the folder is opened up.</p>
   */
  mcp?: McpAccess;
  /**
   * The agent created this entry itself. Only such entries are reachable by a delete permission
   * scoped to `own` — so "tidy up after yourself" works and "delete my production key" does not.
   */
  mcpCreatedByAgent?: boolean;
  notes?: string;
}

export type VpnType = 'openvpn' | 'wireguard' | 'ikev2' | 'l2tp' | 'other';

/** The entity kinds the form's Type selector offers. Adding one is a compile error in every
 * switch that must handle it — see `assertNever` in entityKind.ts. */
export type EntityKind = 'credential' | 'ssh' | 'sshkey' | 'vpn' | 'db' | 'terminal' | 'script' | 'config';

export const ENTITY_KINDS: readonly EntityKind[] = [
  'credential',
  'ssh',
  'sshkey',
  'vpn',
  'db',
  'terminal',
  'script',
  'config',
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
  script: { label: 'Script', icon: 'file-code' },
  config: { label: 'Config file', icon: 'settings-gear' },
};

/** A folder's declared content type; 'any' = unrestricted. */
/** `project` is a folder-only type: a folder that carries the whole default set inside. */
export type FolderType = EntityKind | 'any' | 'project';


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
  /** Last modification time (ms epoch) — tiebreak for concurrent edits, and shown to the user. */
  updatedAt?: number;
  /** When this node was first created here (ms epoch). Absent on nodes older than 0.53. */
  createdAt?: number;
  /** Version vector (deviceId -> seq) — causal conflict resolution. */
  v?: Record<string, number>;
  /** Folders only: the entity kind this folder holds ('any' = unrestricted). */
  folderType?: FolderType;
  /** Manual position among siblings (folders); lower comes first. */
  sortOrder?: number;
  /**
   * This folder is the account's trash. One per account, created on the first delete rather
   * than seeded up front — an empty Trash in a brand-new vault is a question nobody asked.
   * A flag rather than a `folderType`, deliberately: `folderType` dictates what kind of entity a
   * folder may hold, and the trash holds whatever was deleted; teaching the kind machinery about
   * a folder that accepts everything would touch the picker, the locked kind and `folderKindOf`.
   */
  isTrash?: boolean;
  /** Where it was when moved to the Trash (`null` = root) — *Restore* goes back there. Absent pre-0.80.6. */
  trashedFrom?: string | null;
  /**
   * Days after which an entry in the trash is deleted for real. Absent means kept until
   * emptied by hand. Lives on the folder rather than in VS Code settings because each account
   * has its own trash, and the choice has to travel with the vault to another machine — an
   * editor setting is about a machine, not an account.
   */
  trashRetentionDays?: number;
  /**
   * Folders only: what an agent may do with everything in here that has no answer of its own.
   *
   * <p>Inherited rather than applied once, deliberately — an entry created in this folder next
   * week gets the same permissions. "Apply to all now" would leave half a folder configured and
   * half not, with nothing on screen to tell them apart.</p>
   */
  mcp?: McpAccess;
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
  /** The filter row, pinned above the first account. Carries no data — the term lives on
   *  the provider, so typing does not rebuild the element identity. */
  | { kind: 'search' }
  /** A blank, inert row between two accounts (T29) — VS Code's tree has no real separators. */
  | { kind: 'separator'; afterAccountId: string }
  | { kind: 'account'; account: StoredAccount }
  | { kind: 'node'; accountId: string; node: TreeNode }
  /** One kept previous version of an entity, addressed by its POSITION in that
   *  entity's history — the list is capped and rewritten in place, so an index stays
   *  valid where a copy of the revision would go stale. */
  | { kind: 'revision'; accountId: string; node: TreeNode; index: number }
  /** The "Depended on by" sub-tree root under a TARGET entity. A SIBLING of the revision rows,
   *  never a replacement: an entity may have both kept versions and dependents, and the two
   *  must be expandable at the same time. */
  | { kind: 'dependents'; accountId: string; node: TreeNode }
  /** One folder holding at least one dependent, listing ONLY those — not the folder's other
   *  contents. `folderId: null` is the account root, which has no folder to jump to, which is
   *  why it is told apart by that field rather than by a separate kind: the "go to folder"
   *  button is bound to `contextValue`, and this row simply never carries the one that has it. */
  | {
      kind: 'dependentsFolder';
      accountId: string;
      targetId: string;
      folderId: string | null;
      name: string;
      entities: readonly TreeNode[];
    }
  /** A dependent entity, at a SECOND position in the tree. The same record as its own row, a
   *  different row IDENTITY — the same trick `revision` plays, and for the same reason: VS Code
   *  keys expansion and selection on `TreeItem.id`, so two positions must not share one. */
  | { kind: 'dependentEntity'; accountId: string; targetId: string; node: TreeNode }
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
  /**
   * Ed25519 signature over the share's transcript, and the key that made it.
   *
   * <p>Both optional, and that is the compatibility story: a share from an older
   * build has neither and is judged `unsigned` rather than rejected. `id` doubles
   * as the transcript's `shareId` — it is already a fresh UUID per share, so
   * there was no reason to add a second one.</p>
   *
   * <p>Only meaningful on the folder transport. The server stamps the sender from
   * a verified token, which is strictly stronger and needs no key distribution.</p>
   */
  signature?: string;
  senderPublicKey?: string;
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
    /** The canonical `otpauth://` URI — the seed and its parameters, one string. */
    totp?: string;
    /** A config file's contents. What stays behind is `configKeyHash` — see `shareFormat.ts`. */
    config?: string;
    /** A credential's login/URL, as the JSON the vault stores. */
    fields?: string;
  };
  /** Folder chain (shared folder inclusive) recreated on accept. */
  folderPath?: Array<{ name: string; folderType?: FolderType }>;
}

/**
 * The sender's receipt for one share they posted, as the server returns it.
 *
 * <p>A receipt, never a second copy: no `salt`, `iv`, `tag` or `data`. The sealed payload exists
 * once, in the recipient's inbox — putting it here too would double the exposure of every share
 * to buy a listing that does not need it.</p>
 */
export interface SentShare {
  id: string;
  toEmail: string;
  entityName: string;
  entityKind: string;
  createdAt: number;
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
    (v.isSshKey === undefined || typeof v.isSshKey === 'boolean') &&
    (v.isVpn === undefined || typeof v.isVpn === 'boolean') &&
    (v.isDb === undefined || typeof v.isDb === 'boolean') &&
    (v.dbType === undefined ||
      (typeof v.dbType === 'string' && (DB_TYPES as readonly string[]).includes(v.dbType))) &&
    (v.vpnType === undefined ||
      (typeof v.vpnType === 'string' && (VPN_TYPES as readonly string[]).includes(v.vpnType))) &&
    (v.vpnConfigFileName === undefined || typeof v.vpnConfigFileName === 'string') &&
    (v.isTerminal === undefined || typeof v.isTerminal === 'boolean') &&
    (v.isScript === undefined || typeof v.isScript === 'boolean') &&
    hasValidConfigFields(v) &&
    (v.configKeyHash === undefined || typeof v.configKeyHash === 'string') &&
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

// eslint-disable-next-line complexity, max-lines-per-function
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
  if (v.totps !== undefined && !allStrings(v.totps)) {
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
