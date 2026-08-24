import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyncFacts, syncReadiness } from '../syncReadiness';

/**
 * One answer, two surfaces: the colour of the account icon and the report shown when
 * Sync is pressed. They must never disagree, which is why neither computes it itself.
 */

const nothing: SyncFacts = {
  hasLocation: false,
  hasStoredPin: false,
  hasSecurityKey: false,
  isLocked: false,
};

test('a fully set up account is ready', () => {
  const r = syncReadiness({ ...nothing, hasLocation: true, hasStoredPin: true });

  assert.equal(r.state, 'ready');
  assert.equal(r.ready, true);
});

test('no sync location is the first thing to say, because nothing else matters yet', () => {
  const r = syncReadiness({ ...nothing, hasStoredPin: true });

  assert.equal(r.state, 'notConfigured');
  assert.match(r.reason, /No sync location/);
  assert.equal(r.fixCommand, 'credSshManager.setAccountNasPath');
});

test('a location with no way in names the PIN as the fix', () => {
  const r = syncReadiness({ ...nothing, hasLocation: true });

  assert.equal(r.state, 'notConfigured');
  assert.equal(r.ready, false);
  assert.equal(r.fixCommand, 'credSshManager.setSyncPin');
});

test('a security key without a PIN is NOT called ready', () => {
  // A timer cannot touch a security key. Painting this green would make the colour
  // mean "you configured something" rather than "this will sync".
  const r = syncReadiness({ ...nothing, hasLocation: true, hasSecurityKey: true });

  assert.equal(r.state, 'needsPerson');
  assert.equal(r.ready, false);
  assert.match(r.reason, /ask for a touch/);
});

test('a stored PIN wins over a security key, because it is what runs unattended', () => {
  const r = syncReadiness({
    hasLocation: true,
    hasStoredPin: true,
    hasSecurityKey: true,
    isLocked: false,
  });

  assert.equal(r.state, 'ready');
});

test('locked is reported before any "you are missing something" verdict', () => {
  // Telling somebody to set a PIN they already set, seconds after they pressed Lock,
  // is how a status line stops being believed.
  const r = syncReadiness({
    hasLocation: true,
    hasStoredPin: true,
    hasSecurityKey: true,
    isLocked: true,
  });

  assert.equal(r.state, 'locked');
  assert.equal(r.ready, false);
  assert.match(r.reason, /Locked/);
});

test('locked outranks even a completely unconfigured account', () => {
  const r = syncReadiness({ ...nothing, isLocked: true });

  assert.equal(r.state, 'locked');
});

test('every not-ready state offers a way to fix it', () => {
  const cases: SyncFacts[] = [
    { ...nothing },
    { ...nothing, hasLocation: true },
    { ...nothing, hasLocation: true, hasSecurityKey: true },
    { ...nothing, isLocked: true },
  ];

  for (const facts of cases) {
    const r = syncReadiness(facts);
    assert.equal(r.ready, false);
    assert.ok(r.fixCommand, `no fix offered for ${JSON.stringify(facts)}`);
    assert.ok(r.fixLabel, `no fix label for ${JSON.stringify(facts)}`);
  }
});

test('the ready state offers no fix, because there is nothing to fix', () => {
  const r = syncReadiness({ ...nothing, hasLocation: true, hasStoredPin: true });

  assert.equal(r.fixCommand, undefined);
});
