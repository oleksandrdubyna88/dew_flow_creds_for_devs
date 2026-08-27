/* eslint-disable max-lines --
   Just over the 800-line limit since B8 added metadata sealing. One class, one concern
   (the two-tier storage); the next feature that needs room here should extract the
   sealing or the bundle import/export into their own modules instead of growing this. */
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { ProfileSnapshot } from './syncMerge';
import { quarantineUnsafeIds } from './idQuarantine';
import { SigningKeypair, generateSigningKeypair } from './shareSignature';
import { EscrowShareWrap, isEscrowShareWrap } from './orgEscrowShareWrap';
import { RemoteState, buildDefaultFolders, shouldSeedDefaults } from './defaultFolders';
import { Tombstone, VersionVector, bumpVector, mergeVectors, normalizeTombstone } from './versionVector';
import { isSelfOrDescendantIn } from './selectionResolver';
import { Revision, isRevisionList, pushRevision } from './revisionHistory';
import { MetadataError, isSealedMetadata, newMetadataKey, openMetadata, sealMetadata } from './metadataCipher';
import { ExternalSecrets } from './externalBundle';
import { stampKind } from './entityKind';
import { TRASH_FOLDER_NAME, findTrash } from './trash';
import {
  BackupBundle,
  StoredAccount,
  TreeNode,
  isStoredAccount,
  isTreeNode,
} from './types';

const ACCOUNTS_KEY = 'credSshManager.accounts';
/** Account ids that already received their one-time default folder set. */
const SEEDED_KEY = 'credSshManager.defaultsSeeded';

function nodesKey(accountId: string): string {
  return `credSshManager.nodes.${accountId}`;
}

function tombstonesKey(accountId: string): string {
  return `credSshManager.tombstones.${accountId}`;
}

function horizonKey(accountId: string): string {
  return `credSshManager.horizon.${accountId}`;
}

/** SecretStorage slot of the device key that seals the local metadata cache (audit B8). */
const METADATA_KEY_SLOT = 'credSshManager.metadataKey';

const DEVICE_ID_KEY = 'credSshManager.deviceId';
const DEVICE_SEQ_KEY = 'credSshManager.deviceSeq';

/** Per account: the id an imported entity ARRIVED with -> the id it was given here. */
const IMPORTED_IDS_KEY = 'credSshManager.importedIds';

/**
 * The entity-id part of a SecretStorage key.
 *
 * <p>These keys are built by concatenation — `${accountId}_${entityId}`, with a `:sshPrivateKey`
 * / `:vpnConfig` / `:notes` / … suffix for every kind but the password — and concatenation
 * without an escape is ambiguous. The ambiguity was reachable: an entity whose id is
 * `x:sshPrivateKey` produced exactly the key that holds entity `x`'s PRIVATE KEY, so saving the
 * crafted entity's password destroyed a real key and reading that key back returned the
 * attacker's password, with no error anywhere.</p>
 *
 * <p>Ordinary ids are uuids, so accepting a share cannot reach this (`shareInbox` mints a fresh
 * local id) — but import and restore write an envelope's nodes with their own ids.</p>
 *
 * <p><b>Only the three separator characters are escaped, and a uuid contains none of them</b>,
 * so every key an installed build already wrote is unchanged. `%` is escaped first and for that
 * exact reason: without it an entity literally named `x%3AsshPrivateKey` would encode onto the
 * same key as one named `x:sshPrivateKey`, trading one collision for another.</p>
 */
function keyPart(entityId: string): string {
  return entityId.replace(/%/g, '%25').replace(/:/g, '%3A').replace(/_/g, '%5F');
}

/** Tenant-scoped SecretStorage key: `${accountId}_${entityId}`. */
function secretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}`;
}

/** SecretStorage key for an entity's SSH private key content. */
function privateKeySecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:sshPrivateKey`;
}

/**
 * The account's own Ed25519 signing identity for shares on the folder transport.
 * Keyed by account, not by entity — it identifies the signer, not a credential.
 */
function signingKeySecretKey(accountId: string): string {
  return `${accountId}:shareSigningKey`;
}

/**
 * This officer's share of the organisation's recovery key.
 *
 * <p>Keyed by account like the signing identity, and in SecretStorage rather than in the vault
 * payload for one reason worth stating: the payload syncs to a server, and a share that syncs
 * is a share sitting beside the very escrow wraps it exists to open. On the OS keychain it
 * stays on the machines its owner actually uses — which is also why accepting an invite is
 * something an officer does once per machine rather than once.</p>
 */
function orgEscrowShareSecretKey(accountId: string): string {
  return `${accountId}:orgEscrowShare`;
}

/** SecretStorage key for an entity's VPN config file content. */
function vpnConfigSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:vpnConfig`;
}

/** SecretStorage key for an entity's notes (kept out of plaintext globalState). */
function notesSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:notes`;
}

/** SecretStorage key for a config entity's file contents — a secret, exactly like the notes. */
function configSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:config`;
}

/**
 * Every SecretStorage key one entity owns.
 *
 * <p>Extracted while the config body was being added, because the list existed TWICE, written
 * out by hand in `removeAccount` and in the delete path — and the failure mode of that shape is
 * silent in the worst possible way: a kind added to one block and not the other leaves a
 * plaintext secret in the OS keychain after the entity that explained it is gone, where nothing
 * will ever look for it again. It is the same duplication audit A1 removed from the two export
 * walks, in the one place it had survived.</p>
 *
 * <p>The history key is included: previous versions of a secret are secrets.</p>
 */
function entitySecretKeys(accountId: string, entityId: string): readonly string[] {
  return [
    secretKey(accountId, entityId),
    privateKeySecretKey(accountId, entityId),
    vpnConfigSecretKey(accountId, entityId),
    dbConnSecretKey(accountId, entityId),
    notesSecretKey(accountId, entityId),
    attachmentSecretKey(accountId, entityId),
    historySecretKey(accountId, entityId),
    imageSecretKey(accountId, entityId),
    totpSecretKey(accountId, entityId),
    configSecretKey(accountId, entityId),
  ];
}

function historySecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:history`;
}

function attachmentSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:attachment`;
}

function imageSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:image`;
}

/** SecretStorage key for an entity's DB connection string. */
function dbConnSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:dbConn`;
}

/** SecretStorage key for an entity's TOTP seed (the canonical `otpauth://` URI). */
function totpSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${keyPart(entityId)}:totp`;
}

/**
 * One account's validated tree, remembered against the memento value it was read from.
 * `children` memoizes `getChildren` per parent for that same value.
 */
interface NodeCacheEntry {
  raw: unknown;
  nodes: readonly TreeNode[];
  /** Keyed by parent id; `null` is the root, as `getChildren` spells it. */
  children: Map<string | null, readonly TreeNode[]>;
  /**
   * Keyed by node id, built with the entry rather than on demand.
   *
   * <p>`getNode` was a linear scan of the whole profile, which was fine while it answered
   * single questions. It stopped being fine when a tree row started asking one per repaint —
   * a folder of 300 entries times a vault of a thousand nodes is a million comparisons per
   * keystroke in the filter box. The map costs one pass over a list that was just built.</p>
   */
  byId: Map<string, TreeNode>;
}

/** Folders first (manual order, then name), entities alphabetical. */
// eslint-disable-next-line complexity
function siblingOrder(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) {
    return a.type === 'folder' ? -1 : 1;
  }
  if (a.type === 'folder') {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) {
      return ao - bo;
    }
  }
  return a.name.localeCompare(b.name);
}

/**
 * Multi-tenant two-tier storage:
 *  - `globalState`  → account profiles + one flat node list per account
 *  - `SecretStorage` → `${accountId}_${entityId}` -> password
 *                      (passwords are never written to globalState)
 *
 * All mutating methods return new arrays/objects; stored data is never
 * mutated in place — and what `getNodes`/`getChildren` hand out is frozen,
 * because it is shared with every other caller until the next write.
 */
export class StorageManager implements vscode.Disposable {
  /**
   * Per-account read cache (audit 2026-08-25, C3).
   *
   * <p>`getNodes` used to validate every stored node on every call, and `getChildren` to filter
   * and sort the whole account per call — the tree filter makes ~43 such calls per keystroke over
   * a thousand entities. The cache is validated by the IDENTITY of the memento's stored value
   * rather than by invalidation hooks: `ExtHostMemento` hands back the same object until
   * something writes the key — this window through `update` (which stores a JSON clone) or
   * another window of the same profile through the change broadcast — so a different reference
   * means a different tree and an equal one means the cache is exact. No mutator has to remember
   * to clear it, and a second window's edit is seen on the very next read.</p>
   */
  private readonly nodeCache = new Map<string, NodeCacheEntry>();

  /**
   * How many times each profile's local state was written through this instance — one half of
   * `changeToken`. Bumped AFTER the write lands, so a token read that raced ahead of a write is
   * older than the write and the next cycle sees the difference.
   */
  private readonly mutations = new Map<string, number>();
  /** Bumped on every SecretStorage change event — including another window's writes. */
  private secretsEpoch = 0;
  /** The memento values `changeToken` last saw for each profile, to notice a foreign write. */
  private readonly seenRefs = new Map<string, readonly unknown[]>();
  private readonly secretsListener: vscode.Disposable;

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
  ) {
    // A password written by another window of this profile lands in the keychain without
    // passing through this instance; the change event is the only way to learn of it.
    this.secretsListener = secrets.onDidChange(() => {
      this.secretsEpoch += 1;
    });
  }

  dispose(): void {
    this.secretsListener.dispose();
  }

  // ---------- metadata sealing (audit 2026-08-25, B8) ----------

  /**
   * The device key that seals the node slots in `globalState`. Held in memory after `init`;
   * kept in `SecretStorage`, never derived from a PIN and never synced — so the tree stays
   * readable while the OS session is, and a lost keychain loses only a cache the next sync
   * rebuilds from the encrypted remote.
   */
  private metadataKey: Buffer | undefined;

  /**
   * Why sealed metadata could not be opened, when that has happened — one sentence for the
   * activation path to surface. Reading a faulted slot yields an empty tree, never a throw:
   * an unreadable cache must not take the whole extension down.
   */
  metadataFault: string | undefined;

  /**
   * Load or mint the device key, then seal any plaintext node slots left by earlier versions.
   * Runs once, awaited by `activate` before anything reads a tree — reads that raced a
   * migration would see a slot flip identity mid-render.
   */
  // eslint-disable-next-line complexity
  async init(): Promise<void> {
    const stored = await this.secrets.get(METADATA_KEY_SLOT);
    if (stored !== undefined && Buffer.from(stored, 'base64').length === 32) {
      this.metadataKey = Buffer.from(stored, 'base64');
    } else {
      this.metadataKey = newMetadataKey();
      await this.secrets.store(METADATA_KEY_SLOT, this.metadataKey.toString('base64'));
    }
    for (const account of this.getAccounts()) {
      const slot = nodesKey(account.accountId);
      const raw = this.globalState.get<unknown>(slot);
      // Probe every sealed slot now rather than on the first read. `metadataFault` used to be
      // set lazily by openNodesSlot, so activation read it before anything had opened a slot
      // and the warning could never fire — and sync would learn of the fault only by producing
      // an empty tree.
      if (isSealedMetadata(raw)) {
        this.openNodesSlot(account.accountId, raw);
      }
      if (Array.isArray(raw)) {
        // Legacy plaintext: seal in place. A sealed or absent slot is left exactly as it is —
        // migration must never be the thing that overwrites a slot it could not read.
        await this.globalState.update(slot, sealMetadata(raw, this.metadataKey, slot));
        this.touch(account.accountId);
      }
    }
  }

  /** The node array a slot holds — opening the seal when there is one. */
  // eslint-disable-next-line complexity
  private openNodesSlot(accountId: string, raw: unknown): unknown {
    if (!isSealedMetadata(raw)) {
      return raw; // legacy plaintext, or nothing stored yet
    }
    if (this.metadataKey === undefined) {
      this.metadataFault =
        'The credential tree is sealed and init() has not run — this is a wiring bug, not data loss.';
      return [];
    }
    try {
      return openMetadata(raw, this.metadataKey, nodesKey(accountId));
    } catch (error) {
      this.metadataFault =
        error instanceof MetadataError && error.kind === 'wrong-key'
          ? 'The local credential cache could not be opened with this machine’s device key (the OS keychain was reset or restored). The tree will repopulate from the next sync; secrets in the keychain are unaffected.'
          : 'The local credential cache is corrupted and was ignored. The tree will repopulate from the next sync.';
      return [];
    }
  }

  // ---------- change detection (for the sync cycle) ----------

  /**
   * A token that is equal across two calls only when this profile's LOCAL snapshot cannot have
   * changed in between (audit 2026-08-25, C4).
   *
   * <p>Three sources, because three things can move without the others: writes through this
   * instance (the counter), writes to the memento by another window (the reference check on the
   * nodes, tombstones and horizon values), and writes to the keychain by another window (the
   * SecretStorage change event). The sync cycle reads it BEFORE it reads the snapshot and, when
   * neither this token nor the remote bytes have moved since the last cycle that found both sides
   * identical, skips the seven-keychain-reads-per-entity snapshot and the merge entirely. The
   * history secret is deliberately not counted: it is local to this machine and never part of
   * the snapshot.</p>
   */
  changeToken(accountId: string): string {
    const refs = [nodesKey, tombstonesKey, horizonKey].map((key) =>
      this.globalState.get<unknown>(key(accountId)),
    );
    const seen = this.seenRefs.get(accountId);
    if (seen === undefined || refs.some((ref, i) => ref !== seen[i])) {
      this.seenRefs.set(accountId, refs);
      this.touch(accountId);
    }
    return `${this.mutations.get(accountId) ?? 0}.${this.secretsEpoch}`;
  }

  private touch(accountId: string): void {
    this.mutations.set(accountId, (this.mutations.get(accountId) ?? 0) + 1);
  }

  // ---------- account profiles ----------

  getAccounts(): StoredAccount[] {
    const raw = this.globalState.get<unknown>(ACCOUNTS_KEY, []);
    return Array.isArray(raw) ? raw.filter(isStoredAccount) : [];
  }

  getAccount(accountId: string): StoredAccount | undefined {
    return this.getAccounts().find((a) => a.accountId === accountId);
  }

  /** Add a profile, or refresh email/provider when it already exists. */
  async upsertAccount(account: StoredAccount): Promise<void> {
    const accounts = this.getAccounts();
    const exists = accounts.some((a) => a.accountId === account.accountId);
    const next = exists
      ? accounts.map((a) => (a.accountId === account.accountId ? account : a))
      : [...accounts, account];
    await this.globalState.update(ACCOUNTS_KEY, next);
  }

  private seededAccountIds(): string[] {
    const raw = this.globalState.get<unknown>(SEEDED_KEY, []);
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  }

  /** Whether this account already received its one-time default folders. */
  hasSeededDefaults(accountId: string): boolean {
    return this.seededAccountIds().includes(accountId);
  }

  /**
   * Create the default folder set for a brand-new account — but ONLY into an
   * empty account that was never seeded before (see `shouldSeedDefaults`). A
   * user who already has data, or who renamed/deleted the defaults, is never
   * touched, and the folders never come back once seeded. Returns true iff
   * folders were created.
   */
  async seedDefaultFolders(accountId: string, remote: RemoteState): Promise<boolean> {
    if (
      !shouldSeedDefaults(this.getNodes(accountId).length, this.hasSeededDefaults(accountId), remote)
    ) {
      return false;
    }
    // Claim the flag BEFORE the first await. addNode yields, and two sign-in flows that
    // both got past the guard would each write a full set — the same duplication by a
    // different route.
    await this.globalState.update(SEEDED_KEY, [...this.seededAccountIds(), accountId]);
    for (const node of buildDefaultFolders(() => StorageManager.newId())) {
      await this.addNode(accountId, node);
    }
    return true;
  }

  /** Remove a profile together with its whole tree and all its secrets. */
  async removeAccount(accountId: string): Promise<void> {
    for (const node of this.getNodes(accountId)) {
      if (node.type === 'entity') {
        for (const key of entitySecretKeys(accountId, node.id)) {
          await this.secrets.delete(key);
        }
      }
    }
    await this.globalState.update(nodesKey(accountId), undefined);
    await this.globalState.update(tombstonesKey(accountId), undefined);
    await this.globalState.update(horizonKey(accountId), undefined);
    await this.globalState.update(
      SEEDED_KEY,
      this.seededAccountIds().filter((id) => id !== accountId),
    );
    await this.globalState.update(
      ACCOUNTS_KEY,
      this.getAccounts().filter((a) => a.accountId !== accountId),
    );
    this.touch(accountId);
  }

  // ---------- structure (globalState, per account) ----------

  /** The cache entry for this account's CURRENT memento value, built when the value is new. */
  private nodeEntry(accountId: string): NodeCacheEntry {
    const raw = this.globalState.get<unknown>(nodesKey(accountId));
    const cached = this.nodeCache.get(accountId);
    if (cached !== undefined && cached.raw === raw) {
      return cached;
    }
    const plain = this.openNodesSlot(accountId, raw);
    const nodes = Object.freeze(Array.isArray(plain) ? plain.filter(isTreeNode) : []);
    const entry: NodeCacheEntry = {
      raw,
      nodes,
      children: new Map(),
      // Built back to front so the FIRST of a duplicated id wins, the way the linear scan did.
      byId: new Map(nodes.map((node): [string, TreeNode] => [node.id, node]).reverse()),
    };
    this.nodeCache.set(accountId, entry);
    return entry;
  }

  /** Every node of one profile, validated — frozen, shared until the next write. */
  getNodes(accountId: string): readonly TreeNode[] {
    return this.nodeEntry(accountId).nodes;
  }

  getNode(accountId: string, id: string): TreeNode | undefined {
    return this.nodeEntry(accountId).byId.get(id);
  }

  /** The sorted children of one position (`null` = root) — frozen, shared until the next write. */
  getChildren(accountId: string, parentId: string | null): readonly TreeNode[] {
    const entry = this.nodeEntry(accountId);
    const hit = entry.children.get(parentId);
    if (hit !== undefined) {
      return hit;
    }
    const sorted = Object.freeze(
      entry.nodes.filter((n) => (n.parentId ?? null) === parentId).sort(siblingOrder),
    );
    entry.children.set(parentId, sorted);
    return sorted;
  }

  /** Persistent per-install device id (created once). */
  private deviceId(): string {
    let id = this.globalState.get<string>(DEVICE_ID_KEY);
    if (id === undefined || id.length === 0) {
      id = crypto.randomUUID();
      void this.globalState.update(DEVICE_ID_KEY, id);
    }
    return id;
  }

  /** Monotonic per-device sequence — the next write's version component. */
  private nextSeq(): number {
    const seq = (this.globalState.get<number>(DEVICE_SEQ_KEY) ?? 0) + 1;
    void this.globalState.update(DEVICE_SEQ_KEY, seq);
    return seq;
  }

  /** Stamp a node with a fresh version-vector component + updatedAt. */
  private stampVector(node: TreeNode): TreeNode {
    const v = bumpVector(node.v ?? {}, this.deviceId(), this.nextSeq());
    // The kind is stamped HERE, with the version, because this is the one line every local
    // write already passes through (audit A4) — a per-call-site stamp is a stamp the next
    // call site forgets. `stampKind` also keeps the legacy flags in step for older machines
    // and refuses a burn policy that could never fire for the kind.
    const details = node.details === undefined ? undefined : stampKind(node.details);
    return { ...node, details, updatedAt: Date.now(), v };
  }

  async addNode(accountId: string, node: TreeNode): Promise<void> {
    // createdAt is set here and never again — updateNode's stamp only moves updatedAt,
    // so "when was this made" survives every later edit. A node arriving with one
    // already set (an import, an accepted share) keeps the origin date it came with.
    const created = { ...node, createdAt: node.createdAt ?? Date.now() };
    await this.saveNodes(accountId, [...this.getNodes(accountId), this.stampVector(created)]);
    await this.bumpHorizonToSeq(accountId);
  }

  async updateNode(accountId: string, updated: TreeNode): Promise<void> {
    const stamped = this.stampVector(updated);
    await this.saveNodes(
      accountId,
      this.getNodes(accountId).map((n) => (n.id === stamped.id ? stamped : n)),
    );
    await this.bumpHorizonToSeq(accountId);
  }

  /** Move a node under a new parent (null = root). Caller validates cycles. */
  async moveNode(accountId: string, id: string, newParentId: string | null): Promise<void> {
    await this.saveNodes(
      accountId,
      this.getNodes(accountId).map((n) =>
        n.id === id ? this.stampVector({ ...n, parentId: newParentId }) : n,
      ),
    );
    await this.bumpHorizonToSeq(accountId);
  }

  /**
   * Move a node into the account's trash, creating the trash on first use.
   *
   * <p><b>Deliberately not part of `deleteNodeRecursive`.</b> That method is the one real
   * deletion — tombstone, every secret key, the revision history — and `burnOnUse`,
   * `entityExpiry` and `ephemeralSweeper` depend on it staying that way. An entry that promised
   * to destroy itself must not quietly become an entry sitting in a folder, still working. So
   * this is a MOVE, it syncs as a move, and restoring is moving back.</p>
   *
   * <p>Returns the trash folder, so a caller can tell the person where the thing went.</p>
   */
  async moveToTrash(accountId: string, id: string): Promise<TreeNode> {
    const trash = await this.ensureTrash(accountId);
    // Moving the trash into itself, or a folder into its own descendant, is refused by leaving
    // it where it is: `deleteNodeRecursive` is the only way to remove the trash itself.
    if (id !== trash.id) {
      await this.moveNode(accountId, id, trash.id);
    }
    return trash;
  }

  /** The account's trash, made on the first delete rather than seeded into every new vault. */
  async ensureTrash(accountId: string): Promise<TreeNode> {
    const existing = findTrash(this.getNodes(accountId));
    if (existing !== undefined) {
      return existing;
    }
    const trash: TreeNode = {
      id: StorageManager.newId(),
      name: TRASH_FOLDER_NAME,
      type: 'folder',
      parentId: null,
      isTrash: true,
    };
    await this.addNode(accountId, trash);
    return trash;
  }

  /** Set or clear how long the trash keeps what is in it. */
  async setTrashRetention(accountId: string, days: number | undefined): Promise<void> {
    const trash = await this.ensureTrash(accountId);
    await this.updateNode(accountId, { ...trash, trashRetentionDays: days });
  }

  private async bumpHorizonToSeq(accountId: string): Promise<void> {
    const seq = this.globalState.get<number>(DEVICE_SEQ_KEY) ?? 0;
    const horizon = mergeVectors(this.getHorizon(accountId), { [this.deviceId()]: seq });
    await this.setHorizon(accountId, horizon);
  }

  /** True when `nodeId` is `ancestorId` itself or sits anywhere below it. */
  isSelfOrDescendant(accountId: string, ancestorId: string, nodeId: string): boolean {
    // One ancestor walk for the whole extension — the selection resolver needs the same
    // one, and two copies would drift the first time a tree shape surprised either.
    return isSelfOrDescendantIn(this.getNodes(accountId), ancestorId, nodeId);
  }

  /**
   * Delete a node and (for folders) its whole subtree, including every
   * affected entity's secret. Returns the names of removed nodes.
   */
  // eslint-disable-next-line complexity
  async deleteNodeRecursive(accountId: string, id: string): Promise<string[]> {
    const nodes = this.getNodes(accountId);
    const toDelete = new Set<string>([id]);
    // Repeatedly sweep for children until the set stops growing.
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of nodes) {
        if (n.parentId != null && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          grew = true;
        }
      }
    }
    const removed = nodes.filter((n) => toDelete.has(n.id));
    await this.saveNodes(
      accountId,
      nodes.filter((n) => !toDelete.has(n.id)),
    );
    // Tombstones let the cross-machine merge propagate the deletion.
    const now = Date.now();
    const tombstones = { ...this.getTombstones(accountId) };
    const deviceId = this.deviceId();
    for (const n of removed) {
      // The deletion is a versioned event: bump this device and record it.
      const v = bumpVector(n.v ?? {}, deviceId, this.nextSeq());
      tombstones[n.id] = { deletedAt: now, v };
      if (n.type === 'entity') {
        for (const key of entitySecretKeys(accountId, n.id)) {
          await this.secrets.delete(key);
        }
      }
    }
    await this.setTombstones(accountId, tombstones);
    await this.bumpHorizonToSeq(accountId);
    return removed.map((n) => n.name);
  }

  // ---------- deletion tombstones (for sync merge) ----------

  // eslint-disable-next-line complexity
  getTombstones(accountId: string): Record<string, Tombstone> {
    const raw = this.globalState.get<unknown>(tombstonesKey(accountId), {});
    if (typeof raw !== 'object' || raw === null) {
      return {};
    }
    const out: Record<string, Tombstone> = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number') {
        out[id] = { deletedAt: value, v: {} };
      } else if (typeof value === 'object' && value !== null) {
        out[id] = normalizeTombstone(value as Tombstone);
      }
    }
    return out;
  }

  async setTombstones(
    accountId: string,
    tombstones: Record<string, Tombstone | number>,
  ): Promise<void> {
    const normalized: Record<string, Tombstone> = {};
    for (const [id, value] of Object.entries(tombstones)) {
      normalized[id] = normalizeTombstone(value);
    }
    await this.globalState.update(tombstonesKey(accountId), normalized);
    this.touch(accountId);
  }

  getHorizon(accountId: string): VersionVector {
    const raw = this.globalState.get<unknown>(horizonKey(accountId), {});
    if (typeof raw !== 'object' || raw === null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        (e): e is [string, number] => typeof e[1] === 'number',
      ),
    );
  }

  async setHorizon(accountId: string, horizon: VersionVector): Promise<void> {
    await this.globalState.update(horizonKey(accountId), horizon);
    this.touch(accountId);
  }

  // ---------- secrets (SecretStorage, tenant-scoped) ----------

  getPassword(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(secretKey(accountId, entityId));
  }

  async setPassword(
    accountId: string,
    entityId: string,
    password: string | undefined,
  ): Promise<void> {
    if (password === undefined || password.length === 0) {
      return; // empty input means "keep whatever is stored"
    }
    await this.secrets.store(secretKey(accountId, entityId), password);
    this.touch(accountId);
  }

  async deletePassword(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(secretKey(accountId, entityId));
    this.touch(accountId);
  }

  // ---------- share signing identity (SecretStorage, per account) ----------

  /**
   * This account's signing keypair, minted on first use.
   *
   * <p>In SecretStorage only, deliberately NOT wrapped into the vault payload as
   * the plan proposed. A signing identity that syncs is one that an attacker who
   * reads a backup can sign as, and the recovery path for a lost key already
   * exists and is the honest one: the peer re-pins after comparing the new
   * fingerprint. A key per machine also matches what a signature actually proves
   * — "this machine", not "this person".</p>
   */
  // eslint-disable-next-line complexity
  async signingKeypair(accountId: string): Promise<SigningKeypair | undefined> {
    const raw = await this.secrets.get(signingKeySecretKey(accountId));
    if (raw === undefined) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as SigningKeypair;
      return typeof parsed.publicKey === 'string' && typeof parsed.privateKey === 'string'
        ? parsed
        : undefined;
    } catch {
      return undefined;
    }
  }

  /** Mint one if this account has none yet, and return whichever it now has. */
  async ensureSigningKeypair(accountId: string): Promise<SigningKeypair> {
    const existing = await this.signingKeypair(accountId);
    if (existing !== undefined) {
      return existing;
    }
    const fresh = generateSigningKeypair();
    await this.secrets.store(signingKeySecretKey(accountId), JSON.stringify(fresh));
    return fresh;
  }

  // ---------- SSH private keys (SecretStorage, tenant-scoped) ----------

  getPrivateKey(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(privateKeySecretKey(accountId, entityId));
  }

  async setPrivateKey(accountId: string, entityId: string, content: string): Promise<void> {
    await this.secrets.store(privateKeySecretKey(accountId, entityId), content);
    this.touch(accountId);
  }

  async deletePrivateKey(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(privateKeySecretKey(accountId, entityId));
    this.touch(accountId);
  }

  // ---------- VPN configs (SecretStorage, tenant-scoped) ----------

  getVpnConfig(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(vpnConfigSecretKey(accountId, entityId));
  }

  async setVpnConfig(accountId: string, entityId: string, content: string): Promise<void> {
    await this.secrets.store(vpnConfigSecretKey(accountId, entityId), content);
    this.touch(accountId);
  }

  async deleteVpnConfig(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(vpnConfigSecretKey(accountId, entityId));
    this.touch(accountId);
  }

  // ---------- revision history (SecretStorage: old secrets are still secrets) ----------

  /**
   * The kept previous versions of an entity, newest first.
   *
   * <p>In SecretStorage rather than plaintext metadata because a revision holds the old
   * password — replaced is not the same as harmless. Local to this machine: it is not in
   * the sync bundle, so a second machine has its own history and one that never saw the
   * change has none, which is honest rather than invented.</p>
   */
  async getHistory(accountId: string, entityId: string): Promise<Revision[]> {
    const raw = await this.secrets.get(historySecretKey(accountId, entityId));
    if (raw === undefined) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRevisionList(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Record the CURRENT state as a revision, before it is overwritten. */
  async recordRevision(accountId: string, entityId: string, revision: Revision): Promise<void> {
    const next = pushRevision(await this.getHistory(accountId, entityId), revision);
    await this.secrets.store(historySecretKey(accountId, entityId), JSON.stringify(next));
  }

  // ---------- attachments (SecretStorage, base64 content) ----------

  getAttachment(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(attachmentSecretKey(accountId, entityId));
  }

  async setAttachment(accountId: string, entityId: string, base64: string | undefined): Promise<void> {
    if (base64 === undefined || base64.length === 0) {
      await this.secrets.delete(attachmentSecretKey(accountId, entityId));
    } else {
      await this.secrets.store(attachmentSecretKey(accountId, entityId), base64);
    }
    this.touch(accountId);
  }

  getImage(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(imageSecretKey(accountId, entityId));
  }

  async setImage(accountId: string, entityId: string, base64: string | undefined): Promise<void> {
    if (base64 === undefined || base64.length === 0) {
      await this.secrets.delete(imageSecretKey(accountId, entityId));
    } else {
      await this.secrets.store(imageSecretKey(accountId, entityId), base64);
    }
    this.touch(accountId);
  }

  // ---------- the corporate-recovery share this officer holds ----------

  async getOrgEscrowShare(accountId: string): Promise<EscrowShareWrap | undefined> {
    const raw = await this.secrets.get(orgEscrowShareSecretKey(accountId));
    if (raw === undefined) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isEscrowShareWrap(parsed) ? parsed : undefined;
    } catch {
      // A share this build cannot read is one the officer must accept again — saying nothing
      // and returning undefined is what makes the panel report "this machine holds no share".
      return undefined;
    }
  }

  async setOrgEscrowShare(accountId: string, wrap: EscrowShareWrap): Promise<void> {
    await this.secrets.store(orgEscrowShareSecretKey(accountId), JSON.stringify(wrap));
  }

  async clearOrgEscrowShare(accountId: string): Promise<void> {
    await this.secrets.delete(orgEscrowShareSecretKey(accountId));
  }

  // ---------- notes (SecretStorage, tenant-scoped) ----------

  getNotes(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(notesSecretKey(accountId, entityId));
  }

  async setNotes(accountId: string, entityId: string, value: string | undefined): Promise<void> {
    if (value === undefined || value.length === 0) {
      await this.secrets.delete(notesSecretKey(accountId, entityId));
    } else {
      await this.secrets.store(notesSecretKey(accountId, entityId), value);
    }
    this.touch(accountId);
  }

  // ---------- config bodies (SecretStorage, tenant-scoped) ----------

  getConfigBody(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(configSecretKey(accountId, entityId));
  }

  async setConfigBody(accountId: string, entityId: string, value: string | undefined): Promise<void> {
    if (value === undefined || value.length === 0) {
      await this.secrets.delete(configSecretKey(accountId, entityId));
    } else {
      await this.secrets.store(configSecretKey(accountId, entityId), value);
    }
    this.touch(accountId);
  }

  // ---------- DB connection strings (SecretStorage, tenant-scoped) ----------

  getDbConnection(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(dbConnSecretKey(accountId, entityId));
  }

  async setDbConnection(accountId: string, entityId: string, value: string): Promise<void> {
    await this.secrets.store(dbConnSecretKey(accountId, entityId), value);
    this.touch(accountId);
  }

  async deleteDbConnection(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(dbConnSecretKey(accountId, entityId));
    this.touch(accountId);
  }

  // ---------- TOTP seeds (SecretStorage, tenant-scoped) ----------

  /** The canonical `otpauth://` URI, or undefined when the entity has no second factor here. */
  getTotp(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(totpSecretKey(accountId, entityId));
  }

  async setTotp(accountId: string, entityId: string, uri: string): Promise<void> {
    await this.secrets.store(totpSecretKey(accountId, entityId), uri);
  }

  async deleteTotp(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(totpSecretKey(accountId, entityId));
  }

  // ---------- backup ----------

  /**
   * Every stored secret of the given entities, keyed by entity id — a kind an entity does
   * not have is simply absent. The external-export path used to walk the seven kinds by
   * hand right beside `exportBundle`'s own walk (audit 2026-08-25, A1); a kind added to
   * one loop and not the other would have exported silently incomplete files.
   */
  async exportSecretsFor(
    accountId: string,
    entityIds: readonly string[],
  ): Promise<Record<string, ExternalSecrets>> {
    const out: Record<string, ExternalSecrets> = {};
    for (const id of entityIds) {
      const s: ExternalSecrets = {};
      const put = <K extends keyof ExternalSecrets>(key: K, value: string | undefined): void => {
        if (value !== undefined) {
          s[key] = value;
        }
      };
      put('password', await this.getPassword(accountId, id));
      put('privateKey', await this.getPrivateKey(accountId, id));
      put('vpnConfig', await this.getVpnConfig(accountId, id));
      put('dbConnection', await this.getDbConnection(accountId, id));
      put('notes', await this.getNotes(accountId, id));
      put('attachment', await this.getAttachment(accountId, id));
      put('image', await this.getImage(accountId, id));
      put('totp', await this.getTotp(accountId, id));
      put('config', await this.getConfigBody(accountId, id));
      out[id] = s;
    }
    return out;
  }

  /** Pair every entity of one profile with its stored secrets. */
  // eslint-disable-next-line complexity, max-lines-per-function
  async exportBundle(accountId: string): Promise<BackupBundle> {
    const nodes = this.getNodes(accountId);
    const passwords: Record<string, string> = {};
    const privateKeys: Record<string, string> = {};
    const vpnConfigs: Record<string, string> = {};
    const dbConnections: Record<string, string> = {};
    const notes: Record<string, string> = {};
    const attachments: Record<string, string> = {};
    const images: Record<string, string> = {};
    const totps: Record<string, string> = {};
    const configs: Record<string, string> = {};
    for (const node of nodes) {
      if (node.type !== 'entity') {
        continue;
      }
      const totp = await this.secrets.get(totpSecretKey(accountId, node.id));
      if (totp !== undefined) {
        totps[node.id] = totp;
      }
      const configBody = await this.secrets.get(configSecretKey(accountId, node.id));
      if (configBody !== undefined) {
        configs[node.id] = configBody;
      }
      const password = await this.secrets.get(secretKey(accountId, node.id));
      if (password !== undefined) {
        passwords[node.id] = password;
      }
      const privateKey = await this.secrets.get(privateKeySecretKey(accountId, node.id));
      if (privateKey !== undefined) {
        privateKeys[node.id] = privateKey;
      }
      const vpnConfig = await this.secrets.get(vpnConfigSecretKey(accountId, node.id));
      if (vpnConfig !== undefined) {
        vpnConfigs[node.id] = vpnConfig;
      }
      const dbConn = await this.secrets.get(dbConnSecretKey(accountId, node.id));
      if (dbConn !== undefined) {
        dbConnections[node.id] = dbConn;
      }
      const attachment = await this.secrets.get(attachmentSecretKey(accountId, node.id));
      if (attachment !== undefined) {
        attachments[node.id] = attachment;
      }
      const image = await this.secrets.get(imageSecretKey(accountId, node.id));
      if (image !== undefined) {
        images[node.id] = image;
      }
      // Migrate any legacy plaintext note (globalState) into the secret map.
      const note =
        (await this.secrets.get(notesSecretKey(accountId, node.id))) ?? node.details?.notes;
      if (note !== undefined && note.length > 0) {
        notes[node.id] = note;
      }
    }
    return {
      // A copy: the cached array is frozen and shared, and a bundle is the caller's to shape.
      nodes: [...nodes],
      passwords,
      privateKeys,
      vpnConfigs,
      dbConnections,
      notes,
      attachments,
      images,
      totps,
      configs,
      tombstones: this.getTombstones(accountId),
      horizon: this.getHorizon(accountId),
      exportedAt: Date.now(),
    };
  }

  /** The full profile state as the sync merge consumes it. */
  // eslint-disable-next-line complexity
  async getSnapshot(accountId: string): Promise<ProfileSnapshot> {
    const bundle = await this.exportBundle(accountId);
    return {
      nodes: bundle.nodes,
      passwords: bundle.passwords,
      privateKeys: bundle.privateKeys ?? {},
      vpnConfigs: bundle.vpnConfigs ?? {},
      dbConnections: bundle.dbConnections ?? {},
      notes: bundle.notes ?? {},
      attachments: bundle.attachments ?? {},
      images: bundle.images ?? {},
      totps: bundle.totps ?? {},
      configs: bundle.configs ?? {},
      tombstones: bundle.tombstones ?? {},
      horizon: bundle.horizon ?? {},
    };
  }

  /** Replace the whole profile state with a merged snapshot. */
  async applySnapshot(accountId: string, snapshot: ProfileSnapshot): Promise<void> {
    await this.importBundle(accountId, {
      nodes: snapshot.nodes,
      passwords: snapshot.passwords,
      privateKeys: snapshot.privateKeys,
      vpnConfigs: snapshot.vpnConfigs,
      dbConnections: snapshot.dbConnections,
      notes: snapshot.notes,
      attachments: snapshot.attachments,
      images: snapshot.images,
      totps: snapshot.totps,
      configs: snapshot.configs,
      tombstones: snapshot.tombstones,
      horizon: snapshot.horizon,
    });
  }

  /** Replace one profile's whole tree and batch-restore its secrets. */
  // eslint-disable-next-line complexity, max-lines-per-function
  async importBundle(accountId: string, incoming: BackupBundle): Promise<void> {
    // The trust boundary. Every id in this bundle came from OUTSIDE — a restored backup file,
    // or whatever can write the sync location — and an id is concatenated into a SecretStorage
    // key and into a file name. One that could break either is renamed before it enters the
    // vault; an ordinary uuid is passed through untouched, which is what keeps a sync cycle
    // from renaming a whole tree every time it runs.
    const bundle = await this.quarantine(accountId, incoming);
    const privateKeys = bundle.privateKeys ?? {};
    const vpnConfigs = bundle.vpnConfigs ?? {};
    const dbConnections = bundle.dbConnections ?? {};
    const notes = bundle.notes ?? {};
    const attachments = bundle.attachments ?? {};
    const images = bundle.images ?? {};
    const totps = bundle.totps ?? {};
    const configs = bundle.configs ?? {};
    // Drop secrets of entities that will disappear with the replaced tree.
    for (const node of this.getNodes(accountId)) {
      if (node.type !== 'entity') {
        continue;
      }
      if (totps[node.id] === undefined) {
        await this.secrets.delete(totpSecretKey(accountId, node.id));
      }
      if (configs[node.id] === undefined) {
        await this.secrets.delete(configSecretKey(accountId, node.id));
      }
      if (bundle.passwords[node.id] === undefined) {
        await this.secrets.delete(secretKey(accountId, node.id));
      }
      if (privateKeys[node.id] === undefined) {
        await this.secrets.delete(privateKeySecretKey(accountId, node.id));
      }
      if (vpnConfigs[node.id] === undefined) {
        await this.secrets.delete(vpnConfigSecretKey(accountId, node.id));
      }
      if (dbConnections[node.id] === undefined) {
        await this.secrets.delete(dbConnSecretKey(accountId, node.id));
      }
      if (notes[node.id] === undefined) {
        await this.secrets.delete(notesSecretKey(accountId, node.id));
      }
      if (attachments[node.id] === undefined) {
        await this.secrets.delete(attachmentSecretKey(accountId, node.id));
        await this.secrets.delete(historySecretKey(accountId, node.id));
      }
      if (images[node.id] === undefined) {
        await this.secrets.delete(imageSecretKey(accountId, node.id));
      }
    }
    await this.saveNodes(
      accountId,
      bundle.nodes.map((n) => ({ ...n, children: undefined })),
    );
    for (const [entityId, password] of Object.entries(bundle.passwords)) {
      await this.secrets.store(secretKey(accountId, entityId), password);
    }
    for (const [entityId, content] of Object.entries(privateKeys)) {
      await this.secrets.store(privateKeySecretKey(accountId, entityId), content);
    }
    for (const [entityId, content] of Object.entries(vpnConfigs)) {
      await this.secrets.store(vpnConfigSecretKey(accountId, entityId), content);
    }
    for (const [entityId, content] of Object.entries(dbConnections)) {
      await this.secrets.store(dbConnSecretKey(accountId, entityId), content);
    }
    for (const [entityId, content] of Object.entries(notes)) {
      await this.secrets.store(notesSecretKey(accountId, entityId), content);
    }
    for (const [entityId, content] of Object.entries(attachments)) {
      await this.secrets.store(attachmentSecretKey(accountId, entityId), content);
    }
    for (const [entityId, content] of Object.entries(images)) {
      await this.secrets.store(imageSecretKey(accountId, entityId), content);
    }
    for (const [entityId, uri] of Object.entries(totps)) {
      await this.secrets.store(totpSecretKey(accountId, entityId), uri);
    }
    for (const [entityId, body] of Object.entries(configs)) {
      await this.secrets.store(configSecretKey(accountId, entityId), body);
    }
    // Stored notes are authoritative; drop any legacy plaintext copy.
    await this.saveNodes(
      accountId,
      this.getNodes(accountId).map((n) =>
        n.details?.notes !== undefined
          ? { ...n, details: { ...n.details, notes: undefined } }
          : n,
      ),
    );
    await this.setTombstones(accountId, bundle.tombstones ?? {});
    await this.setHorizon(accountId, bundle.horizon ?? {});
  }

  // ---------- helpers ----------

  /**
   * Rename any entity whose id could break a key or a path, remembering what it was called.
   *
   * <p>The memory is per account and local, exactly like `shareOrigin`'s: it is what makes a
   * SECOND import of the same file update the entity it created the first time rather than add
   * a duplicate beside it. Nothing is written when nothing had to be renamed, so the ordinary
   * path costs one regex per node and no state.</p>
   */
  private async quarantine(accountId: string, bundle: BackupBundle): Promise<BackupBundle> {
    const all = this.globalState.get<Record<string, Record<string, string>>>(IMPORTED_IDS_KEY, {});
    const known = all[accountId] ?? {};
    const result = quarantineUnsafeIds(bundle, known, () => StorageManager.newId());
    if (Object.keys(result.renamed).length === 0) {
      return result.bundle;
    }
    await this.globalState.update(IMPORTED_IDS_KEY, {
      ...all,
      [accountId]: { ...known, ...result.renamed },
    });
    return result.bundle;
  }

  static newId(): string {
    return crypto.randomUUID();
  }

  private async saveNodes(accountId: string, nodes: readonly TreeNode[]): Promise<void> {
    // Sealed when the device key is loaded (init ran — always, in the real extension). The
    // plaintext branch keeps pure unit tests honest without making them mint keychains.
    const value =
      this.metadataKey === undefined
        ? nodes
        : sealMetadata(nodes, this.metadataKey, nodesKey(accountId));
    await this.globalState.update(nodesKey(accountId), value);
    this.touch(accountId);
  }
}
