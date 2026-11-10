import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CallDeps, CallSubject } from '../brokerCall';
import type { Grant } from '../grantRegistry';
import type { UsedEntry } from '../useActions';
import { loadEachWithVscode } from './vscodeStub';

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
