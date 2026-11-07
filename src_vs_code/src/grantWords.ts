import type { GrantExpiry, GrantLimits } from './grantRegistry';

/**
 * The words of a grant that ran out. Pure: imports no `vscode`, so a pure module that needs the sentence does not reach the editor through
 * `grantLimits.ts`, which reads a setting (E1.3 epoch 3, R2 walks the closure).
 */

/**
 * Why a token stopped working, in the words that name the fix.
 *
 * <p>An expired token says which kind of expiry it was. "Unknown" would send an agent hunting
 * for a typo in a token that was correct an hour ago.</p>
 */
export function expiredMessage(reason: GrantExpiry, limits: GrantLimits): string {
  return reason === 'idle'
    ? `This grant expired: it went unused for more than ${Math.round(limits.idleMs / 60_000)} minutes. Ask the person for a fresh Share with Claude Code.`
    : `This grant expired: it reached its limit of ${limits.maxUses} calls. Ask the person for a fresh Share with Claude Code.`;
}
