import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import { test } from 'node:test';
import { INTERNAL_FAILURE, UNANSWERED_FAILURE } from '../brokerProtocol';
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
  const answers: string[] = [];
  const lines: string[] = [];
  unanswered(response(sent), error, route, (code, text) => void answers.push(`${code} ${text}`), (line) => void lines.push(line.detail));
  return { answers, lines };
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

test('the sentinel: neither a thrown message nor the fragment a JSON.parse SyntaxError quotes reaches the body or the journal line', () => {
  for (const [what, error, word] of [['a handler\'s message', new Error(SENTINEL), SENTINEL], ['a JSON.parse SyntaxError', jsonSyntaxError(), SENTINEL_JSON]] as const) {
    assert.ok(error instanceof Error, `${what}: the injected throw is a real error`);
    const { answers, lines } = unanswer(error, 'POST /v1/use/exec');
    assert.equal([...answers, ...lines].some((text) => text.includes(word)), false, `${what}: "${word}" reached the body or the journal`);
    assert.equal([...answers, ...lines].some((text) => text.includes(String(error.message))), false, `${what}: the message reached the body or the journal`);
  }
});
