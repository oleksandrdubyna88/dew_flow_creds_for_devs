import { KeyWrap, LoginKeyBinding, recoveryWrap, upsertWrap, wrapWithPinAsync } from './keyWrap';

/**
 * What a corporate developer's wraps should be, decided in one pure place so the sync cycle only has
 * to apply the answer — the shape `orgEscrowOps.ts` uses, and for its reason: the decision is worth
 * reading on its own, and the mechanical half must not be able to disagree with it.
 *
 * <p>Pure — no `vscode`, no I/O, no clock.</p>
 */

/** What this cycle knows about the person and the server. */
export interface LoginKeyFacts {
  /** The policy the server derived for them, or undefined when this cycle could not ask. */
  policy?: { role: string; active: boolean };
  /**
   * The login key this client currently holds, or undefined when it has none — offline, a server
   * without the feature, a member who was never issued one.
   */
  loginKey?: { fingerprint: string };
  /** Whether the PIN is available to re-derive the PIN wrap's key in THIS write. */
  canRewritePinWrap: boolean;
}

export type LoginKeyAction =
  /** The wraps are already right, or nothing is known well enough to change them. */
  | { kind: 'unchanged' }
  /** Bind the wraps this write can reach to the current login key. */
  | { kind: 'bind'; reason: 'first' | 'rekeyed' }
  /** This person is no longer a developer: rewrite the wraps unbound. */
  | { kind: 'unbind' }
  /** A bound vault, and no key to bind with. The write must not proceed unbound. */
  | { kind: 'refuse'; reason: 'noLoginKey' | 'keyChanged' };

/** True when any wrap in this vault is sealed to a login key. */
export function isBoundVault(wraps: readonly KeyWrap[]): boolean {
  return wraps.some((w) => w.serverBound === true);
}

/** The fingerprint this vault's bound wraps name, or undefined when it has none. */
export function boundFingerprint(wraps: readonly KeyWrap[]): string | undefined {
  return wraps.find((w) => w.serverBound === true)?.loginKeyFingerprint;
}

/**
 * What should happen to this vault's binding on the next write.
 *
 * <p><b>Not knowing changes nothing</b> — the rule `escrowAction` states, and the one that matters
 * most here. `policy === undefined` is "we could not ask this cycle": a timeout, an older server, a
 * laptop on a train. Treating it as "not a developer" would strip the binding off a developer's
 * vault once per flaky network, which is the exact failure this whole epic exists to prevent.</p>
 *
 * <p><b>But not knowing must never DOWNGRADE either.</b> A vault that is already bound and a client
 * that cannot produce the key is a `refuse`, not an `unchanged`: the caller must abandon the write
 * rather than rewrite bound wraps as unbound ones. Both a silent strip and a silent success are how
 * a file that was supposed to be dead without the server quietly becomes openable again.</p>
 */
export function loginKeyAction(wraps: readonly KeyWrap[], facts: LoginKeyFacts): LoginKeyAction {
  const bound = isBoundVault(wraps);
  if (facts.policy === undefined) {
    return withoutAPolicy(bound, facts);
  }
  if (!isDeveloper(facts.policy)) {
    return bound ? { kind: 'unbind' } : { kind: 'unchanged' };
  }
  return developerAction(wraps, facts, bound);
}

/** Could not ask: change nothing, and refuse only where proceeding would strip a binding. */
function withoutAPolicy(bound: boolean, facts: LoginKeyFacts): LoginKeyAction {
  if (!bound) {
    return { kind: 'unchanged' };
  }
  return facts.loginKey === undefined ? { kind: 'refuse', reason: 'noLoginKey' } : { kind: 'unchanged' };
}

/** Only an ACTIVE developer's vault is bound; a blocked one is refused by the server long before this. */
function isDeveloper(policy: { role: string; active: boolean }): boolean {
  return policy.role === 'dev' && policy.active;
}

function developerAction(
  wraps: readonly KeyWrap[],
  facts: LoginKeyFacts,
  bound: boolean,
): LoginKeyAction {
  const held = facts.loginKey;
  if (held === undefined) {
    // A developer with no key in hand. An unbound vault simply waits — binding needs one online
    // round trip and there is no hurry — while a bound one must not be written at all.
    return withoutAPolicy(bound, facts);
  }
  return bound ? alreadyBoundAction(wraps, facts, held.fingerprint) : firstBindAction(facts);
}

/** An unbound developer vault binds as soon as a write can rewrite the PIN wrap, and waits otherwise. */
function firstBindAction(facts: LoginKeyFacts): LoginKeyAction {
  return facts.canRewritePinWrap ? { kind: 'bind', reason: 'first' } : { kind: 'unchanged' };
}

/**
 * A bound vault meeting the key it should be bound to — or a different one.
 *
 * <p>A fingerprint that has moved on means a restore from an older backup, or a key replaced by
 * hand. Rebinding needs the vault OPEN, which needs the key it was sealed to, which is exactly what
 * is missing — so a client that cannot rewrite the PIN wrap refuses and names the real problem
 * rather than writing a file nobody can open.</p>
 */
function alreadyBoundAction(
  wraps: readonly KeyWrap[],
  facts: LoginKeyFacts,
  fingerprint: string,
): LoginKeyAction {
  if (boundFingerprint(wraps) === fingerprint) {
    return { kind: 'unchanged' };
  }
  return facts.canRewritePinWrap ? { kind: 'bind', reason: 'rekeyed' } : { kind: 'refuse', reason: 'keyChanged' };
}

/**
 * The wraps that must LEAVE a developer's vault, and the one rule that stops the answer from
 * stranding somebody.
 *
 * <p>Two doors bypass the login key while they exist. The printed <b>recovery code</b> opens the file
 * with no PIN and no server — the same door by another name, and the epic's decision is that a
 * developer does not get one. An <b>unbound security-key wrap</b> is the other: it opens the vault
 * offline with the key in the person's pocket, so a vault whose PIN wrap is bound while its WebAuthn
 * wrap is not has not actually become server-dependent. A security-key wrap can only be REWRITTEN
 * while the person is touching the key, so the honest move is to drop it and ask for a
 * re-registration.</p>
 *
 * <p><b>Never strip the last way in.</b> If dropping these would leave no usable wrap — no bound PIN
 * wrap to fall back on — nothing is dropped and the vault stays as it is: a person locked out of
 * their own credentials is a worse outcome than a door that closes one sync later, and the caller
 * says which of the two happened.</p>
 */
export function wrapsToStripForDeveloper(wraps: readonly KeyWrap[]): KeyWrap[] {
  const doomed = wraps.filter((w) => w === recoveryWrap(wraps) || isUnboundKeyWrap(w));
  const survivors = wraps.filter((w) => !doomed.includes(w));
  return survivors.some(canStillOpen) ? doomed : [];
}

function isUnboundKeyWrap(wrap: KeyWrap): boolean {
  return wrap.kind === 'webauthn' && wrap.serverBound !== true;
}

/** A wrap somebody can actually unlock with today: a PIN or a security key, bound or not. */
function canStillOpen(wrap: KeyWrap): boolean {
  return wrap.kind === 'pin' || wrap.kind === 'webauthn';
}

/**
 * The wrap list a bind or an unbind should write.
 *
 * <p>Only the PIN wrap is rewritten here, and only because it is the one whose key this process can
 * re-derive: it needs the PIN, which the caller has. A security-key wrap's key comes from a secret
 * that exists only while the person is touching the key, so it cannot be rebound in a background
 * cycle — {@link wrapsToStripForDeveloper} drops it instead, and the person re-registers.</p>
 *
 * <p>The recovery wrap goes with it for a developer, because a printed code opens the file with no
 * PIN and no server: the same door by another name. It is NOT restored on demotion — a code the
 * person still has printed on paper must not silently start working again — and the caller says so.</p>
 */
export async function applyLoginKeyAction(
  wraps: readonly KeyWrap[],
  action: LoginKeyAction,
  masterKey: Buffer,
  accountId: string,
  pin: string,
  binding: LoginKeyBinding | undefined,
  now: number,
): Promise<KeyWrap[]> {
  if (action.kind === 'unbind') {
    return upsertWrap(wraps, await wrapWithPinAsync(masterKey, accountId, pin, now));
  }
  if (action.kind !== 'bind') {
    return [...wraps];
  }
  const rewritten = upsertWrap(wraps, await wrapWithPinAsync(masterKey, accountId, pin, now, binding));
  const doomed = wrapsToStripForDeveloper(rewritten);
  return rewritten.filter((w) => !doomed.includes(w));
}
