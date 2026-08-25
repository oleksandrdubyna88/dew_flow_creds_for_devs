import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { ProfileSnapshot } from './syncMerge';
import { SigningKeypair, generateSigningKeypair } from './shareSignature';
import { RemoteState, buildDefaultFolders, shouldSeedDefaults } from './defaultFolders';
import { Tombstone, VersionVector, bumpVector, mergeVectors, normalizeTombstone } from './versionVector';
import { isSelfOrDescendantIn } from './selectionResolver';
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

const DEVICE_ID_KEY = 'credSshManager.deviceId';
const DEVICE_SEQ_KEY = 'credSshManager.deviceSeq';

/** Tenant-scoped SecretStorage key: `${accountId}_${entityId}`. */
function secretKey(accountId: string, entityId: string): string {
  return `${accountId}_${entityId}`;
}

/** SecretStorage key for an entity's SSH private key content. */
function privateKeySecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${entityId}:sshPrivateKey`;
}

/**
 * The account's own Ed25519 signing identity for shares on the folder transport.
 * Keyed by account, not by entity — it identifies the signer, not a credential.
 */
function signingKeySecretKey(accountId: string): string {
  return `${accountId}:shareSigningKey`;
}

/** SecretStorage key for an entity's VPN config file content. */
function vpnConfigSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${entityId}:vpnConfig`;
}

/** SecretStorage key for an entity's notes (kept out of plaintext globalState). */
function notesSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${entityId}:notes`;
}

function attachmentSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${entityId}:attachment`;
}

function imageSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${entityId}:image`;
}

/** SecretStorage key for an entity's DB connection string. */
function dbConnSecretKey(accountId: string, entityId: string): string {
  return `${accountId}_${entityId}:dbConn`;
}

/**
 * Multi-tenant two-tier storage:
 *  - `globalState`  → account profiles + one flat node list per account
 *  - `SecretStorage` → `${accountId}_${entityId}` -> password
 *                      (passwords are never written to globalState)
 *
 * All mutating methods return new arrays/objects; stored data is never
 * mutated in place.
 */
export class StorageManager {
  constructor(
    private readonly globalState: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
  ) {}

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
        await this.secrets.delete(secretKey(accountId, node.id));
        await this.secrets.delete(privateKeySecretKey(accountId, node.id));
        await this.secrets.delete(vpnConfigSecretKey(accountId, node.id));
        await this.secrets.delete(dbConnSecretKey(accountId, node.id));
        await this.secrets.delete(notesSecretKey(accountId, node.id));
        await this.secrets.delete(attachmentSecretKey(accountId, node.id));
        await this.secrets.delete(imageSecretKey(accountId, node.id));
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
  }

  // ---------- structure (globalState, per account) ----------

  getNodes(accountId: string): TreeNode[] {
    const raw = this.globalState.get<unknown>(nodesKey(accountId), []);
    return Array.isArray(raw) ? raw.filter(isTreeNode) : [];
  }

  getNode(accountId: string, id: string): TreeNode | undefined {
    return this.getNodes(accountId).find((n) => n.id === id);
  }

  getChildren(accountId: string, parentId: string | null): TreeNode[] {
    const children = this.getNodes(accountId).filter(
      (n) => (n.parentId ?? null) === parentId,
    );
    // Folders first (manual order, then name), entities alphabetical.
    return [...children].sort((a, b) => {
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
    });
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
    return { ...node, updatedAt: Date.now(), v };
  }

  async addNode(accountId: string, node: TreeNode): Promise<void> {
    await this.saveNodes(accountId, [...this.getNodes(accountId), this.stampVector(node)]);
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
        await this.secrets.delete(secretKey(accountId, n.id));
        await this.secrets.delete(privateKeySecretKey(accountId, n.id));
        await this.secrets.delete(vpnConfigSecretKey(accountId, n.id));
        await this.secrets.delete(dbConnSecretKey(accountId, n.id));
        await this.secrets.delete(notesSecretKey(accountId, n.id));
        await this.secrets.delete(attachmentSecretKey(accountId, n.id));
        await this.secrets.delete(imageSecretKey(accountId, n.id));
      }
    }
    await this.setTombstones(accountId, tombstones);
    await this.bumpHorizonToSeq(accountId);
    return removed.map((n) => n.name);
  }

  // ---------- deletion tombstones (for sync merge) ----------

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

  setTombstones(
    accountId: string,
    tombstones: Record<string, Tombstone | number>,
  ): Thenable<void> {
    const normalized: Record<string, Tombstone> = {};
    for (const [id, value] of Object.entries(tombstones)) {
      normalized[id] = normalizeTombstone(value);
    }
    return this.globalState.update(tombstonesKey(accountId), normalized);
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

  setHorizon(accountId: string, horizon: VersionVector): Thenable<void> {
    return this.globalState.update(horizonKey(accountId), horizon);
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
  }

  async deletePassword(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(secretKey(accountId, entityId));
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
  }

  async deletePrivateKey(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(privateKeySecretKey(accountId, entityId));
  }

  // ---------- VPN configs (SecretStorage, tenant-scoped) ----------

  getVpnConfig(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(vpnConfigSecretKey(accountId, entityId));
  }

  async setVpnConfig(accountId: string, entityId: string, content: string): Promise<void> {
    await this.secrets.store(vpnConfigSecretKey(accountId, entityId), content);
  }

  async deleteVpnConfig(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(vpnConfigSecretKey(accountId, entityId));
  }

  // ---------- attachments (SecretStorage, base64 content) ----------

  getAttachment(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(attachmentSecretKey(accountId, entityId));
  }

  async setAttachment(accountId: string, entityId: string, base64: string | undefined): Promise<void> {
    if (base64 === undefined || base64.length === 0) {
      await this.secrets.delete(attachmentSecretKey(accountId, entityId));
      return;
    }
    await this.secrets.store(attachmentSecretKey(accountId, entityId), base64);
  }

  getImage(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(imageSecretKey(accountId, entityId));
  }

  async setImage(accountId: string, entityId: string, base64: string | undefined): Promise<void> {
    if (base64 === undefined || base64.length === 0) {
      await this.secrets.delete(imageSecretKey(accountId, entityId));
      return;
    }
    await this.secrets.store(imageSecretKey(accountId, entityId), base64);
  }

  // ---------- notes (SecretStorage, tenant-scoped) ----------

  getNotes(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(notesSecretKey(accountId, entityId));
  }

  async setNotes(accountId: string, entityId: string, value: string | undefined): Promise<void> {
    if (value === undefined || value.length === 0) {
      await this.secrets.delete(notesSecretKey(accountId, entityId));
      return;
    }
    await this.secrets.store(notesSecretKey(accountId, entityId), value);
  }

  // ---------- DB connection strings (SecretStorage, tenant-scoped) ----------

  getDbConnection(accountId: string, entityId: string): Thenable<string | undefined> {
    return this.secrets.get(dbConnSecretKey(accountId, entityId));
  }

  async setDbConnection(accountId: string, entityId: string, value: string): Promise<void> {
    await this.secrets.store(dbConnSecretKey(accountId, entityId), value);
  }

  async deleteDbConnection(accountId: string, entityId: string): Promise<void> {
    await this.secrets.delete(dbConnSecretKey(accountId, entityId));
  }

  // ---------- backup ----------

  /** Pair every entity of one profile with its stored secrets. */
  async exportBundle(accountId: string): Promise<BackupBundle> {
    const nodes = this.getNodes(accountId);
    const passwords: Record<string, string> = {};
    const privateKeys: Record<string, string> = {};
    const vpnConfigs: Record<string, string> = {};
    const dbConnections: Record<string, string> = {};
    const notes: Record<string, string> = {};
    const attachments: Record<string, string> = {};
    const images: Record<string, string> = {};
    for (const node of nodes) {
      if (node.type !== 'entity') {
        continue;
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
      nodes,
      passwords,
      privateKeys,
      vpnConfigs,
      dbConnections,
      notes,
      attachments,
      images,
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
      passwords: bundle.passwords,
      privateKeys: bundle.privateKeys ?? {},
      vpnConfigs: bundle.vpnConfigs ?? {},
      dbConnections: bundle.dbConnections ?? {},
      notes: bundle.notes ?? {},
      attachments: bundle.attachments ?? {},
      images: bundle.images ?? {},
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
      tombstones: snapshot.tombstones,
      horizon: snapshot.horizon,
    });
  }

  /** Replace one profile's whole tree and batch-restore its secrets. */
  async importBundle(accountId: string, bundle: BackupBundle): Promise<void> {
    const privateKeys = bundle.privateKeys ?? {};
    const vpnConfigs = bundle.vpnConfigs ?? {};
    const dbConnections = bundle.dbConnections ?? {};
    const notes = bundle.notes ?? {};
    const attachments = bundle.attachments ?? {};
    const images = bundle.images ?? {};
    // Drop secrets of entities that will disappear with the replaced tree.
    for (const node of this.getNodes(accountId)) {
      if (node.type !== 'entity') {
        continue;
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

  static newId(): string {
    return crypto.randomUUID();
  }

  private saveNodes(accountId: string, nodes: TreeNode[]): Thenable<void> {
    return this.globalState.update(nodesKey(accountId), nodes);
  }
}
