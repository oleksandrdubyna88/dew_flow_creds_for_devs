import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keySentence, renderBackupPage } from '../backupPage';
import { BackupReader, BackupTab, BackupTabHost } from '../backupTab';
import { BackupStatus } from '../orgBackupClient';
import { StoredAccount } from '../types';

/**
 * The Server backup tab's state machine and the page it draws.
 *
 * <p>The properties worth pinning are the ones an administrator meets once and cannot undo: a key
 * shown while the page redraws underneath it, a mint button offered where the server would refuse,
 * and a failure that leaves the tab looking busy for ever.</p>
 */

const account: StoredAccount = { accountId: 'acct-1', email: 'anna@corp.com', provider: 'microsoft' };

function status(over: Partial<BackupStatus> = {}): BackupStatus {
  return {
    configured: true,
    keyState: 'Ready',
    scheduleHourUtc: 3,
    retentionDays: 30,
    lastRunAt: 1_757_260_800_000,
    lastResult: 'ok',
    lastError: '',
    running: false,
    localArchiveBytes: 4096,
    localArchiveName: 'cred-vault-20260907-030405Z.cvbk',
    targets: [],
    ...over,
  };
}

interface World {
  readonly tab: BackupTab;
  readonly drawn: string[];
  readonly order: string[];
  readonly host: BackupTabHost;
}

function world(client: Partial<BackupReader>, over: Partial<BackupTabHost> = {}): World {
  const drawn: string[] = [];
  const order: string[] = [];
  const reader: BackupReader = {
    readStatus: () => {
      order.push('read');
      return Promise.resolve(status());
    },
    saveSettings: () => Promise.resolve(),
    mintKey: () => Promise.resolve({ key: 'BK1-AAAAA', entropyBits: 150 }),
    runNow: () => Promise.resolve(),
    downloadArchive: () => Promise.reject(new Error('not used here')),
    ...client,
  };
  const host: BackupTabHost = {
    draw: (html) => drawn.push(html),
    showKey: () => {
      order.push('showKey');
      return Promise.resolve(true);
    },
    saveArchive: () => Promise.resolve(),
    ...over,
  };
  return { tab: new BackupTab(reader, account, host), drawn, order, host };
}

test('the tab draws the status it read', async () => {
  const w = world({});

  await w.tab.start();

  assert.ok(w.drawn.at(-1)?.includes('cred-vault-20260907-030405Z.cvbk'));
  assert.ok(w.drawn.at(-1)?.includes('Server backup'));
});

test('the key is SHOWN before the status is read back, never after', async () => {
  // The one ordering in this feature that cannot be got wrong twice: a status refresh redrawing the
  // page while somebody is copying words they will never see again is how a key is lost.
  const w = world({});

  await w.tab.handle({ type: 'mint' });

  assert.deepEqual(w.order, ['showKey', 'read']);
});

test('words the person DISCARDED are not reported as a key in place', async () => {
  // Delivering the mint response is what acknowledges the key on the server, so by the time this
  // dialog closes the key is Ready whatever was pressed. A person who discards the words therefore
  // has a deployment that will seal every future archive under something nobody has — and telling
  // them "the backup key is in place" would be true and useless. The screen has to say the state
  // they are in and the only way out of it, which is on the host rather than here.
  const w = world({}, { showKey: () => Promise.resolve(false) });

  await w.tab.handle({ type: 'mint' });

  const last = w.drawn.at(-1) ?? '';
  // The status line still reads "A backup key is in place" — that is TRUE, the server accepted it.
  // What must not appear is the mint's own success sentence, and what must appear is the state.
  assert.ok(!last.includes('will not be shown again'), 'the success notice is not drawn');
  assert.match(last, /discarded/);
  assert.match(last, /key\.sealed/, 'and it names the file that starts the deployment again');
});

test('and the discard survives a status read that fails right after it', async () => {
  // The ordering that keeps the message. A refresh failing after the dialog closed would otherwise
  // replace "you discarded the words" with "the server is unreachable" — true, secondary, and not
  // what the person has to be told. The status being stale until the next refresh is the smaller
  // cost by a distance.
  const w = world(
    { readStatus: () => Promise.reject(new Error('Vault server unreachable')) },
    { showKey: () => Promise.resolve(false) },
  );

  await w.tab.handle({ type: 'mint' });

  const last = w.drawn.at(-1) ?? '';
  assert.match(last, /discarded/, 'the discard is what reaches the screen');
  assert.ok(!last.includes('unreachable'), 'and not the secondary failure');
});

test('a mint the server refuses leaves the words unshown and says why', async () => {
  const w = world({ mintKey: () => Promise.reject(new Error('a backup key already exists.')) });

  await w.tab.handle({ type: 'mint' });

  assert.deepEqual(w.order, [], 'nothing was shown and nothing was re-read');
  assert.ok(w.drawn.at(-1)?.includes('a backup key already exists'));
});

test('a failure ends the busy state — the tab never spins for ever', async () => {
  const w = world({ runNow: () => Promise.reject(new Error('a backup is already running.')) });

  await w.tab.handle({ type: 'run' });

  const last = w.drawn.at(-1) ?? '';
  assert.ok(last.includes('already running'), 'the reason is on the page');
  assert.ok(!last.includes('id="run" class="primary" disabled'), 'and the buttons are live again');
});

test('an hour out of range is refused without a request', async () => {
  let sent = 0;
  const w = world({ saveSettings: () => { sent += 1; return Promise.resolve(); } });

  await w.tab.handle({ type: 'save', scheduleHourUtc: 24, retentionDays: 30 });

  assert.equal(sent, 0);
  assert.ok(w.drawn.at(-1)?.includes('0 to 23'));
});

test('saving the schedule does NOT send targets, so destinations survive the edit', async () => {
  let seen: unknown;
  const w = world({ saveSettings: (_a, settings) => { seen = settings; return Promise.resolve(); } });

  await w.tab.handle({ type: 'save', scheduleHourUtc: 4, retentionDays: 14 });

  assert.equal('targets' in (seen as object), false, 'omitted means unchanged');
});

test('a second click while one action is out is ignored rather than raced', async () => {
  let starts = 0;
  let release = (): void => {};
  const w = world({
    runNow: () => {
      starts += 1;
      return new Promise<void>((resolve) => { release = resolve; });
    },
  });

  const first = w.tab.handle({ type: 'run' });
  await w.tab.handle({ type: 'run' });
  release();
  await first;

  assert.equal(starts, 1, 'a run is not started twice by an impatient double click');
});

test('the mint button is offered only where the server would accept it', () => {
  const offered = (state: BackupStatus): boolean =>
    !renderBackupPage({ status: state, busy: false, account: 'anna@corp.com' })
      .includes('id="mint" disabled');

  assert.equal(offered(status({ keyState: 'Absent' })), true, 'nothing to lose');
  assert.equal(
    offered(status({ keyState: 'AwaitingAcknowledgement' })), true,
    'the unused key may be replaced, and that is the safe retry after a lost response',
  );
  assert.equal(
    offered(status({ keyState: 'Ready' })), false,
    'the server refuses this, and a button that answers "already minted" teaches nothing',
  );
  assert.equal(offered(status({ configured: false })), false, 'this server cannot seal anything');
});

test('the page escapes what a server said, so an error cannot become markup', () => {
  const html = renderBackupPage({
    status: status(),
    busy: false,
    error: '<img src=x onerror=alert(1)>',
    account: 'anna@corp.com',
  });

  assert.ok(!html.includes('<img src=x'), 'escaped');
  assert.ok(html.includes('&lt;img'));
});

test('each key state says what it means AND what to do about it', () => {
  assert.match(keySentence(status({ keyState: 'Absent' })), /shown exactly once|exactly\s+once/);
  assert.match(keySentence(status({ keyState: 'AwaitingAcknowledgement' })), /Mint again/);
  assert.match(keySentence(status({ keyState: 'Unreadable' })), /deployment key changed/);
  assert.match(keySentence(status({ configured: false })), /Vault:LoginKey:Kek/);
});

test('a target that arrived where retention could not run is drawn with BOTH facts', () => {
  const html = renderBackupPage({
    status: status({
      targets: [{
        kind: 's3',
        where: 's3 vaults/backups',
        result: 'succeeded',
        error: '',
        retention: 'retention could not run: it answered 403 Forbidden.',
        at: 1_757_260_800_000,
      }],
    }),
    busy: false,
    account: 'anna@corp.com',
  });

  assert.ok(html.includes('succeeded'), 'the upload did arrive');
  assert.ok(html.includes('retention could not run'), 'and the destination is now unbounded');
});

test('no destination at all says what that costs, rather than showing an empty table', () => {
  const html = renderBackupPage({ status: status(), busy: false, account: 'anna@corp.com' });

  assert.match(html, /not a backup/);
});
