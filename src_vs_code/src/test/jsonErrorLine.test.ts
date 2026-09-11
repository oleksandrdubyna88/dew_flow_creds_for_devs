import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsonErrorLine } from '../configFormat';

/**
 * Where a bad `appsettings.json` went wrong, read out of V8's own sentence.
 *
 * <p>`jsonErrorLine` parses the message `JSON.parse` throws, and that message is not a contract: the
 * function's own comment says "measured on Node 24". Two tests elsewhere assert a LINE NUMBER against
 * whatever engine happens to run the suite, and the 2026-09-09 audit watched both fail under Node 20
 * (finding #8).</p>
 *
 * <p>So the parser is pinned HERE, on the two message shapes quoted in its own comment, where no
 * engine is involved. What the engine-driven tests keep is the thing only they can check — that the
 * whole path produces the right answer when the engine offers one at all.</p>
 */

/** The shape that carries a position. Quoted from V8, not composed. */
const WITH_POSITION = "Expected ',' or '}' after property value in JSON at position 13 (line 4 column 1)";

/**
 * And the shape that carries a context snippet instead.
 *
 * <p>It spans the failure rather than pointing at it, so locating that snippet in the body would be
 * guesswork built on a format that is not a contract — which is why an absent line is the answer.</p>
 */
const WITHOUT_POSITION = 'Unexpected token \'o\', ..."b": oops is not valid JSON';

test('a message that names a line yields that line', () => {
  assert.equal(jsonErrorLine(WITH_POSITION), 4);
});

test('a message that names none yields none — an absent line is honest, a wrong one is not', () => {
  assert.equal(jsonErrorLine(WITHOUT_POSITION), undefined);
});

test('a line is read wherever in the sentence it appears, and only as a whole word', () => {
  assert.equal(jsonErrorLine('...(line 12 column 3)'), 12);
  assert.equal(jsonErrorLine('...(LINE 7 column 1)'), 7, 'the engine has changed its wording before now');
  assert.equal(jsonErrorLine('a multiline string with no position'), undefined, '"multiline" is not "line"');
});
