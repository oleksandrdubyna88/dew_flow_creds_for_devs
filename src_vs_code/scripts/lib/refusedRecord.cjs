'use strict';
// The pure rules of the refused legs of M4 and M9 (G1, E3.S5; `todo/PLAN_person_roads_pin_host_key_E3_S5_spec.md` §2; decision 15 of
// `todo/PLAN_person_roads_pin_host_key.md`): the table of the 25 legs, the message that a refused leg expects (read from the product's own
// functions, never typed here), and the judge of a refused leg's counts. `test/itestRowsRefused.test.ts` (RF1 to RF3) holds them without
// loading the harness. The four counts stay apart (the stories of E3.S4): a start of the client is not a connection start, and neither is a
// connection in the counterpart's log.
//
// Nothing is read when this module is loaded: no variable, no file, no process. It imports `lib/rowRecord.cjs` only (pure as well); what needs
// the product's functions takes them as an argument.
const { openingOf, CAUSE_MARK } = require('./rowRecord.cjs');

/** A saved key that does not parse (M4 (b), M9), and a host that cannot form a known-hosts line (M4 (c): `isSafeSshHost` refuses the space). */
const UNUSABLE_TEXT = 'not a host key';
const UNSAFE_HOST = 'not a host';

/** What each leg of M4 (a) puts in the entry's `hostKey` before its first click: nothing, an empty text, white space only. */
const ABSENT_TEXTS = Object.freeze({ 'm4-a-none': undefined, 'm4-a-empty': '', 'm4-a-space': '   ' });

const ROADS = ['install', 'bridge'];
const STATES = ['cold', 'warm'];

const leg = (row, name, fields) => Object.freeze({ name, row, ...fields });

/** The four legs of one refused case: each road once cold and once warm, each its own process and world (§1.2). */
const refusedLegs = (row, prefix, fields) => ROADS.flatMap((road) => STATES.map((state) => leg(row, `${prefix}-${road}-${state}`, { ...fields, road, state })));

/** M4: (a) absent on the five runs, then (b) a text that does not parse, (c) a host that cannot form a line, (d) a pin write that fails. */
const M4_LEGS = Object.freeze([
  ...Object.keys(ABSENT_TEXTS).map((name) => leg('M4', name, { case: 'a', road: 'five', state: 'cold', credential: 'named', k1: 'standIn' })),
  ...refusedLegs('M4', 'm4-b', { case: 'b', credential: 'stored', k1: 'plain' }),
  ...refusedLegs('M4', 'm4-c', { case: 'c', credential: 'stored', k1: 'plain' }),
  ...refusedLegs('M4', 'm4-d', { case: 'd', credential: 'named', k1: 'plain' }),
]);

/** M9: a pin that does not parse on each road, for a key entry and for a password entry; Connect's repair; the password entry's Connect (C1). */
const M9_LEGS = Object.freeze([
  ...refusedLegs('M9', 'm9-key', { case: 'pin', credential: 'stored', k1: 'plain' }),
  ...refusedLegs('M9', 'm9-password', { case: 'pin', credential: 'password', k1: 'passwords' }),
  leg('M9', 'm9-key-repair', { case: 'repair', road: 'five', state: 'cold', credential: 'stored', k1: 'standIn' }),
  leg('M9', 'm9-password-connect', { case: 'c1', road: 'none', state: 'cold', credential: 'password', k1: 'ended' }),
]);

const PREFIXES = { install: (name) => `Cannot reach "${name}": `, bridge: (name) => `Cannot bridge to "${name}": ` };

/**
 * The message that a refused leg expects: `{ prefix, text, code }`. The prefix is the road's; `text` is sentence A in the login's form (the key form
 * for every credential but a password), or, for (d), the opening of sentence B up to its cause, with `code` the cause that the leg makes (`EACCES`).
 */
function expectedMessage(product, spec, name) {
  if (PREFIXES[spec.road] === undefined) {
    throw new Error(`unknown road ${JSON.stringify(spec.road)}; legal: ${Object.keys(PREFIXES).join(', ')}`);
  }
  const prefix = PREFIXES[spec.road](name);
  if (spec.case === 'd') {
    return { prefix, text: openingOf(product.pinWriteFailedSentence(name, new Error(CAUSE_MARK)), CAUSE_MARK), code: 'EACCES' };
  }
  return { prefix, text: product.unusablePinSentence(name, spec.credential === 'password' ? 'askpass' : 'key') };
}

/** Whether `text` is the expected message: A whole; B up to its opening and then the code, so the cause is the one the leg made. */
function messageMatches(text, expected) {
  const head = expected.prefix + expected.text;
  return expected.code === undefined ? text === head : text.startsWith(head) && text.slice(head.length).startsWith(expected.code);
}

const isCount = (value) => typeof value === 'number' && Number.isFinite(value);
const detailOf = (value) => JSON.stringify(value);

/**
 * The judge of R.1 to R.5 of a refused leg: a list of `{ name, ok, detail }` from the counts of the rig (`countsOf`), the leg's state and
 * `timing` (`questionEnd`, `sentenceAt`: `performance.now()` of the leg process). A value that could not be read is `null` and fails its check;
 * it is never read as `0`.
 */
function refusedChecks(counts, spec, timing) {
  const { starts, question, bridges, counterparts } = counts;
  const roads = ['install', 'bridge', 'check'];
  const connection = roads.map((road) => starts?.byRoad?.[road]?.connectionStarts);
  const kinds = Array.isArray(starts?.list) ? starts.list.map((one) => one.kind) : null;
  const checkStarts = starts?.byRoad?.check?.starts;
  const peers = Array.isArray(counterparts) && counterparts.length > 0 ? counterparts : null;
  const cold = spec.state === 'cold';
  const ended = isCount(timing?.questionEnd) && isCount(timing?.sentenceAt) && timing.questionEnd <= timing.sentenceAt;
  const coldOk = starts?.total === 1 && starts.questions === 1 && kinds?.length === 1 && kinds[0] === 'question' && starts.list[0].whole === true && Array.isArray(question) && question.length === 1 && ended;
  const warmOk = starts?.total === 0 && starts.questions === 0 && kinds?.length === 0 && Array.isArray(question) && question.length === 0;
  return [
    { name: '0 connection starts: install 0, bridge 0, check 0 (R.1)', ok: connection.every((count) => count === 0) && starts?.connectionStarts === 0, detail: detailOf({ byRoad: starts?.byRoad, connectionStarts: starts?.connectionStarts }) },
    { name: 'the socket check has no start of any kind, and no run of the sweep or the mode check (R.2)', ok: checkStarts === 0 && kinds !== null && !kinds.some((kind) => kind === 'sweep' || kind === 'mode'), detail: detailOf({ check: checkStarts, kinds }) },
    { name: '0 connections and 0 authentication attempts in the counterpart\'s log (R.3)', ok: peers !== null && peers.every((one) => one.connections === 0 && one.authAttempts === 0), detail: detailOf(peers) },
    { name: 'no bridge was spawned (R.4)', ok: Array.isArray(bridges) && bridges.length === 0, detail: detailOf(bridges) },
    cold
      ? { name: 'cold: exactly ONE start of the client, its argv -V alone, and that run had ended before the sentence was shown (R.5)', ok: coldOk, detail: detailOf({ total: starts?.total, questions: starts?.questions, kinds, timed: question?.length, timing }) }
      : { name: 'warm: exactly 0 starts of the client, of any kind (R.5)', ok: warmOk, detail: detailOf({ total: starts?.total, questions: starts?.questions, kinds, timed: question?.length }) },
  ];
}

module.exports = { UNUSABLE_TEXT, UNSAFE_HOST, ABSENT_TEXTS, M4_LEGS, M9_LEGS, expectedMessage, messageMatches, refusedChecks };
