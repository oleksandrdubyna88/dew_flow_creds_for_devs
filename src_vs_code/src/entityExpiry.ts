import { TreeNode } from './types';

/**
 * When a short-lived entry stops existing.
 *
 * <p>Developers make one-off credentials constantly — a staging token, a temporary key for a
 * customer's box, a test Stripe key, a service password for one debugging session. None of
 * them has a moment when somebody decides to delete it, so a year later the vault is two
 * hundred entries of which a hundred and fifty are `test-key-2` from two years ago. Each dead
 * entry is also a live secret that still works somewhere.</p>
 *
 * <p><b>What "expired" must mean.</b> Not a flag, not a hidden row: a real delete, through
 * `StorageManager.deleteNodeRecursive`, which writes a causal tombstone, removes all eight
 * SecretStorage keys — <i>including the revision history</i> — and lets the existing merge
 * carry the deletion to every other machine. A "burned" marker that left the node in place
 * would leave the old password retrievable from history, present in the next backup, and, with
 * no tombstone and no version bump, would be silently resurrected by the next machine that
 * synced. This module therefore only ever answers <i>whether</i>; the caller does the deleting,
 * and there is exactly one way to do it.</p>
 *
 * <p>Pure and `vscode`-free, in the shape of `lockState.ts`: the rule lives here, the timer
 * lives with whoever owns a clock.</p>
 */

/** What ends an entry's life. Absent means it lives until somebody deletes it. */
export type BurnPolicy =
  /** Gone at `expiresAt`. */
  | 'ttl'
  /** Gone after an agent uses it once through the broker. */
  | 'oneUse'
  /** Gone when this window closes. */
  | 'onClose';

export const BURN_POLICIES: readonly BurnPolicy[] = ['ttl', 'oneUse', 'onClose'];

export function isBurnPolicy(value: unknown): value is BurnPolicy {
  return typeof value === 'string' && (BURN_POLICIES as readonly string[]).includes(value);
}

/** Presets the form offers, in the order it offers them. */
export const LIFETIME_CHOICES: readonly {
  readonly label: string;
  readonly policy?: BurnPolicy;
  readonly ms?: number;
}[] = [
  { label: 'Forever' },
  { label: '1 hour', policy: 'ttl', ms: 60 * 60_000 },
  { label: '1 day', policy: 'ttl', ms: 24 * 60 * 60_000 },
  { label: 'Until this window closes', policy: 'onClose' },
  { label: 'Until an agent uses it once', policy: 'oneUse' },
];

/** The expiry stamp for a chosen preset, or `undefined` when the choice needs no clock. */
export function expiresAtFor(choice: { policy?: BurnPolicy; ms?: number }, nowMs: number): number | undefined {
  return choice.policy === 'ttl' && choice.ms !== undefined ? nowMs + choice.ms : undefined;
}

/** Whether this entry's clock has run out. Never true for an entry without one. */
export function isExpired(node: TreeNode, nowMs: number): boolean {
  const at = node.details?.expiresAt;
  return typeof at === 'number' && nowMs >= at;
}

/** Whether closing the window should take this entry with it. */
export function burnsOnClose(node: TreeNode): boolean {
  return node.details?.burnPolicy === 'onClose';
}

/**
 * Whether an agent's successful use should take this entry with it.
 *
 * <p>Only the broker counts, by the owner's decision. A person copying the password or
 * connecting from the tree does NOT burn it — which is why the UI must say "after an agent
 * uses it" rather than "one-time", or the name promises more than the code does.</p>
 */
export function burnsOnAgentUse(node: TreeNode): boolean {
  return node.details?.burnPolicy === 'oneUse';
}

/** Everything in a set whose time has come — the exact list a sweep should delete. */
export function expiredNodes(nodes: readonly TreeNode[], nowMs: number): TreeNode[] {
  return nodes.filter((node) => node.type === 'entity' && isExpired(node, nowMs));
}

/** Entries a window's closing should take with it. */
export function nodesBurnedOnClose(nodes: readonly TreeNode[]): TreeNode[] {
  return nodes.filter((node) => node.type === 'entity' && burnsOnClose(node));
}

/**
 * How long is left, in the words a tree row uses.
 *
 * <p>Coarse on purpose: the sweep runs once a minute, so a second-by-second countdown would
 * promise a precision the mechanism does not have.</p>
 */
const CLOCKLESS: Partial<Record<BurnPolicy, string>> = {
  onClose: 'until this window closes',
  oneUse: 'until an agent uses it',
};

export function describeRemaining(node: TreeNode, nowMs: number): string {
  return clocklessText(node.details?.burnPolicy) ?? onClock(node.details?.expiresAt, nowMs);
}

function clocklessText(policy: BurnPolicy | undefined): string | undefined {
  return policy === undefined ? undefined : CLOCKLESS[policy];
}

function onClock(expiresAt: number | undefined, nowMs: number): string {
  return typeof expiresAt === 'number' ? describeGap(expiresAt - nowMs) : '';
}

function describeGap(ms: number): string {
  if (ms <= 0) {
    return 'expired';
  }
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) {
    return `expires in ${minutes} min`;
  }
  const hours = Math.ceil(minutes / 60);
  return hours < 48 ? `expires in ${hours} h` : `expires in ${Math.ceil(hours / 24)} days`;
}

/** Whether a row should be tinted as going soon — the same idea as the history tint. */
export function expiresSoon(node: TreeNode, nowMs: number, withinMs: number): boolean {
  const at = node.details?.expiresAt;
  return typeof at === 'number' && at > nowMs && at - nowMs <= withinMs;
}
