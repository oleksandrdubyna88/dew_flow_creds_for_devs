import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import { test } from 'node:test';
import { INTERNAL_FAILURE } from '../brokerProtocol';
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

test('unanswered: the caller is answered before the journal is written, and a journal that throws does not undo the answer', () => {
  const order: string[] = [];
  unanswered(
    response(false),
    new Error('the reason'),
    (code, message) => void order.push(`answer ${code} ${message}`),
    () => {
      order.push('journal');
      throw new Error('the journal could not be written');
    },
  );
  assert.deepEqual(order, [`answer internal ${INTERNAL_FAILURE}`, 'journal']);
});

test('unanswered: after the headers went out nothing more is sent, and the reason still reaches the journal (never the body)', () => {
  const lines: string[] = [];
  const answers: string[] = [];
  unanswered(response(true), new Error('the reason'), (code) => void answers.push(code), (line) => void lines.push(line.detail));
  assert.deepEqual(answers, [], 'the guard: a handler that threw after answering writes no second answer');
  assert.deepEqual(lines, ['a handler threw: the reason']);
});
