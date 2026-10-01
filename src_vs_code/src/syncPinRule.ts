import { SECRET_KINDS, SecretMapKey } from './secretMaps';
import { isLockedSecret } from './secretEnvelope';
import { stored } from './storedSecret';
import type { TreeNode } from './types';
import { VersionVector, concurrent, dominates, emptyVector, mergeVectors } from './versionVector';

/**
 * The sync merge's rule for PROTECTION — which side wins when two machines disagree about whether an
 * entry is under its PIN (entry-PIN plan §5.9, D12, rule R6).
 *
 * <p>The merge broke concurrent vectors on the wall clock. So machine B, not yet synced, edits the
 * entry machine A has just protected, and if B's clock is later, B's plaintext and unmarked node
 * replace A's envelopes: the protection is silently undone. And the per-slot fallback took the
 * loser's value for any slot the winner lacked — a plaintext slot from the losing side could land in
 * a protected winner.</p>
 *
 * <ol>
 *   <li><b>Dominance still decides first.</b> A causally later write SAW the protection state, so
 *       what it did about it is a decision, not a race.</li>
 *   <li><b>Concurrent vectors whose SEALED state differs</b> are decided by `TreeNode.pinEpoch`, the
 *       count of protection decisions: the higher one is the later decision and wins; equal epochs →
 *       the sealed side wins (fail closed). "Sealed" is read from the envelopes — the truth — never
 *       from the `pinProtected` mark, which is a mirror and can be lost.</li>
 *   <li><b>When that overrides the wall clock</b>, the kept node's vector is the merge of both, so
 *       the resolution dominates both inputs and an older build elsewhere accepts it by dominance
 *       instead of flipping it back on its clock.</li>
 *   <li><b>The fallback takes a value only when its sealed state MATCHES the winner's</b> — a sealed
 *       winner takes no plaintext, and an unsealed winner takes no envelope (plan gate, finding 4:
 *       the second direction would hand a just-unprotected entry an envelope, which is D1, D2 and D6
 *       all over again).</li>
 *   <li><b>Two SEALED sides that raced do not mix at all.</b> Both protected concurrently — perhaps
 *       under two different PINs — so the rule does not fire and the clock picks one node; that node
 *       then wins wholesale and borrows no sealed slot from the loser, because a value sealed under
 *       the loser's PIN inside the winner's entry is a value the winner's PIN can never open (§5.9,
 *       table row 4). Attachments and images are outside the PIN and still fill in.</li>
 * </ol>
 *
 * <p>Pure: `mergeProfiles` calls it, and `syncMerge.test.ts` asserts it in both argument orders.</p>
 */

/**
 * The secret maps a PIN wraps — every kind the vault syncs except attachments and images, which the
 * slot table (`entitySlots.ts`) deliberately leaves outside the PIN. Derived from the vault's own list
 * of kinds, so a kind added there is judged here with no line written; `syncPinRule` tests assert the
 * count against the slot table.
 */
export const SEALABLE_MAPS: readonly SecretMapKey[] = SECRET_KINDS.map((kind) => kind.bundleKey).filter(
  (key) => key !== 'attachments' && key !== 'images',
);

/** The maps a side's snapshot holds — `ProfileSnapshot`'s shape, without importing the merge. */
export type SecretSide = Partial<Record<SecretMapKey, Record<string, string>>>;

/** Whether this side holds a SEALED value for `id` — from the envelopes, never from the mark. */
export function sealedIn(side: SecretSide, id: string): boolean {
  return SEALABLE_MAPS.some((key) => isLockedSecret(stored(side[key]?.[id])));
}

/** One side of a merge for one id: its node, and whether its values are sealed. */
export interface PinSide {
  readonly node: TreeNode;
  readonly sealed: boolean;
}

/**
 * What the rule decided: the node to keep, which side it came from (for the per-slot copy), and
 * whether that side wins WHOLESALE — both sides sealed and concurrent, so nothing sealed is borrowed.
 */
export interface PinDecision {
  readonly node: TreeNode;
  readonly from: 'a' | 'b';
  readonly wholesale: boolean;
}

/**
 * The node to keep for one id present on both sides. `byClock` is what the merge would pick without
 * this rule (`pickNode`); it stands whenever the rule does not reach — dominance, or the same sealed
 * state on both sides.
 */
export function decideProtection(a: PinSide, b: PinSide, byClock: TreeNode): PinDecision {
  const ruled = ruledWinner(a, b);
  const clockSide = sideOf(byClock, a);
  if (ruled === undefined || ruled === clockSide) {
    return { node: byClock, from: clockSide, wholesale: racedSealed(a, b) };
  }
  const winner = ruled === 'a' ? a.node : b.node;
  return { node: { ...winner, v: mergeVectors(vectorOf(a.node), vectorOf(b.node)) }, from: ruled, wholesale: false };
}

/** Both sides sealed and neither saw the other: rule 5 — one node wins wholesale. */
function racedSealed(a: PinSide, b: PinSide): boolean {
  return a.sealed && b.sealed && concurrent(vectorOf(a.node), vectorOf(b.node));
}

function sideOf(node: TreeNode, a: PinSide): 'a' | 'b' {
  return node === a.node ? 'a' : 'b';
}

/** The side the protection rule picks, or `undefined` when the rule does not reach this pair. */
function ruledWinner(a: PinSide, b: PinSide): 'a' | 'b' | undefined {
  const [va, vb] = [vectorOf(a.node), vectorOf(b.node)];
  if (dominates(va, vb) || dominates(vb, va) || a.sealed === b.sealed) {
    return undefined;
  }
  return laterDecision(a, b);
}

/** The higher epoch is the later decision; equal epochs fail closed, to the sealed side. */
function laterDecision(a: PinSide, b: PinSide): 'a' | 'b' {
  const [ea, eb] = [epochOf(a.node), epochOf(b.node)];
  if (ea !== eb) {
    return ea > eb ? 'a' : 'b';
  }
  return a.sealed ? 'a' : 'b';
}

function vectorOf(node: TreeNode): VersionVector {
  return node.v ?? emptyVector();
}

/** An older build never wrote one: no decision recorded is epoch 0. */
function epochOf(node: TreeNode): number {
  return node.pinEpoch ?? 0;
}

/**
 * Which of the losing side's values the per-slot fallback may take for a slot the winner lacks:
 * only sealed ones (a sealed winner), only plain ones (an unsealed winner), or none at all (two sealed
 * sides that raced — rule 5).
 */
export type FallbackRule = 'sealed' | 'plain' | 'none';

/** The fallback rule for a sealable map, from the winner's sealed state and the decision. */
export function fallbackRuleFor(winnerSealed: boolean, wholesale: boolean): FallbackRule {
  if (wholesale) {
    return 'none';
  }
  return winnerSealed ? 'sealed' : 'plain';
}

/**
 * The per-slot fallback, guarded: the losing side's value for a slot the winner lacks is taken only
 * when the rule allows it — `undefined` otherwise, and the slot stays empty.
 */
export function fallbackValue(value: string | undefined, rule: FallbackRule): string | undefined {
  if (value === undefined || rule === 'none') {
    return undefined;
  }
  return isLockedSecret(stored(value)) === (rule === 'sealed') ? value : undefined;
}

/**
 * A protection DECISION as one node write (`StorageManager.updateNodeFields` with a function patch,
 * evaluated inside the write lease): the mark AND `pinEpoch + 1` together, so no machine ever sees a
 * new mark with the old count or the other way round. Protect, Remove PIN and a sealed share import
 * write this; the door's healing of a lost mark never does — it is a repair, not a decision.
 */
export function protectionDecision(on: boolean): (node: TreeNode) => Partial<TreeNode> {
  return (node) => ({ details: markedDetails(node, on), pinEpoch: epochOf(node) + 1 });
}

function markedDetails(node: TreeNode, on: boolean): TreeNode['details'] {
  return node.details === undefined ? undefined : { ...node.details, pinProtected: on ? true : undefined };
}
