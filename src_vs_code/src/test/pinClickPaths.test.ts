import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { withoutPassword } from '../dbConnString';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { ACCOUNT, PIN, Sinks, clickVscode, everythingSunk, locked, memoryStorage, seedEntry, sinks } from './pinWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * D6 of the entry-PIN plan: every CLICK that hands a stored value to a sink opens it through the
 * entry's door first. Until 1.12 each of them read the raw getter, so a protected entry put
 * `{"v":1,"lock":…}` on the clipboard, into a saved file, into the database extension and into
 * `~/.ssh`.
 *
 * <p>Driven through the REAL `registerEntityCommands` with a fake `register` that keeps the handlers,
 * over the real `StorageManager` holding real `lockSecret` wraps. Each row states one guarantee four
 * times: the sink receives the PLAINTEXT, never an envelope; the door asks at most once; a declined
 * door hands nothing to anything; and an entry with no PIN is not asked at all (the positive that
 * proves the fixture reaches the sink — a file of "nothing happened" would pass over a broken one).</p>
 */

const SEED = 'otpauth://totp/GitHub:me?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
const CONN = 'postgres://app:s3cret@db.example.com:5432/app';
const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nnot-a-real-key\n-----END OPENSSH PRIVATE KEY-----';
const VPN = '[Interface]\nPrivateKey = abc\n';

/** What the mocked sinks received — the two collaborators whose whole job is the value. */
interface Collaborators {
  db: (string | undefined)[];
  installed: { key: string | undefined; note: string }[];
}

interface Row {
  readonly command: string;
  readonly details: EntityMetadata;
  readonly slot: string;
  readonly plain: string;
  /** What reached the sink, or `undefined` when nothing did. */
  readonly sunk: (s: Sinks, c: Collaborators) => string | undefined;
  readonly expected: string | RegExp;
}

const entry = (over: Partial<EntityMetadata>): EntityMetadata =>
  ({ id: 'e1', name: 'prod', isSshEnabled: false, pinProtected: true, ...over }) as EntityMetadata;

const lastClip = (s: Sinks): string | undefined => s.clipboard[s.clipboard.length - 1];

const ROWS: readonly Row[] = [
  { command: 'credSshManager.copyPassword', details: entry({ kind: 'credential' }), slot: 'password', plain: 'hunter2', sunk: lastClip, expected: 'hunter2' },
  { command: 'credSshManager.copyDbConnection', details: entry({ kind: 'db', dbType: 'postgres' }), slot: 'database connection', plain: CONN, sunk: lastClip, expected: CONN },
  {
    command: 'credSshManager.copyDbConnectionNoPassword',
    details: entry({ kind: 'db', dbType: 'postgres' }),
    slot: 'database connection',
    plain: CONN,
    sunk: lastClip,
    expected: withoutPassword(CONN),
  },
  { command: 'credSshManager.connectDb', details: entry({ kind: 'db', dbType: 'postgres' }), slot: 'database connection', plain: CONN, sunk: (_s, c) => c.db[0], expected: CONN },
  { command: 'credSshManager.copyTotpCode', details: entry({ kind: 'credential', hasTotp: true }), slot: 'one-time-code seed', plain: SEED, sunk: lastClip, expected: /^\d{6}$/ },
  { command: 'credSshManager.installSshKey', details: entry({ kind: 'sshkey' }), slot: 'private key', plain: KEY, sunk: (_s, c) => c.installed[0]?.key, expected: KEY },
  { command: 'credSshManager.saveVpnConfig', details: entry({ kind: 'vpn', vpnType: 'wireguard' }), slot: 'VPN configuration', plain: VPN, sunk: (s) => s.files['/workspace/chosen-in-the-dialog/saved.file'], expected: VPN },
];

interface Clicked {
  s: Sinks;
  c: Collaborators;
  storage: StorageManager;
}

/** Seed the entry, register the entity commands, and click `command` on it. */
async function click(row: Row, inputs: (string | undefined)[], protect = true): Promise<Clicked> {
  const s = sinks();
  const c: Collaborators = { db: [], installed: [] };
  const stub = clickVscode([...inputs], s);
  const storage = memoryStorage(stub);
  const details = protect ? row.details : { ...row.details, pinProtected: undefined };
  await seedEntry(storage, details, { [row.slot]: protect ? await locked(row.plain) : row.plain });
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const mod = loadWithVscode<typeof import('../commands/entityCommands')>('../commands/entityCommands', stub, {
    '../dbLauncher': { openInDbExtension: (_d: EntityMetadata, conn: string | undefined) => c.db.push(conn) },
    '../keyInstaller': {
      installKeyToSystem: (_d: EntityMetadata, key: string | undefined, note = '') => c.installed.push({ key, note }),
      removeInstalledKey: (): undefined => undefined,
    },
  });
  mod.registerEntityCommands({
    register: (command, handler) => handlers.set(command, handler),
    storage,
    storageDir: '/workspace/creds-test',
    doorsAt: () => ({}) as never,
    mutated: () => undefined,
    vaultKeys: { noteUserActivity: () => undefined } as never,
    trust: {} as never,
  });
  const handler = handlers.get(row.command);
  assert.ok(handler !== undefined, `${row.command} is not registered`);
  const node = storage.getNode(ACCOUNT, details.id);
  await handler({ kind: 'node', accountId: ACCOUNT, node });
  return { s, c, storage };
}

for (const row of ROWS) {
  test(`${row.command} on a protected entry hands its sink the PLAINTEXT after one PIN, never the envelope`, async () => {
    const { s, c } = await click(row, [PIN]);

    const got = row.sunk(s, c);
    assert.ok(got !== undefined, `nothing reached the sink; warnings: ${s.warnings.join(' | ')}`);
    assert.ok(!got.includes('"lock"'), `the sink got the sealed envelope: ${got.slice(0, 40)}…`);
    if (typeof row.expected === 'string') {
      assert.equal(got, row.expected);
    } else {
      assert.match(got, row.expected);
    }
    assert.equal(s.boxes, 1, 'one PIN, at the door');
    assert.match(s.boxTitles[0] ?? '', /PIN for "prod"/);
  });

  test(`${row.command}: a declined PIN hands nothing to anything, and says nothing more`, async () => {
    const { s, c } = await click(row, [undefined]);

    assert.equal(row.sunk(s, c), undefined, 'a value reached the sink without the PIN');
    assert.equal(everythingSunk(s), '[[],{}]');
    assert.deepEqual(s.warnings, []);
  });

  test(`${row.command}: an entry with no PIN is not asked for one`, async () => {
    const { s, c } = await click(row, [], false);

    assert.ok(row.sunk(s, c) !== undefined, 'the unprotected value must still reach the sink');
    assert.equal(s.boxes, 0);
  });
}

test('a wrong PIN is said, and hands nothing to the clipboard', async () => {
  const { s } = await click(ROWS[0], ['0000']);

  assert.deepEqual(s.clipboard, []);
  assert.match(s.warnings.join(' '), /That PIN does not open this entry/);
});

test('installing a protected key says the file is outside the PIN', async () => {
  const { c } = await click(ROWS.find((row) => row.command.endsWith('installSshKey')) as Row, [PIN]);

  assert.equal(c.installed[0]?.note, ' The file is outside the PIN: anyone who can read it has the value.');
});

test('saving a protected VPN config says the file is outside the PIN; an unprotected one does not', async () => {
  const row = ROWS.find((one) => one.command.endsWith('saveVpnConfig')) as Row;
  const guarded = await click(row, [PIN]);
  const plain = await click(row, [], false);

  assert.match(guarded.s.infos.join(' '), /Saved to .*\. The file is outside the PIN: anyone who can read it has the value\./);
  assert.doesNotMatch(plain.s.infos.join(' '), /outside the PIN/);
});

// ---------------------------------------------------------------------------------------------
// The key clicks: Git signing, Add Key to Agent, the bridge — and Show Config Changes (D6, D18).
// ---------------------------------------------------------------------------------------------

function realKey(): string {
  // Generated, never committed: a private key in a repository is a private key on the internet.
  const { privateKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }) as unknown as { privateKey: string };
  return privateKey;
}

const REAL_KEY = realKey();

const keyEntry = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'key1', name: 'signing key', kind: 'sshkey', isSshEnabled: false, pinProtected: true, ...over }) as EntityMetadata;

/** A protected key entry over the real vault, and a `vscode` that answers `inputs` to the PIN box. */
async function keyWorld(
  inputs: (string | undefined)[],
  details: EntityMetadata = keyEntry(),
): Promise<{ s: Sinks; stub: Record<string, unknown>; storage: StorageManager }> {
  const s = sinks();
  const stub = clickVscode([...inputs], s);
  const storage = memoryStorage(stub);
  await seedEntry(storage, details, { 'private key': await locked(REAL_KEY) });
  return { s, stub, storage };
}

test('Git signing uses the entry\'s public key without asking for the PIN when it has one', async () => {
  const publicKey = `ssh-ed25519 ${'A'.repeat(68)} me@laptop`;
  const w = await keyWorld([], keyEntry({ publicKey }));
  const { signingPublicLine } = loadWithVscode<typeof import('../gitSigningKey')>('../gitSigningKey', w.stub);

  const line = await signingPublicLine(w.storage, ACCOUNT, keyEntry({ publicKey }), []);

  assert.equal(line, publicKey);
  assert.equal(w.s.boxes, 0, 'the public half is not a secret — asking for the PIN to read it is an obstacle with no reason');
});

test('Git signing on a protected key with no public half asks its PIN once and reads the key, not the envelope', async () => {
  const w = await keyWorld([PIN]);
  const { signingPublicLine } = loadWithVscode<typeof import('../gitSigningKey')>('../gitSigningKey', w.stub);

  const line = await signingPublicLine(w.storage, ACCOUNT, keyEntry(), []);

  assert.match(String(line), /^ssh-ed25519 [A-Za-z0-9+/]+=* signing key$/, `no public line; warnings: ${w.s.warnings.join(' | ')}`);
  assert.equal(w.s.boxes, 1);
});

test('Add Key to Agent on a protected key asks its PIN once and serves the key', async () => {
  const w = await keyWorld([PIN]);
  const agent = agentManager(w.stub, w.storage);
  const { clickOpener } = loadWithVscode<typeof import('../pinClick')>('../pinClick', w.stub);

  const result = await agent.instance.load(ACCOUNT, keyEntry(), clickOpener(w.storage, ACCOUNT, 'load its key into the SSH agent'));

  assert.equal(result.ok, true, result.ok ? '' : result.reason);
  assert.equal(w.s.boxes, 1);
  assert.match(w.s.boxTitles[0] ?? '', /PIN for "signing key"/);
});

test('the startup sweep (loadMarked) never prompts, and says the PIN sentence — not "the key does not parse"', async () => {
  const w = await keyWorld([], keyEntry({ sshAgent: true }));
  const agent = agentManager(w.stub, w.storage);

  assert.equal(await agent.instance.loadMarked(), 0);
  assert.equal(w.s.boxes, 0, 'an automatic path never prompts');
  assert.match(agent.logs.join('\n'), /could not load "signing key": "signing key" is protected with its own PIN, so it cannot be used automatically/);
});

test('the bridge (a click) opens a borrowed protected key with ITS PIN and writes the key in the clear', async () => {
  const w = await keyWorld([PIN]);
  const connection = { id: 'ssh1', name: 'prod box', host: 'h', user: 'u', isSshEnabled: true, sshKeyEntityId: 'key1' } as EntityMetadata;
  await seedEntry(w.storage, connection, {});
  const written: string[] = [];
  const mod = loadWithVscode<typeof import('../sshExecAuth')>('../sshExecAuth', w.stub, {
    './keyInstaller': {
      materializePrivateKey: (dir: string, name: string, content: string): string => {
        written.push(content);
        return `${dir}/${name}`;
      },
      writeAskpassScriptFile: (dir: string): string => `${dir}/askpass.sh`,
    },
  });
  const { clickOpener } = loadWithVscode<typeof import('../pinClick')>('../pinClick', w.stub);

  const auth = await mod.resolveExecAuth(w.storage, ACCOUNT, connection, '/store', clickOpener(w.storage, ACCOUNT, 'connect'));

  assert.equal(auth.ok, true, auth.ok ? '' : auth.message);
  assert.deepEqual(written, [REAL_KEY]);
  assert.match(w.s.boxTitles[0] ?? '', /PIN for "signing key"/);
});

test('Show Config Changes on a protected config compares the OPENED bodies, after one PIN', async () => {
  const s = sinks();
  const stub = clickVscode([PIN], s);
  const storage = memoryStorage(stub);
  const details = { id: 'cfg1', name: 'app config', kind: 'config', configFormat: 'json', isSshEnabled: false, pinProtected: true } as EntityMetadata;
  await seedEntry(storage, details, { 'config body': await locked('{"db":"new","port":1}') });
  const previous = await locked('{"db":"old","port":1}');
  await storage.recordRevision(ACCOUNT, 'cfg1', { at: Date.UTC(2026, 8, 1, 12), name: 'app config', details, secrets: { config: previous } });
  const { showConfigChanges } = loadWithVscode<typeof import('../configCommands')>('../configCommands', stub);

  await showConfigChanges(storage, ACCOUNT, storage.getNode(ACCOUNT, 'cfg1') as TreeNode);

  assert.match(s.infos.join(' '), /"app config": 1 changed since/, `the diff read: ${s.infos.join(' | ')}`);
  assert.equal(s.boxes, 1);
});

test('Write config file on a protected config writes the OPENED body after one PIN, and says the file is outside the PIN', async () => {
  const s = sinks();
  const stub = clickVscode([PIN], s, '/workspace/app.env');
  const storage = memoryStorage(stub);
  const details = { id: 'cfg1', name: 'app config', kind: 'config', configFormat: 'env', isSshEnabled: false, pinProtected: true } as EntityMetadata;
  await seedEntry(storage, details, { 'config body': await locked('DB_PASSWORD=s3cret\n') });
  const { writeStoredConfig } = loadWithVscode<typeof import('../configWrite')>('../configWrite', stub);
  // Not tracked, and covered by a .gitignore rule: the write goes ahead without the modal.
  const git = (args: readonly string[]): Promise<number> => Promise.resolve(args[0] === 'check-ignore' ? 0 : 1);

  await writeStoredConfig(storage, ACCOUNT, details, git);

  assert.equal(s.files['/workspace/app.env'], 'DB_PASSWORD=s3cret\n', `the file held: ${String(s.files['/workspace/app.env']).slice(0, 40)}`);
  assert.equal(s.boxes, 1);
  assert.match(s.infos.join(' '), /keep it out of the repository\. The file is outside the PIN: anyone who can read it has the value\./);
});

test('Write config file: a declined PIN writes no file', async () => {
  const s = sinks();
  const stub = clickVscode([undefined], s, '/workspace/app.env');
  const storage = memoryStorage(stub);
  const details = { id: 'cfg1', name: 'app config', kind: 'config', configFormat: 'env', isSshEnabled: false, pinProtected: true } as EntityMetadata;
  await seedEntry(storage, details, { 'config body': await locked('DB_PASSWORD=s3cret\n') });
  const { writeStoredConfig } = loadWithVscode<typeof import('../configWrite')>('../configWrite', stub);

  await writeStoredConfig(storage, ACCOUNT, details, () => Promise.resolve(1));

  assert.deepEqual(s.files, {});
  assert.deepEqual(s.warnings, [], 'a decline says nothing more — not "has nothing in it yet"');
});

test('Start VPN writes the OPENED config where the tunnel reads it, after one PIN — and a decline writes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-vpn-'));
  try {
    for (const [inputs, expected] of [[[PIN], VPN], [[undefined], undefined]] as const) {
      const s = sinks();
      const stub = clickVscode([...inputs], s);
      const storage = memoryStorage(stub);
      const details = entry({ kind: 'vpn', vpnType: 'wireguard' });
      await seedEntry(storage, details, { 'VPN configuration': await locked(VPN) });
      const { writeVpnConfig } = loadWithVscode<typeof import('../vpnLauncherRun')>('../vpnLauncherRun', stub);

      const written = await writeVpnConfig({ accountId: ACCOUNT, details, storage, storageDir: dir, trust: {} as never }, 'prod.conf');

      assert.equal(written === undefined ? undefined : fs.readFileSync(written, 'utf8'), expected);
      assert.equal(s.boxes, 1);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

interface Agent {
  instance: InstanceType<typeof import('../sshAgentManager').SshAgentManager>;
  logs: string[];
}

/** The real `SshAgentManager` over the real vault, with the socket server stood in for. */
function agentManager(stub: Record<string, unknown>, storage: StorageManager): Agent {
  const logs: string[] = [];
  const window = stub.window as Record<string, unknown>;
  const withLog = {
    ...stub,
    window: { ...window, createOutputChannel: () => ({ appendLine: (line: string) => logs.push(line), dispose: (): void => undefined }) },
  };
  class StubServer {
    listening = false;
    socketPath = '/workspace/agent.sock';
    listen(): Promise<void> {
      this.listening = true;
      return Promise.resolve();
    }
    dispose(): void {
      this.listening = false;
    }
  }
  const mod = loadWithVscode<typeof import('../sshAgentManager')>('../sshAgentManager', withLog, {
    './sshAgentServer': { SshAgentServer: StubServer, agentSocketPath: (): string => '/workspace/agent.sock' },
  });
  const env = { replace: (): void => undefined, delete: (): void => undefined, description: '' };
  return { instance: new mod.SshAgentManager(storage, os.tmpdir(), env as never, () => undefined), logs };
}
