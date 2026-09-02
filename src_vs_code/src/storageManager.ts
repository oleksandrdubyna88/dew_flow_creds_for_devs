/* eslint-disable max-lines --
   Just over the 800-line limit since B8 added metadata sealing. One class, one concern
   (the two-tier storage); the next feature that needs room here should extract the
   sealing or the bundle import/export into their own modules instead of growing this. */
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { ProfileSnapshot } from './syncMerge';
import { quarantineUnsafeIds } from './idQuarantine';
import { SigningKeypair } from './shareSignature';
import { ensureSigningKeypair, readSigningKeypair } from './signingKeyStore';
import { EscrowShareWrap, isEscrowShareWrap } from './orgEscrowShareWrap';
import { RemoteState, buildDefaultFolders, shouldSeedDefaults } from './defaultFolders';
import { Tombstone, VersionVector, bumpVector, mergeVectors, normalizeTombstone, parseTombstones } from './versionVector';
import { isSelfOrDescendantIn, subtreeOf } from './selectionResolver';
import { Revision } from './revisionHistory';
import { readHistory, writeRevision } from './revisionStore';
import { MetadataError, isSealedMetadata, newMetadataKey, openMetadata, sealMetadata } from './metadataCipher';
import { ExternalSecrets } from './externalBundle';
import { stampKind } from './entityKind';
import { TRASH_FOLDER_NAME, findTrash, restoreTarget } from './trash';
import { exportSecretsFor } from './exportSecrets';
import { PaymentFields, parsePaymentFields, serializePaymentFields } from './paymentFields';
import { forgetTombstone, sweepOrphanSecrets } from './orphanSweep';
import { SerialQueue } from './serialQueue';
import {
  CleanupPort,
  clearSecretsPending,
  isEmptyPending,
  markSecretsPending,
  parsePendingCleanup,
  finishBeforeReuse,
  removeWithIntent,
  resumePending,
} from './pendingCleanup';
import {
  dropVanishedSecrets,
  readSecretMaps,
  secretMapsOf,
  storeSecretMaps,
} from './secretMaps';
import {
  attachmentSecretKey,
  configSecretKey,
  dbConnSecretKey,
  entitySecretKeys,
  fieldsSecretKey,
  imageSecretKey,
  notesSecretKey,
  orgEscrowShareSecretKey,
  paymentSecretKey,
  privateKeySecretKey,
  secretKey,
  totpSecretKey,
  vpnConfigSecretKey,
} from './secretKeys';
import {
  BackupBundle,
  StoredAccount,
  TreeNode,
  isStoredAccount,
  isTreeNode,
} from './types';
import { EntityFields, parseFields, serializeFields } from './entityFields';

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

/** Work started and not yet finished — LOCAL, never synced. See `pendingCleanup.ts`. */
const PENDING_KEY = 'credSshManager.pendingCleanup';




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
   * Applying a bundle, removing an account and finishing interrupted work — one at a time.
   *
   * <p>All three are `async` and touch the same secrets, so every `await` inside one was a place
   * another could start; a whole round of review findings were variants of that one fact. Narrowing
   * each window individually is not closing it — the windows exist because these interleave.
   * `SerialQueue` already solved this shape for `GitTransport`, and its header states the boundary:
   * one instance, not two windows, which is why the sweep exists at all.</p>
   */
  private readonly writes = new SerialQueue();

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
    // An account whose removal was interrupted is finished off BEFORE it is listed again, so what
    // comes back is a clean profile rather than the wreckage of a deletion. See `pendingCleanup.ts`.
    // Read first and await only when there IS one: this runs on every sign-in, and the common path
    // should not gain a turn of the event loop for a case that almost never applies.
    const port = this.cleanupPort();
    if (port.read().accounts.includes(account.accountId)) {
      await finishBeforeReuse(port, account.accountId);
    }
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

  /** Mark, unlist, wipe, unmark — the order and its reasoning are in `accountRemoval.ts`. */
  async removeAccount(accountId: string): Promise<void> {
    await this.writes.run(() => removeWithIntent(this.cleanupPort(), accountId, () => this.unlistAccount(accountId)));
    this.touch(accountId);
  }

  /** Unlisted, but not gone: its data is still stored, and its own tree still names it. */
  private async unlistAccount(accountId: string): Promise<void> {
    await this.globalState.update(ACCOUNTS_KEY, this.getAccounts().filter((a) => a.accountId !== accountId));
    await this.globalState.update(SEEDED_KEY, this.seededAccountIds().filter((id) => id !== accountId));
  }

  /** Finish every removal a killed window left half-done — idempotent; see `pendingCleanup.ts`. */
  resumeAccountRemovals(): Promise<readonly string[]> {
    return this.writes.run(() => resumePending(this.cleanupPort()));
  }

  /** This class's half of `pendingCleanup.ts` — the storage the sequencing there acts on. */
  private cleanupPort(): CleanupPort {
    return {
      read: () => parsePendingCleanup(this.globalState.get<unknown>(PENDING_KEY)),
      write: async (next) => {
        await this.globalState.update(PENDING_KEY, isEmptyPending(next) ? undefined : next);
      },
      wipeAccount: (accountId) => this.wipeAccountData(accountId),
      isListed: (accountId) => this.getAccount(accountId) !== undefined,
      liveIds: (accountId) => this.getNodes(accountId).map((n) => n.id),
      forgetSecrets: (a, e) => this.forgetEntitySecrets(a, e, () => this.getNode(a, e) !== undefined),
    };
  }

  /** The secrets named by the still-present tree, then the tree and everything keyed beside it. */
  private async wipeAccountData(accountId: string): Promise<void> {
    for (const node of this.getNodes(accountId).filter((n) => n.type === 'entity')) {
      await this.forgetEntitySecrets(accountId, node.id);
    }
    for (const key of [nodesKey, tombstonesKey, horizonKey]) {
      await this.globalState.update(key(accountId), undefined);
    }
  }

  /**
   * Every keychain key this entity owns, gone. Safe as a blanket delete for a failed CREATE precisely
   * because the id is new — nothing older sits under any of them.
   */
  /**
   * Store a value, or DELETE when there is none — the shape six secret kinds share. `setPassword` is
   * the one that does NOT (nothing means KEEP); its own comment and `writeOrderPaths.test.ts` say so.
   */
  private async putSecret(key: string, accountId: string, value: string | undefined): Promise<void> {
    if (value === undefined || value.length === 0) {
      await this.secrets.delete(key);
    } else {
      await this.secrets.store(key, value);
    }
    this.touch(accountId);
  }

  async forgetEntitySecrets(accountId: string, entityId: string, stopIf?: () => boolean): Promise<void> {
    for (const key of entitySecretKeys(accountId, entityId)) {
      if (stopIf?.() === true) {
        return; // The entity came back mid-sweep — see `CleanupPort.forgetSecrets`.
      }
      await this.secrets.delete(key);
    }
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

  /**
   * Present, absent, or unknowable — because under a `metadataFault` EVERY node reads as missing, so
   * "not found" cannot mean "not there". Why that matters is in `entityWrite.ts`.
   */
  nodePresence(accountId: string, id: string): 'present' | 'absent' | 'unknown' {
    if (this.metadataFault !== undefined) {
      return 'unknown';
    }
    return this.getNode(accountId, id) === undefined ? 'absent' : 'present';
  }

  /** Hand an id to the sweep, for collection once the tree can say it is really gone. */
  async deferSecretCleanup(accountId: string, entityId: string): Promise<void> {
    const port = this.cleanupPort();
    await port.write(markSecretsPending(port.read(), accountId, [entityId]));
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
    await forgetTombstone(this, accountId, created.id);
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
    await this.relocate(accountId, id, { parentId: newParentId });
  }

  /** One write: the node with `patch` applied and stamped, then the horizon bumped. */
  private async relocate(accountId: string, id: string, patch: Partial<TreeNode>): Promise<void> {
    await this.saveNodes(
      accountId,
      this.getNodes(accountId).map((n) => (n.id === id ? this.stampVector({ ...n, ...patch }) : n)),
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
      // One write for the move AND where it came from — a crash between two could not leave
      // an entry in the trash that has forgotten its folder.
      const from = this.getNode(accountId, id)?.parentId ?? null;
      await this.relocate(accountId, id, { trashedFrom: from, parentId: trash.id });
    }
    return trash;
  }

  /**
   * *Restore*: back to the folder it was deleted from (`restoreTarget` — the root when that
   * folder is gone or is itself in the trash). Returns the folder it went to, `undefined` when
   * there is nothing to restore.
   */
  async restoreFromTrash(accountId: string, id: string): Promise<TreeNode | null | undefined> {
    const node = this.getNode(accountId, id);
    if (node === undefined) {
      return undefined;
    }
    const target = restoreTarget(node, (nodeId) => this.getNode(accountId, nodeId));
    await this.relocate(accountId, id, { trashedFrom: undefined, parentId: target });
    return target === null ? null : this.getNode(accountId, target);
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
  async deleteNodeRecursive(accountId: string, id: string): Promise<string[]> {
    const nodes = this.getNodes(accountId);
    const removed = subtreeOf(nodes, id);
    const toDelete = new Set(removed.map((n) => n.id));
    // THE ORDER IS THE GUARANTEE: tombstone, then node, then secrets — the tombstone is both the
    // sync record and the only durable list of ids that had secrets. See `orphanSweep.ts`.
    await this.tombstone(accountId, removed);
    await this.saveNodes(
      accountId,
      nodes.filter((n) => !toDelete.has(n.id)),
    );
    for (const n of removed.filter((one) => one.type === 'entity')) {
      await this.forgetEntitySecrets(accountId, n.id);
    }
    await this.bumpHorizonToSeq(accountId);
    return removed.map((n) => n.name);
  }

  /** Record these nodes as deleted — a VERSIONED event, so the deletion wins over the node it removes. */
  private async tombstone(accountId: string, nodes: readonly TreeNode[]): Promise<void> {
    const now = Date.now();
    const deviceId = this.deviceId();
    const tombstones = { ...this.getTombstones(accountId) };
    for (const node of nodes) {
      tombstones[node.id] = { deletedAt: now, v: bumpVector(node.v ?? {}, deviceId, this.nextSeq()) };
    }
    await this.setTombstones(accountId, tombstones);
  }

  /** Keychain keys a half-finished deletion left behind — reasoning in `orphanSweep.ts`. */
  sweepOrphanSecrets(accountId: string): Promise<{ deleted: number; checked: number }> {
    return sweepOrphanSecrets(
      this.secrets,
      accountId,
      Object.keys(this.getTombstones(accountId)),
      this.getNodes(accountId).map((n) => n.id),
    );
  }

  // ---------- deletion tombstones (for sync merge) ----------

  getTombstones(accountId: string): Record<string, Tombstone> {
    return parseTombstones(this.globalState.get<unknown>(tombstonesKey(accountId), {}));
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

  /** This account's signing keypair — see `signingKeyStore.ts` for why it never syncs. */
  signingKeypair(accountId: string): Promise<SigningKeypair | undefined> {
    return readSigningKeypair(this.secrets, accountId);
  }

  /** Mint one if this account has none yet, and return whichever it now has. */
  ensureSigningKeypair(accountId: string): Promise<SigningKeypair> {
    return ensureSigningKeypair(this.secrets, accountId);
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

  /** The kept previous versions of an entity, newest first — see `revisionStore.ts`. */
  getHistory(accountId: string, entityId: string): Promise<Revision[]> {
    return readHistory(this.secrets, accountId, entityId);
  }

  /** Record the CURRENT state as a revision, before it is overwritten. */
  recordRevision(accountId: string, entityId: string, revision: Revision): Promise<void> {
    return writeRevision(this.secrets, accountId, entityId, revision);
  }

  // ---------- attachments (SecretStorage, base64 content) ----------

  getAttachment(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(attachmentSecretKey(accountId, entityId));
  }

  setAttachment(accountId: string, entityId: string, base64: string | undefined): Promise<void> {
    return this.putSecret(attachmentSecretKey(accountId, entityId), accountId, base64);
  }

  getImage(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(imageSecretKey(accountId, entityId));
  }

  setImage(accountId: string, entityId: string, base64: string | undefined): Promise<void> {
    return this.putSecret(imageSecretKey(accountId, entityId), accountId, base64);
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

  setNotes(accountId: string, entityId: string, value: string | undefined): Promise<void> {
    return this.putSecret(notesSecretKey(accountId, entityId), accountId, value);
  }

  // ---------- config bodies (SecretStorage, tenant-scoped) ----------

  // ---------- login / URL (SecretStorage, tenant-scoped, JSON) ----------

  /** The stored JSON as it is — what bundles, snapshots, shares and revisions carry. */
  getFieldsRaw(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(fieldsSecretKey(accountId, entityId));
  }

  setFieldsRaw(accountId: string, entityId: string, value: string | undefined): Promise<void> {
    return this.putSecret(fieldsSecretKey(accountId, entityId), accountId, value);
  }

  async getFields(accountId: string, entityId: string): Promise<EntityFields> {
    return parseFields(await this.getFieldsRaw(accountId, entityId));
  }

  /** Typed write: an empty record deletes, so a credential that lost both fields holds no key. */
  setFields(accountId: string, entityId: string, fields: EntityFields | undefined): Promise<void> {
    return this.setFieldsRaw(accountId, entityId, serializeFields(fields));
  }

  // ---------- payment instruments (SecretStorage, tenant-scoped, JSON) ----------

  /** The stored JSON as it is — what bundles, snapshots, shares and revisions carry. */
  getPaymentRaw(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(paymentSecretKey(accountId, entityId));
  }

  setPaymentRaw(accountId: string, entityId: string, value: string | undefined): Promise<void> {
    return this.putSecret(paymentSecretKey(accountId, entityId), accountId, value);
  }

  async getPayment(accountId: string, entityId: string): Promise<PaymentFields> {
    return parsePaymentFields(await this.getPaymentRaw(accountId, entityId));
  }

  /** Typed write: an empty record deletes, so a payment instrument stripped bare holds no key. */
  setPayment(accountId: string, entityId: string, fields: PaymentFields | undefined): Promise<void> {
    return this.setPaymentRaw(accountId, entityId, serializePaymentFields(fields));
  }

  getConfigBody(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(configSecretKey(accountId, entityId));
  }

  setConfigBody(accountId: string, entityId: string, value: string | undefined): Promise<void> {
    return this.putSecret(configSecretKey(accountId, entityId), accountId, value);
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

  /** Every stored secret of the given entities, keyed by entity id — see `exportSecrets.ts`. */
  exportSecretsFor(accountId: string, ids: readonly string[]): Promise<Record<string, ExternalSecrets>> {
    return exportSecretsFor(this, accountId, ids);
  }

  /** Pair every entity of one profile with its stored secrets. */
  async exportBundle(accountId: string): Promise<BackupBundle> {
    const nodes = this.getNodes(accountId);
    const maps = await readSecretMaps(this.secrets, accountId, nodes);
    return {
      // A copy: the cached array is frozen and shared, and a bundle is the caller's to shape.
      nodes: [...nodes],
      ...maps,
      tombstones: this.getTombstones(accountId),
      horizon: this.getHorizon(accountId),
      exportedAt: Date.now(),
    };
  }

  /** The full profile state as the sync merge consumes it. */
  async getSnapshot(accountId: string): Promise<ProfileSnapshot> {
    const bundle = await this.exportBundle(accountId);
    return {
      nodes: bundle.nodes,
      ...secretMapsOf(bundle),
      tombstones: bundle.tombstones ?? {},
      horizon: bundle.horizon ?? {},
    };
  }

  /** Replace the whole profile state with a merged snapshot. */
  async applySnapshot(accountId: string, snapshot: ProfileSnapshot): Promise<void> {
    await this.importBundle(accountId, { ...snapshot });
  }

  /** Replace one profile's whole tree and batch-restore its secrets. */
  importBundle(accountId: string, incoming: BackupBundle): Promise<void> {
    return this.writes.run(() => this.applyBundle(accountId, incoming));
  }

  private async applyBundle(accountId: string, incoming: BackupBundle): Promise<void> {
    // The trust boundary. Every id in this bundle came from OUTSIDE — a restored backup file,
    // or whatever can write the sync location — and an id is concatenated into a SecretStorage
    // key and into a file name. One that could break either is renamed before it enters the
    // vault; an ordinary uuid is passed through untouched, which is what keeps a sync cycle
    // from renaming a whole tree every time it runs.
    const bundle = await this.quarantine(accountId, incoming);
    const maps = secretMapsOf(bundle);
    // Rule A applied to a restore (`orphanSweep.ts`); this path had it backwards in BOTH halves.
    // Vanished ids come from the OLD tree, which after `saveNodes` is no longer there to iterate.
    const before = this.getNodes(accountId).filter((n) => n.type === 'entity').map((n) => n.id);
    await storeSecretMaps(this.secrets, accountId, maps);
    // Rule B, with a LOCAL record rather than a tombstone — `pendingCleanup.ts` says why both shapes
    // of tombstone were wrong here.
    // Ids this bundle drops are recorded; ids it CARRIES stop waiting to be swept — one write, and it
    // lands HERE rather than before the secrets because no sweep can run beside this apply any more,
    // so clearing early would only risk losing the intent to a crash. See `serialQueue.ts`.
    const kept = new Set(bundle.nodes.map((n) => n.id));
    const vanishing = before.filter((id) => !kept.has(id));
    const port = this.cleanupPort();
    await port.write(markSecretsPending(clearSecretsPending(port.read(), accountId), accountId, vanishing));
    await this.saveNodes(
      accountId,
      bundle.nodes.map((n) => ({ ...n, children: undefined })),
    );
    await dropVanishedSecrets(this.secrets, accountId, before, maps);
    await port.write(clearSecretsPending(port.read(), accountId));

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
