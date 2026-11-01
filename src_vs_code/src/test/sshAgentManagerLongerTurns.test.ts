import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { ALLOW_ONCE } from '../agentConsent';
import { KEY_ID, keyMaterialLogged, rejectedPick, unanswered, unansweredPick, world } from './sshAgentWorld';
import { H, LONGER, loaded, tick } from './sshAgentLongerRig';

/**
 * *Allow longer…* inside ONE turn (#197, E3.3): the list is the turn's second dialog, under the SAME slot, bound and
 * fences, so everything E2.3 proved about a modal must hold about the list too — the bound ends it, a client that goes
 * away ends it, and an answer that reaches the manager after its turn ended signs nothing and opens nothing.
 *
 * <p>The rule under test is R4: no `await` between the last `turn.aborted` check and the grant, so no timer or socket
 * `close` can run between them. The first half of this file is that rule on the PICK path (the macrotask timings of
 * `sshAgentManagerTurns.test.ts`), the second the races of a pick and an abort, the third the list that fails.</p>
 */

const STALE = /That signing request had already been refused/;
const ORPHAN = /A signing prompt for "prod" is still open from an earlier request/;

test('L5 the bound covers both steps: a list still open at the bound is closed and refused, the queued login is orphaned, then the key prompts again', async () => {
  const pick = unansweredPick();
  const { w, ask } = await loaded({ answers: [LONGER, ALLOW_ONCE], picks: [pick.answer], consentTimeoutMs: 200 });
  const first = ask();
  await tick();
  assert.equal(w.picks.length, 1, 'the list is open');
  const queued = ask();

  assert.equal(await first, false, 'the bound ran out while the list was up: refused');
  assert.equal(await queued, false, 'the login queued behind the list is refused orphaned at that moment');

  assert.ok(w.logs.some((line) => /no answer in .* — refused/.test(line)), `the refusal line:\n${w.logs.join('\n')}`);
  assert.equal(w.infos.filter((text) => ORPHAN.test(text)).length, 1, 'the orphan notice, once');
  assert.equal(w.presence, 0, 'nothing was answered');
  await tick();
  assert.equal(w.sources[0].disposed, true, 'the list closed itself through the token and cleaned up');
  assert.equal(await ask(), true, 'once the list has settled the key prompts again');
  assert.equal(w.dialogs.length, 2);
});

test('L6 a late Allow longer… opens no list and says the request had already been refused', async () => {
  const modal = unanswered();
  const { w, ask } = await loaded({ answers: [modal.answer], consentTimeoutMs: 40 });
  assert.equal(await ask(), false, 'the bound refused the request');

  modal.clickLate(LONGER);
  await tick();
  await tick();

  assert.equal(w.picks.length, 0, 'no list for a request that was already refused');
  assert.equal(w.infos.filter((text) => STALE.test(text)).length, 1, 'the click is told it signed nothing');
  assert.equal(w.presence, 0);
});

test('L6b a late Allow longer… on a vault that locked meanwhile is told it was too late — the aborted check comes before the middle check', async () => {
  // Both checks would stop the list; only the order decides what is said and whether presence counts. A turn that
  // ended signs nothing and counts nobody — it must not be answered as "allowed once" because the vault locked too.
  const modal = unanswered();
  const { w, instance, ask } = await loaded({ answers: [modal.answer], consentTimeoutMs: 40 });
  assert.equal(await ask(), false, 'the bound refused the request');

  instance.lockedNow = () => true;
  modal.clickLate(LONGER);
  await tick();
  await tick();

  assert.equal(w.presence, 0, 'a refused request counts no presence');
  assert.equal(w.picks.length, 0);
  assert.equal(w.infos.length, 1, `only one thing is said:\n${w.infos.join('\n')}`);
  assert.match(w.infos[0], STALE, 'the stale notice');
  assert.equal(w.infos.some((text) => /allowed once/.test(text)), false, 'and not the "allowed once, no window" notice');
});

/** Ways a client's `close` can arrive right after the PICK: the next macrotask, the one after, a timer. */
const GOES_AWAY_AFTER_THE_PICK: [string, (abort: () => void) => void][] = [
  ['setImmediate', (abort) => void setImmediate(abort)],
  ['setImmediate twice', (abort) => void setImmediate(() => setImmediate(abort))],
  ['setTimeout 0', (abort) => void setTimeout(abort, 0)],
];

for (const [name, later] of GOES_AWAY_AFTER_THE_PICK) {
  test(`L17 R4 on the pick path: a client that goes away (${name}) right after the pick either loses to the answer or wins entirely`, async () => {
    // The pick is applied in the SAME continuation that checks the turn: no macrotask can run between the check and
    // the window. So the request either was answered (signed, window open) or refused (nothing signed, NO window).
    const modal = unanswered();
    const pick = unansweredPick();
    const { w, instance, ask } = await loaded({ answers: [modal.answer], picks: [pick.answer] });
    const client = new AbortController();
    const first = ask({ signal: client.signal });
    await tick();
    modal.clickLate(LONGER);
    await tick();
    assert.equal(w.picks.length, 1, 'the list is open');

    pick.pickLate('4 hours');
    later(() => client.abort());
    const signed = await first;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const windowOpen = Object.keys(instance.windowsFor('a1', KEY_ID)).length > 0;
    assert.equal(windowOpen, signed, `signed=${signed} but window=${windowOpen}: a pick applied outside its turn`);
    assert.equal(w.infos.length, signed ? 0 : 1, signed ? 'answered: nothing to tell' : 'refused: the click is told it signed nothing');
    instance.dispose();
  });
}

test('L20 the pick races: an abort and a pick (or an Escape) that meet before the continuation runs sign nothing, grant nothing and count no presence', async () => {
  // The list is STUBBORN: it answers only when the test says, even after its token was cancelled — which is how a
  // pick that reaches the manager AFTER the turn ended is built. (Real VS Code returns `undefined` on cancel, but
  // the manager must not depend on it.)
  const races: [string, (client: AbortController, pick: ReturnType<typeof unansweredPick>) => void, number][] = [
    ['abort, then an item', (client, pick) => { client.abort(); pick.pickLate('4 hours'); }, 1],
    ['abort, then Escape', (client, pick) => { client.abort(); pick.escapeLate(); }, 0],
    ['Escape, then abort', (client, pick) => { pick.escapeLate(); client.abort(); }, 0],
    // A list that FAILS is nobody's click: silent, even though the turn ended first (the stale message is for a click).
    ['abort, then a rejected list', (client, pick) => { client.abort(); pick.rejectLate(new Error('the window is closing')); }, 0],
  ];
  for (const [name, race, told] of races) {
    const modal = unanswered();
    const pick = unansweredPick({ stubborn: true });
    const { w, instance, ask } = await loaded({ answers: [modal.answer], picks: [pick.answer] });
    const client = new AbortController();
    const first = ask({ signal: client.signal });
    await tick();
    modal.clickLate(LONGER);
    await tick();
    assert.equal(w.picks.length, 1, `${name}: the list is open`);

    race(client, pick);

    assert.equal(await first, false, `${name}: nothing signed`);
    await tick(); // the work behind the ended turn settles after the request was already refused
    assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, `${name}: nothing granted`);
    assert.equal(w.presence, 0, `${name}: an aborted turn counts no presence`);
    assert.equal(w.infos.filter((text) => STALE.test(text)).length, told, `${name}: the message only for a click that meant something`);
    assert.equal(w.sources[0].disposed, true, `${name}: the list's token source was disposed`);
  }
});

test('L20b a turn that is already over opens no list: a gone client, then Allow longer…', async () => {
  const modal = unanswered();
  const { w, ask } = await loaded({ answers: [modal.answer] });
  const client = new AbortController();
  const first = ask({ signal: client.signal });
  await tick();

  client.abort();
  modal.clickLate(LONGER);

  assert.equal(await first, false);
  await tick();
  assert.equal(w.picks.length, 0, 'no list for a turn that ended');
  assert.equal(w.sources.length, 0, 'and no token source made for it');
});

test('L20c the list owns its token: cancelled only by THIS turn, disposed and unhooked afterwards, whatever the list answered', async () => {
  const w = world({ also: ['../sshSignPrompt'] });
  const [prompt] = w.modules as [typeof import('../sshSignPrompt')];
  const items = [{ label: '4 hours', description: '', ms: 4 * H }];
  const log: string[] = [];

  // A pick: the item's own ms comes back, the source is disposed, and no listener stays on the turn.
  const turn = new AbortController();
  w.pickAnswers.push('4 hours');
  assert.deepEqual(await prompt.pickLength({ name: 'prod' }, items, 300_000, turn.signal, (m) => log.push(m)), { kind: 'picked', ms: 4 * H });
  assert.equal(w.sources[0].disposed, true, 'disposed after a pick');
  assert.equal(getEventListeners(turn.signal, 'abort').length, 0, 'the abort listener was removed after a pick');

  // The turn ends while the list is open: the list is told to close, and answers Escape.
  const ending = new AbortController();
  const open = unansweredPick();
  w.pickAnswers.push(open.answer);
  const pending = prompt.pickLength({ name: 'prod' }, items, 300_000, ending.signal, (m) => log.push(m));
  assert.equal(getEventListeners(ending.signal, 'abort').length, 1, 'while the list is open the turn is listened to');
  ending.abort();
  assert.deepEqual(await pending, { kind: 'escaped' });
  assert.equal(w.sources[1].token.isCancellationRequested, true, 'this turn\'s end cancelled the list');
  assert.equal(w.sources[1].disposed, true);
  assert.equal(getEventListeners(ending.signal, 'abort').length, 0);

  // A turn that is over already: no list, no source.
  const over = new AbortController();
  over.abort();
  const before = w.picks.length;
  assert.deepEqual(await prompt.pickLength({ name: 'prod' }, items, 300_000, over.signal, (m) => log.push(m)), { kind: 'escaped' });
  assert.equal(w.picks.length, before, 'no list was opened for an aborted turn');
  assert.deepEqual(log, [], 'none of this is logged');
});

test('L22 a list that REJECTS is a dismissal: refused, no presence, one log line', async () => {
  const { w, instance, ask } = await loaded({ answers: [LONGER], picks: [rejectedPick('the window is closing')] });

  assert.equal(await ask(), false, 'refused');

  assert.equal(w.presence, 0, 'a rejection is not a person answering');
  assert.deepEqual(w.infos, [], 'nothing is told');
  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {});
  const lines = w.logs.filter((line) => line.includes('the signing list failed'));
  assert.equal(lines.length, 1, w.logs.join('\n'));
  assert.ok(lines[0].endsWith('the signing list failed: the window is closing — refused'), lines[0]);
  assert.equal(w.sources[0].disposed, true);
});

test('nothing this suite logged carries key material', () => {
  assert.deepEqual(keyMaterialLogged(), [], 'a log line carries key material');
});
