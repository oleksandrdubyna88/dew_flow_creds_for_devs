import { KeyWrap, orgEscrowWrap, removeWrap, upsertWrap, wrapWithOrgEscrow } from './keyWrap';
import { OrgRecoveryVerdict, verdictBlocksEnrolment } from './orgRecoveryPinning';

/**
 * Whether this vault's escrow wrap is current, and what to do about it — decided in one pure
 * place so the sync cycle only has to apply the answer.
 *
 * <p>Enrolment is automatic: on a server with corporate recovery configured, every vault gains
 * the wrap on its next ordinary write, with no command to run and nothing to click. That is
 * the owner's decision (recorded in `todo/PLAN_org_recovery.md`) and it is why the client is
 * obliged to SAY so — see `orgRecoveryPinning.orgRecoveryNotice`.</p>
 *
 * <p>Pure — no `vscode`, no I/O.</p>
 */

export interface EscrowEnrolment {
  /** The published key to seal to, and which generation it is. */
  orgPublicKey: Buffer;
  orgPublicKeyFingerprint: string;
  /** What trust-on-first-use made of it. A blocking verdict is honoured here, not by the caller. */
  verdict: OrgRecoveryVerdict;
}

export type EscrowAction =
  /** The wraps are already right. */
  | { kind: 'unchanged' }
  /** Seal the master key to the org key — first time, or the published key has moved on. */
  | { kind: 'enrol'; reason: 'absent' | 'stale' }
  /** Corporate recovery went away, or its key is no longer trusted: drop the wrap. */
  | { kind: 'remove'; reason: 'disabled' | 'untrusted' };

/**
 * What should happen to the escrow wrap on the next write.
 *
 * <p><b>An unavailable answer changes nothing.</b> `enrolment === undefined` is "we could not
 * ask the server this cycle" — a timeout, an older server, an offline laptop — and the safe
 * response to not knowing is to leave the wraps exactly as they are. Treating it as "corporate
 * recovery is off" would silently strip a wrap the company relies on, once per flaky network.</p>
 */
// eslint-disable-next-line complexity
export function escrowAction(
  wraps: readonly KeyWrap[],
  enrolment: EscrowEnrolment | undefined,
): EscrowAction {
  const existing = orgEscrowWrap(wraps);
  if (enrolment === undefined) {
    return { kind: 'unchanged' };
  }
  if (enrolment.verdict === 'off') {
    return existing === undefined ? { kind: 'unchanged' } : { kind: 'remove', reason: 'disabled' };
  }
  if (verdictBlocksEnrolment(enrolment.verdict)) {
    // The published key is not the pinned one. Refusing to ADD is not enough: a wrap already
    // sealed to a key somebody may have substituted has to go, or the substitution keeps
    // paying out on every vault version written before it was noticed.
    return existing === undefined ? { kind: 'unchanged' } : { kind: 'remove', reason: 'untrusted' };
  }
  if (enrolment.verdict === 'notReady') {
    return { kind: 'unchanged' };
  }
  if (existing === undefined) {
    return { kind: 'enrol', reason: 'absent' };
  }
  return existing.orgPublicKeyFingerprint === enrolment.orgPublicKeyFingerprint
    ? { kind: 'unchanged' }
    : { kind: 'enrol', reason: 'stale' };
}

/**
 * The wrap list a write should carry, given that decision.
 *
 * <p>Separate from {@link escrowAction} because the decision is worth reading on its own — the
 * caller shows the person a different sentence for each reason — while this is the mechanical
 * half that must not be able to disagree with it.</p>
 */
export function applyEscrowAction(
  wraps: readonly KeyWrap[],
  action: EscrowAction,
  masterKey: Buffer,
  enrolment: EscrowEnrolment | undefined,
  now: number,
): KeyWrap[] {
  if (action.kind === 'remove') {
    return removeWrap(wraps, 'org-escrow', 'org-escrow');
  }
  if (action.kind === 'enrol' && enrolment !== undefined) {
    return upsertWrap(
      wraps,
      wrapWithOrgEscrow(
        masterKey,
        enrolment.orgPublicKey,
        enrolment.orgPublicKeyFingerprint,
        now,
      ),
    );
  }
  return [...wraps];
}

function describeEnrol(reason: 'absent' | 'stale', officers: readonly string[]): string {
  return reason === 'absent'
    ? `This vault is now also recoverable by your organisation's officers (${officers.join(', ')}).`
    : 'The corporate recovery key changed; this vault has been re-sealed to the new one.';
}

function describeRemove(reason: 'disabled' | 'untrusted'): string {
  return reason === 'disabled'
    ? 'Corporate recovery is switched off on this server; this vault is no longer sealed to it.'
    : 'The corporate recovery key is not the one this machine trusts — this vault is no longer sealed to it.';
}

/** One line for the person, when something actually changed. Empty when nothing did. */
export function describeEscrowAction(action: EscrowAction, officers: readonly string[]): string {
  if (action.kind === 'enrol') {
    return describeEnrol(action.reason, officers);
  }
  return action.kind === 'remove' ? describeRemove(action.reason) : '';
}
