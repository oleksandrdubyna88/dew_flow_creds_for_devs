import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BROKER_HOOK_NAMES, checkedHooks } from '../brokerHooks';
import { world } from './brokerWorld';

/**
 * The guard that pays for making the broker's hooks named.
 *
 * <p>Fourteen positional constructor parameters, eleven of them optional callbacks, is a shape
 * where inserting one in the middle hands every argument after it to the wrong slot. It happened
 * twice: `visibleConfig` in August (nineteen checks in an integration script broken for a month,
 * unseen) and `isOneUse` on 2026-09-11 (`creds ls` went blank). Naming them ends that.</p>
 *
 * <p><b>But naming them buys a new failure, and it is quieter than the one it replaces.</b>
 * Positional got the SLOT wrong, which broke something. Named gets the KEY wrong — and every hook
 * here is optional, so `resolveAlais` is not an error, it is a feature silently switched off. That
 * is why the keys are checked rather than trusted, and why the check lives in the constructor
 * rather than only in this file: three reviewers read the plan as testing `checkedHooks` in
 * isolation while the server stored the raw object, which would leave production exactly as
 * exposed.</p>
 */

test('a misspelled hook is refused, and the message says what was meant', () => {
  assert.throws(
    () => checkedHooks({ resolveAlais: () => undefined } as never),
    (error: Error) => {
      assert.match(error.message, /resolveAlais/, 'it names the key that is wrong');
      assert.match(error.message, /resolveAlias/, 'and the twelve that are right');
      return true;
    },
  );
});

test('the SERVER refuses it too — the check is not only in this test file', () => {
  // The finding three reviewers raised independently: a guard the constructor does not call is a
  // guard that protects the test suite and nothing else.
  assert.throws(() => world({ hooks: { badHook: true } }), /badHook/);
});

test('every hook the interface declares is accepted', () => {
  // Not a list this test maintains by hand: `BROKER_HOOK_NAMES` is the same tuple the guard reads,
  // and a compile-time assertion in `brokerHooks.ts` refuses it drifting from the interface. So
  // this asserts the guard agrees with itself, and the type checker asserts the rest.
  const everything = Object.fromEntries(BROKER_HOOK_NAMES.map((name) => [name, undefined]));

  assert.doesNotThrow(() => checkedHooks(everything as never));
  assert.equal(BROKER_HOOK_NAMES.length, 12, 'eleven callbacks and the storage directory');
});

test('nothing at all is a real build, and so is a hook set to undefined', () => {
  // The CLI integration script constructs a server with a registry and nothing else; a window
  // without a vault passes several of these as undefined on purpose. Neither is a mistake.
  assert.deepEqual(checkedHooks(undefined), {});
  assert.deepEqual(checkedHooks({}), {});
  assert.doesNotThrow(() => checkedHooks({ resolveAlias: undefined }));
});

test('a value that is not a hook set at all is refused, not silently ignored', () => {
  // The half-migrated `.cjs` shape: a caller that still passes the old third positional argument
  // now hands a STRING where the hooks belong. Ignoring it would turn every hook off at once —
  // which is the August failure with a new spelling.
  assert.throws(() => checkedHooks('C:/storage' as never), /hooks/i);
  assert.throws(() => checkedHooks((() => undefined) as never), /hooks/i);
  assert.throws(() => checkedHooks(null as never), /hooks/i);
});

test('an object that is not a PLAIN object is refused, whatever it carries', () => {
  // The gate found this one, and it is the guard failing at its own job: a `Map` holding the hooks
  // has no own enumerable keys, so the stray-key check saw nothing wrong and every hook came out
  // switched off — silently, which is the exact shape of the August failure.
  assert.throws(() => checkedHooks(new Map([['listAliases', () => []]]) as never), /plain object/i);
  assert.throws(() => checkedHooks(new Date() as never), /plain object/i);
  assert.throws(() => checkedHooks(new (class Hooks {})() as never), /plain object/i);
});

test('a hook of the wrong KIND is refused, and the message says which and what', () => {
  // Keys alone are not enough for the five untyped callers. `storageDir: 123` reaches `path.join`
  // and throws somewhere later; `listAliases: 'yes'` is called and throws on the first `creds ls`.
  // Both are this constructor's business, and both are one line to catch here.
  assert.throws(() => checkedHooks({ storageDir: 123 } as never), /storageDir.*string/i);
  assert.throws(() => checkedHooks({ listAliases: 'yes' } as never), /listAliases.*function/i);
  assert.throws(() => checkedHooks({ mcpCreate: () => undefined } as never), /mcpCreate.*object/i);
});

test('the hooks the server keeps are its own, and frozen', () => {
  // A caller that reuses its options object must not be able to switch a running window's feature
  // off after the fact — the repository's immutability rule, and cheap to hold here.
  const mine: Record<string, unknown> = { listAliases: () => [] };
  const kept = checkedHooks(mine as never);

  mine.listAliases = undefined;

  assert.notEqual(kept.listAliases, undefined, 'the server holds a copy, not the caller object');
  assert.throws(() => {
    (kept as Record<string, unknown>).listAliases = undefined;
  }, TypeError);
});

test('null is not an object hook, whatever typeof says', () => {
  // CodeRabbit's, on the pull request, and it is this guard's own blind spot: `typeof null` is
  // "object", so `mcpCreate: null` walked straight through the kind check — and then
  // `handleMcpCreate` tests `create === undefined`, which null is not, and calls `create.choose`.
  // A TypeError on the first create request, from a value the constructor had just approved.
  assert.throws(() => checkedHooks({ mcpCreate: null } as never), /mcpCreate/);
  assert.throws(() => checkedHooks({ configRoute: null } as never), /configRoute/);
  // And it is not the general case: undefined still means "this window does not serve that".
  assert.doesNotThrow(() => checkedHooks({ mcpCreate: undefined, configRoute: undefined }));
});
