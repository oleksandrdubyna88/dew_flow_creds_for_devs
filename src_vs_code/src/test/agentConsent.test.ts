import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALLOW_LONGER,
  ALLOW_ONCE,
  ALLOW_WINDOW,
  ALLOW_WINDOW_MS,
  DENY,
  LONGER_WINDOWS_MS,
  SIGNING_BUTTONS,
  LongWindowClaim,
  SigningAnswer,
  answerFromModal,
  answerFromPick,
  consentFromChoice,
  decideSigning,
  longWindowClaim,
  longerOffer,
  withinAllowWindow,
} from '../agentConsent';
import { MAX_WINDOW_MS } from '../allowWindows';
import { SignPurpose } from '../sshAgentProtocol';

const NOW = 1_800_000_000_000;

test('Allow once signs this request and remembers nothing', () => {
  assert.deepEqual(consentFromChoice(ALLOW_ONCE, NOW), { allow: true, present: true });
});

test('Allow for 10 minutes is the ONLY answer that arms a window', () => {
  assert.deepEqual(consentFromChoice(ALLOW_WINDOW, NOW), {
    allow: true,
    present: true,
    allowedUntil: NOW + ALLOW_WINDOW_MS,
  });
  assert.equal(consentFromChoice(ALLOW_ONCE, NOW).allowedUntil, undefined);
  assert.equal(consentFromChoice(DENY, NOW).allowedUntil, undefined);
});

test('Deny refuses this signature but is NOT remembered — the next request asks again', () => {
  // A key that could not be used once is not a key that should become unusable.
  const denied = consentFromChoice(DENY, NOW);
  assert.equal(denied.allow, false);
  assert.equal(denied.allowedUntil, undefined);
  assert.equal(denied.present, true, 'saying no is a person being there');
});

test('a DISMISSED dialog refuses, and counts as nobody being present', () => {
  // The asymmetry that matters: Escape or a missed notification must not be recorded as a
  // decision, and must not postpone the idle auto-lock the way a real answer does.
  assert.deepEqual(consentFromChoice(undefined, NOW), { allow: false, present: false });
});

test('an unrecognised label allows once rather than arming anything', () => {
  // If a label is ever renamed and this file is not updated, the failure should be "asks every
  // time" — annoying — rather than "signs silently for ten minutes".
  const odd = consentFromChoice('Allow, I suppose', NOW);
  assert.equal(odd.allow, true);
  assert.equal(odd.allowedUntil, undefined);
});

test('the window covers requests until it expires, and not one after', () => {
  const until = NOW + ALLOW_WINDOW_MS;
  assert.equal(withinAllowWindow(until, NOW), true);
  assert.equal(withinAllowWindow(until, until - 1), true);
  assert.equal(withinAllowWindow(until, until), false, 'the boundary expires, it does not linger');
  assert.equal(withinAllowWindow(until, until + 1), false);
});

test('no window at all means ask, which is the default state of every key', () => {
  assert.equal(withinAllowWindow(undefined, NOW), false);
});

test('ten minutes is the stated number, not an accident of arithmetic', () => {
  assert.equal(ALLOW_WINDOW_MS, 600_000);
  assert.match(ALLOW_WINDOW, /10 minutes/);
});

// ---- #197 E3.2: what an answer means, what may be offered ---------------------------------------------------------

const H = 3_600_000;
const LOGIN: SignPurpose = { kind: 'ssh-login', user: 'git', service: 'ssh-connection' };
const GIT_SIGNATURE: SignPurpose = { kind: 'sshsig', namespace: 'git' };
const UNKNOWN: SignPurpose = { kind: 'unknown' };

/** The answer a label means, which for every label but `ALLOW_LONGER` is a `SigningAnswer`. */
function answer(label: string | undefined): SigningAnswer {
  const read = answerFromModal(label);
  assert.notEqual(read, 'pick-longer', `${label} is not an answer by itself`);
  return read as SigningAnswer;
}

test('the label of the longer answer is "Allow longer" and ONE ellipsis character, never three dots', () => {
  assert.equal(ALLOW_LONGER.startsWith('Allow longer'), true);
  assert.deepEqual([...ALLOW_LONGER.slice('Allow longer'.length)].map((c) => c.codePointAt(0)), [0x2026]);
  assert.equal(ALLOW_LONGER.includes('...'), false);
  assert.equal((SIGNING_BUTTONS as readonly string[]).includes(ALLOW_LONGER), false, 'E3.3 adds it to the buttons, with the help');
});

test('Allow longer… authorises nothing by itself: it asks for the list', () => {
  assert.equal(answerFromModal(ALLOW_LONGER), 'pick-longer');
});

test('each label means what the table says', () => {
  assert.deepEqual(answer(ALLOW_ONCE), { kind: 'once' });
  assert.deepEqual(answer(DENY), { kind: 'deny' });
  assert.deepEqual(answer(ALLOW_WINDOW), { kind: 'window', scope: 'all', ms: 10 * 60_000 });
  assert.deepEqual(answer(undefined), { kind: 'unanswered' });
});

test('an unrecognised label allows once and arms nothing', () => {
  const odd = answer('Allow, I suppose');
  assert.deepEqual(odd, { kind: 'once' });
  assert.deepEqual(decideSigning(odd, NOW), { allow: true, present: true });
});

test('each offered length arms exactly its duration, from the pick', () => {
  for (const ms of LONGER_WINDOWS_MS) {
    const decision = decideSigning(answerFromPick(ms), NOW);
    assert.deepEqual(decision, { allow: true, present: true, window: { scope: 'login', until: NOW + ms } }, `${ms / H} hours`);
  }
  const fourHours = decideSigning(answerFromPick(4 * H), NOW + 7);
  assert.equal(fourHours.window?.until, NOW + 7 + 4 * H, 'the clock handed in at the pick is the start');
});

test('the 10-minute answer arms an `all` window from the click', () => {
  assert.deepEqual(decideSigning(answer(ALLOW_WINDOW), NOW), {
    allow: true,
    present: true,
    window: { scope: 'all', until: NOW + ALLOW_WINDOW_MS },
  });
});

test('Escape on the list refuses and counts as presence; the bound running out does not', () => {
  assert.deepEqual(answerFromPick(undefined), { kind: 'declined-longer' });
  assert.deepEqual(decideSigning(answerFromPick(undefined), NOW), { allow: false, present: true });
  assert.deepEqual(decideSigning({ kind: 'unanswered' }, NOW), { allow: false, present: false });
  assert.deepEqual(decideSigning(answer(DENY), NOW), { allow: false, present: true });
});

test('a length the list never offered allows once and arms nothing', () => {
  for (const ms of [2 * H, 0, -H, 13 * H, 3_600_001, Number.NaN]) {
    const picked = answerFromPick(ms);
    assert.deepEqual(picked, { kind: 'once' }, `${ms}`);
    assert.deepEqual(decideSigning(picked, NOW), { allow: true, present: true });
  }
});

test('the lengths are 1, 4, 8 and 12 hours, shortest first, none past the login ceiling', () => {
  assert.deepEqual([...LONGER_WINDOWS_MS], [1 * H, 4 * H, 8 * H, 12 * H]);
  assert.equal(Math.max(...LONGER_WINDOWS_MS), MAX_WINDOW_MS.login);
  assert.equal(LONGER_WINDOWS_MS.every((ms) => ms <= MAX_WINDOW_MS.login), true);
});

test('a login with a SHA-2 or non-RSA signature may have a long window; SHA-1 RSA and every other purpose may not', () => {
  assert.equal(longWindowClaim(LOGIN, false), 'login');
  assert.equal(longWindowClaim(LOGIN, true), 'sha1-login');
  assert.equal(longWindowClaim(GIT_SIGNATURE, false), 'not-login');
  assert.equal(longWindowClaim(UNKNOWN, false), 'not-login');
  assert.equal(longWindowClaim(GIT_SIGNATURE, true), 'not-login', 'SHA-1 does not turn a signature into a login');
});

test('the longer answer is offered only for a login: never for SHA-1, locked, or with auto-lock off — and says which', () => {
  assert.deepEqual(longerOffer('login', false, 60), { offer: true });
  assert.deepEqual(longerOffer('login', false, 1), { offer: true });
  assert.deepEqual(longerOffer('not-login', false, 60), { offer: false, why: 'Longer windows cover SSH logins only' });
  assert.deepEqual(longerOffer('sha1-login', false, 60), {
    offer: false,
    why: 'Longer windows need a SHA-2 signature: this RSA login asked for SHA-1',
  });
  assert.deepEqual(longerOffer('login', true, 60), {
    offer: false,
    why: 'Longer windows need the vault unlocked — a lock ends them',
  });
  const off = { offer: false, why: 'Longer windows need idle auto-lock: credSshManager.autoLockMinutes is off' };
  assert.deepEqual(longerOffer('login', false, 0), off);
  assert.deepEqual(longerOffer('login', false, -5), off, 'a negative value is off too');
  assert.deepEqual(longerOffer('login', false, Number.NaN), off, 'a value that is not a number is not "on"');
});

test('a claim that is neither login nor sha1-login is never offered a long window, and gets the "logins only" reason', () => {
  for (const claim of ['forwarded-login', '', 'LOGIN', 'sshsig'] as unknown as LongWindowClaim[]) {
    assert.deepEqual(
      longerOffer(claim, false, 60),
      { offer: false, why: 'Longer windows cover SSH logins only' },
      `claim "${claim}"`,
    );
  }
  assert.equal((longerOffer('forwarded-login' as unknown as LongWindowClaim, true, 0) as { why: string }).why, 'Longer windows cover SSH logins only');
});

test('the answers shared by every prompt are frozen, so no caller can turn "once" into something else', () => {
  assert.equal(Object.isFrozen(answerFromModal(ALLOW_ONCE)), true, 'allow once');
  assert.equal(Object.isFrozen(answerFromModal(undefined)), true, 'unanswered');
  assert.equal(Object.isFrozen(answerFromModal('Allow, I suppose')), true, 'an unrecognised label allows once');
  assert.equal(Object.isFrozen(answerFromPick(2 * H)), true, 'a length never offered allows once');
});

test('when several reasons apply, the first in the order is the one said: logins only, SHA-1, locked, auto-lock', () => {
  assert.equal((longerOffer('not-login', true, 0) as { why: string }).why, 'Longer windows cover SSH logins only');
  assert.match((longerOffer('sha1-login', true, 0) as { why: string }).why, /SHA-2/);
  assert.match((longerOffer('login', true, 0) as { why: string }).why, /unlocked/);
});
