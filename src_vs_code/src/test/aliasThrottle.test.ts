import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AliasThrottle, MAX_PROMPTS, SILENT_CEILING, TokenlessCeilings, WINDOW_MS } from '../aliasThrottle';

/**
 * The rate at which a caller with no token may make a window ask a human.
 *
 * <p>This is authorization, not comfort: the alias route carries no bearer token, so the
 * consent modal is the whole gate, and a gate you can ring a thousand times is one somebody
 * eventually opens to make the noise stop.</p>
 */

const NOW = 1_700_000_000_000;

test('the first call is admitted', () => {
  assert.equal(new AliasThrottle().admit(NOW), 'allow');
});

test('a second call while the first is still being answered is refused as busy', () => {
  // A stack of modals is unusable long before any count is reached, and the person cannot
  // answer the first one while the second is covering it.
  const t = new AliasThrottle();
  t.admit(NOW);

  assert.equal(t.admit(NOW), 'busy');
});

test('releasing lets the next one through', () => {
  const t = new AliasThrottle();
  t.admit(NOW);
  t.release();

  assert.equal(t.admit(NOW + 1), 'allow');
});

test('a burst past the cap is refused even when each is answered', () => {
  // The slow grind: one prompt at a time, answered and re-asked, wears somebody down just as
  // effectively as a pile-up. `busy` alone would not stop it.
  const t = new AliasThrottle();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    assert.equal(t.admit(NOW + i), 'allow', `prompt ${i}`);
    t.release();
  }

  assert.equal(t.admit(NOW + MAX_PROMPTS), 'too-many');
});

test('the window slides, so a person who genuinely uses it is not locked out', () => {
  const t = new AliasThrottle();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    t.admit(NOW + i);
    t.release();
  }
  assert.equal(t.admit(NOW + MAX_PROMPTS), 'too-many');

  assert.equal(t.admit(NOW + WINDOW_MS + 1), 'allow', 'a minute later it is open again');
});

test('a prompt is spent at the moment it is ASKED, not when it is answered', () => {
  // A caller that opens a dialog and never has it answered has still consumed the window —
  // which is exactly the abuse being prevented, so counting on answer would miss it.
  const t = new AliasThrottle();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    t.admit(NOW);
    t.release();
  }

  assert.equal(t.admit(NOW), 'too-many');
});

test('releasing more often than admitting cannot bank free slots', () => {
  // A bug in the caller must not be able to open the door: `release` is clamped at zero.
  const t = new AliasThrottle();
  t.release();
  t.release();
  t.release();

  assert.equal(t.admit(NOW), 'allow');
  assert.equal(t.admit(NOW), 'busy', 'still exactly one in flight');
});

test('the refusal says which limit was hit, and what to do', () => {
  const t = new AliasThrottle();
  assert.match(t.describe('busy'), /already waiting/i);
  assert.match(t.describe('too-many'), new RegExp(String(MAX_PROMPTS)));
});

test('the cap is low enough to matter and high enough to use', () => {
  // A person running a command in a terminal is nowhere near this; a script grinding at a
  // human is well past it. A per-second limit would still permit three hundred an hour.
  assert.ok(MAX_PROMPTS <= 10, 'a cap that lets a grind through is not a cap');
  assert.ok(MAX_PROMPTS >= 3, 'and one that blocks ordinary use is an outage');
  assert.equal(WINDOW_MS, 60_000);
});

/**
 * The silent ceiling (issue #95): the same window, constructed for a path with no human behind it.
 *
 * <p>Taking the prompt away from a pre-consented call took the limiter away with it, because on
 * this route the prompt WAS the limiter. What replaces it must bound a runaway loop without
 * refusing a dialog nobody was going to see — so it is a second construction of this class, not a
 * second class, and these tests are about what that construction may and may not do.</p>
 */

const silent = (): AliasThrottle => new AliasThrottle(SILENT_CEILING, WINDOW_MS, false);

test("the default construction is today's modal budget to the byte: five, serialized, that wording", () => {
  // Every `new AliasThrottle()` in the codebase predates the second construction and must not
  // notice it: same cap, same one-in-flight rule, same sentence — asserted as the literal string,
  // because "matches /5/" would also match a sentence that had quietly changed around the number.
  const t = new AliasThrottle();
  assert.equal(t.admit(NOW), 'allow');
  assert.equal(t.admit(NOW), 'busy', 'serialized');
  t.release();
  for (let i = 1; i < MAX_PROMPTS; i += 1) {
    assert.equal(t.admit(NOW + i), 'allow', `prompt ${i + 1}`);
    t.release();
  }

  assert.equal(t.admit(NOW + MAX_PROMPTS), 'too-many', 'five');
  assert.equal(t.describe('too-many'), 'Too many requests: a caller without a token may prompt at most 5 times a minute.');
  assert.equal(t.describe('busy'), 'Another request is already waiting for the person to answer. Try again once they have.');
});

test('an unserialized throttle never answers busy, however many calls are in flight', () => {
  // The one-in-flight rule protects a person from a stack of dialogs. This path raises none, so
  // `busy` here would only serialise an agent's concurrent calls for nobody's benefit.
  const t = silent();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    assert.equal(t.admit(NOW + i), 'allow', `call ${i + 1}, with ${i} in flight and none released`);
  }
});

test('it refuses the (max+1)th inside the window, and admits again once the window has passed', () => {
  const t = silent();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    t.admit(NOW + i);
  }

  assert.equal(t.admit(NOW + SILENT_CEILING), 'too-many', 'the sixty-first inside the minute');
  assert.equal(t.admit(NOW + WINDOW_MS), 'allow', 'the window slides: the first call has aged out');
  assert.equal(t.admit(NOW + WINDOW_MS + SILENT_CEILING), 'allow', 'a minute after the last, it is open again');
});

test('release on an unserialized throttle is a no-op: it frees nothing and banks nothing', () => {
  // There is no in-flight slot to give back. The window is untouched either way — sixty admitted
  // and sixty released is still sixty inside the minute.
  const t = silent();
  t.release();
  t.release();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    assert.equal(t.admit(NOW + i), 'allow', `call ${i + 1}`);
    t.release();
  }

  assert.equal(t.admit(NOW + SILENT_CEILING), 'too-many');
});

test('its refusal names silent calls and its own ceiling, not prompts and five', () => {
  // A silent call refused at sixty and told it "may prompt at most 5 times a minute" would be wrong
  // in the number and in the verb, and an agent reading it would set about fixing the wrong thing.
  const refusal = silent().describe('too-many');

  assert.match(refusal, /silent calls/);
  assert.match(refusal, new RegExp(String(SILENT_CEILING)));
  assert.doesNotMatch(refusal, /prompt at most/);
  assert.doesNotMatch(refusal, new RegExp(`\\b${MAX_PROMPTS}\\b`));
  assert.equal(silent().describe('busy'), new AliasThrottle().describe('busy'), 'busy is one sentence — only a serialized throttle can ever say it');
});

test('a refusal says the window it was measured over, whatever that window is', () => {
  // Both production instances measure over a minute, and "a minute" is what they say. A throttle
  // built over another window must not claim the same — a true number in a false sentence is
  // still a false sentence.
  assert.match(new AliasThrottle(3, 10_000, false).describe('too-many'), /3 silent calls every 10 seconds/);
  assert.match(new AliasThrottle(3, 10_000, true).describe('too-many'), /prompt at most 3 times every 10 seconds/);
});

test('the ceilings hand a prompting call to the modal budget and a quiet one to the silent ceiling, and neither sees the other', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    assert.equal(c.for(true).admit(NOW + i), 'allow', `prompt ${i + 1}`);
    c.for(true).release();
  }
  assert.equal(c.for(true).admit(NOW + MAX_PROMPTS), 'too-many', 'the modal budget is spent');

  for (let i = 0; i < SILENT_CEILING; i += 1) {
    assert.equal(c.for(false).admit(NOW + i), 'allow', `quiet call ${i + 1}, with the modal budget spent`);
  }
  assert.equal(c.for(false).admit(NOW + SILENT_CEILING), 'too-many', 'the silent ceiling is its own count');
  assert.equal(c.for(true).admit(NOW + WINDOW_MS), 'allow', 'a minute later the modal budget is back, untouched by sixty quiet calls');
});

test('the silent ceiling is high enough for an agent and low enough to bound a loop', () => {
  // An agent runs a command, reads the answer, thinks, and runs the next; one a second sustained
  // is nowhere near that and still bounds a loop with no thinking in it. And it is not the modal
  // budget under another name: that one protects a person's patience, this one a credential.
  assert.ok(SILENT_CEILING <= WINDOW_MS / 1000, 'at most one a second sustained, or a loop is not bounded');
  assert.ok(SILENT_CEILING >= 30, 'and not so low that a busy agent session is refused');
  assert.ok(SILENT_CEILING > MAX_PROMPTS, 'a ceiling below the modal budget would refuse quiet calls a prompt would have got');
});

test('a runaway loop leaves ONE line a window, not one line a call', () => {
  // The ceiling bounds actions and not refusals: a loop calling a thousand times a minute is
  // refused nine hundred and forty times, and a line each would be a journal nobody can read
  // about a machine nobody can diagnose. One line says everything the second one would.
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    assert.equal(c.admit(false, NOW + i), undefined, `quiet call ${i + 1}`);
  }

  const first = refusal(c, NOW + SILENT_CEILING);
  const second = refusal(c, NOW + SILENT_CEILING + 1);
  const hundredth = refusal(c, NOW + SILENT_CEILING + 100);

  assert.equal(first.report, true, 'the first refusal of a window is the one worth recording');
  assert.equal(second.report, false);
  assert.equal(hundredth.report, false);
  assert.match(first.message, /silent calls/, 'and it says which ceiling fired');

  // A NEW window is a new fact — the loop is still going, or it started again. The window has to
  // be FILLED again to be refused again, because a minute later the count has slid off.
  const next = NOW + WINDOW_MS + 1;
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    assert.equal(c.admit(false, next + i), undefined, 'a new window admits its own sixty');
  }

  assert.equal(refusal(c, next + SILENT_CEILING).report, true, 'a second window of refusals is worth one line too');
});

/** The refusal, or a failure that says the call was admitted — so no assertion reads `undefined`. */
function refusal(c: TokenlessCeilings, at: number): { message: string; report: boolean } {
  const answer = c.admit(false, at);
  assert.notEqual(answer, undefined, `the call at ${at - NOW}ms was admitted, not refused`);
  return answer ?? { message: '', report: false };
}

test('a refused PROMPT is answered but never written down, which is unchanged and deliberate', () => {
  // S2.3 audits the silent refusal only. The modal budget's refusal has never been audited — the
  // same root cause, `respondError` logging nothing without a grant — and widening that is a
  // decision rather than a side effect of this one. Pinned so the gap is visible, not forgotten.
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    c.admit(true, NOW);
    c.for(true).release();
  }

  const refused = c.admit(true, NOW);

  assert.notEqual(refused, undefined, 'the modal budget still refuses');
  assert.equal(refused === undefined ? true : refused.report, false, 'and still says nothing to the journal');
});

test('the ceiling is one per WINDOW, shared by every tokenless caller — and that is the choice', () => {
  // Deliberate, and the trade is real: one runaway agent can spend the window on everybody else's
  // behalf. The alternative is worse. A per-caller quota needs a caller identity, and the only one
  // this route has is a LABEL the body supplies — `brokerCaller.ts` says so in as many words — so
  // keying on it would hand an attacker as many quotas as it cared to invent. What this ceiling
  // answers is "how much may this window do unattended", which is a question about the window.
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    c.admit(false, NOW + i);
  }

  assert.notEqual(c.admit(false, NOW + SILENT_CEILING), undefined, 'a second caller shares the same window');
});
