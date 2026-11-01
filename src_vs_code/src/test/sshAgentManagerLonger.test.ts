import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW } from '../agentConsent';
import { clockUntil, localRequestTimeLine, localWallTime } from '../requestTime';
import { describePurpose } from '../sshAgentProtocol';
import { KEY_ID, keyMaterialLogged, unanswered, unansweredPick } from './sshAgentWorld';
import { FOUR_BUTTONS, GIT, H, LOGIN, LONGER, M, MIN, THREE_BUTTONS, W, atOnce, clocks, loaded, tick } from './sshAgentLongerRig';

/**
 * *Allow longer…* at the manager (#197, E3.3): 1, 4, 8 or 12 hours of SSH logins with one key — and never a Git
 * signature, never SHA-1 RSA, never while the vault is locked, overdue for auto-lock or with auto-lock off.
 *
 * <p>What an answer MEANS is `agentConsent.test.ts`; what the texts SAY is `sshAgentTexts.test.ts`. What is only true
 * here is that the manager asks the right question at the right moment and applies the answer: the three eligibility
 * questions (the button, the list, the pick), the window starting at the PICK, and the row and the gate answering
 * "which windows count" through one rule. The turns, the races and the bound are `sshAgentManagerLongerTurns.test.ts`;
 * the real server and the flags are `sshAgentManagerFlags.test.ts`. The rig is `sshAgentLongerRig.ts`.</p>
 */

/** The sentence the modal and the notices give when auto-lock is off. */
const AUTO_LOCK_OFF = 'Longer windows need idle auto-lock: credSshManager.autoLockMinutes is off';
const LOCKED = 'Longer windows need the vault unlocked — a lock ends them';
const OVERDUE = 'Longer windows need the vault unlocked — idle auto-lock is about to lock it';
const SHA1 = 'Longer windows need a SHA-2 signature: this RSA login asked for SHA-1';
const LOGINS_ONLY = 'Longer windows cover SSH logins only';

test('L1 a login prompt offers Allow longer… third, before Deny; a Git signature\'s prompt does not', async () => {
  const { w, ask } = await loaded({ answers: [ALLOW_ONCE, ALLOW_ONCE] });

  await ask();
  await ask({ purpose: GIT });

  // Written out, not derived: a reorder in agentConsent.ts must turn this red.
  assert.deepEqual(w.buttons[0], ['Allow once', 'Allow for 10 minutes', 'Allow longer…', 'Deny']);
  assert.deepEqual(w.buttons[1], ['Allow once', 'Allow for 10 minutes', 'Deny']);
});

test('L2 Allow longer… then 4 hours lets logins through for four hours from the PICK, not from the prompt', async () => {
  const c = clocks();
  const modal = unanswered();
  const { w, instance, ask } = await loaded({ answers: [modal.answer, ALLOW_ONCE], picks: ['4 hours'], clock: c.clock, monotonic: c.monotonic });
  const first = ask();
  await tick();

  c.at(3 * MIN); // the prompt sat three minutes before the person chose
  modal.clickLate(LONGER);

  assert.equal(await first, true, 'the pick allows this login');
  assert.equal(w.presence, 1, 'one person, one presence — not one for the modal and one for the list');
  const pickedAt = W + 3 * MIN;
  c.at(3 * MIN + 4 * H - MIN);
  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 1, 'one minute before pick + 4 hours a login is silent');
  assert.equal(instance.windowsFor('a1', KEY_ID).login?.until, pickedAt + 4 * H, 'the row shows the end: the pick plus four hours');
  c.at(3 * MIN + 4 * H);
  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 2, 'at pick + 4 hours the window is over and the login asks again');
});

test('L3 the list offers 1, 4, 8 and 12 hours, shortest first, each with its end time; the title names the key through displayText', async () => {
  const c = clocks();
  const { w, ask } = await loaded({ answers: [LONGER], picks: [undefined], clock: c.clock, monotonic: c.monotonic });

  await ask({ name: 'pro\nd' });

  assert.equal(w.picks.length, 1, 'Allow longer… opened one list');
  const { items, options } = w.picks[0];
  const offset = -new Date(W).getTimezoneOffset();
  assert.deepEqual(items.map((item) => item.label), ['1 hour', '4 hours', '8 hours', '12 hours']);
  assert.deepEqual(items.map((item) => item.ms), [1, 4, 8, 12].map((hours) => hours * H));
  assert.deepEqual(
    items.map((item) => item.description),
    [1, 4, 8, 12].map(
      (hours) =>
        `from your pick, about ${clockUntil(W + hours * H, W, offset)}, or until the vault locks in this VS Code window (idle auto-lock: 60 min)`,
    ),
  );
  assert.equal(options.title, 'How long may "pro?d" log in without asking?', 'a line break in the name shows as ?');
  assert.equal(options.ignoreFocusOut, true, 'a click elsewhere must not dismiss the list');
  assert.equal(
    options.placeHolder,
    'SSH logins only, git push and fetch included. Escape refuses this signature. Unanswered, it is refused after 5 minutes.',
  );
});

test('L4 Escape on the list refuses this signature, counts as presence, and says nothing', async () => {
  const { w, instance, ask } = await loaded({ answers: [LONGER], picks: [undefined] });

  assert.equal(await ask(), false, 'Escape refuses');

  assert.equal(w.presence, 1, 'a person clicked Allow longer… and then declined');
  assert.deepEqual(w.infos, [], 'Escape is not a stale click: nothing is said');
  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, 'no window');
});

for (const [name, becomeIneligible] of [
  ['the vault locks', (rig: Awaited<ReturnType<typeof loaded>>) => void (rig.instance.lockedNow = () => true)],
  ['auto-lock is turned off', (rig: Awaited<ReturnType<typeof loaded>>) => void (rig.instance.autoLockMinutes = () => 0)],
] as const) {
  test(`L4b Escape still refuses after the offer became ineligible (${name}) — no window, no notice`, async () => {
    // Escape is a refusal whatever else has changed: degrading it to "allowed once" would sign a request the
    // person declined (risk consultation C-a).
    const pick = unansweredPick();
    const rig = await loaded({ answers: [LONGER], picks: [pick.answer] });
    const asked = rig.ask();
    await tick();
    assert.equal(rig.w.picks.length, 1, 'the list is open');

    becomeIneligible(rig);
    pick.escapeLate();

    assert.equal(await asked, false, 'Escape refuses');
    assert.equal(rig.w.presence, 1);
    assert.deepEqual(rig.w.infos, [], 'no notice for a refusal');
    assert.deepEqual(rig.instance.windowsFor('a1', KEY_ID), {});
  });
}

test('L7 a pick that is no longer eligible allows once, opens no window and says why; auto-lock back on, the next login prompts', async () => {
  const pick = unansweredPick();
  const { w, instance, ask } = await loaded({ answers: [LONGER, ALLOW_ONCE], picks: [pick.answer] });
  const asked = ask();
  await tick();
  assert.equal(w.picks.length, 1, 'the list opened with auto-lock at 60');

  instance.autoLockMinutes = () => 0;
  pick.pickLate('12 hours');

  assert.equal(await asked, true, 'allowed once');
  assert.equal(w.presence, 1);
  assert.deepEqual(w.infos, [`${AUTO_LOCK_OFF}. This signature was allowed once; no window was opened.`]);
  assert.ok(
    w.logs.some((line) =>
      line.endsWith(
        '"prod": picked 12 hours but longer windows need idle auto-lock: credSshManager.autoLockMinutes is off — allowed once, no window was opened',
      ),
    ),
    `the log names the pick and the reason:\n${w.logs.join('\n')}`,
  );
  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, 'no window');
  instance.autoLockMinutes = () => 60;
  await ask();
  assert.equal(w.dialogs.length, 2, 'the next login prompts');
});

test('L8 the vault locked while the list was open: the pick allows once, opens no window, says the vault is locked', async () => {
  const pick = unansweredPick();
  const { w, instance, ask } = await loaded({ answers: [LONGER], picks: [pick.answer] });
  const asked = ask();
  await tick();

  instance.lockedNow = () => true;
  pick.pickLate('4 hours');

  assert.equal(await asked, true);
  assert.deepEqual(w.infos, [`${LOCKED}. This signature was allowed once; no window was opened.`]);
  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {});
});

test('L8b the vault locked while the MODAL was up: Allow longer… opens no list, allows once and says why, once', async () => {
  const modal = unanswered();
  const { w, instance, ask } = await loaded({ answers: [modal.answer] });
  const asked = ask();
  await tick();

  instance.lockedNow = () => true;
  modal.clickLate(LONGER);

  assert.equal(await asked, true, 'the click was an Allow: this one signature goes ahead');
  assert.equal(w.picks.length, 0, 'no list for something that can no longer be granted');
  assert.equal(w.presence, 1);
  assert.deepEqual(w.infos, [`${LOCKED}. This signature was allowed once; no window was opened.`], 'told once');
  assert.ok(
    w.logs.some((line) => line.endsWith('"prod": answered "Allow longer…" but longer windows need the vault unlocked — a lock ends them — allowed once, no list was opened')),
    `the log names the answer:\n${w.logs.join('\n')}`,
  );
});

test('L8c an auto-lock that became overdue while the MODAL was up: Allow longer… opens no list, allows once and says why', async () => {
  const modal = unanswered();
  const { w, instance, ask } = await loaded({ answers: [modal.answer] });
  const asked = ask();
  await tick();

  instance.autoLockOverdue = () => true;
  modal.clickLate(LONGER);

  assert.equal(await asked, true, 'the click was an Allow: this one signature goes ahead');
  assert.equal(w.picks.length, 0, 'no list for something the gate would not honour');
  assert.deepEqual(w.infos, [`${OVERDUE}. This signature was allowed once; no window was opened.`]);
});

test('L9 the button is not offered for a Git signature, an unknown request, a locked vault, auto-lock off or SHA-1 RSA — and the prompt says which', async () => {
  const cases: [string, Parameters<typeof loaded>[0], { purpose?: unknown; flags?: number }, string][] = [
    ['a Git signature', { answers: [ALLOW_ONCE] }, { purpose: GIT }, LOGINS_ONLY],
    ['an unrecognised request', { answers: [ALLOW_ONCE] }, { purpose: { kind: 'unknown' } }, LOGINS_ONLY],
    ['a locked vault', { answers: [ALLOW_ONCE], locked: true }, {}, LOCKED],
    ['an auto-lock that is overdue (the lock lands within the minute)', { answers: [ALLOW_ONCE], overdue: true }, {}, OVERDUE],
    ['auto-lock off', { answers: [ALLOW_ONCE], autoLockMinutes: 0 }, {}, AUTO_LOCK_OFF],
    ['a negative auto-lock', { answers: [ALLOW_ONCE], autoLockMinutes: -5 }, {}, AUTO_LOCK_OFF],
    ['SHA-1 RSA (flags 0)', { answers: [ALLOW_ONCE], keyType: 'rsa' }, { flags: 0 }, SHA1],
  ];
  for (const [name, options, request, why] of cases) {
    const { w, ask } = await loaded(options);

    await ask(request);

    assert.deepEqual(w.buttons[0], THREE_BUTTONS, `${name}: the button is absent`);
    assert.ok(w.dialogs[0].includes(`${why}.`), `${name}: the prompt says why:\n${w.dialogs[0]}`);
    assert.equal(w.picks.length, 0, `${name}: no list`);
  }
});

test('L9b a login that may be offered the list is offered it, for Ed25519 and for an RSA login that asks for SHA-2', async () => {
  const ed = await loaded({ answers: [ALLOW_ONCE] });
  const rsa = await loaded({ answers: [ALLOW_ONCE], keyType: 'rsa' });

  await ed.ask();
  await rsa.ask({ flags: 2 });

  assert.deepEqual(ed.w.buttons[0], FOUR_BUTTONS);
  assert.deepEqual(rsa.w.buttons[0], FOUR_BUTTONS, 'rsa-sha2-256 (flag 2) is not SHA-1');
  assert.ok(!ed.w.dialogs[0].includes('Longer windows need'), 'the control: no refusal sentence when it is offered');
});

test('L11 a request a login window covers never waits behind an open Git prompt', async () => {
  const gitModal = unanswered();
  const { w, ask } = await loaded({ answers: [LONGER, gitModal.answer], picks: ['1 hour'] });
  assert.equal(await ask(), true, 'the login window is open');
  const git = ask({ purpose: GIT });
  await tick();
  assert.equal(w.dialogs.length, 2, 'the Git signature holds the key\'s prompt slot');

  const login = ask();

  assert.equal(await atOnce(login), true, 'the login is covered at arrival and does not queue behind the Git prompt');
  assert.equal(w.dialogs.length, 2, 'and it raised no dialog');
  gitModal.clickLate(ALLOW_ONCE);
  assert.equal(await git, true);
});

test('L12 a 10-minute answer for a Git signature never shortens a 12-hour login window — the row shows both', async () => {
  const c = clocks();
  const { instance, ask } = await loaded({ answers: [LONGER, ALLOW_WINDOW], picks: ['12 hours'], clock: c.clock, monotonic: c.monotonic });
  await ask();

  c.at(MIN);
  assert.equal(await ask({ purpose: GIT }), true, 'the Git signature asks and is answered with a 10-minute window');

  const row = instance.windowsFor('a1', KEY_ID);
  assert.equal(row.login?.until, W + 12 * H, 'the login window still ends at pick + 12 hours');
  assert.equal(row.all?.until, W + MIN + 10 * MIN, 'the 10-minute window ends ten minutes after its own answer');
});

test('L13 a login window opened by the first prompt covers the waiting login without a prompt', async () => {
  const modal = unanswered();
  const { w, ask } = await loaded({ answers: [modal.answer], picks: ['1 hour'] });
  const first = ask();
  const second = ask();
  await tick();

  modal.clickLate(LONGER);

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(w.dialogs.length, 1, 'the waiting login was covered, not asked');
});

test('L13b a Git signature that waited behind the login prompt is NOT covered by the login window that prompt opened', async () => {
  // The gate asks again after a wait, and asks with the WAITER's claim: a window for logins must never cover a
  // signature that is not one (Opus review of E3.3, M1). Dropping the claim there would sign the Git request silently.
  const modal = unanswered();
  const { w, ask } = await loaded({ answers: [modal.answer, ALLOW_ONCE], picks: ['4 hours'] });
  const first = ask();
  const git = ask({ purpose: GIT });
  await tick();

  modal.clickLate(LONGER);

  assert.deepEqual(await Promise.all([first, git]), [true, true]);
  assert.equal(w.dialogs.length, 2, 'the waiting Git signature asked for itself: the login window did not cover it');
});

test('L13c a SHA-1 RSA login that waited behind the login prompt is NOT covered by the login window that prompt opened', async () => {
  const modal = unanswered();
  const { w, ask } = await loaded({ answers: [modal.answer, ALLOW_ONCE], picks: ['4 hours'], keyType: 'rsa' });
  const first = ask({ flags: 2 }); // rsa-sha2-256: a login that may have a long window
  const sha1 = ask({ flags: 0 }); // the same key, asking for SHA-1: it may not
  await tick();

  modal.clickLate(LONGER);

  assert.deepEqual(await Promise.all([first, sha1]), [true, true]);
  assert.equal(w.dialogs.length, 2, 'the waiting SHA-1 login asked for itself: the login window did not cover it');
});

test('L14 the gate and the row answer "which windows count" through the same rule — a waiter, and an immediate arrival', async () => {
  // Leg 1: the hook flips to "auto-lock off" at the moment of the click's presence — after the pick was judged
  // eligible, before the waiter's turn. The waiter's check reads the hooks AGAIN; a gate that read them once at
  // arrival would cover it.
  const modal = unanswered();
  const waiting = await loaded({ answers: [modal.answer, ALLOW_ONCE], picks: ['4 hours'] });
  waiting.instance.autoLockMinutes = () => (waiting.w.presence === 0 ? 60 : 0);
  const first = waiting.ask();
  const waiter = waiting.ask();
  await tick();

  modal.clickLate(LONGER);

  assert.deepEqual(await Promise.all([first, waiter]), [true, true]);
  assert.equal(waiting.w.dialogs.length, 2, 'the waiter was not covered: auto-lock was off when its turn came');
  assert.deepEqual(waiting.instance.windowsFor('a1', KEY_ID), {}, 'and the row hides a window the gate would not honour');

  // Leg 2: a window is open, the hook goes to 0 with NO listener firing, and the next login arrives.
  const arriving = await loaded({ answers: [LONGER, ALLOW_ONCE], picks: ['4 hours'] });
  await arriving.ask();
  assert.notDeepEqual(arriving.instance.windowsFor('a1', KEY_ID), {}, 'the control: the window is shown while auto-lock is on');

  arriving.instance.autoLockMinutes = () => 0;

  assert.deepEqual(arriving.instance.windowsFor('a1', KEY_ID), {}, 'the row hides it at once');
  assert.equal(await arriving.ask(), true);
  assert.equal(arriving.w.dialogs.length, 2, 'the immediate arrival was not covered');
});

test('L15 every silent login names its window: the scope, until when, and when it was granted', async () => {
  const c = clocks();
  const { w, ask } = await loaded({ answers: [LONGER], picks: ['4 hours'], clock: c.clock, monotonic: c.monotonic });
  await ask();

  c.at(MIN);
  assert.equal(await ask(), true);

  const line = w.logs.find((l) => l.includes('allowed without asking'));
  assert.ok(line !== undefined, `no "allowed without asking" line in:\n${w.logs.join('\n')}`);
  const until = localWallTime(new Date(W + 4 * H));
  const granted = localWallTime(new Date(W));
  assert.ok(line.includes(`allowed without asking: login window of "prod" until ${until} (granted ${granted}) for `), line);
});

test('L16 an Allow longer… given across a lock or Ask for Every Use Again names the answer in the log, and the message says so', async () => {
  const crossings: [string, (rig: Awaited<ReturnType<typeof loaded>>) => void, string, RegExp][] = [
    [
      'a lock',
      (rig) => rig.instance.endAllWindows('the vaults were locked'),
      '"prod": answered "Allow longer…" (4 hours) after the vaults were locked — allowed once, no window was opened',
      /^The vault locked while you were choosing/,
    ],
    [
      'Ask for Every Use Again',
      (rig) => void rig.instance.endWindows(KEY_ID),
      '"prod": answered "Allow longer…" (4 hours) after Ask for Every Use Again — allowed once, no window was opened',
      /^Ask for Every Use Again was used while you were choosing/,
    ],
  ];
  for (const [name, cross, logged, message] of crossings) {
    const modal = unanswered();
    const rig = await loaded({ answers: [modal.answer], picks: ['4 hours'] });
    const asked = rig.ask();
    await tick();

    cross(rig);
    modal.clickLate(LONGER);

    assert.equal(await asked, true, `${name}: this one signature goes ahead`);
    assert.ok(rig.w.logs.some((line) => line.endsWith(logged)), `${name}: the log names the answer:\n${rig.w.logs.join('\n')}`);
    assert.equal(rig.w.infos.length, 1, `${name}: told once`);
    assert.match(rig.w.infos[0], message);
    assert.deepEqual(rig.instance.windowsFor('a1', KEY_ID), {}, `${name}: no window`);
  }
});

test('L19 the list says the time the request has left — a request that waited four minutes reads 60 seconds there too', async () => {
  const m1 = unanswered();
  let mono = M;
  const { w, ask } = await loaded({ answers: [m1.answer, LONGER], picks: [undefined], monotonic: () => mono });
  const r1 = ask();
  const r2 = ask();
  await tick();

  mono += 4 * MIN;
  m1.clickLate(ALLOW_ONCE);
  await r1;
  await r2;

  assert.match(w.dialogs[1], /refused after 60 seconds\./, 'the second prompt says it');
  assert.equal(w.picks.length, 1, 'the second request opened the list');
  assert.match(w.picks[0].options.placeHolder ?? '', /Unanswered, it is refused after 60 seconds\.$/);
});

test('L19b the list says the time the TURN has left: what the modal already spent is not given back', async () => {
  const modal = unanswered();
  let mono = M;
  const { w, ask } = await loaded({ answers: [modal.answer], picks: [undefined], monotonic: () => mono });
  const asked = ask();
  await tick();

  mono += 2 * MIN; // the person read the prompt for two minutes before choosing Allow longer…
  modal.clickLate(LONGER);
  await asked;

  assert.equal(w.picks.length, 1);
  assert.match(w.picks[0].options.placeHolder ?? '', /Unanswered, it is refused after 3 minutes\.$/, 'five minutes in all, two spent');
});

test('L21b a shorter pick while a longer login window still stands keeps the longer one, and says so — in the log and once to the person', async () => {
  const c = clocks();
  const modal = unanswered();
  const { w, instance, ask } = await loaded({ answers: [LONGER, modal.answer], picks: ['12 hours', '1 hour'], clock: c.clock, monotonic: c.monotonic });
  await ask();
  instance.autoLockOverdue = () => true; // the window is hidden, so this login asks for itself …
  const second = ask();
  await tick();
  instance.autoLockOverdue = () => false; // … and the person is back by the time they choose

  modal.clickLate(LONGER);

  assert.equal(await second, true, 'the pick allows this login');
  const until = localWallTime(new Date(W + 12 * H));
  assert.equal(instance.windowsFor('a1', KEY_ID).login?.until, W + 12 * H, 'the longer window is untouched');
  assert.deepEqual(w.infos, [`Your earlier login window until ${until} still stands — the shorter length you picked was not applied.`]);
  const line = `"prod": answered "Allow longer…" (1 hour) — the earlier login window until ${until} stands, no new window was opened`;
  assert.ok(w.logs.some((l) => l.endsWith(line)), `the log names it:\n${w.logs.join('\n')}`);
});

test('L21 an auto-lock that is overdue leaves no login window honoured: the login prompts and the row hides the window', async () => {
  const { w, instance, ask } = await loaded({ answers: [LONGER, ALLOW_ONCE], picks: ['4 hours'] });
  await ask();
  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 1, 'the control: while not overdue the window covers');

  instance.autoLockOverdue = () => true;

  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, 'the row hides the window');
  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 2, 'the login prompts');
  instance.autoLockOverdue = () => false;
  assert.notDeepEqual(instance.windowsFor('a1', KEY_ID), {}, 'the window was hidden, not ended: activity brings it back');
});

test('W5 a manager nobody wired offers no longer window and honours none — each hook fails closed on its own', async () => {
  // (a) nothing wired: no button, and a forced Allow longer… opens nothing.
  const none = await loaded({ answers: [LONGER], wired: false });
  assert.equal(await none.ask(), true);
  assert.deepEqual(none.w.buttons[0], THREE_BUTTONS, 'no button');
  assert.equal(none.w.picks.length, 0, 'no list');

  // (b) only the lock and the overdue hooks wired: auto-lock still defaults to off.
  const noMinutes = await loaded({ answers: [ALLOW_ONCE], wired: false, locked: false, overdue: false });
  await noMinutes.ask();
  assert.deepEqual(noMinutes.w.buttons[0], THREE_BUTTONS, 'auto-lock defaults to off');

  // (c) only auto-lock and overdue wired: the vault defaults to locked.
  const locked = await loaded({ answers: [ALLOW_ONCE], wired: false, autoLockMinutes: 60, overdue: false });
  await locked.ask();
  assert.deepEqual(locked.w.buttons[0], THREE_BUTTONS, 'the vault defaults to locked');

  // (d) only the lock and auto-lock wired: overdue defaults to true, so a granted login window is never honoured.
  const overdue = await loaded({ answers: [LONGER, ALLOW_ONCE], picks: ['4 hours'], wired: false, autoLockMinutes: 60, locked: false });
  await overdue.ask();
  assert.deepEqual(overdue.w.buttons[0], THREE_BUTTONS, 'overdue defaults to true: no button (the stub still answered Allow longer…)');
  assert.deepEqual(overdue.instance.windowsFor('a1', KEY_ID), {}, 'a window granted while overdue defaults to true is not shown');
  await overdue.ask();
  assert.equal(overdue.w.dialogs.length, 2, 'and not honoured: the next login prompts');
});

test('the modal text, whole: with the longer window offered, and without it', async () => {
  // A snapshot of the entire prompt, not a few phrases: a sentence dropped or reordered must show.
  const c = clocks();
  const { w, ask } = await loaded({ answers: [ALLOW_ONCE, ALLOW_ONCE], clock: c.clock, monotonic: c.monotonic });
  await ask();
  await ask({ purpose: GIT });

  const what = (purpose: unknown): string => describePurpose(purpose as never);
  const head = (purpose: unknown): string =>
    `Use the SSH key "prod" to sign ${what(purpose)}?\n${localRequestTimeLine(new Date(W))}\n\nSHA256:abc\n\n`;
  const risk =
    'While a window is open, any process running as you that reaches this agent — an AI agent in a terminal, a script, WSL, ' +
    'a host you forwarded the agent to — uses this key without asking. Locking the vault in this VS Code window ends every ' +
    'window, and so does "Ask for Every Use Again" on the key\'s row.';
  assert.equal(
    w.dialogs[0],
    `${head(LOGIN)}The key itself never leaves this window. Allow once; allow every use of this key for 10 minutes — long enough ` +
      'for a push that signs and authenticates in one go; or allow SSH logins with this key for longer, up to 12 hours — ' +
      `logins include git push and fetch over SSH.\n\n${risk}\n\nUnanswered, it is refused after 5 minutes.`,
  );
  assert.equal(
    w.dialogs[1],
    `${head(GIT)}The key itself never leaves this window. Allow once, or allow every use of this key for 10 minutes — long enough ` +
      `for a push that signs and authenticates in one go. ${LOGINS_ONLY}.\n\n${risk}\n\nUnanswered, it is refused after 5 minutes.`,
  );
});

test('nothing this suite logged carries key material', () => {
  assert.deepEqual(keyMaterialLogged(), [], 'a log line carries key material');
});
