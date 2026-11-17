import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGED_DB_PROFILES, bridgedDbPair } from '../bridgedDbProfile';
import type { DbType } from '../types';

/**
 * E1.6 §S6.15 Z1 (parent §4.11, Q18): the gate. A bridged `query` is served only for a client and system whose profile was measured, and while E1.6
 * merges no pair is. A row is `served` in the commit that records the probe runs of its pair (E1.7): until then every bridged query is refused.
 */

const CLIENT_OF = { postgres: 'psql', mysql: 'mysql', mssql: 'sqlcmd' } as const;
const SYSTEMS = ['linux', 'win32', 'darwin'] as const;

test('DP1: the table has a row for each client on linux, win32 and darwin, and none is served', () => {
  for (const client of Object.values(CLIENT_OF)) {
    for (const platform of SYSTEMS) {
      const rows = BRIDGED_DB_PROFILES.filter((row) => row.client === client && row.platform === platform);
      assert.equal(rows.length, 1, `${client} on ${platform}: exactly one row`);
      assert.equal(rows[0].served, false, `${client} on ${platform}: not served`);
    }
  }
  assert.equal(BRIDGED_DB_PROFILES.length, 9, 'no row for anything else');
  assert.equal(BRIDGED_DB_PROFILES.some((row) => row.served), false);
});

test('DP1b: the production table answers "not served" for every type of the product on every platform it names', () => {
  for (const dbType of ['postgres', 'mysql', 'mssql'] as const) {
    for (const platform of SYSTEMS) {
      const answer = bridgedDbPair(BRIDGED_DB_PROFILES, dbType, platform);
      assert.equal(answer.served, false, `${dbType} on ${platform}`);
    }
  }
});

test('DP2: a platform with no row, and a type with no client, are not served, and the sentence is DR1', () => {
  const freebsd = bridgedDbPair(BRIDGED_DB_PROFILES, 'postgres', 'freebsd');
  assert.deepEqual(freebsd, { served: false, sentence: 'A Remote Bridge runs a database query only with a client and system whose behaviour was measured. psql on freebsd is not among them.' });
  const mongo = bridgedDbPair(BRIDGED_DB_PROFILES, 'mongodb', 'linux');
  assert.deepEqual(mongo, { served: false, sentence: 'A Remote Bridge runs a database query only with a client and system whose behaviour was measured. mongosh on Linux is not among them.' });
  const unknown = bridgedDbPair(BRIDGED_DB_PROFILES, 'oracle' as DbType, 'linux');
  assert.equal(unknown.served, false, 'a type the code does not know is not served');
});

test('DP2b: the three system words, and a table that serves a row serves exactly that pair', () => {
  const words = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' } as const;
  for (const platform of SYSTEMS) {
    const answer = bridgedDbPair([], 'mysql', platform);
    assert.equal(answer.served === false && answer.sentence.endsWith(`mysql on ${words[platform]} is not among them.`), true, platform);
  }
  const rows = [{ client: 'mysql', platform: 'linux', served: true }, { client: 'psql', platform: 'linux', served: false }] as const;
  assert.deepEqual(bridgedDbPair(rows, 'mysql', 'linux'), { served: true });
  assert.equal(bridgedDbPair(rows, 'mysql', 'win32').served, false, 'another platform');
  assert.equal(bridgedDbPair(rows, 'postgres', 'linux').served, false, 'a row that is not served');
  assert.equal(bridgedDbPair(rows, 'mssql', 'linux').served, false, 'a client with no row');
});
