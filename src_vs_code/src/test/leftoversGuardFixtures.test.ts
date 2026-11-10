// The shipped Node guard's F30 reader, pinned by the plants this repository's own tests care about (E2.5 S2.6, the parent's row E2.5-a).
//
// At conventions release 37b9aa5 the guard reads one line's SPELLINGS (table D2 of `todo/PLAN_F30_folding_reader.md`): a split `'a' + 'b'` in a script, touching
// quoted pieces in a shell word, a piece of the prefix word. Each plant below is a positive test through `scanText` of the MOUNTED guard (never a copy): the class,
// the line AND the detail text. The detail text matters: with the `+` join off the `.cjs` plant is still a `legacy-name`, but its text becomes the piece text, and
// with the piece reading off the `.sh` `+` plant is no finding at all, so an assertion of class and line alone would stay green (measured, brief § 0). No case asserts
// that a spelling is NOT found: a limit of the reader is stated in `research/module_tests.md`, not pinned here.
//
// `scanText` reads the spelling, not discovery, so each plant path is also checked against `isScanned(path, 'node')`: a plant at a path the profile does not read would
// prove the reader only. THIS FILE IS READ BY THE `docs.yml` GUARD STEP (`*.test.ts`), and each plant string is itself a finding there, so every plant line has a marker above.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { guardOrSkip, judgeGuard, loadFailureReason, type MountedGuard } from './mountedGuard';

const CJS = 'scripts/x.cjs';
const SH = '.github/scripts/x.sh';

// testsToDelete-exempt: legacy-name — a planted spelling: the guard under test must find it in scanText
const JS_SPLIT = "const p = 'testsTo' + 'Delete-agent-x';";
// testsToDelete-exempt: legacy-name — a planted spelling: the guard under test must find it in scanText
const SH_TOUCHING = 'p="testsTo""Delete-agent-x"';
// testsToDelete-exempt: legacy-name — a planted spelling: the guard under test must find it in scanText
const SH_PLUS = 'p="testsTo"+"Delete-agent-x"';
// testsToDelete-exempt: legacy-name — a planted spelling: the guard under test must find it in scanText
const JS_WHOLE = "const p = 'testsToDelete" + "-agent-x';"; // two pieces: leftoversSites.test.ts refuses the whole legacy form in any test file; the text the guard reads is whole
// testsToDelete-exempt: legacy-name — a planted spelling: the guard under test must find it in scanText
const SH_WHOLE = 'p="testsToDelete' + '-agent-x"'; // two pieces, as above

// testsToDelete-exempt: legacy-name — expected detail text, not a plant: what the guard prints for a joined or whole plant, so it holds the word itself
const WHOLE_TEXT = '`testsToDelete-agent`';
// testsToDelete-exempt: legacy-name — expected detail text, not a plant: what the guard prints for a plus-split shell plant, so it holds half of the word
const PIECE_TEXT = '`testsTo (a piece of the prefix word)`';

/** One plant: the class, the line and the detail text the guard gives it, and the path the `node` profile reads. */
async function found(t: TestContext, file: string, plant: string): Promise<{ cls: string; line: number; text: string }[] | undefined> {
  const guard = await guardOrSkip(t);
  if (guard === undefined) return undefined;
  assert.equal(guard.isScanned(file, 'node'), true, `${file} is a path the node profile reads`);
  return guard.scanText(file, `${plant}\n`).map(({ cls, line, text }) => ({ cls, line, text }));
}

test('a `.cjs` prefix split by `+` is one legacy-name on its line, named as the joined spelling', async (t) => {
  const findings = await found(t, CJS, JS_SPLIT);
  if (findings !== undefined) assert.deepEqual(findings, [{ cls: 'legacy-name', line: 1, text: WHOLE_TEXT }]);
});

test('a `.sh` word of two touching quoted pieces is one legacy-name, named as the joined spelling', async (t) => {
  const findings = await found(t, SH, SH_TOUCHING);
  if (findings !== undefined) assert.deepEqual(findings, [{ cls: 'legacy-name', line: 1, text: WHOLE_TEXT }]);
});

test('a `.sh` prefix split by `+` is one legacy-name on its piece: a shell does not join `+`', async (t) => {
  const findings = await found(t, SH, SH_PLUS);
  if (findings !== undefined) assert.deepEqual(findings, [{ cls: 'legacy-name', line: 1, text: PIECE_TEXT }]);
});

test('a whole legacy literal in a `.cjs` and in a `.sh` is one legacy-name each', async (t) => {
  const js = await found(t, CJS, JS_WHOLE);
  const sh = await found(t, SH, SH_WHOLE);
  if (js !== undefined) assert.deepEqual(js, [{ cls: 'legacy-name', line: 1, text: WHOLE_TEXT }]);
  if (sh !== undefined) assert.deepEqual(sh, [{ cls: 'legacy-name', line: 1, text: WHOLE_TEXT }]);
});

// --- what `mountedGuard.ts` does with the answer of the load (E2.5 S2.4, G3) ---------------------------------------------------------------------------

const REASON = 'the mounted guard cannot load its yaml module';
const skips = (): { calls: string[]; skip: (reason: string) => void } => {
  const calls: string[] = [];
  return { calls, skip: (reason: string) => void calls.push(reason) };
};
const stub: MountedGuard = { scanText: () => [], isScanned: () => true };

test('a guard that loaded is handed to the test, flag or no flag', () => {
  const context = skips();

  assert.equal(judgeGuard(stub, context, {}), stub);
  assert.equal(judgeGuard(stub, context, { CREDS_GUARD_TESTS_REQUIRED: '1' }), stub);
  assert.deepEqual(context.calls, []);
});

test('a guard that cannot load skips the test with the reason where the flag is not set', () => {
  const context = skips();

  assert.equal(judgeGuard(REASON, context, {}), undefined);
  assert.equal(judgeGuard(REASON, context, { CREDS_GUARD_TESTS_REQUIRED: '0' }), undefined);
  assert.deepEqual(context.calls, [REASON, REASON]);
});

test('a guard that cannot load FAILS the test with the reason where CREDS_GUARD_TESTS_REQUIRED=1, and skips nothing', () => {
  const context = skips();

  assert.throws(() => judgeGuard(REASON, context, { CREDS_GUARD_TESTS_REQUIRED: '1' }), (error: Error) => error.message.includes(REASON) && error.message.includes('CREDS_GUARD_TESTS_REQUIRED=1'));
  assert.deepEqual(context.calls, []);
});

// --- the reason a failed load gives (E2.5 review 7): the real cause, and `yaml` only when it is the missing module ----------------------------------------

test('a missing yaml module is named as the yaml module, with the error\'s own message', () => {
  const missing = new Error('leftovers-check: the `yaml` package (version 2) is needed to read workflows and cannot be found');
  missing.name = 'YamlMissingError';
  const notFound = Object.assign(new Error("Cannot find package 'yaml' imported from /x/leftovers-check.mjs"), { code: 'ERR_MODULE_NOT_FOUND' });

  for (const error of [missing, notFound]) {
    const reason = loadFailureReason(error);
    assert.match(reason, /cannot load its yaml module \(run npm ci --ignore-scripts --prefix /);
    assert.ok(reason.includes(error.message), `the message is kept: ${reason}`);
  }
});

test('any other load failure is reported as itself and never as a yaml problem', () => {
  const syntax = new SyntaxError('Unexpected token } in leftovers-check.mjs');
  const otherModule = Object.assign(new Error("Cannot find package 'picomatch' imported from /x/leftovers-check.mjs"), { code: 'ERR_MODULE_NOT_FOUND' });

  for (const error of [syntax, otherModule, 'a thrown string']) {
    const reason = loadFailureReason(error);
    assert.doesNotMatch(reason, /yaml/i, reason);
    assert.ok(reason.includes(typeof error === 'string' ? error : error.message), `the message is kept: ${reason}`);
  }
});
