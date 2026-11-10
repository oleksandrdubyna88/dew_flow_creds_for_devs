import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedWhileAsking, linkedRunRefused, terminalRunAction } from '../agentUseActions';
import { burnOneUseIn } from '../burnOnUse';
import { BROKER_HOOK_NAMES } from '../brokerHooks';
import type { CallDeps, CallSubject } from '../brokerCall';
import { commandFingerprint } from '../commandTrust';
import { oneUseIn } from '../entityExpiry';
import type { Grant } from '../grantRegistry';
import type { EntityMetadata, TreeNode } from '../types';
import type { OverSsh, OverSshCall, UseAction, UseActionContext, UseActionResult, UsedEntry } from '../useActions';
import { OK_BODY, OneUseStorage, gateWorld, oneUseStorage, terminalNode, trustLineOf, usableSsh } from './agentSshWorld';
import { Answer, World, call, code, message, overlapping, world as brokerWorld } from './brokerWorld';
import { ACCOUNT as VAULT_ACCOUNT, carried, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';
import { fingerprintOf, holdRotated } from '../rotationQuarantine';
import { trustLineFor } from '../remoteLaunch';
import { loadEachWithVscode } from './vscodeStub';
import { FAKE_STORAGE_DIR } from './fakePaths';

/**
 * The SSH entry's one-use promise through the broker (E3.4 F-S2; security spec §2.5, scenarios U1-U11, A1 and A5): a linked run is an agent's
 * use of the SSH entry, so the broker takes its turn in the one-use lane, asks its spent marker first, and burns it after a call that
 * answered 200. Each test is named for the guarantee; each was watched RED first (after the no-op types, on its assertion), and the commit
 * that builds the guarantee says what the failure read.
 */

const [{ performCall, usedEntrySpent }, { OneUseLane, burnAndMark, laneKeyFor }] = loadEachWithVscode(['../brokerCall', '../oneUseLane'], {
  window: {},
  workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
}) as [typeof import('../brokerCall'), typeof import('../oneUseLane')];

type Lane = InstanceType<typeof OneUseLane>;

// ---- U11 ------------------------------------------------------------------------------------------------------------------------

test('the_sentence_for_a_spent_used_entry_names_one_entry', () => {
  assert.equal(usedEntrySpent.length, 1);
  assert.deepEqual(usedEntrySpent('Q').match(/"[^"]*"/g), ['"Q"'], 'one quoted name, the grant\'s');
  assert.ok(!usedEntrySpent('deploy').includes('prod box'), 'the used entry\'s name is not in it');
  assert.match(usedEntrySpent('deploy'), /uses another entry that was one-use, and an agent has already used it, so nothing ran\.$/);
});

// ---- U7: performCall with the real lane and the real burnAndMark ---------------------------------------------------------------

const ACCOUNT = 'acct-1';

/** What a world of `performCall` records: the order things happened in, who was refused with what, who ran, who was burned. */
interface Seen {
  readonly refused: string[];
  readonly ran: string[];
  readonly burned: string[];
  readonly notes: string[];
}

function grantOf(entityId: string, entityName: string): Grant {
  return { secret: `secret-${entityId}`, accountId: ACCOUNT, entityId, entityName, kind: 'terminal', status: 'allowed', mintedAt: 0, lastUsedAt: 0, uses: 0, scope: 'call' };
}

/** The deps of one call over a lane SHARED between calls, with the product's own `burnAndMark` and one-use question (every entry named in `oneUse` is one-use until it burns). */
function depsOf(lane: Lane, seen: Seen, oneUse: Set<string>, grant: Grant, asked: (entityId: string) => void = () => undefined): CallDeps {
  const burnAfterUse = async (_account: string, entityId: string): Promise<boolean> => {
    seen.burned.push(entityId);
    oneUse.delete(entityId);
    return true;
  };
  const isOneUse = (_account: string, entityId: string): boolean => {
    asked(entityId);
    return oneUse.has(entityId);
  };
  return {
    grants: { reserve: () => ({ kind: 'live', grant }) },
    lane,
    isOneUse,
    respond: () => undefined,
    log: () => undefined,
    refuse: (code, message, why) => void seen.refused.push(`${code} ${message}${why === undefined ? '' : ` · ${why}`}`),
    failed: (why) => void seen.refused.push(`failed ${why}`),
    refresh: () => Promise.resolve(undefined),
    burn: (status, of = grant) => burnAndMark(lane, burnAfterUse, isOneUse, of, status, (note) => void seen.notes.push(note)),
    abandon: () => undefined,
  };
}

/** A call whose grant names `entityId` and whose action ALSO uses `uses`; the action waits `ms`, records `label`, and answers `status`. */
function callOf(entityId: string, entityName: string, uses: UsedEntry | undefined, seen: Seen, ms = 50, label = entityId, status = 200): CallSubject {
  return {
    grant: grantOf(entityId, entityName),
    useAction: {
      kind: 'terminal', action: 'run', mutatesSecrets: false, verb: 'run', summarize: () => 'summary', validate: () => ({ ok: true }), describeOutcome: () => 'exit 0',
      run: async () => {
        seen.ran.push(label);
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { status, body: {} };
      },
    },
    action: 'run',
    body: {},
    via: 'token',
    caller: undefined,
    summary: 'summary',
    uses,
    table: { entries: [] },
    signal: new AbortController().signal,
  };
}

const used = (entityId: string, entityName: string): UsedEntry => ({ accountId: ACCOUNT, entityId, entityName });

/** One call through `performCall`, over a lane the caller shares between calls. */
const performOn = (lane: Lane, seen: Seen, oneUse: Set<string>, call: CallSubject, asked?: (entityId: string) => void): Promise<void> => performCall(depsOf(lane, seen, oneUse, call.grant, asked), call);

/** Both calls are started in one tick; a call that does not end in two seconds fails the test instead of hanging it. */
async function bothEnd(calls: Promise<void>[]): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('the two calls did not end in 2 s: each holds a turn the other waits for')), 2000);
  });
  try {
    await Promise.race([Promise.all(calls), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

test('the_turns_are_taken_in_key_order_so_two_calls_that_use_each_others_entry_both_end', async () => {
  // Deviation from the spec's literal scenario, MEASURED: an entry with nothing in flight starts its job SYNCHRONOUSLY (`keyedQueue.ts`), so two calls
  // started in one tick on idle entries cannot interleave and cannot deadlock in either order of turns. A cycle needs a third call that holds one of the
  // keys while X and Y queue behind it: `holder` (a call on `a` that answers 500, so it spends nothing) holds `a` for 100 ms.
  for (const firstIsX of [true, false]) {
    const lane = new OneUseLane();
    const seen: Seen = { refused: [], ran: [], burned: [], notes: [] };
    const oneUse = new Set(['a', 'b']);
    // X: the grant names b, and it uses a. Y: the grant names a, and it uses b. Each is the other's used entry.
    const holder = performOn(lane, seen, oneUse, callOf('a', 'alpha', undefined, seen, 100, 'holder', 500));
    const x = (): Promise<void> => performOn(lane, seen, oneUse, callOf('b', 'beta', used('a', 'alpha'), seen, 50, 'X'));
    const y = (): Promise<void> => performOn(lane, seen, oneUse, callOf('a', 'alpha', used('b', 'beta'), seen, 50, 'Y'));

    await bothEnd([holder, ...(firstIsX ? [x(), y()] : [y(), x()])]);

    const ran = seen.ran.filter((label) => label !== 'holder');
    assert.equal(ran.length, 1, `exactly one of the two actions ran: ${ran.join(',')}`);
    assert.deepEqual([...seen.burned].sort(), ['a', 'b'], 'both entries are burned');
    assert.ok(lane.isSpent(laneKeyFor(ACCOUNT, 'a')) && lane.isSpent(laneKeyFor(ACCOUNT, 'b')), 'and both are marked spent');
    assert.equal(seen.refused.length, 1, seen.refused.join(' | '));
    const own = (name: string): string => `not_found "${name}" was one-use and has already been used.`;
    const usedSpent = (name: string, other: string): string => `denied ${usedEntrySpent(name)} · the entry it also uses, "${other}", was one-use and has already been used`;
    assert.ok([own('alpha'), own('beta'), usedSpent('beta', 'alpha'), usedSpent('alpha', 'beta')].includes(seen.refused[0]), `the loser was refused before its action ran, by the turn it met first: ${seen.refused[0]}`);
  }
});

test('a_throw_while_the_grants_entry_burns_does_not_leave_the_used_entry_unburned_and_unmarked', async () => {
  // The Opus reviewer's m7 (spec §2.5): `burnAndMark` catches a delete that fails, but its one-use question reads storage first and can throw.
  const lane = new OneUseLane();
  const seen: Seen = { refused: [], ran: [], burned: [], notes: [] };
  const asked = (entityId: string): void => {
    if (entityId === 't' && seen.ran.length > 0) {
      throw new Error('storage would not answer');
    }
  };

  await performOn(lane, seen, new Set(['t', 's']), callOf('t', 'deploy', used('s', 'prod box'), seen, 0), asked).catch(() => undefined);

  assert.deepEqual(seen.burned, ['s'], 'the used entry was still burned');
  assert.ok(lane.isSpent(laneKeyFor(ACCOUNT, 's')), 'and marked');
});

// ---- U1-U6, U8: through the REAL broker ----------------------------------------------------------------------------------------------
//
// `run` is the REAL `terminalRunAction` over `oneUseStorage`, with a recording `overSsh`; `exec` is the world's scripted stub (it records in `w.ran`).
// All entries live in `acct-1`: `s1` is `prod box` (one-use unless a test says otherwise), `t1` is `deploy` and `t2` is `deploy2`, both linked to it.

const BURN_NOTE = (name: string): string => `"${name}" was one-use and has been deleted from the vault.`;
const SPENT_OWN = (name: string): string => `"${name}" was one-use and has already been used.`;

interface Entity {
  readonly id: string;
  readonly name: string;
}
const S1: Entity = { id: 's1', name: 'prod box' };
const T1: Entity = { id: 't1', name: 'deploy' };
const T2: Entity = { id: 't2', name: 'deploy2' };

interface OneUseWorld {
  readonly w: World;
  readonly storage: OneUseStorage;
  /** Each `overSsh` call the real action made. */
  readonly calls: OverSshCall[];
  /** What the next `overSsh` answers; a test sets it. */
  answer: UseActionResult;
  /** The details of an entry of the world, mutable (a test changes the world while a dialog stands). */
  details(id: string): EntityMetadata;
  /** How many times ssh was started on S: through the linked run or through a direct exec. */
  started(): number;
  /** Vouch for the line a person would have run over ssh, for one Terminal entry. */
  trust(terminal: Entity): void;
  readonly action: UseAction;
  readonly ctx: UseActionContext;
}

interface OneUseOptions {
  readonly s1?: Partial<EntityMetadata>;
  readonly t1?: Partial<EntityMetadata>;
  readonly holdDialogs?: boolean;
  readonly hooks?: Record<string, unknown>;
  readonly masker?: (accountId: string, entityId: string) => Promise<readonly { value: string; label: string }[]>;
  readonly extra?: readonly TreeNode[];
}

function oneUseWorld(options: OneUseOptions = {}): OneUseWorld {
  const s1 = usableSsh('s1', { burnPolicy: 'oneUse', ...options.s1 });
  const nodes = [s1, terminalNode({ id: 't1', name: 'deploy', ...options.t1 }), terminalNode({ id: 't2', name: 'deploy2' }), ...(options.extra ?? [])];
  const storage = oneUseStorage({ 'acct-1': nodes });
  const gate = gateWorld({ noTerminal: true, acct1: nodes, storage });
  const calls: OverSshCall[] = [];
  const holder: { w?: World } = {};
  const state = { answer: { status: 200, body: OK_BODY } as UseActionResult };
  const overSsh: OverSsh = async (_ctx, call) => {
    calls.push(call);
    await holder.w?.hold?.();
    return state.answer;
  };
  const deps = { ...gate.deps, overSsh };
  const action = terminalRunAction(deps);
  const w = brokerWorld({
    kind: 'terminal',
    supports: ['run', 'exec'],
    realActions: { run: action },
    vault: { isOneUse: oneUseIn(storage), burnAfterUse: burnOneUseIn(storage, () => undefined) },
    answers: Array.from({ length: 40 }, () => 'Allow'),
    holdDialogs: options.holdDialogs,
    hooks: options.hooks,
    masker: options.masker,
  });
  holder.w = w;
  return {
    w,
    storage,
    calls,
    get answer() {
      return state.answer;
    },
    set answer(value: UseActionResult) {
      state.answer = value;
    },
    details: (id) => {
      const found = storage.getNode('acct-1', id)?.details;
      assert.ok(found !== undefined, `the world holds no entity ${id}`);
      return found;
    },
    started: () => calls.length + w.ran.filter((ran) => ran.entityId === 's1').length,
    trust: (terminal) => {
      gate.trusted.push(commandFingerprint(terminal.id, trustLineOf(s1.details as EntityMetadata)));
    },
    action,
    ctx: { accountId: 'acct-1', entityId: 't1', entityName: 'deploy', signal: new AbortController().signal },
  };
}

/** One agent call on the token door: a new grant for the entry (its dialog is answered `Allow`), then the action's route. */
async function send(world: OneUseWorld, entity: Entity, action: 'run' | 'exec'): Promise<Answer> {
  const token = await world.w.server.share('acct-1', entity.id, entity.name, 'terminal');
  const dot = token.indexOf('.');
  return call(Number(token.slice(0, dot)), `/v1/use/${action}`, { token: token.slice(dot + 1), body: action === 'exec' ? { command: 'uptime' } : {} });
}

const sentence = (answer: Answer): string => `${code(answer)}: ${message(answer)}`;
const refusedAs = (answer: Answer, codeOf: string, text: string): string => `${sentence(answer)}`.concat(code(answer) === codeOf && message(answer) === text ? '' : ` — expected ${codeOf}: ${text}`);

/** Wait (bounded) until a condition holds: a held dialog is raised by a request that is still on its way. */
async function until(condition: () => boolean): Promise<void> {
  for (let waited = 0; !condition() && waited < 2000; waited += 5) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(condition(), 'the condition did not hold within 2 s');
}

test('two_linked_runs_in_a_row_use_a_one_use_ssh_entry_once', async () => {
  const world = oneUseWorld();
  world.trust(T1);
  try {
    const first = await send(world, T1, 'run');
    assert.equal(first.status, 200, sentence(first));
    assert.equal(world.storage.getNode('acct-1', 's1'), undefined, 'the one-use SSH entry is deleted after the run');
    assert.ok(world.w.audit.some((line) => line.includes(BURN_NOTE('prod box'))), world.w.audit.join(' | '));
    assert.notEqual(world.storage.getNode('acct-1', 't1'), undefined, 'the Terminal entry stays');

    const dialogs = world.w.dialogs.length;
    const second = await send(world, T1, 'run');

    assert.equal(refusedAs(second, 'denied', linkedRunRefused('deploy')), sentence(second), 'S is missing: validate\'s gate answers the one sentence');
    assert.equal(world.started(), 1, 'ssh was started once');
    assert.equal(world.w.dialogs.length, dialogs, 'and the second call raised no dialog');
  } finally {
    world.w.server.dispose();
  }
});

type Who = 'exec' | 't1' | 't2';

/** What each road reads when it LOST the turn: the direct exec meets the grant's own sentence, a linked run the sentence that names one entry, its own. */
const LOSES: Record<Who, [string, string]> = { exec: ['not_found', SPENT_OWN('prod box')], t1: ['denied', usedEntrySpent('deploy')], t2: ['denied', usedEntrySpent('deploy2')] };

function assertLost(world: OneUseWorld, who: Who, answer: Answer, order: readonly Who[]): void {
  assert.equal(refusedAs(answer, LOSES[who][0], LOSES[who][1]), sentence(answer), `${order.join(',')}: ${who} lost`);
  assert.ok(who === 'exec' || !message(answer).includes('prod box'), 'a run that lost does not name the SSH entry');
  assert.ok(who === 'exec' || world.w.audit.some((line) => line.includes('was one-use and has already been used')), 'the journal says why');
}

/** One round: the three calls sent in `order`, each held inside its stub until the others had 300 ms to arrive. */
async function roundOf(order: readonly Who[]): Promise<void> {
  const world = oneUseWorld();
  world.trust(T1);
  world.trust(T2);
  const peak = overlapping(world.w, 3);
  try {
    const sends: Record<Who, () => Promise<Answer>> = { exec: () => send(world, S1, 'exec'), t1: () => send(world, T1, 'run'), t2: () => send(world, T2, 'run') };
    const answers = await Promise.all(order.map((who) => sends[who]()));

    assert.equal(world.started(), 1, `${order.join(',')}: ssh was started once`);
    assert.equal(peak(), 1, 'never two inside a stub at one time');
    assert.equal(answers.filter((answer) => answer.status === 200).length, 1, answers.map(sentence).join(' | '));
    order.forEach((who, at) => answers[at].status === 200 || assertLost(world, who, answers[at], order));
    assert.equal(world.storage.getNode('acct-1', 's1'), undefined, 'the SSH entry is gone');
  } finally {
    world.w.server.dispose();
  }
}

test('a_direct_exec_and_two_linked_runs_at_once_start_ssh_once', async () => {
  // Three rounds, a different call sent first each time. The answers are the same whoever wins: ONE 200, and the losers say what they lost to.
  for (const order of [['exec', 't1', 't2'], ['t1', 't2', 'exec'], ['t2', 'exec', 't1']] as Who[][]) {
    await roundOf(order);
  }
});

test('a_one_use_ssh_entry_that_could_not_be_deleted_stays_spent_on_both_roads', async () => {
  const world = oneUseWorld();
  world.trust(T1);
  world.trust(T2);
  world.storage.failDelete = true;
  try {
    const first = await send(world, T1, 'run');
    assert.equal(first.status, 200, sentence(first));
    assert.ok(world.w.audit.some((line) => line.includes('"prod box" was one-use but could NOT be deleted')), world.w.audit.join(' | '));
    assert.notEqual(world.storage.getNode('acct-1', 's1'), undefined, 's1 is still in storage');
    assert.equal(oneUseIn(world.storage)('acct-1', 's1'), true, 'still one-use');
    assert.deepEqual(world.action.validate({}, world.ctx), { ok: true }, 'and still usable: validate passes, so only the broker\'s marker refuses the next calls');

    const again = await send(world, T1, 'run');
    assert.equal(refusedAs(again, 'denied', usedEntrySpent('deploy')), sentence(again), 'the marker is set though the delete failed');
    const other = await send(world, T2, 'run');
    assert.equal(refusedAs(other, 'denied', usedEntrySpent('deploy2')), sentence(other));
    const exec = await send(world, S1, 'exec');
    assert.equal(refusedAs(exec, 'not_found', SPENT_OWN('prod box')), sentence(exec), 'a direct exec meets the same marker');
    assert.equal(world.started(), 1);
  } finally {
    world.w.server.dispose();
  }
});

test('linked_runs_over_an_ordinary_ssh_entry_are_not_queued_and_burn_nothing', async () => {
  const world = oneUseWorld({ s1: { burnPolicy: undefined } });
  world.trust(T1);
  world.trust(T2);
  const peak = overlapping(world.w, 2);
  try {
    const answers = await Promise.all([send(world, T1, 'run'), send(world, T2, 'run')]);

    assert.deepEqual(answers.map((answer) => answer.status), [200, 200], answers.map(sentence).join(' | '));
    assert.equal(peak(), 2, 'two linked runs over an ordinary SSH entry keep running at the same time');
    for (const entity of [S1, T1, T2]) {
      assert.notEqual(world.storage.getNode('acct-1', entity.id), undefined, `${entity.name} is still there`);
    }
    assert.ok(!world.w.audit.some((line) => line.includes('was one-use')), 'the journal holds no one-use line');
    const later = await send(world, T1, 'run');
    assert.equal(later.status, 200, 'nothing is marked spent');
  } finally {
    world.w.server.dispose();
  }
});

test('a_one_use_terminal_entry_burns_as_before_and_both_burn_when_both_are_one_use', async () => {
  // (a) T one-use, S ordinary.
  const a = oneUseWorld({ s1: { burnPolicy: undefined }, t1: { burnPolicy: 'oneUse' } });
  a.trust(T1);
  try {
    assert.equal((await send(a, T1, 'run')).status, 200);
    assert.equal(a.storage.getNode('acct-1', 't1'), undefined, 't1 is gone');
    assert.notEqual(a.storage.getNode('acct-1', 's1'), undefined, 's1 is there');
    assert.ok(a.w.audit.some((line) => line.includes(BURN_NOTE('deploy'))));
    assert.ok(!a.w.audit.some((line) => line.includes(BURN_NOTE('prod box'))));
    const again = await send(a, T1, 'run');
    assert.equal(again.status, 404, `the door's answer for an entry that is gone: ${sentence(again)}`);
    assert.equal(a.started(), 1);
  } finally {
    a.w.server.dispose();
  }

  // (b) both one-use: both are gone, in the order deploy, prod box.
  const b = oneUseWorld({ t1: { burnPolicy: 'oneUse' } });
  b.trust(T1);
  try {
    assert.equal((await send(b, T1, 'run')).status, 200);
    assert.equal(b.storage.getNode('acct-1', 't1'), undefined);
    assert.equal(b.storage.getNode('acct-1', 's1'), undefined);
    const notes = b.w.audit.filter((line) => line.includes('was one-use and has been deleted'));
    assert.deepEqual(notes.map((line) => (line.includes('"deploy"') ? 'deploy' : 'prod box')), ['deploy', 'prod box'], notes.join(' | '));
    const exec = await send(b, S1, 'exec');
    assert.equal(exec.status, 404, `exec(s1) after the burn: ${sentence(exec)}`);
  } finally {
    b.w.server.dispose();
  }

  // (c) T one-use, two runs together: ssh once, the loser reads today's sentence for the grant's own entry.
  const c = oneUseWorld({ s1: { burnPolicy: undefined }, t1: { burnPolicy: 'oneUse' } });
  c.trust(T1);
  overlapping(c.w, 2);
  try {
    const answers = await Promise.all([send(c, T1, 'run'), send(c, T1, 'run')]);
    assert.equal(c.started(), 1);
    const loser = answers.find((answer) => answer.status !== 200);
    assert.ok(loser !== undefined, answers.map(sentence).join(' | '));
    assert.equal(refusedAs(loser, 'not_found', SPENT_OWN('deploy')), sentence(loser));
  } finally {
    c.w.server.dispose();
  }
});

test('a_linked_run_that_did_not_answer_200_spends_nothing', async () => {
  // (a) the trust line is NOT trusted: the untrusted refusal, nothing spent; then trusted: 200 and S is gone.
  const a = oneUseWorld();
  try {
    const refused = await send(a, T1, 'run');
    assert.equal(code(refused), 'no_credential', sentence(refused));
    assert.notEqual(a.storage.getNode('acct-1', 's1'), undefined, 'nothing was spent');
    a.trust(T1);
    assert.equal((await send(a, T1, 'run')).status, 200);
    assert.equal(a.storage.getNode('acct-1', 's1'), undefined, 'and now it is');
  } finally {
    a.w.server.dispose();
  }

  // (b) ssh could not run (a 500): nothing spent, and a later run is the one use.
  const b = oneUseWorld();
  b.trust(T1);
  b.answer = { status: 500, body: { error: { code: 'internal', message: 'Could not run ssh: it fell over' } } };
  try {
    assert.equal((await send(b, T1, 'run')).status, 500);
    assert.notEqual(b.storage.getNode('acct-1', 's1'), undefined, 'a 500 spends nothing');
    b.answer = { status: 200, body: OK_BODY };
    assert.equal((await send(b, T1, 'run')).status, 200);
    assert.equal(b.storage.getNode('acct-1', 's1'), undefined);
  } finally {
    b.w.server.dispose();
  }

  // (c) a GUARD (green before and after): the summary differs at run time, S's host changed while the dialog stood.
  const c = oneUseWorld({ holdDialogs: true });
  c.trust(T1);
  try {
    const pending = send(c, T1, 'run');
    await until(() => c.w.openDialogs.length === 1);
    c.details('s1').host = 'other.example';
    (c.w.openDialogs.shift() as (answer: string) => void)('Allow');
    const refused = await pending;
    assert.equal(refusedAs(refused, 'denied', changedWhileAsking('deploy')), sentence(refused));
    assert.notEqual(c.storage.getNode('acct-1', 's1'), undefined, 'S is there');

    const exec = send(c, S1, 'exec');
    await until(() => c.w.openDialogs.length === 1);
    (c.w.openDialogs.shift() as (answer: string) => void)('Allow');
    assert.equal((await exec).status, 200, 'and it is not marked: a later exec runs');
  } finally {
    c.w.server.dispose();
  }
});

test('a_waiting_value_of_the_ssh_entry_goes_in_before_the_table_is_read', async () => {
  // A5 (spec §7): the broker releases a waiting rotated value of the used entry after the grant's own and before it reads the mask table.
  const order: string[] = [];
  const world = oneUseWorld({
    extra: [terminalNode({ id: 't3', name: 'solo', sshEntityId: undefined })],
    hooks: {
      releaseWaiting: async (accountId: string, entityId: string): Promise<void> => {
        order.push(`release ${accountId}/${entityId}`);
      },
    },
    masker: async (accountId, entityId) => {
      order.push(`mask ${accountId}/${entityId}`);
      return [];
    },
  });
  world.trust(T1);
  try {
    assert.equal((await send(world, T1, 'run')).status, 200);
    assert.deepEqual(order, ['release acct-1/t1', 'release acct-1/s1', 'mask acct-1/t1'], 'the linked run: the grant\'s entry, then S, then the table');

    order.length = 0;
    await send(world, S1, 'exec');
    assert.deepEqual(order, ['release acct-1/s1', 'mask acct-1/s1'], 'a direct exec on S is unchanged');
  } finally {
    world.w.server.dispose();
  }

  // An unlinked Terminal entry has no second release (its run is refused as untrusted: nothing is spawned here).
  const solo = oneUseWorld({
    extra: [terminalNode({ id: 't3', name: 'solo', sshEntityId: undefined })],
    hooks: {
      releaseWaiting: async (accountId: string, entityId: string): Promise<void> => {
        order.push(`release ${accountId}/${entityId}`);
      },
    },
    masker: async (accountId, entityId) => {
      order.push(`mask ${accountId}/${entityId}`);
      return [];
    },
  });
  try {
    order.length = 0;
    await send(solo, { id: 't3', name: 'solo' }, 'run');
    assert.deepEqual(order, ['release acct-1/t3', 'mask acct-1/t3'], 'an unlinked entry releases only its own');
  } finally {
    solo.w.server.dispose();
  }
});

test('every_per_entry_hook_of_the_broker_has_a_decision_for_the_used_entry', () => {
  // The sweep of spec §2.5, left behind as a test: a hook the broker takes a grant's entry for must say what it does for the entry a call also uses.
  const DECISIONS: Record<string, string> = {
    maskEntriesFor: 'the link (maskEntriesWithLink)',
    releaseWaiting: 'uses',
    isOneUse: 'uses',
    burnAfterUse: 'uses',
    rememberMcpConsent: "the grant's only (spec §3.2)",
  };
  const NONE = 'takes no entry of a grant';
  assert.ok(BROKER_HOOK_NAMES.length > 0 && BROKER_HOOK_NAMES.includes('burnAfterUse'), 'a scan that matches nothing passes forever: it finds burnAfterUse');
  const undecided = BROKER_HOOK_NAMES.filter((name) => !(name in DECISIONS) && !PER_ENTRY_FREE.includes(name));
  assert.deepEqual(undecided, [], `a broker hook has no decision for the used entry (${undecided.join(', ')}): add it to DECISIONS (what it does for \`uses\`) or to PER_ENTRY_FREE (${NONE})`);
});

/** The hooks that take no entry of a grant: no decision about a used entry is owed (spec §2.5). */
const PER_ENTRY_FREE: readonly string[] = ['storageDir', 'resolveAlias', 'listAliases', 'listMcpEntries', 'visibleConfig', 'resolveMcpUse', 'moveToTrash', 'mcpCreate', 'configRoute', 'bridgeWall'];

test('the_agents_output_masks_the_ssh_password_that_the_run_used', async () => {
  // A5 (the pattern of waitingRotationVisible.test.ts): S stores OLD and holds a rotated NEW waiting. The run opens S's password the automatic way, which stores
  // NEW and uses it, and prints it. The table must have been read AFTER NEW went in, or the answer holds NEW in the clear.
  const OLD = 'old-Password-3d9a';
  const NEW = 'NEW-rotated-Password-7c1e';
  const stub = clickVscode([], sinks());
  const storage = memoryStorage(stub);
  const ssh: EntityMetadata = { id: 's1', name: 'prod box', isSshEnabled: true, host: 'prod.example', user: 'deploy', mcp: { view: true, use: true } };
  const terminal: EntityMetadata = { id: 't1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' };
  await seedEntry(storage, ssh, { password: OLD });
  await seedEntry(storage, terminal, {});
  await holdRotated(storage, VAULT_ACCOUNT, 's1', 'password', NEW, await fingerprintOf(OLD));
  const [{ maskEntriesWithLink }, { automaticOpenerFor }, quarantine] = loadEachWithVscode(['../maskEntries', '../automaticRead', '../rotationQuarantine'], stub) as [
    typeof import('../maskEntries'),
    typeof import('../automaticRead'),
    typeof import('../rotationQuarantine'),
  ];
  const trusted = [commandFingerprint('t1', trustLineFor(ssh, undefined, 'echo linked'))];
  const action = terminalRunAction({
    storage,
    storageDir: FAKE_STORAGE_DIR,
    signal: new AbortController().signal,
    acquireExecSlot: () => () => undefined,
    note: () => undefined,
    trustStore: { get: () => trusted, update: async () => undefined },
    applyEnv: async () => ({ written: [], withheld: [] }),
    onPath: () => false,
    // The run's ssh stand-in: S's password is opened the automatic way (it stores the waiting one first) and printed.
    overSsh: async () => {
      const opened = await automaticOpenerFor(storage, VAULT_ACCOUNT)(ssh, await storage.getPassword(VAULT_ACCOUNT, 's1'), 'password');
      return { status: 200, body: { ...OK_BODY, stdout: `the password is ${opened.kind === 'open' ? opened.value : '?'}\n` } };
    },
  });
  const w = brokerWorld({
    kind: 'terminal',
    supports: ['run'],
    realActions: { run: action },
    masker: (accountId, entityId) => maskEntriesWithLink(storage, accountId, entityId),
    hooks: { releaseWaiting: (accountId: string, entityId: string) => quarantine.releaseBeforeAutomaticUse(storage, accountId, entityId) },
  });
  try {
    const token = await w.server.share(VAULT_ACCOUNT, 't1', 'deploy', 'terminal');
    const dot = token.indexOf('.');

    const answer = await call(Number(token.slice(0, dot)), '/v1/use/run', { token: token.slice(dot + 1), body: {} });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(carried(await storage.getPassword(VAULT_ACCOUNT, 's1')), NEW, 'the setup: the waiting password was released');
    assert.match(String(answer.body.stdout), /the password is /);
    assert.ok(!JSON.stringify(answer.body).includes(NEW), `the agent's output carried the released SSH password UNMASKED: ${JSON.stringify(answer.body)}`);
  } finally {
    w.server.dispose();
  }
});
