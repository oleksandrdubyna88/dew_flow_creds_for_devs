import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBackupPageMessage, keySentence, renderBackupPage, successSentence } from '../backupPage';
import { BackupReader, BackupTab, BackupTabHost } from '../backupTab';
import { BackupSettingsInput, BackupStatus, BackupTargetInput, BackupTargetSummary } from '../orgBackupClient';
import { StoredAccount } from '../types';

/**
 * The Server backup tab's state machine and the page it draws.
 *
 * <p>The properties worth pinning are the ones an administrator meets once and cannot undo: a key
 * shown while the page redraws underneath it, a mint button offered where the server would refuse,
 * a failure that leaves the tab looking busy for ever — and, since #134, a credential typed into the
 * destination form that must never be drawn back, and a save against an older server that would
 * silently erase the destinations this build cannot see.</p>
 */

const account: StoredAccount = { accountId: 'acct-1', email: 'anna@corp.com', provider: 'microsoft' };

const NIGHTLY: BackupTargetSummary = {
  kind: 's3',
  endpoint: 'https://s3.example.com',
  region: 'eu-central-1',
  bucket: 'vaults',
  prefix: 'nightly',
  credentials: 'sealed',
};

const OLD_AZURE: BackupTargetSummary = {
  kind: 'azure-blob',
  endpoint: 'https://acct.blob.core.windows.net',
  region: '',
  bucket: 'vaults',
  prefix: 'old',
  credentials: 'unopenable',
};

/** The four strings a test can watch for — none of them may ever reach the page. */
const SECRETS = ['AKIDTYPED', 'typed-secret-value', 'typed-account', 'typed-account-key'];

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
  /** Every settings document the tab sent, in order. */
  readonly saved: BackupSettingsInput[];
  /** Every status handed to the tree's seam. */
  readonly recorded: BackupStatus[];
}

function world(client: Partial<BackupReader>, over: Partial<BackupTabHost> = {}): World {
  const drawn: string[] = [];
  const order: string[] = [];
  const saved: BackupSettingsInput[] = [];
  const recorded: BackupStatus[] = [];
  const reader: BackupReader = {
    readStatus: () => {
      order.push('read');
      return Promise.resolve(status());
    },
    readTargets: () => {
      order.push('readTargets');
      return Promise.resolve([NIGHTLY, OLD_AZURE]);
    },
    saveSettings: (_a, settings) => {
      saved.push(settings);
      return Promise.resolve();
    },
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
    confirmRemove: () => Promise.resolve(true),
    record: (read) => recorded.push(read),
    ...over,
  };
  return { tab: new BackupTab(reader, account, host), drawn, order, host, saved, recorded };
}

/** A tab that has read its status and its destinations, so a form action has something to act on. */
async function started(client: Partial<BackupReader> = {}, over: Partial<BackupTabHost> = {}): Promise<World> {
  const w = world(client, over);
  await w.tab.start();
  return w;
}

/** The destinations of the last save the tab sent — asserted present, so a test reads a list. */
function sentTargets(w: World): readonly BackupTargetInput[] {
  const sent = w.saved.at(-1);
  assert.ok(sent !== undefined && sent.targets !== undefined, 'a destinations save carries the list');
  return sent.targets;
}

const last = (w: World): string => w.drawn.at(-1) ?? '';

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
  const html = renderBackupPage({ status: status(), targets: [], busy: false, account: 'anna@corp.com' });

  assert.match(html, /not a backup/);
});

// --- the destinations (#134) -----------------------------------------------------------------

test('the tab draws the destinations it read, each with its own credentials word, and offers Add', async () => {
  const w = await started();

  const html = last(w);
  assert.match(html, /s3 vaults\/nightly/);
  assert.match(html, /azure vaults\/old/);
  assert.match(html, /cannot be opened by this server — re-enter them/, 'per row, not all-or-nothing');
  assert.match(html, /id="addTarget"/);
  assert.match(html, /data-edit="1"/);
  assert.match(html, /data-remove="0"/);
});

test('against a server older than destination editing the form is NOT offered, and the page says which side is older', async () => {
  // PUT /settings replaces the whole list. Without the list, a save would silently erase the
  // destinations this build cannot see — so a 404 on the route means no Add, no Edit, no Remove.
  const w = await started({ readTargets: () => Promise.resolve(undefined) });

  const html = last(w);
  assert.match(html, /older than destination editing/);
  assert.match(html, /schedule above can still be saved/);
  assert.doesNotMatch(html, /id="addTarget"/);
  assert.doesNotMatch(html, /data-edit=/);
});

test('a destination that no run has reported on yet is not called "not configured"', () => {
  // The old sentence said "No destination is configured" whenever the last run's per-target list
  // was empty — which it is from the moment a destination is saved until the first run.
  const configured = renderBackupPage({
    status: status({ configuredTargetKinds: ['s3'], targets: [] }),
    targets: [NIGHTLY],
    busy: false,
    account: 'anna@corp.com',
  });
  assert.match(configured, /No run has reported on these destinations yet/);

  const none = renderBackupPage({
    status: status({ configuredTargetKinds: [], targets: [] }),
    targets: [],
    busy: false,
    account: 'anna@corp.com',
  });
  assert.match(none, /No destination is configured/);
});

test('Add opens a form whose credential inputs carry no value', async () => {
  const w = await started();

  await w.tab.handle({ type: 'addTarget' });

  const html = last(w);
  assert.match(html, /New destination/);
  assert.match(html, /<input type="text" id="tid" autocomplete="off" spellcheck="false">/, 'no value attribute');
  assert.match(html, /<input type="password" id="tsecret" autocomplete="off">/, 'a password input, no value');
  assert.match(html, /required the first time/);
});

test('saving a new destination sends the WHOLE list — the sealed ones key-less, the new one with its keys — then re-reads', async () => {
  const w = await started();
  await w.tab.handle({ type: 'addTarget' });

  await w.tab.handle({
    type: 'saveTarget',
    kind: 's3',
    endpoint: 'https://s3.example.com',
    region: 'eu-west-1',
    bucket: 'vaults',
    prefix: 'weekly',
    accessKeyId: 'AKIDTYPED',
    secretAccessKey: 'typed-secret-value',
  });

  const sent = w.saved.at(-1);
  assert.ok(sent?.targets, 'the list travelled');
  assert.equal(sent.targets.length, 3, 'two kept plus one new');
  assert.deepEqual(sent.targets[0], { kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-central-1', bucket: 'vaults', prefix: 'nightly' }, 'kept: key-less');
  assert.deepEqual(sent.targets[2], {
    kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-west-1', bucket: 'vaults', prefix: 'weekly',
    accessKeyId: 'AKIDTYPED', secretAccessKey: 'typed-secret-value',
  });
  assert.equal(sent.scheduleHourUtc, 3, 'the schedule as last read, untouched');
  assert.ok(w.order.filter((step) => step === 'readTargets').length >= 2, 'the list was read back');
  assert.match(last(w), /Destination saved\./);
  assert.doesNotMatch(last(w), /New destination/, 'the form is closed');
  for (const secret of SECRETS) {
    assert.ok(!last(w).includes(secret), `${secret} never reaches the page`);
  }
});

test('after a FAILED save the form keeps the endpoint and holds none of the four credential strings', async () => {
  // The owner's decision for this task: a credential lives for one message. What the tab keeps for
  // the retry is the non-secret draft, so the person does not retype the endpoint — and never what
  // they typed into the two fields below it. The list is re-read, so the page shows what the server
  // holds rather than what the person hoped.
  let reads = 0;
  const w = await started({
    saveSettings: () => Promise.reject(new Error('s3 vaults/weekly: this bucket would not accept a write: 403 Forbidden')),
    readTargets: () => {
      reads += 1;
      return Promise.resolve([NIGHTLY]);
    },
  });
  await w.tab.handle({ type: 'addTarget' });
  const before = reads;

  await w.tab.handle({
    type: 'saveTarget',
    kind: 's3',
    endpoint: 'https://s3.example.com',
    region: 'eu-west-1',
    bucket: 'vaults',
    prefix: 'weekly',
    accessKeyId: 'AKIDTYPED',
    secretAccessKey: 'typed-secret-value',
  });

  const html = last(w);
  assert.match(html, /would not accept a write/, 'the server sentence is on the page');
  assert.match(html, /value="https:\/\/s3\.example\.com"/, 'the endpoint is back in the form');
  assert.match(html, /value="weekly"/);
  for (const secret of SECRETS) {
    assert.ok(!html.includes(secret), `${secret} is not drawn back`);
  }
  assert.equal(reads, before + 1, 'the list was re-read after the failure');
  assert.doesNotMatch(html, /id="run" class="primary" disabled/, 'and the tab is not stuck busy');
});

test('a destination the server would refuse is refused without a request, named', async () => {
  const w = await started();
  await w.tab.handle({ type: 'addTarget' });

  await w.tab.handle({
    type: 'saveTarget', kind: 's3', endpoint: 'http://s3.example.com', region: 'eu-west-1', bucket: 'vaults', prefix: 'weekly',
    accessKeyId: 'AKIDTYPED', secretAccessKey: 'typed-secret-value',
  });

  assert.equal(w.saved.length, 0, 'nothing was sent');
  assert.match(last(w), /s3 vaults\/weekly: The endpoint must be https/);
  assert.match(last(w), /New destination/, 'the form stays open for the correction');
});

test('editing a destination and leaving the keys empty sends it key-less — the server keeps the sealed ones', async () => {
  const w = await started();
  await w.tab.handle({ type: 'editTarget', index: 0 });
  assert.match(last(w), /Edit destination/);
  assert.match(last(w), /Leave both credential fields empty to keep/);

  await w.tab.handle({
    type: 'saveTarget', kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-west-1', bucket: 'vaults', prefix: 'nightly',
    accessKeyId: '', secretAccessKey: '',
  });

  const targets = sentTargets(w);
  assert.deepEqual(targets[0], { kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-west-1', bucket: 'vaults', prefix: 'nightly' });
  assert.equal(targets.length, 2, 'the sibling is still there');
});

test('an edit that changes the identity is a NEW destination to the server, and needs both halves', async () => {
  // The keep-the-keys rule matches by kind, endpoint, bucket and prefix. Change the prefix and the
  // server has nothing sealed for that identity — sending it key-less would be refused as a first save.
  const w = await started();
  await w.tab.handle({ type: 'editTarget', index: 0 });

  await w.tab.handle({
    type: 'saveTarget', kind: 's3', endpoint: 'https://s3.example.com', region: 'eu-central-1', bucket: 'vaults', prefix: 'renamed',
    accessKeyId: '', secretAccessKey: '',
  });

  assert.equal(w.saved.length, 0);
  assert.match(last(w), /s3 vaults\/renamed: An access key id and a secret access key are required the first time/);
});

test('a region typed under S3 is not sent once the kind is Azure', async () => {
  const w = await started();
  await w.tab.handle({ type: 'addTarget' });

  await w.tab.handle({
    type: 'saveTarget', kind: 'azure-blob', endpoint: 'https://acct.blob.core.windows.net', region: 'eu-central-1', bucket: 'vaults', prefix: 'x',
    accountName: 'typed-account', accountKey: 'typed-account-key',
  });

  assert.equal(sentTargets(w).at(-1)?.region, '');
});

test('remove asks first, naming the destination; a dismissed dialog sends nothing', async () => {
  const asked: string[] = [];
  const w = await started({}, { confirmRemove: (what) => { asked.push(what); return Promise.resolve(false); } });

  await w.tab.handle({ type: 'removeTarget', index: 1 });

  assert.deepEqual(asked, ['azure vaults/old']);
  assert.equal(w.saved.length, 0, 'a dismissed dialog removes nothing');
});

test('a confirmed remove sends the list without that row and says the archives stay', async () => {
  const w = await started();

  await w.tab.handle({ type: 'removeTarget', index: 0 });

  const targets = sentTargets(w);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].prefix, 'old');
  assert.match(last(w), /Archives already there stay there/);
});

test('cancel closes the form and sends nothing', async () => {
  const w = await started();
  await w.tab.handle({ type: 'addTarget' });

  await w.tab.handle({ type: 'cancelTarget' });

  assert.doesNotMatch(last(w), /New destination/);
  assert.equal(w.saved.length, 0);
});

test('every status the tab reads is handed to the tree seam, so the row moves with the tab', async () => {
  const w = await started();
  const afterStart = w.recorded.length;

  await w.tab.handle({ type: 'run' });
  await w.tab.handle({ type: 'save', scheduleHourUtc: 4, retentionDays: 14 });

  assert.ok(afterStart >= 1, 'the first read was recorded');
  assert.equal(w.recorded.length, afterStart + 2, 'and each action re-read and recorded once');
  assert.equal(w.recorded.at(-1)?.lastResult, 'ok', 'the document the server answered, not a guess');
});

test('a message is refused at the door when a field is not of its kind', () => {
  assert.equal(isBackupPageMessage({ type: 'saveTarget', kind: 's3', endpoint: 'https://x', region: '', bucket: 'b', prefix: '', accessKeyId: 'a', secretAccessKey: 'b' }), true);
  assert.equal(isBackupPageMessage({ type: 'removeTarget', index: 1 }), true);
  assert.equal(isBackupPageMessage({ type: 'removeTarget', index: '1' }), false, 'an index is a number');
  assert.equal(isBackupPageMessage({ type: 'saveTarget', bucket: ['vaults'] }), false, 'a field is a string');
  assert.equal(isBackupPageMessage({ type: 'dropEverything' }), false, 'an unknown type');
  assert.equal(isBackupPageMessage(null), false);
});

test('the last success is said only when it is a different fact from the last run', () => {
  const at = (instant: number): string => `stamped(${instant})`;

  assert.equal(successSentence(status({ lastResult: 'ok', lastSuccessAt: 1 }), at), '', 'a run that succeeded IS the last success');
  assert.equal(successSentence(status({ lastResult: 'failed' }), at), '', 'an older server says nothing rather than guessing');
  assert.equal(successSentence(status({ lastResult: 'failed', lastSuccessAt: 5 }), at), 'The last successful backup was at stamped(5).');
  assert.equal(successSentence(status({ lastResult: 'partial', lastSuccessAt: 0 }), at), 'No backup has ever succeeded on this server.');
  assert.equal(successSentence(status({ lastRunAt: 0, lastResult: 'never run', lastSuccessAt: 0 }), at), '', 'no run, nothing to compare');
});
