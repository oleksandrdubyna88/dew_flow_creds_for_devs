import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CLIENT_CONTRACT_VERSION, CONTRACT_HEADER } from '../contractVersion';
import { BackupStatus, OrgBackupClient, settingsProblem } from '../orgBackupClient';
import { StoredAccount } from '../types';

/**
 * The backup client against a stubbed `fetch`: what it sends, and what it concludes from each
 * answer.
 *
 * <p>The properties worth pinning here are the ones an administrator finds out about at the worst
 * moment — a settings save that quietly dropped their destinations, a status shape this build cannot
 * read passed on as undefined fields, and a 400 MB archive pulled into memory.</p>
 */

const account: StoredAccount = { accountId: 'acct-1', email: 'anna@corp.com', provider: 'microsoft' };

const STATUS: BackupStatus = {
  configured: true,
  keyState: 'Ready',
  scheduleHourUtc: 3,
  retentionDays: 30,
  lastRunAt: 1_725_400_000_000,
  lastResult: 'ok',
  lastError: '',
  running: false,
  localArchiveBytes: 4096,
  localArchiveName: 'cred-vault-20260907-030405Z.cvbk',
  targets: [],
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}): Seen[] {
  const seen: Seen[] = [];
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  globalThis.fetch = ((input: unknown, init: RequestInit = {}) => {
    seen.push(sent(input, init));
    // A 204 is what a successful save answers, and the Response constructor refuses a body with one
    // — which is a fact about the real thing, so the stub honours it rather than working around it.
    return Promise.resolve(new Response(status === 204 ? null : text, { status, headers }));
  }) as typeof fetch;
  return seen;
}

/** One request as the stub saw it. Out of the arrow so the arrow decides one thing. */
function sent(input: unknown, init: RequestInit): Seen {
  return {
    url: String(input),
    method: init.method ?? 'GET',
    headers: new Headers(init.headers),
    body: typeof init.body === 'string' ? init.body : undefined,
  };
}

function client(): OrgBackupClient {
  return new OrgBackupClient('https://vault.corp.com/', async () => 'token', 5_000);
}

test('the status request carries the bearer and the contract, on the admin route', async () => {
  const seen = respondWith(200, STATUS);

  const status = await client().readStatus(account);

  assert.equal(status.keyState, 'Ready');
  assert.equal(seen[0].url, 'https://vault.corp.com/api/org/backup/status');
  assert.equal(seen[0].headers.get('Authorization'), 'Bearer token');
  assert.equal(seen[0].headers.get(CONTRACT_HEADER), String(CLIENT_CONTRACT_VERSION));
});

test('a server with no such route reads as no backup here, not as a failure', async () => {
  // A readiness cycle against an older server must not report an error about a feature that server
  // does not have — the same reading readEvents makes for the event log.
  respondWith(404, '');

  const status = await client().readStatus(account);

  assert.equal(status.configured, false);
  assert.equal(status.lastResult, 'no backup here');
});

test('a status shape this build cannot read becomes a sentence, never undefined fields', async () => {
  respondWith(200, { keyState: 'Ready' });

  await assert.rejects(
    () => client().readStatus(account),
    /shape this build cannot read/,
  );
});

test('a refusal comes back as the SERVER own sentence, so an admin learns why', async () => {
  respondWith(409, { error: 'a backup is already running.' });

  await assert.rejects(() => client().runNow(account), /already running/);
});

test('a settings save that names no targets sends no targets member at all', async () => {
  // The distinction the server draws and the one a client is most likely to erase: omitted means
  // unchanged, an empty array means remove them all. A client that defaulted the field to [] would
  // wipe every configured destination each time somebody edited the schedule.
  const seen = respondWith(204, '');

  await client().saveSettings(account, { scheduleHourUtc: 4, retentionDays: 14 });

  const sent = JSON.parse(seen[0].body ?? '{}') as Record<string, unknown>;
  assert.equal('targets' in sent, false, 'omitted, not null and not an empty array');
  assert.equal(seen[0].method, 'PUT');
});

test('an empty targets array IS sent, because removing them all is a different request', async () => {
  const seen = respondWith(204, '');

  await client().saveSettings(account, { scheduleHourUtc: 4, retentionDays: 14, targets: [] });

  const sent = JSON.parse(seen[0].body ?? '{}') as { targets?: unknown };
  assert.deepEqual(sent.targets, []);
});

test('an hour or a window out of range is refused BEFORE a request is made', async () => {
  // The save also probes every destination over the network, so a typo would otherwise cost a round
  // trip and up to a twenty-second wait to be told what this knows already.
  const seen = respondWith(204, '');

  await assert.rejects(
    () => client().saveSettings(account, { scheduleHourUtc: 24, retentionDays: 30 }),
    /0 to 23/,
  );
  await assert.rejects(
    () => client().saveSettings(account, { scheduleHourUtc: 3, retentionDays: 0 }),
    /at least one day/,
  );
  assert.equal(seen.length, 0, 'nothing reached the network');
});

test('the bounds are the SERVER own, and a valid pair passes', () => {
  assert.equal(settingsProblem({ scheduleHourUtc: 0, retentionDays: 1 }), '');
  assert.equal(settingsProblem({ scheduleHourUtc: 23, retentionDays: 365 }), '');
  assert.match(settingsProblem({ scheduleHourUtc: 3.5, retentionDays: 30 }), /whole number/);
});

test('the minted key comes back with its words and its entropy, once', async () => {
  const seen = respondWith(200, { key: 'BK1-ABCDE-FGHJK-MNPQR-STVWX-YZ123-45678-9ABC', entropyBits: 150 });

  const minted = await client().mintKey(account);

  assert.match(minted.key, /^BK1-/);
  assert.equal(minted.entropyBits, 150);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].url, 'https://vault.corp.com/api/org/backup/key');
});

test('a mint answered in a shape this build cannot read is a sentence, not an empty key', async () => {
  // The worst possible silent failure in this feature: a dialog showing an empty string, dismissed,
  // and a deployment whose archives nobody can open.
  respondWith(200, { entropyBits: 150 });

  await assert.rejects(() => client().mintKey(account), /shape this build cannot read/);
});

test('the download hands back the STREAM, its length and its name — never a buffer', async () => {
  const seen = respondWith(200, 'archive-bytes', {
    'content-length': '13',
    'content-disposition': 'attachment; filename="cred-vault-20260907-030405Z.cvbk"',
  });

  const download = await client().downloadArchive(account);

  assert.ok(download.body instanceof ReadableStream, 'a stream, so 400 MB never lands in memory');
  assert.equal(download.bytes, 13);
  assert.equal(download.name, 'cred-vault-20260907-030405Z.cvbk');
  assert.equal(seen[0].url, 'https://vault.corp.com/api/org/backup/archive');
});

test('a download of an archive that does not exist yet carries the server sentence', async () => {
  respondWith(404, { error: 'there is no archive on this server yet.' });

  await assert.rejects(() => client().downloadArchive(account), /no archive on this server yet/);
});

const HOSTILE_NAMES: readonly [string, string][] = [
  ['/home/dev/.ssh/config', 'an absolute POSIX path'],
  ['C:\\Users\\dev\\.ssh\\config', 'an absolute Windows path'],
  ['../../../.bashrc', 'traversal'],
  ['sub/dir/thing.cvbk', 'a separator of any kind'],
  ['..', 'the parent itself'],
  ['', 'nothing at all'],
];

test('a filename the SERVER chose can never be a path', async () => {
  // The Save dialog opens at `defaultUri`, so a compromised or hostile server answering
  // `Content-Disposition: attachment; filename="/home/dev/.ssh/config"` would put the administrator
  // one Enter away from overwriting their own ssh config with archive bytes. Only a basename is
  // taken, and anything that is not one falls back to the neutral name.
  for (const [hostile, why] of HOSTILE_NAMES) {
    respondWith(200, 'bytes', {
      'content-disposition': `attachment; filename="${hostile}"`,
    });

    const download = await client().downloadArchive(account);

    assert.equal(download.name, 'cred-vault-backup.cvbk', `${why} is refused: ${hostile}`);
  }
});

test('an ordinary filename still comes through untouched', () => {
  // So the test above cannot pass by refusing everything.
  respondWith(200, 'bytes', {
    'content-disposition': 'attachment; filename="cred-vault-20260907-030405Z.cvbk"',
  });

  return client().downloadArchive(account).then((download) => {
    assert.equal(download.name, 'cred-vault-20260907-030405Z.cvbk');
  });
});

test('a status missing a field the PAGE reads is refused, not passed on', async () => {
  // The guard used to check five fields and that `targets` was an array. Everything else — the
  // archive name the page measures, the error the notice reads, each target's own strings — reached
  // the renderer unchecked, so a truncated or older answer became a broken tab rather than the
  // sentence this client exists to produce.
  const missing: Record<string, unknown> = { ...STATUS };
  delete missing.localArchiveName;
  respondWith(200, missing);

  await assert.rejects(() => client().readStatus(account), /shape this build cannot read/);
});

test('a status whose TARGET rows are malformed is refused too', async () => {
  respondWith(200, { ...STATUS, targets: [null] });

  await assert.rejects(() => client().readStatus(account), /shape this build cannot read/);
});

test('a status with a well-formed target row is accepted', async () => {
  respondWith(200, {
    ...STATUS,
    targets: [{
      kind: 's3', where: 's3 vaults/backups', result: 'succeeded', error: '', retention: '', at: 1,
    }],
  });

  const status = await client().readStatus(account);

  assert.equal(status.targets.length, 1);
  assert.equal(status.targets[0].where, 's3 vaults/backups');
});
