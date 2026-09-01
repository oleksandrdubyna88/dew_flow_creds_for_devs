import * as crypto from 'node:crypto';
import { BackupBundle, TreeNode } from './types';

/**
 * Giving a fresh local id to any entity whose own id could break something.
 *
 * <p><b>Why an id is dangerous at all.</b> An entity id is concatenated into things that parse
 * it: a SecretStorage key (`${accountId}_${entityId}`, plus a `:sshPrivateKey` / `:notes` / …
 * suffix per kind) and a file name inside `keys/&lt;pid&gt;/`. Both were reachable — an id of
 * `x:sshPrivateKey` addressed another entity's private-key slot, and one of
 * `x/../../../../evil` escaped the key directory — and both are now fixed at the point of use.
 * This module closes the class instead of its instances: an id that could do either never
 * enters the vault.</p>
 *
 * <p><b>Where it belongs.</b> Ids are generated locally as uuids, and accepting a share already
 * mints a fresh one (`shareInbox`). The gap is `importBundle`, which is reached by RESTORE — a
 * file whose PIN someone may have been given along with the file — and by SYNC, whose envelope
 * is written by whatever can write the sync location.</p>
 *
 * <p><b>Why renaming rather than rejecting.</b> Refusing the whole bundle would break importing
 * a vault written by a different tool for the sake of one odd id, which is a real cost paid by
 * honest users to stop a dishonest one. Renaming loses nothing: the entity arrives, with a new
 * identity, and the map records what it was called so a SECOND import of the same file updates
 * that entity instead of adding a duplicate. That is the mechanism `shareOrigin.ts` already uses
 * for exactly this problem, applied to a different source.</p>
 *
 * <p><b>A safe id is passed through untouched, and that is load-bearing.</b> Sync calls this on
 * every cycle: if an ordinary uuid were rewritten, each cycle would rename every entity, push the
 * renames, and every other machine would see its whole vault replaced. So the common case must be
 * identity — asserted, not assumed.</p>
 */

/**
 * Characters that cannot break a key or a path: no separator (`_`, `:`), no path component
 * (`/`, `\`, `..`), nothing a shell or a URL would read.
 *
 * <p>Deliberately wider than "must be a uuid". A vault written by an older build, or by another
 * tool, may use ids of its own shape, and renaming those would duplicate a person's entries for
 * no security gain.</p>
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,127}$/;

export function isSafeEntityId(id: string): boolean {
  return SAFE_ID.test(id) && !id.includes('..');
}

export interface Quarantined {
  bundle: BackupBundle;
  /** The id it arrived with → the id it was given. Empty when nothing had to be renamed. */
  renamed: Record<string, string>;
}

/** Re-key a record whose keys are entity ids, leaving unrenamed entries where they are. */
function rekey<T>(
  source: Record<string, T> | undefined,
  renamed: Readonly<Record<string, string>>,
): Record<string, T> | undefined {
  if (source === undefined) {
    return undefined;
  }
  const out: Record<string, T> = {};
  for (const [id, value] of Object.entries(source)) {
    out[renamed[id] ?? id] = value;
  }
  return out;
}

/** One id, pointed at its replacement when it has one. */
type Rename = (id: string) => string;

/** The id references inside `details` — a key source, a jump host, and the dependency list. */
function remapDetails(details: NonNullable<TreeNode['details']>, to: Rename): TreeNode['details'] {
  const key = details.sshKeyEntityId;
  const jump = details.jumpHostEntityId;
  const depends = details.dependsOn;
  return {
    ...details,
    id: to(details.id),
    ...(key === undefined ? {} : { sshKeyEntityId: to(key) }),
    ...(jump === undefined ? {} : { jumpHostEntityId: to(jump) }),
    ...(depends === undefined ? {} : { dependsOn: depends.map(to) }),
  };
}

/** Every id reference a node carries, pointed at the new ids. */
function remapNode(node: TreeNode, renamed: Readonly<Record<string, string>>): TreeNode {
  const to: Rename = (id) => renamed[id] ?? id;
  const details = node.details;
  return {
    ...node,
    id: to(node.id),
    parentId: node.parentId == null ? node.parentId : to(node.parentId),
    ...(details === undefined ? {} : { details: remapDetails(details, to) }),
  };
}

/**
 * Plan the renames: which ids are unsafe, and what each becomes.
 *
 * <p>`known` is consulted first so a re-import of the same file reuses the id it was given last
 * time — otherwise the second import would add a duplicate beside the first, which is the defect
 * `shareOrigin.ts` was written to stop.</p>
 */
function planRenames(
  nodes: readonly TreeNode[],
  known: Readonly<Record<string, string>>,
  mint: () => string,
): Record<string, string> {
  const renamed: Record<string, string> = {};
  for (const node of nodes) {
    if (!isSafeEntityId(node.id)) {
      renamed[node.id] = known[node.id] ?? mint();
    }
  }
  return renamed;
}

/**
 * The bundle with every unsafe id replaced, and every reference to one pointed at its
 * replacement.
 *
 * <p>Returns the SAME bundle object when nothing had to change, so the ordinary path — every
 * sync cycle — allocates nothing and cannot differ from the input by accident.</p>
 */
/** The bundle rebuilt against a non-empty rename map. */
function remapBundle(bundle: BackupBundle, renamed: Readonly<Record<string, string>>): BackupBundle {
  return {
    ...bundle,
    nodes: bundle.nodes.map((node) => remapNode(node, renamed)),
    passwords: rekey(bundle.passwords, renamed) ?? {},
    privateKeys: rekey(bundle.privateKeys, renamed),
    vpnConfigs: rekey(bundle.vpnConfigs, renamed),
    dbConnections: rekey(bundle.dbConnections, renamed),
    notes: rekey(bundle.notes, renamed),
    fields: rekey(bundle.fields, renamed),
    attachments: rekey(bundle.attachments, renamed),
    images: rekey(bundle.images, renamed),
    totps: rekey(bundle.totps, renamed),
    // Missing since the `config` kind shipped in 0.77.0, and found only because `payment` met the
    // identical bug in review. A config document left behind is the whole file the entry exists to
    // hold: the restored entry reads as an empty config, the next export omits it, and the only copy
    // becomes an unreachable keychain orphan.
    configs: rekey(bundle.configs, renamed),
    payments: rekey(bundle.payments, renamed),
    // Tombstones are keyed by node id and must follow, or a renamed entity's deletion would
    // stop applying. `horizon` is keyed by DEVICE, not by node, and deliberately does not.
    tombstones: rekey(bundle.tombstones, renamed),
  };
}

/**
 * The bundle with every unsafe id replaced, and every reference to one pointed at its
 * replacement.
 *
 * <p>Returns the SAME bundle object when nothing had to change, so the ordinary path — every
 * sync cycle — allocates nothing and cannot differ from the input by accident.</p>
 */
export function quarantineUnsafeIds(
  bundle: BackupBundle,
  known: Readonly<Record<string, string>> = {},
  mint: () => string = (): string => crypto.randomUUID(),
): Quarantined {
  const renamed = planRenames(bundle.nodes, known, mint);
  return Object.keys(renamed).length === 0
    ? { bundle, renamed }
    : { bundle: remapBundle(bundle, renamed), renamed };
}
