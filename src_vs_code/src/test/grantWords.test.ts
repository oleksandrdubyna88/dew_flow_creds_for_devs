import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { expiredMessage } from '../grantWords';
import { loadWithVscode } from './vscodeStub';

/** The words of a grant that ran out, moved out of `grantLimits.ts` so a pure module can say them without reaching the editor (E1.3 epoch 3, A.3.7). */

const LIMITS = { idleMs: 90 * 60_000, maxUses: 7 };

test('an idle expiry says how long it went unused and what to do', () => {
  assert.equal(expiredMessage('idle', LIMITS), 'This grant expired: it went unused for more than 90 minutes. Ask the person for a fresh Share with Claude Code.');
});

test('a call-cap expiry says the cap and what to do', () => {
  assert.equal(expiredMessage('uses', LIMITS), 'This grant expired: it reached its limit of 7 calls. Ask the person for a fresh Share with Claude Code.');
});

test('grantWords loads with no editor at all, and grantLimits no longer carries the sentence', () => {
  const without = (): never => {
    throw new Error('the editor was asked for');
  };
  const words = loadWithVscode<typeof import('../grantWords')>('../grantWords', new Proxy({}, { get: without }));
  assert.equal(typeof words.expiredMessage, 'function');
  const limits = loadWithVscode<Record<string, unknown>>('../grantLimits', { workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) } });
  assert.equal('expiredMessage' in limits, false, 'one home for the sentence');
  assert.deepEqual(Object.keys(limits).sort(), ['describeLimits', 'grantLimits']);
});
