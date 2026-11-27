import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessFamily, ledgerOf, tapped } from '../../scripts/lib/dbAssert.cjs';
import { type RecordedRun, factsOf, legRoad } from '../../scripts/lib/containerLegs.cjs';

/**
 * The container legs' own checks (change 11.1, S3 part 2): what the isolation script prints is read as names and counts, and the road's two promises (no password on an argument, no env file left)
 * are judged from what the recorder saw. Each check is shown to fail on the case it exists for, so a green CI run of the harness means something.
 */

const NAME = 'container-odbc-sqlcmd';
const SECRET = 'not-a-real-password-7f3a';
const RUN: RecordedRun = { argv: ['run', '--rm', '--env-file', '/s/db-env/a.env', 'img', '/opt/mssql-tools18/bin/sqlcmd', '-S', '192.0.2.10,1433', '-Q', 'select 1'], query: true, mode: '600', values: [SECRET] };

/** The lines `legRoad` prints for these runs. */
async function roadLines(runs: RecordedRun[], left: number[]): Promise<string[]> {
  const { lines } = await tapped(async () => legRoad(NAME, runs, left));
  return lines;
}

const statusOf = (lines: string[], id: string): string => {
  const head = `PRODUCTION sqlcmd odbc-sqlcmd 18.7.0001.1 "Linux" container driver 18.7.1.1  (${NAME}: img)`;
  return assessFamily('sqlcmd', ledgerOf([head, ...lines])).clients[0].results.find((one: { id: string }) => one.id === id)?.status ?? 'none';
};

test('CI-argv: CLEAN when no argument holds the env file\'s password; a password on the client\'s arguments FAILS; no password read is not shown', async () => {
  assert.equal(statusOf(await roadLines([RUN, RUN], [0, 0]), 'CI-argv'), 'pass');
  assert.equal(statusOf(await roadLines([RUN, { ...RUN, argv: [...RUN.argv, '-P', SECRET] }], [0, 0]), 'CI-argv'), 'FAIL', 'a password on the command line');
  assert.equal(statusOf(await roadLines([{ ...RUN, argv: ['run', `--env=SQLCMDPASSWORD=${SECRET}`] }], [0]), 'CI-argv'), 'FAIL', 'inside a longer argument');
  assert.equal(statusOf(await roadLines([{ ...RUN, values: [] }], [0]), 'CI-argv'), 'not shown', 'no password read from the file');
  assert.equal(statusOf(await roadLines([], []), 'CI-argv'), 'not shown', 'no run');
});

test('CI-envfile: REMOVED when the file was owner-only during every run and none was left; a file left, or one readable by others, FAILS', async () => {
  assert.equal(statusOf(await roadLines([RUN, RUN], [0, 0]), 'CI-envfile'), 'pass');
  assert.equal(statusOf(await roadLines([RUN, RUN], [0, 1]), 'CI-envfile'), 'FAIL', 'a file left after a run');
  assert.equal(statusOf(await roadLines([{ ...RUN, mode: '644' }], [0]), 'CI-envfile'), 'FAIL', 'readable by others');
  assert.equal(statusOf(await roadLines([{ ...RUN, mode: undefined }], [0]), 'CI-envfile'), 'FAIL', 'no file while the tool ran');
});

test('the isolation script\'s answer is read as names and counts; an answer with no tickets line is not "no tickets"', () => {
  const facts = factsOf('uid 65534 gid 65534\ncaps 0000000000000000\nnames HOME HOSTNAME PATH SQLCMDPASSWORD SQLCMDUSER \ntickets 0\nmounts \n');
  assert.deepEqual(facts, { uid: '65534 gid 65534', caps: '0000000000000000', names: ['HOME', 'HOSTNAME', 'PATH', 'SQLCMDPASSWORD', 'SQLCMDUSER'], tickets: 0, mounts: [] });
  assert.equal(Number.isNaN(factsOf('uid 0 gid 0\n').tickets), true);
  assert.deepEqual(factsOf('mounts /home/runner /mnt \n').mounts, ['/home/runner', '/mnt']);
});
