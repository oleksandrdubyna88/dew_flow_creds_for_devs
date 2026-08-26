import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigStub, configStub, loadWithVscode, settingsVscode } from './vscodeStub';
import { StoredAccount } from '../types';

/**
 * Where each account's vault and snapshots go (audit A3).
 *
 * <p>Two settings modules, deliberately shaped alike, deciding the one thing that must never
 * be wrong: which folder an account's secrets are written to. Getting it wrong does not throw
 * — it writes a vault where another account's should be, or silently stops syncing because a
 * per-account override was recorded under a key nothing reads back.</p>
 *
 * <p>Neither module had a test. The cases below are the ones a person actually hits: an email
 * typed with different capitalisation than the one stored, a setting left as spaces, and the
 * read-modify-write that has to find an existing key rather than add a second one for the same
 * person.</p>
 */

const WORK: StoredAccount = { accountId: 'a1', email: 'Work@Corp.com', provider: 'microsoft' };
const HOME: StoredAccount = { accountId: 'a2', email: 'me@gmail.com', provider: 'google' };

type Nas = typeof import('../nasPaths');
type Backup = typeof import('../backupPaths');

function nas(config: ConfigStub): Nas {
  return loadWithVscode<Nas>('../nasPaths', settingsVscode(config));
}

function backup(config: ConfigStub): Backup {
  return loadWithVscode<Backup>('../backupPaths', settingsVscode(config));
}

// ---- the sync location ------------------------------------------------------------------

test('a per-account folder wins over the global one', () => {
  const config = configStub({
    nasBackupPath: '/mnt/global',
    accountNasPaths: { 'work@corp.com': '/mnt/company' },
  });

  assert.equal(nas(config).nasPathFor(WORK), '/mnt/company');
  assert.equal(nas(config).nasPathFor(HOME), '/mnt/global', 'no mapping falls back');
});

test('the email is matched case-insensitively — the stored one and the typed one differ', () => {
  // WORK.email is "Work@Corp.com"; the setting was written lower-case. A case-sensitive
  // lookup here does not fail loudly: it silently uses the GLOBAL folder, so the account
  // quietly syncs to the wrong place.
  const config = configStub({
    nasBackupPath: '/mnt/global',
    accountNasPaths: { 'WORK@CORP.COM': '/mnt/company' },
  });

  assert.equal(nas(config).nasPathFor(WORK), '/mnt/company');
});

test('a blank or whitespace-only setting counts as unset, not as a folder named " "', () => {
  assert.equal(nas(configStub({ nasBackupPath: '   ' })).globalNasPath(), undefined);
  assert.equal(nas(configStub({})).globalNasPath(), undefined);
  assert.deepEqual(
    nas(configStub({ accountNasPaths: { 'a@b.c': '  ', 'd@e.f': ' /mnt/x ' } })).accountNasPaths(),
    { 'd@e.f': '/mnt/x' },
    'blank entries are dropped and real ones trimmed',
  );
});

test('every configured folder is listed once, however many accounts share it', () => {
  const config = configStub({
    nasBackupPath: '/mnt/shared',
    accountNasPaths: { 'a@b.c': '/mnt/shared', 'd@e.f': '/mnt/other' },
  });

  assert.deepEqual(nas(config).allNasPaths().sort(), ['/mnt/other', '/mnt/shared']);
});

test('setting an override finds the EXISTING key whatever its case, instead of adding a second', async () => {
  // Two entries for one person is the failure this guards: the reader lower-cases, so a
  // second differently-cased key is invisible — the person changes the folder and nothing
  // happens, because the entry that is read was never the entry that was written.
  const config = configStub({ accountNasPaths: { 'Work@Corp.com': '/mnt/old' } });

  await nas(config).setAccountNasPath('WORK@corp.com', '/mnt/new');

  assert.deepEqual(config.values.accountNasPaths, { 'Work@Corp.com': '/mnt/new' });
  assert.equal(config.updates.at(-1)?.target, 1, 'written to Global, not the workspace');
});

test('clearing an override removes the entry rather than storing an empty string', async () => {
  const config = configStub({ accountNasPaths: { 'work@corp.com': '/mnt/company' } });

  await nas(config).setAccountNasPath('work@corp.com', undefined);

  assert.deepEqual(config.values.accountNasPaths, {});
  assert.equal(nas(config).nasPathFor(WORK), undefined, 'and it falls back to the global again');
});

// ---- the snapshot location, which is deliberately NOT the sync location -------------------

test('snapshots read their OWN setting, so the two can never be the same by accident', () => {
  // Pointing both at one disk defeats the purpose: sync merges, so a deletion travels, and
  // the snapshot is the copy you restore from when the deletion was the mistake.
  const config = configStub({
    nasBackupPath: '/mnt/sync',
    backupLocation: '/mnt/snapshots',
  });

  assert.equal(nas(config).nasPathFor(HOME), '/mnt/sync');
  assert.equal(backup(config).backupPathFor(HOME), '/mnt/snapshots');
});

test('the snapshot folder has the same per-account and case rules as the sync folder', () => {
  const config = configStub({
    backupLocation: '/mnt/global-snap',
    accountBackupPaths: { 'WORK@CORP.COM': '/mnt/company-snap' },
  });

  assert.equal(backup(config).backupPathFor(WORK), '/mnt/company-snap');
  assert.equal(backup(config).backupPathFor(HOME), '/mnt/global-snap');
});

test('a per-account interval overrides the global one, and 0 is a real answer', () => {
  // 0 means "disable snapshots for this account". Treating it as unset — the easy mistake
  // with a falsy check — silently re-enables a schedule somebody deliberately turned off.
  const config = configStub({
    backupIntervalHours: 24,
    accountBackupIntervals: { 'work@corp.com': 0, 'me@gmail.com': 168 },
  });

  assert.equal(backup(config).backupIntervalHoursFor(WORK), 0);
  assert.equal(backup(config).backupIntervalHoursFor(HOME), 168);
});

test('a nonsense or negative interval falls back to the global default', () => {
  const config = configStub({
    backupIntervalHours: 24,
    accountBackupIntervals: { 'work@corp.com': -1, 'me@gmail.com': 'weekly' },
  });

  assert.equal(backup(config).backupIntervalHoursFor(WORK), 24, 'negative is not a schedule');
  assert.equal(backup(config).backupIntervalHoursFor(HOME), 24, 'a string from settings.json');
});

test('the defaults are the documented ones when nothing is configured', () => {
  const config = configStub({});

  assert.equal(backup(config).backupIntervalHours(), 24);
  assert.equal(backup(config).backupRetainDays(), 30);
  assert.equal(backup(config).backupPathFor(HOME), undefined, 'no location means no snapshots');
});
