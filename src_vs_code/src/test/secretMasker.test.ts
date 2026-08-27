import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_MASK_TABLE,
  MIN_MASKABLE_LENGTH,
  buildMaskTable,
  maskResponseBody,
  maskText,
  placeholderFor,
} from '../secretMasker';

/**
 * The masker's whole value is that it is exact. These tests pin both halves: it must catch
 * the value in every form output can carry it, and it must not touch anything else — a
 * false positive corrupts a diff or a JSON payload the agent then acts on, which is worse
 * than the leak, because it is silent and wrong rather than absent.
 */

const PASSWORD = 'Tr0ub4dor&3-horse-battery';
const table = buildMaskTable([{ value: PASSWORD, label: 'DB_PASSWORD' }]);

test('an exact secret in output is replaced by a labelled placeholder', () => {
  const result = maskText(`PGPASSWORD=${PASSWORD}\nconnected`, table);

  assert.equal(result.text.includes(PASSWORD), false);
  assert.equal(result.text.includes(placeholderFor('DB_PASSWORD')), true);
  assert.equal(result.hits, 1);
});

test('every occurrence goes, not just the first', () => {
  const result = maskText(`${PASSWORD} ... ${PASSWORD}`, table);

  assert.equal(result.hits, 2);
  assert.equal(result.text.includes(PASSWORD), false);
});

test('the secret is caught inside a URL and inside base64', () => {
  // A connection string percent-encodes it; a dumped .env or an echoed auth header base64s it.
  const encoded = encodeURIComponent(PASSWORD);
  const b64 = Buffer.from(PASSWORD, 'utf8').toString('base64');

  assert.equal(maskText(`postgres://u:${encoded}@h/db`, table).hits, 1);
  assert.equal(maskText(`Authorization: Basic ${b64}`, table).hits, 1);
});

test('a private key is caught by its body, not only as a whole blob', () => {
  // What is stored and what a tool prints differ in line endings often enough that matching
  // the whole PEM is unreliable; the base64 body is the part that survives reformatting.
  const key = [
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gt',
    'ZWQyNTUxOQAAACBoZXJlLWlzLXNvbWUta2V5LW1hdGVyaWFsLWZvci10ZXN0aW5n',
    '-----END OPENSSH PRIVATE KEY-----',
  ].join('\n');
  const keyTable = buildMaskTable([{ value: key, label: 'SSH_KEY' }]);

  const printed = key.replace(/\n/g, '\r\n');
  const result = maskText(printed, keyTable);

  assert.ok(result.hits >= 2, `body lines masked: ${result.hits}`);
  assert.equal(result.text.includes('ZWQyNTUxOQ'), false, 'no key body survives');
});

test('a short secret is never masked — it would shred the text instead', () => {
  const short = '1234';
  assert.ok(short.length < MIN_MASKABLE_LENGTH);
  const shortTable = buildMaskTable([{ value: short, label: 'PIN' }]);

  const line = 'line 1234 of 1234567, exit 0';
  assert.equal(maskText(line, shortTable).text, line);
  assert.equal(shortTable.entries.length, 0);
});

test('ordinary output passes through byte for byte', () => {
  // The control case. If this ever fails, the masker is guessing.
  const output = [
    'diff --git a/src/app.ts b/src/app.ts',
    '+  const hash = "a3f5c9d2e1b8447a91fe0c6d5b2a8e7f";',
    '{"status":"ok","count":42,"token_type":"bearer"}',
    'Tr0ub4dor',
  ].join('\n');

  const result = maskText(output, table);
  assert.equal(result.text, output);
  assert.equal(result.hits, 0);
});

test('an empty table and empty text are both no-ops', () => {
  assert.equal(maskText('anything', EMPTY_MASK_TABLE).hits, 0);
  assert.equal(maskText('', table).hits, 0);
});

test('a longer secret is masked before a shorter one contained in it', () => {
  // Otherwise the short needle cuts the long value in half and leaves a fragment behind.
  const long = 'super-secret-prefix-and-suffix';
  const short = 'secret-prefix';
  const both = buildMaskTable([
    { value: short, label: 'SHORT' },
    { value: long, label: 'LONG' },
  ]);

  const result = maskText(`value=${long}`, both);
  assert.equal(result.text, `value=${placeholderFor('LONG')}`);
  assert.equal(result.text.includes('and-suffix'), false);
});

test('the response body is masked on stdout and stderr, and nothing else changes', () => {
  const body = {
    exitCode: 0,
    stdout: `PGPASSWORD=${PASSWORD}`,
    stderr: `warning: ${PASSWORD} in env`,
    stdoutTruncated: false,
    timedOut: false,
    durationMs: 12,
  };

  const { body: masked, hits } = maskResponseBody(body, table) as {
    body: typeof body;
    hits: number;
  };

  assert.equal(hits, 2);
  assert.equal(masked.stdout.includes(PASSWORD), false);
  assert.equal(masked.stderr.includes(PASSWORD), false);
  assert.equal(masked.exitCode, 0, 'non-text fields are carried unchanged');
  assert.equal(masked.durationMs, 12);
  assert.equal(masked.timedOut, false);
});

test('a body with no secret is returned as the very same object', () => {
  // Identity, not a copy: nothing downstream should see a rebuilt object when nothing was
  // masked, and it makes "did anything happen" cheap to assert.
  const body = { exitCode: 0, stdout: 'fine', stderr: '' };
  const result = maskResponseBody(body, table);

  assert.equal(result.body, body);
  assert.equal(result.hits, 0);
});

test('a body that is not an object survives untouched', () => {
  assert.equal(maskResponseBody(undefined, table).body, undefined);
  assert.equal(maskResponseBody('text', table).body, 'text');
});

/**
 * The field-name trap, found in a security pass on 2026-08-27.
 *
 * <p>This masked exactly two fields — `stdout` and `stderr` — on the reasoning that nothing else
 * in a response is text an agent reads. That was true of every shape that existed when it was
 * written, and it stopped being true the moment `rotate` answered with the far side's output in a
 * field it called `output`. A statement composed to echo its own argument then returned the
 * freshly generated secret to the agent in plaintext: the one hole the rotation's design claims
 * the masker closes.</p>
 *
 * <p>The fix is not a longer list. A list is a thing to forget, and this one was forgotten by the
 * person who wrote both halves in the same week. Every string field is masked now, which fails in
 * the safe direction: the worst case is a non-secret field whose value happens to BE a secret,
 * and that field wanted masking anyway.</p>
 */
test('a response field this masker has never heard of is masked too', () => {
  const table = buildMaskTable([{ value: 'GENERATED-9f2c41ab', label: 'DB_PASSWORD' }]);

  const { body, hits } = maskResponseBody(
    { rotated: true, entity: 'orders-db', output: "ALTER USER app IDENTIFIED BY 'GENERATED-9f2c41ab'" },
    table,
  );

  assert.equal(hits, 1);
  assert.equal(JSON.stringify(body).includes('GENERATED-9f2c41ab'), false);
  assert.match(String((body as { output: string }).output), /CREDS_MASKED/);
});

test('non-string fields are carried through untouched, whatever they are', () => {
  // Widening to every field must not start stringifying numbers, booleans or arrays.
  const table = buildMaskTable([{ value: 'hunter2-secret', label: 'PASSWORD' }]);

  const { body } = maskResponseBody(
    { exitCode: 0, timedOut: false, written: ['A', 'B'], nested: { deep: 'hunter2-secret' } },
    table,
  );

  const out = body as Record<string, unknown>;
  assert.equal(out.exitCode, 0);
  assert.equal(out.timedOut, false);
  assert.deepEqual(out.written, ['A', 'B']);
  // Not recursed into, and that is stated rather than assumed: no response shape nests text.
  assert.deepEqual(out.nested, { deep: 'hunter2-secret' });
});
