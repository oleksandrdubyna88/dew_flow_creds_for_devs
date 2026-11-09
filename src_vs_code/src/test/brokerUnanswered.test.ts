import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import { test } from 'node:test';
import { INTERNAL_FAILURE, UNANSWERED_FAILURE } from '../brokerProtocol';
import type { BridgeContext } from '../bridgeContext';
import { loadBridgeModules } from './bridgeModules';

/**
 * `unanswered` (Amendment 6, D.8 and its review): a handler threw, so the caller is answered FIRST and the journal line is written
 * after, in a `try` — a journal that will not take the line costs the caller nothing.
 */

const { requests: { unanswered } } = loadBridgeModules();

/** A real response object whose headers have (or have not) gone out; nothing is listening on it. */
function response(sent: boolean): http.ServerResponse {
  const res = new http.ServerResponse(new http.IncomingMessage(new net.Socket()));
  if (sent) {
    res.writeHead(200);
  }
  return res;
}

const SENTINEL = 'zq-sentinel-message';
const SENTINEL_JSON = 'zq-sentinel-json';

/** What `unanswered` was given to write, and what it answered, for one thrown value. */
function unanswer(error: unknown, route: string, sent = false): { answers: string[]; lines: string[] } {
  const { answers, lines } = unanswerFor(undefined, error, route, sent);
  return { answers, lines };
}

/** The same, through a door: which bridge's context the request came in by, and the grant field the line was written with. */
function unanswerFor(bridge: BridgeContext | undefined, error: unknown, route: string, sent = false): { answers: string[]; lines: string[]; grants: string[] } {
  const answers: string[] = [];
  const lines: string[] = [];
  const grants: string[] = [];
  unanswered(response(sent), error, route, bridge, (code, text) => void answers.push(`${code} ${text}`), (line) => void (lines.push(line.detail), grants.push(line.grant)));
  return { answers, lines, grants };
}

/** The SyntaxError a `JSON.parse` of text holding a sentinel really throws (its message quotes the input on some Nodes). */
function jsonSyntaxError(): unknown {
  try {
    JSON.parse(`{"x": "${SENTINEL_JSON}" broken`);
  } catch (error) {
    return error;
  }
  return undefined;
}

test('unanswered: the caller is answered before the journal is written, with its own sentence, and a journal that throws does not undo the answer', () => {
  const order: string[] = [];
  unanswered(
    response(false),
    new Error(SENTINEL),
    'GET /v1/mcp/entries',
    undefined,
    (code, message) => void order.push(`answer ${code} ${message}`),
    () => {
      order.push('journal');
      throw new Error('the journal could not be written');
    },
  );
  assert.deepEqual(order, [`answer internal ${UNANSWERED_FAILURE}`, 'journal']);
  assert.notEqual(UNANSWERED_FAILURE, INTERNAL_FAILURE, 'the body does not promise a reason the journal no longer holds');
  assert.equal(UNANSWERED_FAILURE.includes('journal for the reason'), false);
});

test('unanswered: after the headers went out nothing more is sent, and the line says so — class, route, headers flag, never the message', () => {
  const { answers, lines } = unanswer(new Error(SENTINEL), 'GET /v1/mcp/entries', true);
  assert.deepEqual(answers, [], 'a handler that threw after answering writes no second answer');
  assert.deepEqual(lines, ['a handler failed: Error on GET /v1/mcp/entries; headers sent']);
});

test('unanswered: the line is a classification — a built-in class name, a code of the strict shape or none, the route or `other`, the headers flag', () => {
  class Home extends Error {}
  const coded = Object.assign(new Error(SENTINEL), { code: 'ECONNRESET' });
  const odd = Object.assign(new TypeError(SENTINEL), { code: `E ${SENTINEL}` });
  assert.deepEqual(unanswer(new TypeError(SENTINEL), 'other').lines, ['a handler failed: TypeError on other; headers not sent']);
  assert.deepEqual(unanswer(coded, 'POST /v1/alias/exec').lines, ['a handler failed: Error ECONNRESET on POST /v1/alias/exec; headers not sent']);
  assert.deepEqual(unanswer(odd, 'other').lines, ['a handler failed: TypeError on other; headers not sent'], 'a code that is not of the strict shape is left out');
  assert.deepEqual(unanswer(new Home(SENTINEL), 'other').lines, ['a handler failed: Error on other; headers not sent'], 'a class of our own, or a path in a name, reads Error');
  assert.deepEqual(unanswer(SENTINEL, 'other').lines, ['a handler failed: Error on other; headers not sent'], 'a thrown string is not a class');
  assert.deepEqual(unanswer(undefined, 'other').lines, ['a handler failed: Error on other; headers not sent']);
});

test('unanswered: a `code` is named only when it is a system errno of this platform, and only an Error carries it — no ERR_ word, no planted all-caps word', () => {
  const PLANTED = 'ZQPLANTEDSECRETVALUE';
  const line = (error: unknown): string => unanswer(error, 'other').lines[0];
  assert.equal(line(Object.assign(new Error('x'), { code: 'ENOENT' })), 'a handler failed: Error ENOENT on other; headers not sent');
  assert.equal(line(Object.assign(new Error('x'), { code: 'ECONNRESET' })), 'a handler failed: Error ECONNRESET on other; headers not sent');
  for (const [what, error] of [
    ['an ERR_ word with a planted value', Object.assign(new Error('x'), { code: `ERR_${PLANTED}` })],
    ['one of Node\'s own ERR_ codes (left out: only errno names are named)', Object.assign(new Error('x'), { code: 'ERR_INVALID_ARG_TYPE' })],
    ['an all-caps word on an Error', Object.assign(new Error('x'), { code: PLANTED })],
    ['an E-prefixed word that is no errno', Object.assign(new Error('x'), { code: `E${PLANTED}` })],
    ['an all-caps word on a thrown plain object', { code: PLANTED }],
    ['a real errno name on a thrown plain object', { code: 'ECONNRESET' }],
    ['a real errno name on a thrown string', 'ECONNRESET'],
  ] as const) {
    assert.equal(line(error), 'a handler failed: Error on other; headers not sent', what);
    assert.equal(line(error).includes(PLANTED), false, what);
  }
});

test('the body promises what the line keeps: it names the kind of error and never the message — and does not say "not why", since an errno name is a fragment of why', () => {
  const coded = Object.assign(new Error('zq-message'), { code: 'ENOENT' });
  const { answers, lines } = unanswer(coded, 'other');
  assert.ok(lines[0].includes('ENOENT'), 'the observation: the line carries an errno name, which tells part of why');
  assert.doesNotMatch(UNANSWERED_FAILURE, /not why/i);
  assert.match(UNANSWERED_FAILURE, /kind of error/);
  assert.match(UNANSWERED_FAILURE, /never its message/);
  assert.equal(answers[0].includes('zq-message'), false);
});

test('the sentinel: neither a thrown message nor the fragment a JSON.parse SyntaxError quotes reaches the body or the journal line', () => {
  for (const [what, error, word] of [['a handler\'s message', new Error(SENTINEL), SENTINEL], ['a JSON.parse SyntaxError', jsonSyntaxError(), SENTINEL_JSON]] as const) {
    assert.ok(error instanceof Error, `${what}: the injected throw is a real error`);
    const { answers, lines } = unanswer(error, 'POST /v1/use/exec');
    assert.equal([...answers, ...lines].some((text) => text.includes(word)), false, `${what}: "${word}" reached the body or the journal`);
    assert.equal([...answers, ...lines].some((text) => text.includes(String(error.message))), false, `${what}: the message reached the body or the journal`);
  }
});

const CONTEXT: BridgeContext = { bridgeId: 'b1', accountId: 'a1', serverEntityId: 's1', serverName: 'prod (eu) \u2192 db', target: '', remoteOs: undefined };

test('unanswered (E1.4, Q13): the line says which bridge the request came in by — the context the door handed, in the grant field — and off a bridge it says nothing', () => {
  const bridged = unanswerFor(CONTEXT, new Error(SENTINEL), 'POST /v1/alias/exec');
  assert.deepEqual(bridged.grants, ['\u2014 bridge=prod_eu_db'], 'the mark, as auditGrantMark writes it for a line with no grant');
  assert.deepEqual(bridged.lines, ['a handler failed: Error on POST /v1/alias/exec; headers not sent'], 'beside the classification, which does not move');
  assert.deepEqual(unanswerFor(undefined, new Error(SENTINEL), 'POST /v1/alias/exec').grants, ['\u2014'], 'off a bridge the field is what it was');
  assert.deepEqual(unanswerFor(CONTEXT, new Error(SENTINEL), 'other', true).answers, [], 'and the headers rule is unchanged');
});
