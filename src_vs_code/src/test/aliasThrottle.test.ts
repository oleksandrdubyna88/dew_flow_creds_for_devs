import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PROMPTS, OneInFlight, SILENT_CEILING, SlidingWindow, type Slot, TokenlessCeilings, WINDOW_MS, over } from '../aliasThrottle';

/**
 * The rate at which a caller with no token may make a window ask a human.
 *
 * <p>This is authorization, not comfort: the alias route carries no bearer token, so the
 * consent modal is the whole gate, and a gate you can ring a thousand times is one somebody
 * eventually opens to make the noise stop.</p>
 *
 * <p>Three pieces since E1.3 epoch 3: the count ({@link SlidingWindow}), the one dialog at a time for a human
 * ({@link OneInFlight}), and the coordinator that keeps one count per door and stamps it where a dialog is raised.</p>
 */

const NOW = 1_700_000_000_000;
const A = 'bridge-A';
const B = 'bridge-B';

/** A bridged grant, as the consent gate hands it to `prompted`. */
const bridged = (bridgeId: string): { bridge: { context: { bridgeId: string } } } => ({ bridge: { context: { bridgeId } } });
const local = {};

/** The slot an admitted call holds — and a failure that names the call when it was refused instead. */
function admitted(c: TokenlessCeilings, prompts: boolean, at: number, what: string, door?: string): Slot {
  const admission = c.admit(prompts, at, door);
  assert.equal(admission.refusal, undefined, `${what} was refused: ${admission.refusal?.message ?? ''}`);
  return admission;
}

/** The refusal, or a failure that says the call was admitted — so no assertion reads `undefined`. */
function refusal(c: TokenlessCeilings, prompts: boolean, at: number, door?: string): { message: string; report: boolean } {
  const answer = c.admit(prompts, at, door).refusal;
  assert.notEqual(answer, undefined, `the call at ${at - NOW}ms was admitted, not refused`);
  return answer ?? { message: '', report: false };
}

/** One dialog raised and answered on a bridge: admitted, shown (stamped), released. */
function bridgeDialog(c: TokenlessCeilings, at: number, door: string, via: 'alias' | 'mcp' | 'token' = 'alias'): void {
  const slot = admitted(c, true, at, `a dialog on ${door}`, door);
  c.prompted(bridged(door), via, at);
  slot.release();
}

/** One dialog raised and answered on the local door. */
function dialog(c: TokenlessCeilings, at: number): void {
  const slot = admitted(c, true, at, 'a local dialog');
  c.prompted(local, 'alias', at);
  slot.release();
}

/* ---------------------------------------------------------------------------------------------------------------
 * The count
 * ------------------------------------------------------------------------------------------------------------- */

test('a sliding window admits up to its cap, refuses the next, and counts only what it admitted', () => {
  const w = new SlidingWindow(MAX_PROMPTS, WINDOW_MS);
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    assert.equal(w.admit(NOW + i), 'allow', `call ${i + 1}`);
  }
  assert.equal(w.admit(NOW + MAX_PROMPTS), 'too-many', 'the sixth');
  assert.equal(w.admit(NOW + MAX_PROMPTS + 1), 'too-many', 'a refusal stamped nothing, so it is still the sixth');
});

test('the window slides, so a person who genuinely uses it is not locked out', () => {
  const w = new SlidingWindow(MAX_PROMPTS, WINDOW_MS);
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    w.stamp(NOW + i);
  }
  assert.equal(w.full(NOW + MAX_PROMPTS), true);
  assert.equal(w.admit(NOW + WINDOW_MS + 1), 'allow', 'a minute later it is open again');
});

test('full() looks and does not count: asking whether it is full twice changes nothing', () => {
  const w = new SlidingWindow(2, WINDOW_MS);
  w.stamp(NOW);
  for (let i = 0; i < 10; i += 1) {
    assert.equal(w.full(NOW + i), false);
  }
  w.stamp(NOW + 1);
  assert.equal(w.full(NOW + 2), true);
});

test('a clock that moves backward does not strand a window: a stamp in the future is not in it', () => {
  // A stamp AHEAD of now means the host clock was corrected backward — a resume from sleep, an NTP
  // step. `now - at` is then negative, which a one-sided window test reads as "recent", so a full
  // window would stay full until the clock caught up. That is an outage produced by a clock.
  const w = new SlidingWindow(MAX_PROMPTS, WINDOW_MS);
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    w.stamp(NOW + i);
  }
  assert.equal(w.admit(NOW + MAX_PROMPTS), 'too-many', 'the window is full, as it should be');
  assert.equal(w.admit(NOW - 30 * 60_000), 'allow', 'half an hour back, and the window is measured from the new now');
});

test('idle: a window with nothing inside it is idle, and one stamp inside it is not', () => {
  const w = new SlidingWindow(MAX_PROMPTS, WINDOW_MS);
  assert.equal(w.idle(NOW), true, 'never used');
  w.stamp(NOW);
  assert.equal(w.idle(NOW + 1), false);
  assert.equal(w.idle(NOW + WINDOW_MS), true, 'a minute later it has aged out');
  assert.equal(w.idle(NOW - 1), true, 'and a stamp ahead of a corrected clock is not inside the window');
});

test('the cap is low enough to matter and high enough to use', () => {
  // A person running a command in a terminal is nowhere near this; a script grinding at a
  // human is well past it. A per-second limit would still permit three hundred an hour.
  assert.ok(MAX_PROMPTS <= 10, 'a cap that lets a grind through is not a cap');
  assert.ok(MAX_PROMPTS >= 3, 'and one that blocks ordinary use is an outage');
  assert.equal(WINDOW_MS, 60_000);
});

test('the silent ceiling is high enough for an agent and low enough to bound a loop', () => {
  assert.ok(SILENT_CEILING <= WINDOW_MS / 1000, 'at most one a second sustained, or a loop is not bounded');
  assert.ok(SILENT_CEILING >= 30, 'and not so low that a busy agent session is refused');
  assert.ok(SILENT_CEILING > MAX_PROMPTS, 'a ceiling below the modal budget would refuse quiet calls a prompt would have got');
});

test('a refusal says the window it was measured over, whatever that window is', () => {
  // A true number in a false sentence is still a false sentence.
  assert.equal(over(WINDOW_MS), 'a minute');
  assert.equal(over(10_000), 'every 10 seconds');
});

/* ---------------------------------------------------------------------------------------------------------------
 * One dialog at a time
 * ------------------------------------------------------------------------------------------------------------- */

test('one in flight: the second hold is refused until the first is released', () => {
  // A stack of modals is unusable long before any count is reached, and the person cannot
  // answer the first one while the second is covering it.
  const f = new OneInFlight();
  assert.equal(f.hold(), true);
  assert.equal(f.hold(), false);
  f.release();
  assert.equal(f.hold(), true, 'releasing lets the next one through');
});

test('releasing more often than holding cannot bank free places', () => {
  const f = new OneInFlight();
  f.release();
  f.release();
  assert.equal(f.hold(), true);
  assert.equal(f.hold(), false, 'still exactly one in flight');
});

/* ---------------------------------------------------------------------------------------------------------------
 * The local door, as it always was
 * ------------------------------------------------------------------------------------------------------------- */

test("the local door is today's modal budget to the byte: five dialogs, one in flight, those sentences", () => {
  // Asserted as the literal string, because "matches /5/" would also match a sentence that had quietly changed
  // around the number.
  const c = new TokenlessCeilings();
  const first = admitted(c, true, NOW, 'the first prompting call');
  c.prompted(local, 'alias', NOW);
  assert.equal(refusal(c, true, NOW).message, 'Another request is already waiting for the person to answer. Try again once they have.', 'serialized');
  first.release();
  for (let i = 1; i < MAX_PROMPTS; i += 1) {
    dialog(c, NOW + i);
  }
  assert.equal(refusal(c, true, NOW + MAX_PROMPTS).message, 'Too many requests: a caller without a token may prompt at most 5 times a minute.');
  assert.equal(c.admit(true, NOW + WINDOW_MS + 1).refusal, undefined, 'a minute after the first, the window has slid');
});

test('a prompt is spent when the dialog is SHOWN, whatever happens to its answer', () => {
  // A caller that opens a dialog and never has it answered has still consumed the window — which is exactly the
  // abuse being prevented. The stamp is `prompted`, written where the dialog is raised.
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    dialog(c, NOW);
  }
  assert.match(refusal(c, true, NOW).message, /prompt at most 5 times a minute/);
});

test('admitting does not spend a prompt: calls refused before any dialog leave the window as it was', () => {
  // The consequence on the local doors of a window that counts dialogs raised (E1.3 epoch 3, A.2 item 9): a call
  // refused before its dialog — an out-of-scope reference, an entry the wall refuses — used to spend one of five.
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS * 4; i += 1) {
    admitted(c, true, NOW + i, `call ${i + 1}, refused before its dialog`).release();
  }
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    dialog(c, NOW + 100 + i);
  }
  assert.match(refusal(c, true, NOW + 200).message, /prompt at most 5/, 'and then the five dialogs are five');
});

test('a refusal gives back nothing: a call refused behind the one in flight does not free the one in flight', () => {
  // A `finally` that releases whatever it was given must not hand back a place it never took, because that one
  // belongs to the call still in flight — and the person would be shown two modals at once.
  const c = new TokenlessCeilings();
  const held = admitted(c, true, NOW, 'the first prompting call');
  const refused = c.admit(true, NOW);
  assert.notEqual(refused.refusal, undefined, 'the one-in-flight rule refuses the second');
  refused.release();
  assert.notEqual(c.admit(true, NOW).refusal, undefined, 'the call in flight still holds its place');
  held.release();
  assert.equal(c.admit(true, NOW).refusal, undefined, 'and only its own release frees it');
});

test('a slot released twice frees the place once: the second release cannot free the next call\'s', () => {
  const c = new TokenlessCeilings();
  const first = admitted(c, true, NOW, 'the first');
  first.release();
  const second = admitted(c, true, NOW, 'the second, once the first has gone');
  first.release();
  assert.equal(c.admit(true, NOW).refusal?.message.startsWith('Another request'), true, 'the late second release freed nothing of the second call');
  second.release();
});

test('a window refuses with the window full even when nothing is in flight, and holds no place while it does', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    dialog(c, NOW + i);
  }
  for (let i = 0; i < 3; i += 1) {
    assert.match(refusal(c, true, NOW + MAX_PROMPTS).message, /prompt at most/, 'too many, repeatedly: never mistaken for busy by a place left held');
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * The silent ceiling
 * ------------------------------------------------------------------------------------------------------------- */

test('the silent ceiling never answers busy, however many calls are in flight', () => {
  // The one-in-flight rule protects a person from a stack of dialogs. This path raises none, so `busy` here would
  // only serialise an agent's concurrent calls for nobody's benefit.
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    admitted(c, false, NOW + i, `call ${i + 1}, with ${i} in flight and none released`);
  }
});

test('it refuses the (max+1)th inside the window, and admits again once the window has passed', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    admitted(c, false, NOW + i, `quiet call ${i + 1}`);
  }
  assert.notEqual(c.admit(false, NOW + SILENT_CEILING).refusal, undefined, 'the sixty-first inside the minute');
  assert.equal(c.admit(false, NOW + WINDOW_MS).refusal, undefined, 'the window slides: the first call has aged out');
});

test('release on a silent admission is a no-op: it frees nothing and banks nothing', () => {
  const c = new TokenlessCeilings();
  const holder = admitted(c, true, NOW, 'a prompting call in flight');
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    admitted(c, false, NOW + i, `quiet call ${i + 1}`).release();
  }
  assert.match(refusal(c, true, NOW).message, /already waiting/, 'sixty silent releases did not free the dialog in flight');
  assert.notEqual(c.admit(false, NOW + SILENT_CEILING).refusal, undefined, 'and the sixty are still sixty inside the minute');
  holder.release();
});

test('its refusal names silent calls and its own ceiling, not prompts and five', () => {
  // A silent call refused at sixty and told it "may prompt at most 5 times a minute" would be wrong in the number
  // and in the verb, and an agent reading it would set about fixing the wrong thing.
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    c.admit(false, NOW + i);
  }
  const message = refusal(c, false, NOW + SILENT_CEILING).message;
  assert.equal(message, 'Too many requests: a caller without a token may make at most 60 silent calls a minute — ones a consent policy lets through without a prompt.');
  assert.doesNotMatch(message, /prompt at most/);
});

test('the ceilings hand a prompting call to the modal budget and a quiet one to the silent ceiling, and neither sees the other', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    dialog(c, NOW + i);
  }
  assert.notEqual(c.admit(true, NOW + MAX_PROMPTS).refusal, undefined, 'the modal budget is spent');
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    admitted(c, false, NOW + i, `quiet call ${i + 1}, with the modal budget spent`);
  }
  assert.notEqual(c.admit(false, NOW + SILENT_CEILING).refusal, undefined, 'the silent ceiling is its own count');
  assert.equal(c.admit(true, NOW + WINDOW_MS).refusal, undefined, 'a minute later the modal budget is back, untouched by sixty quiet calls');
});

test('a runaway loop leaves ONE line a window, not one line a call', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    assert.equal(c.admit(false, NOW + i).refusal, undefined, `quiet call ${i + 1}`);
  }
  assert.equal(refusal(c, false, NOW + SILENT_CEILING).report, true, 'the first refusal of a window is the one worth recording');
  assert.equal(refusal(c, false, NOW + SILENT_CEILING + 1).report, false);
  assert.equal(refusal(c, false, NOW + SILENT_CEILING + 100).report, false);
  // A NEW window is a new fact. The window has to be FILLED again to be refused again.
  const next = NOW + WINDOW_MS + 1;
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    assert.equal(c.admit(false, next + i).refusal, undefined, 'a new window admits its own sixty');
  }
  assert.equal(refusal(c, false, next + SILENT_CEILING).report, true, 'a second window of refusals is worth one line too');
});

test('a refused PROMPT is answered but never written down, which is unchanged and deliberate', () => {
  // The modal budget's refusal has never been audited; widening that is a decision rather than a side effect.
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    dialog(c, NOW);
  }
  const refused = c.admit(true, NOW).refusal;
  assert.notEqual(refused, undefined, 'the modal budget still refuses');
  assert.equal(refused?.report ?? true, false, 'and still says nothing to the journal');
});

test('the local ceiling is one per WINDOW, shared by every tokenless caller — and that is the choice', () => {
  // A per-caller quota needs a caller identity, and the only one this route has is a LABEL the body supplies.
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    c.admit(false, NOW + i);
  }
  assert.notEqual(c.admit(false, NOW + SILENT_CEILING).refusal, undefined, 'a second caller shares the same window');
});

test('a clock that moves backward does not strand the silent ceiling or its journal line', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    c.admit(false, NOW + i);
  }
  assert.notEqual(c.admit(false, NOW + SILENT_CEILING).refusal, undefined, 'the window is full, as it should be');
  const corrected = NOW - 30 * 60_000;
  assert.equal(c.admit(false, corrected).refusal, undefined, 'half an hour back, and the window is measured from the new now');
  // A `reportedAt` in the future would silence the journal for as long as the jump.
  for (let i = 1; i < SILENT_CEILING; i += 1) {
    c.admit(false, corrected + i);
  }
  assert.equal(refusal(c, false, corrected + SILENT_CEILING).report, true, 'the refusal after the jump is still worth a line');
});

/* ---------------------------------------------------------------------------------------------------------------
 * A door of its own (S26)
 * ------------------------------------------------------------------------------------------------------------- */

test('each door has its own windows: five dialogs on bridge A leave bridge B and the local door untouched', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    bridgeDialog(c, NOW + i, A);
  }
  assert.notEqual(c.admit(true, NOW + MAX_PROMPTS, A).refusal, undefined, 'the sixth through A is refused');
  admitted(c, true, NOW + MAX_PROMPTS, 'a sixth through B', B).release();
  admitted(c, true, NOW + MAX_PROMPTS, 'and a local call').release();
});

test('the silent windows are per door too', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    c.admit(false, NOW + i, A);
  }
  assert.notEqual(c.admit(false, NOW + SILENT_CEILING, A).refusal, undefined);
  assert.equal(c.admit(false, NOW + SILENT_CEILING, B).refusal, undefined, 'B has its own sixty');
  assert.equal(c.admit(false, NOW + SILENT_CEILING).refusal, undefined, 'and so has the local door');
});

test('one dialog in flight is global: a dialog held open on A makes B and the local door busy', () => {
  // The person is one person with one screen. Per-door in-flight would show them two modals at once.
  const c = new TokenlessCeilings();
  const held = admitted(c, true, NOW, 'a dialog on A', A);
  assert.match(refusal(c, true, NOW, B).message, /already waiting/);
  assert.match(refusal(c, true, NOW).message, /already waiting/);
  held.release();
  assert.equal(c.admit(true, NOW, B).refusal, undefined, 'and B is asked the moment A is answered');
});

test('on a bridge the sentences name the bridge, never a caller without a token', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    bridgeDialog(c, NOW + i, A, 'token');
  }
  assert.equal(refusal(c, true, NOW + MAX_PROMPTS, A).message, 'Too many requests: this Remote Bridge may prompt at most 5 times a minute.');
  for (let i = 0; i < SILENT_CEILING; i += 1) {
    c.admit(false, NOW + i, B);
  }
  assert.equal(
    refusal(c, false, NOW + SILENT_CEILING, B).message,
    'Too many requests: this Remote Bridge may make at most 60 silent calls a minute — ones a consent policy lets through without a prompt.',
  );
});

test('a local token call is not throttled: its dialog stamps nothing; a bridged token call is counted on its bridge', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS * 2; i += 1) {
    c.prompted(local, 'token', NOW + i);
  }
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    dialog(c, NOW + 50 + i);
  }
  assert.notEqual(c.admit(true, NOW + 100).refusal, undefined, 'only the five alias dialogs counted: the ten token dialogs did not');
  const d = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    d.prompted(bridged(A), 'token', NOW + i);
  }
  assert.notEqual(d.admit(true, NOW + MAX_PROMPTS, A).refusal, undefined, 'a token call on a bridge is counted on it');
});

test('forget(door) starts that door over, and leaves the others as they were', () => {
  const c = new TokenlessCeilings();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    bridgeDialog(c, NOW + i, A);
    bridgeDialog(c, NOW + i, B);
  }
  c.forget(A, NOW + MAX_PROMPTS);
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    bridgeDialog(c, NOW + 10 + i, A);
  }
  assert.notEqual(c.admit(true, NOW + 20, A).refusal, undefined, 'five more on A were asked, and then the window is full again');
  assert.notEqual(c.admit(true, NOW + 20, B).refusal, undefined, 'B kept its count');
});

test('a door whose windows are idle is forgotten when another is, and the local door never is', () => {
  const c = new TokenlessCeilings();
  bridgeDialog(c, NOW, A);
  bridgeDialog(c, NOW, B);
  dialog(c, NOW);
  assert.equal(c.doorCount(), 3);
  c.forget(B, NOW + WINDOW_MS + 1);
  assert.equal(c.doorCount(), 1, 'A aged out and went with B; only the local door is left');
  c.forget('never-opened', NOW + 2 * WINDOW_MS);
  assert.equal(c.doorCount(), 1, 'the local door is idle by now and is still there: it is always there');
});
