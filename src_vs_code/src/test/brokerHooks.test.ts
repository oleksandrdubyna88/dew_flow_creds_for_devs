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
      assert.match(error.message, /resolveAlias/, 'and the eleven that are right');
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
