import { applyLoginKeyAction, loginKeyAction, wrapsToStripForDeveloper } from './devLoginKeyOps';
import { KeyWrap, LoginKeyBinding } from './keyWrap';
import { StoredAccount } from './types';

/**
 * The developer binding as the sync cycle applies it: what a write should carry, or nothing when the
 * wraps are already right.
 *
 * <p>Out of `syncManager.ts` because that class coordinates a cycle and this decides a
 * cryptographic property — and because the manager is at its 800-line ceiling, which is the
 * linter's way of saying the same thing. Pure apart from the log callback, so every branch below is
 * a unit test rather than a sync run.</p>
 */

/** What a cycle knows: who the server says this person is, the key held, and the PIN if there is one. */
export interface BindingContext {
  readonly policy?: { role: string; active: boolean };
  readonly loginKey?: LoginKeyBinding;
  readonly pin?: string;
}

export interface BindingWrite {
  readonly wraps: readonly KeyWrap[];
  readonly masterKey: Buffer;
  readonly account: StoredAccount;
  readonly context: BindingContext | undefined;
  readonly now: number;
  readonly log: (message: string) => void;
  /**
   * Say something to the person, once. Used for the two changes they would otherwise discover by
   * finding that something no longer works: a printed recovery code that stops opening the vault,
   * and a security key that has to be registered again.
   */
  readonly announce: (message: string) => void;
}

/**
 * What a person must be told when their vault becomes a developer's.
 *
 * <p>Both doors close silently otherwise. The printed code keeps sitting in a drawer looking valid,
 * and the security key keeps being offered by the operating system while the vault no longer
 * accepts it — and the first time either is discovered is in the moment somebody needs it.</p>
 */
export function describeStrip(stripped: readonly KeyWrap[]): string {
  const lost = [
    stripped.some((w) => w.kind === 'recovery') ? 'the printed recovery code no longer opens it' : '',
    stripped.some((w) => w.kind === 'webauthn')
      ? 'any security key must be registered again while you are signed in'
      : '',
  ].filter((part) => part.length > 0);
  return lost.length === 0
    ? ''
    : `This vault is now sealed to your organisation server, so ${lost.join(', and ')}.`;
}

/**
 * The wrap list this write should carry, or `undefined` to leave the list alone.
 *
 * <p><b>A refusal does not stop the write, and that is deliberate.</b> An ordinary sync write
 * CARRIES the existing wraps rather than rebuilding them, so a bound vault written by a client with
 * no key stays bound — nothing is downgraded by proceeding. What must refuse are the paths that
 * REBUILD a wrap (a PIN change, a security key added), and they do it themselves, loudly. Here the
 * honest response is to leave the list as it is and say so once in the log.</p>
 *
 * <p><b>No PIN means no rewrite.</b> The PIN wrap's key cannot be re-derived without the PIN, and a
 * background cycle must not prompt for one — so a decision this write cannot carry out is deferred
 * to the next unlock that asks, rather than half-applied.</p>
 */
export async function bindingWrapsFor(write: BindingWrite): Promise<KeyWrap[] | undefined> {
  const context = write.context ?? {};
  const action = loginKeyAction(write.wraps, {
    policy: context.policy,
    loginKey: context.loginKey,
    canRewritePinWrap: context.pin !== undefined,
  });
  if (action.kind === 'refuse') {
    write.log(`${write.account.email}: vault binding left as it is (${action.reason})`);
    return undefined;
  }
  if (context.pin === undefined) {
    return undefined; // unchanged, or a decision this write cannot carry out without the PIN
  }
  return rewrite(write, action, context.pin);
}

/** The write itself, once the decision says there is one and the PIN is in hand. */
async function rewrite(
  write: BindingWrite,
  action: ReturnType<typeof loginKeyAction>,
  pin: string,
): Promise<KeyWrap[] | undefined> {
  if (action.kind === 'unchanged') {
    return undefined;
  }
  say(write, action.kind === 'bind');
  return applyLoginKeyAction(
    write.wraps,
    action,
    write.masterKey,
    write.account.accountId,
    pin,
    write.context?.loginKey,
    write.now,
  );
}

/** The log line every rewrite gets, and the person-facing sentence only a bind earns. */
function say(write: BindingWrite, binding: boolean): void {
  write.log(`${write.account.email}: ${binding ? 'binding' : 'unbinding'} the vault`);
  if (binding) {
    announceStrip(write, wrapsToStripForDeveloper(write.wraps));
  }
}

/** Say what a bind is about to take away, and say nothing when it takes nothing. */
function announceStrip(write: BindingWrite, stripped: readonly KeyWrap[]): void {
  const message = describeStrip(stripped);
  if (message.length > 0) {
    write.announce(`${write.account.email}: ${message}`);
  }
}
