import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGE_KEY_HEADER, BRIDGE_NOTE_DIR, BRIDGE_NOTE_FIELDS, BRIDGE_NOTE_SUFFIX, BridgeNote } from '../bridgeNote';

/**
 * The note a Remote Bridge publishes (E1.3 fixes its schema; the publisher is E2.2 and the reader E2.1).
 *
 * <p>Constants and a type, so what these show is that the two descriptions of the note, the field table and the
 * interface, cannot drift: the compile-time assertion in `bridgeNote.ts` catches a name added to one, and this
 * catches a KIND that differs, which a name list cannot see.</p>
 */

const SAMPLE: BridgeNote = {
  socket: '/tmp/creds-bridge-1.sock',
  port: 40123,
  brokerPort: 40100,
  key: 'k'.repeat(43),
  serverName: 'prod-server',
  openedAt: '2026-11-05T09:00:00.000Z',
};

test('the note schema is the six fields of the parent plan, and they are what the contract will carry', () => {
  assert.equal(BRIDGE_KEY_HEADER, 'X-Creds-Bridge');
  assert.equal(BRIDGE_NOTE_DIR, '.creds-for-devs/bridge');
  assert.equal(BRIDGE_NOTE_SUFFIX, '.json');
  assert.deepEqual(BRIDGE_NOTE_FIELDS, {
    socket: 'string',
    port: 'number',
    brokerPort: 'number',
    key: 'string',
    serverName: 'string',
    openedAt: 'string',
  });
});

test('a note built to the interface has exactly the declared fields, each of the declared kind', () => {
  assert.deepEqual(Object.keys(SAMPLE).sort(), Object.keys(BRIDGE_NOTE_FIELDS).sort());
  for (const [field, kind] of Object.entries(BRIDGE_NOTE_FIELDS)) {
    assert.equal(typeof SAMPLE[field as keyof BridgeNote], kind, field);
  }
});

test('the field table cannot be changed from outside the module', () => {
  assert.throws(() => {
    (BRIDGE_NOTE_FIELDS as Record<string, string>).extra = 'string';
  }, TypeError);
});

test('the note directory is relative: it is under the login user\'s home, never an absolute path', () => {
  assert.ok(!BRIDGE_NOTE_DIR.startsWith('/') && !BRIDGE_NOTE_DIR.includes('..'));
  assert.ok(BRIDGE_NOTE_SUFFIX.startsWith('.') && !BRIDGE_NOTE_SUFFIX.includes('/'));
});
