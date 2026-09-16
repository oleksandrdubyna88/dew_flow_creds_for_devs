import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/**
 * That the panel actually WIRES the row order — asserted over its source.
 *
 * <h3>Why a source scan, and what it is standing in for</h3>
 *
 * <p>`entityViewPanel.ts` imports `vscode` and builds a real webview panel, and nothing in this
 * repository drives a real webview: `research/module_tests.md` names that gap under *What none of
 * them covers* — "Nothing drives VS Code itself ... a webview that throws on open is caught by unit
 * tests over the pure halves and by nothing else". So the halves are tested where they are pure
 * (`rowFlip.test.ts`, `paymentViewHost.test.ts`, `wovenPasswordForm.test.ts`), and what remains is
 * the question those cannot answer: is the store CONSTRUCTED, handed to BOTH hosts, and CLEARED.</p>
 *
 * <p>This feature has already paid for skipping that question. Ten modules of the weaving work
 * shipped reachable from nothing but their own tests — `revealGate`, `phraseBuffer`,
 * `phraseReassembly`, `phraseLayout`, `decoyPhrase`, `wordlists` among them — every one of them
 * green. The lesson written down at the time is the one this file applies: <b>a test that asserts
 * the CALL, not only the function.</b></p>
 *
 * <p>Every assertion of an ABSENCE or a presence here carries a companion that proves the scan is
 * still reading what it thinks it is. A scan that has quietly stopped matching passes for ever.</p>
 */

const source = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'entityViewPanel.ts'),
  'utf8',
);

test('the panel constructs exactly ONE row-order store, and gives it the real randomness', () => {
  const built = source.match(/new RowOrderStore\(/g) ?? [];

  assert.equal(built.length, 1, 'two stores would let a Show and its Copy disagree');
  // The house CSPRNG, never Math.random: one bit, but a predictable bit is one a reader who has
  // watched a few opens carries into the next.
  assert.match(source, /new RowOrderStore\(cryptoRandom\)/, 'drawn from the crypto source');
  assert.ok(!/RowOrderStore\(Math\.random\)/.test(source), 'and never from the one that looks random');
});

test('the SAME store reaches both hosts — the card’s and the woven password’s', () => {
  const handed = source.match(/^\s*orders,$/gm) ?? [];

  assert.equal(handed.length, 2, 'one host wired and not the other is a Copy that copies the wrong row');
  // The companion: the two constructions the two `orders,` lines belong to are still here, so this
  // count cannot go on passing because the hosts were renamed out from under it.
  assert.match(source, /new PaymentViewHost\(\{/, 'the card’s host is still constructed here');
  assert.match(source, /handleWovenPassword\(/, 'and the password’s half is still called here');
});

test('the store is cleared where the card’s other per-entry state is cleared', () => {
  // Both sites, because a store cleared only on dispose would carry one entry's order into the
  // next — the preview tab is reused, which is the whole reason `payment.reset()` has two callers.
  // Anchored to a STATEMENT, not a mention: the prose above these calls names `payment.reset()`
  // too, and counting that as a call site is how a scan comes to pass for the wrong reason.
  const cleared = source.match(/^\s*orders\.clear\(\);$/gm) ?? [];
  const reset = source.match(/^\s*payment\.reset\(\);$/gm) ?? [];

  assert.equal(cleared.length, 2, 'clear on render AND on dispose');
  assert.equal(reset.length, 2, 'the companion: the state it is paired with still has its two sites');
});

test('the order reaches no message the panel posts', () => {
  // The invariant the whole feature rests on: the page is given `a` and `b` and nothing else. If an
  // order, a flip or a swap ever appears in a posted object, it is one inspector away from the
  // reader this defends against.
  assert.ok(!/post[A-Za-z]*\([^)]*\b(flip|swapped|asRead|rowOrder)\b/i.test(source));
  // The CALL, not the property: `panel.webview.postMessage` alone would keep matching an assignment
  // or a reference that posts nothing.
  assert.match(source, /panel\.webview\.postMessage\(/, 'the companion: the panel still posts at all');
});

/**
 * The copy path checks it is still the same entry on BOTH sides of the read (#52).
 *
 * <p>Raised by the automated reviewer, and it is the shape this feature has already been bitten by
 * twice: a guard before an await does nothing about what happens during it. `copyValueFor` goes to
 * the keychain — for a payment field, for a second value, for every ordinary secret — so a render
 * landing in that window would put the PREVIOUS entry's secret on the clipboard and tell the new
 * entry's page it was copied.</p>
 *
 * <p>The whole SEQUENCE is pinned rather than the count, because a scan that matches a fragment
 * survives its own break: two guards could both sit before the read and this would still pass.</p>
 */
test('the entry is re-checked after the value is read, not only before it', () => {
  const copyPath = source.slice(source.indexOf("message.type !== 'copy'"));
  const order = [...copyPath.matchAll(/state\.options !== options|await copyValueFor\(|await copySecret\(/g)]
    .map((one) => one[0]);

  assert.deepEqual(
    order.slice(0, 4),
    ['state.options !== options', 'await copyValueFor(', 'state.options !== options', 'await copySecret('],
    'guard, read, guard, then the clipboard — in that order',
  );
});

test('and the scan is still reading the copy path it thinks it is', () => {
  // The companion every scan in this file carries: proof the slice above is the handler rather than
  // an empty string that would make any assertion about its contents vacuously true.
  const copyPath = source.slice(source.indexOf("message.type !== 'copy'"));

  assert.ok(copyPath.length > 200, 'the slice found the handler');
  assert.match(copyPath, /Nothing to copy/, 'and it is the one that answers an empty field');
});
