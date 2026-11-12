import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, mock, test } from 'node:test';
import { errorBody } from '../brokerProtocol';
import { SECOND_ENTRY_REFUSED } from '../agentNaming';
import { loadWithVscode } from './vscodeStub';
import { ACCOUNT, JOURNAL_BROKEN, SecondOptions, SecondWorld, secondEntryWorld } from './secondEntryWorld';
import { resolveJumpChain } from '../sshOptions';
import { memoryStorage, seedEntry } from './pinWorld';
import { EntityMetadata } from '../types';
import type { UseActionContext } from '../useActions';
import type { SshUseDeps } from '../sshUseActions';
import type { StorageManager } from '../storageManager';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { recordingLog } from './liveColourStorage';

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

/**
 * What an agent may actually do with an SSH grant (audit A3).
 *
 * <p>The claim this module makes is that the secret never leaves its own stack frame: a
 * password reaches `ssh` through the spawned process's environment, a stored key through a
 * 0600 file deleted in a `finally`, and neither appears in anything it returns. The response
 * types in `brokerProtocol.ts` have no field one could travel in, so what needs testing is not
 * the shape of the answer but the SEQUENCE — what was written, and whether it is gone.</p>
 *
 * <p>Two defects the code records are pinned here. The materialised key gets a name unique to
 * the CALL, because a shared one meant the first call to finish pulled the key out from under
 * every other still authenticating with it — including a human terminal open on the same
 * entity. And an entity whose host was cleared after the grant was minted is refused BEFORE
 * anything decrypts to disk, because writing key material only to refuse the call left it
 * lying there until the next activate.</p>
 *
 * <p>`buildSshExecArgv`, `resolveJumpChain`, `validateRemoteCommand` and `clampExecTimeout`
 * are the REAL ones. Only the I/O boundaries are substituted, so an assertion about the argv
 * is an assertion about what would really be executed.</p>
 */

type Actions = typeof import('../sshUseActions');

/** What the run leaves behind, recorded by the stubs — built BEFORE the module loads, so the world needs no placeholder. */
interface Log {
  /** Every key file this run materialised, in order. */
  materialised: string[];
  /** The argv, program and env `runSshExec` was called with. */
  runs: { argv: string[]; program?: string; env: NodeJS.ProcessEnv; timeoutMs: number }[];
  notes: string[];
  warnings: string[];
  /** Counters live in one object, so the stubs and the world share them by reference. */
  tally: { slotsHeld: number; connected: number };
}

interface World extends Log {
  mod: Actions;
  /**
   * The REAL `StorageManager` over an in-memory memento and keychain, seeded with the entry — so the deps
   * handed to the actions are an `SshUseDeps` and not a cast (E4.S3's code round, finding 1). Narrowing
   * `SshUseDeps.storage` instead was measured and refused: the exec and terminal paths hand the manager to
   * the credential, PIN and rotation modules, each typed `StorageManager`.
   */
  storage: StorageManager;
  storageDir: string;
  /** What the agent manager would report, so a test can run with and without an agent. */
  agentSocket?: string;
}

interface Parts {
  source: Record<string, unknown>;
  entity?: EntityMetadata | undefined;
  noSlot?: boolean;
  runFails?: boolean;
  /** The window refuses the connection — a remote one can, and the action must not claim success. */
  connectRefuses?: boolean;
  /** The credential read itself fails (a keychain that errors): `prepareAuth` throws instead of answering (X1). */
  credentialThrows?: boolean;
  /** The journal will not take a line: `deps.note` throws (X3). */
  noteThrows?: boolean;
}

const ENTITY = {
  id: 'e1',
  name: 'prod',
  kind: 'ssh',
  host: 'prod.corp.com',
  user: 'deploy',
  isSshEnabled: true,
} as unknown as EntityMetadata;

async function world(parts: Parts): Promise<World> {
  const storageDir = ownedDir(scope, 'use');
  const log: Log = { materialised: [], runs: [], notes: [], warnings: [], tally: { slotsHeld: 0, connected: 0 } };
  const stub = {
    window: {
      showWarningMessage: (m: string): Promise<undefined> => {
        log.warnings.push(m);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
    },
  };
  const mod = loadWithVscode<Actions>('../sshUseActions', stub, mocks(parts, storageDir, log));
  // The entry is re-read on every call, never snapshotted at grant time — so a world whose entry is
  // `undefined` (deleted since the grant was minted) seeds nothing.
  const storage = memoryStorage(stub);
  const entity = 'entity' in parts ? parts.entity : ENTITY;
  if (entity !== undefined) {
    await seedEntry(storage, entity, {});
  }
  return { ...log, mod, storage, storageDir };
}

/** The I/O boundaries, substituted — each one records into `log` what it was asked to do. */
function mocks(parts: Parts, storageDir: string, log: Log): Record<string, unknown> {
  return {
    './sshCredential': {
      resolveSshCredential: (): Promise<unknown> =>
        parts.credentialThrows === true ? Promise.reject(new Error('the keychain would not answer')) : Promise.resolve(parts.source),
    },
    './keyInstaller': {
      // A REAL file, so the `finally` cleanup is observed by asking the filesystem rather
      // than by counting calls to a stub.
      materializePrivateKey: (dir: string, id: string, content: string): string => {
        const keyPath = path.join(dir, `${id}.key`);
        fs.writeFileSync(keyPath, content, { mode: 0o600 });
        log.materialised.push(keyPath);
        return keyPath;
      },
      writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
    },
    './hostKeyTrust': { materializeKnownHosts: (): string | undefined => undefined },
    './sshExecRunner': {
      runSshExec: (
        argv: string[],
        o: { env: NodeJS.ProcessEnv; timeoutMs: number; program?: string },
      ): Promise<unknown> => {
        log.runs.push({ argv, program: o.program, env: o.env, timeoutMs: o.timeoutMs });
        return parts.runFails === true
          ? Promise.reject(new Error('ssh is not installed'))
          : Promise.resolve({ exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false });
      },
    },
    './sshConnect': {
      // It answers whether a terminal actually opened, so the action can stop reporting success
      // for a connection a remote window refused.
      connectEntity: (): Promise<boolean> => {
        log.tally.connected += 1;
        return Promise.resolve(parts.connectRefuses !== true);
      },
    },
    './terminalManager': { describeSshTarget: (e: { host?: string }): string | undefined => e.host },
    './sshAskpass': {
      askpassEnv: (_s: string, password: string): Record<string, string> => ({
        SSH_ASKPASS_REQUIRE: 'force',
        CREDS_PASSWORD: password,
      }),
    },
  };
}

function deps(w: World, parts: Parts): SshUseDeps {
  return {
    storage: w.storage,
    storageDir: w.storageDir,
    log: recordingLog().log,
    signal: new AbortController().signal,
    acquireExecSlot: (): (() => void) | undefined => {
      if (parts.noSlot === true) {
        return undefined;
      }
      w.tally.slotsHeld += 1;
      return (): void => {
        w.tally.slotsHeld -= 1;
      };
    },
    note: (m: string): void => {
      if (parts.noteThrows === true) {
        throw new Error('the journal could not be written');
      }
      w.notes.push(m);
    },
    agentSocket: (): string | undefined => w.agentSocket,
  };
}

const CTX: UseActionContext = { accountId: 'a1', entityId: 'e1', entityName: 'prod', signal: new AbortController().signal };
const KEY_SOURCE = { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE KEY BODY' };

/** Run the exec action once and hand back its result. */
async function exec(w: World, parts: Parts, command = 'uptime'): Promise<{ status: number; body: Record<string, unknown> }> {
  const action = w.mod.sshExecAction(deps(w, parts));
  return (await action.run(CTX, { command })) as { status: number; body: Record<string, unknown> };
}

test('an entity deleted since the grant was minted is not_found', async () => {
  // The entity is re-read on every call, never snapshotted at grant time.
  const parts: Parts = { source: KEY_SOURCE, entity: undefined };
  const w = await world(parts);
  const result = await exec(w, parts);

  assert.equal(result.status, 404);
  assert.equal((result.body.error as { code: string }).code, 'not_found');
});

test('an entity whose HOST was cleared is refused BEFORE any key is written', async () => {
  // The recorded defect: writing key material only to then refuse the call left a decrypted
  // key on disk until the next activate.
  const parts: Parts = {
    source: KEY_SOURCE,
    entity: { ...ENTITY, host: undefined } as unknown as EntityMetadata,
  };
  const w = await world(parts);
  const result = await exec(w, parts);

  assert.equal((result.body.error as { code: string }).code, 'no_credential');
  assert.deepEqual(w.materialised, [], 'nothing was decrypted to disk');
});

test('a runaway agent is refused a slot rather than allowed to pile up SSH processes', async () => {
  const parts: Parts = { source: KEY_SOURCE, noSlot: true };
  const w = await world(parts);
  const result = await exec(w, parts);

  assert.equal((result.body.error as { code: string }).code, 'too_many_requests');
  assert.deepEqual(w.runs, [], 'and nothing ran');
});

test('an entity with no credential left is refused, and the slot is given back', async () => {
  // A slot leaked on a refusal would let a handful of dead grants exhaust the pool.
  const parts: Parts = { source: { kind: 'none' } };
  const w = await world(parts);
  const result = await exec(w, parts);

  assert.equal((result.body.error as { code: string }).code, 'no_credential');
  assert.equal(w.tally.slotsHeld, 0);
});

test('X1: a credential read that THROWS gives the slot back and fails the call — it neither leaks nor hangs', async () => {
  // `prepareAuth` is awaited after the slot is taken and before the `try` that releases it: a throw out of it used to
  // leave the slot held for ever, and a handful of such calls would have exhausted the pool.
  const parts: Parts = { source: KEY_SOURCE, credentialThrows: true };
  const w = await world(parts);
  await assert.rejects(exec(w, parts), { message: 'the keychain would not answer' });
  assert.equal(w.tally.slotsHeld, 0, 'the slot came back');
  assert.deepEqual(w.runs, [], 'and nothing ran');
  parts.credentialThrows = false; // the mock reads the world's own parts
  const result = await exec(w, parts);
  assert.equal(result.status, 200, 'the next call is served');
});

test('C.3: asksAfterConsent is true on the terminal action (a remote window\'s refusal modal can follow the Allow); on exec it is per entity — only a forwarding entry with the agent socket up', async () => {
  const forwarding: EntityMetadata = { ...ENTITY, agentForward: true };
  const asked = async (entity: EntityMetadata, socket: string | undefined): Promise<unknown> => {
    const parts: Parts = { source: KEY_SOURCE, entity };
    const w = await world(parts);
    w.agentSocket = socket;
    const flag = w.mod.sshExecAction(deps(w, parts)).asksAfterConsent;
    return typeof flag === 'function' ? flag({ accountId: 'a1', entityId: 'e1', entityName: 'prod' }) : flag;
  };
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  assert.equal(w.mod.sshTerminalAction(deps(w, parts)).asksAfterConsent, true);
  assert.deepEqual(
    [await asked(forwarding, '/run/agent.sock'), await asked(forwarding, undefined), await asked(ENTITY, '/run/agent.sock'), await asked(ENTITY, undefined)],
    [true, false, false, false],
    'forwarding+socket, forwarding without the socket, plain with the socket, plain without',
  );
});

test('X2: a key file that cannot be removed (a Windows lock) still gives the slot back, keeps the finished result and says so in the journal', async () => {
  // `fs.rmSync(..., { force: true })` swallows ENOENT only: an EPERM/EBUSY out of the `finally` used to leak one of the eight
  // exec slots, leave the key on disk and replace a finished result with a rejection (Amendment 3, C.6).
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  // The module object itself: `import * as fs` is a frozen namespace copy, and the action under test calls the real one.
  const nodeFs = require('node:fs') as typeof fs;
  const real = nodeFs.rmSync;
  const refused = mock.method(nodeFs, 'rmSync', (target: fs.PathLike, options?: fs.RmOptions): void => {
    if (String(target).endsWith('.key')) {
      throw Object.assign(new Error(`EPERM: operation not permitted, unlink '${String(target)}'`), { code: 'EPERM' });
    }
    real(target, options);
  });
  try {
    const result = await exec(w, parts);
    assert.equal(result.status, 200, 'the finished exec is the answer, not the failed cleanup');
    assert.equal(refused.mock.callCount() > 0, true, 'the removal was attempted');
    assert.equal(w.tally.slotsHeld, 0, 'and the slot came back');
    assert.ok(w.notes.some((note) => note.startsWith('ssh:exec — the key file could not be removed: ')), `the note names the removal failure: ${w.notes.join(' | ')}`);
    assert.ok(w.notes.every((note) => !note.includes('PRIVATE KEY BODY')), 'and not the key');
  } finally {
    refused.mock.restore();
  }
});

test('X3 (Amendment 6, D.6): a key file that cannot be removed AND a journal that will not say so still give the slot back and keep the finished result', async () => {
  const parts: Parts = { source: KEY_SOURCE, noteThrows: true };
  const w = await world(parts);
  const nodeFs = require('node:fs') as typeof fs;
  const real = nodeFs.rmSync;
  const refused = mock.method(nodeFs, 'rmSync', (target: fs.PathLike, options?: fs.RmOptions): void => {
    if (String(target).endsWith('.key')) {
      throw Object.assign(new Error(`EPERM: operation not permitted, unlink '${String(target)}'`), { code: 'EPERM' });
    }
    real(target, options);
  });
  try {
    const result = await exec(w, parts);
    assert.equal(result.status, 200, 'the finished exec is the answer, not the failed note');
    assert.equal(refused.mock.callCount() > 0, true, 'the removal was attempted');
    assert.equal(w.tally.slotsHeld, 0, 'and the slot came back');
  } finally {
    refused.mock.restore();
  }
});

test('a stored key is written, used, and DELETED before the call returns', async () => {
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  await exec(w, parts);

  assert.equal(w.materialised.length, 1);
  assert.equal(fs.existsSync(w.materialised[0]), false, 'the decrypted key is gone');
  assert.ok(w.runs[0].argv.includes(w.materialised[0]), 'and it really was the key ssh was given');
});

test('the key is deleted even when ssh itself FAILS', async () => {
  // The `finally` is what makes this true; a delete on the success path only would leave a
  // decrypted key behind on exactly the runs someone is investigating.
  const parts: Parts = { source: KEY_SOURCE, runFails: true };
  const w = await world(parts);
  const result = await exec(w, parts);

  assert.equal((result.body.error as { code: string }).code, 'internal');
  assert.equal(fs.existsSync(w.materialised[0]), false);
  assert.equal(w.tally.slotsHeld, 0, 'and the slot came back too');
});

test('two calls get two DIFFERENT key files — one name would break both', async () => {
  // The recorded defect: a shared file name meant the first call to finish pulled the key out
  // from under every other still authenticating with it, human terminals included.
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  await exec(w, parts);
  await exec(w, parts);

  assert.equal(w.materialised.length, 2);
  assert.notEqual(w.materialised[0], w.materialised[1]);
});

test('a password goes into the spawned process ENVIRONMENT, never the argv', async () => {
  const parts: Parts = { source: { kind: 'password', password: 'hunter2' } };
  const w = await world(parts);
  await exec(w, parts);

  assert.equal(w.runs[0].env.CREDS_PASSWORD, 'hunter2');
  assert.ok(!w.runs[0].argv.join(' ').includes('hunter2'), w.runs[0].argv.join(' '));
});

test('the spawned environment carries PATH — spawn REPLACES it rather than merging', async () => {
  // Without this, `ssh` is unresolvable and known_hosts is not found, and the failure looks
  // like a broken credential rather than a missing variable.
  const parts: Parts = { source: { kind: 'password', password: 'hunter2' } };
  const w = await world(parts);
  await exec(w, parts);

  const env = w.runs[0].env;
  assert.ok(env.PATH !== undefined || env.Path !== undefined, Object.keys(env).slice(0, 10).join());
});

test('the secret never appears in what the action RETURNS', async () => {
  const parts: Parts = { source: { kind: 'password', password: 'hunter2' } };
  const w = await world(parts);
  const result = await exec(w, parts);

  assert.ok(!JSON.stringify(result).includes('hunter2'), JSON.stringify(result));
});

test('a credential warning reaches the AUDIT as well as the screen', async () => {
  // The agent path used to drop it — the one case where an entity authenticates with
  // different key material than its configuration names and nobody is told.
  const parts: Parts = { source: { ...KEY_SOURCE, warning: 'the referenced key entity is gone' } };
  const w = await world(parts);
  await exec(w, parts);

  assert.ok(w.notes.some((n) => /key entity is gone/.test(n)), w.notes.join(' | '));
  assert.ok(w.warnings.some((n) => /key entity is gone/.test(n)));
});

test('a command the validator rejects never reaches run()', async () => {
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  const action = w.mod.sshExecAction(deps(w, parts));

  assert.equal(action.validate({ command: '' }, CTX).ok, false, 'an empty command is not a command');
  assert.equal(action.validate({ command: 'uptime' }, CTX).ok, true);
});

test('the outcome an audit line shows names the exit code, and says when it timed out', async () => {
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  const action = w.mod.sshExecAction(deps(w, parts));

  assert.match(action.describeOutcome({ status: 200, body: { exitCode: 7 } }), /exit 7/);
  assert.match(action.describeOutcome({ status: 200, body: { timedOut: true } }), /timed out/);
});

test('the terminal action goes through the human Connect path, verbatim', async () => {
  // Same terminal name, same askpass env, same key cleanup on close — one implementation, so
  // the agent's terminal cannot drift from the one a person opens.
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  const action = w.mod.sshTerminalAction(deps(w, parts));

  const result = (await action.run(CTX, {})) as { status: number; body: { opened: boolean } };

  assert.equal(w.tally.connected, 1);
  assert.equal(result.body.opened, true);
});

test('the terminal action refuses a deleted entity rather than opening an empty session', async () => {
  const parts: Parts = { source: KEY_SOURCE, entity: undefined };
  const w = await world(parts);
  const action = w.mod.sshTerminalAction(deps(w, parts));

  const result = (await action.run(CTX, {})) as { status: number; body: Record<string, unknown> };

  assert.equal((result.body.error as { code: string }).code, 'not_found');
  assert.equal(w.tally.connected, 0);
});

// --- agent forwarding is more than a flag in the argv (2026-08-26) -------------------------
//
// `-A` had reached the argv for months and forwarded nothing: the child never received
// SSH_AUTH_SOCK, because the extension publishes it to TERMINALS. The old test asserting the
// flag was present stayed green throughout, which is the whole lesson — see `sshProgram.ts`.

const FORWARDING = { ...ENTITY, agentForward: true } as unknown as EntityMetadata;

test('a forwarding connection hands the child the agent socket', async () => {
  const parts: Parts = { source: KEY_SOURCE, entity: FORWARDING };
  const w = await world(parts);
  w.agentSocket = '/run/creds/agent.sock';
  await exec(w, parts);

  assert.equal(w.runs.length, 1);
  assert.ok(w.runs[0].argv.includes('-A'), 'the flag is still sent');
  assert.equal(
    w.runs[0].env.SSH_AUTH_SOCK,
    '/run/creds/agent.sock',
    'and now something can answer it',
  );
});

test('a connection that did not ask for the agent is left exactly as it was', async () => {
  // Exporting SSH_AUTH_SOCK makes our agent the AUTHENTICATION agent for that connection —
  // a consent dialog for a key nobody chose. It travels with the checkbox, never alone.
  const parts: Parts = { source: KEY_SOURCE };
  const w = await world(parts);
  w.agentSocket = '/run/creds/agent.sock';
  await exec(w, parts);

  assert.equal(w.runs[0].env.SSH_AUTH_SOCK, undefined);
  assert.equal(w.runs[0].program, 'ssh');
});

test('forwarding asked for with no agent loaded is SAID, not passed over in silence', async () => {
  const parts: Parts = { source: KEY_SOURCE, entity: FORWARDING };
  const w = await world(parts);
  await exec(w, parts);

  assert.equal(w.runs[0].env.SSH_AUTH_SOCK, undefined);
  assert.ok(
    w.notes.some((n) => n.includes('nothing will be forwarded')),
    `the audit channel said: ${JSON.stringify(w.notes)}`,
  );
});

test('the terminal action does NOT report success when the window refused the connection', async () => {
  // It reported `opened: true` whatever happened, which was harmless while the only failure was an
  // entity with no host — and is not, now that a WSL window can refuse. An agent told a terminal is
  // open then waits at one that is not there.
  const parts: Parts = { source: KEY_SOURCE, connectRefuses: true };
  const w = await world(parts);
  const action = w.mod.sshTerminalAction(deps(w, parts));

  const result = (await action.run(CTX, {})) as { status: number; body: { opened?: boolean } };

  assert.equal(w.tally.connected, 1, 'it still went through the one connect path');
  assert.notEqual(result.status, 200);
  assert.notEqual(result.body.opened, true);
});

test('the terminal action refused because its client left is that request’s abandonment, not an internal failure (E4.S3)', async () => {
  // `connectEntity` answers false for a request whose start gate fired; reported as `internal`, the
  // journal carried a failure nobody caused and a reply was written to a socket nobody reads.
  const parts: Parts = { source: KEY_SOURCE, connectRefuses: true };
  const w = await world(parts);
  const request = new AbortController();
  request.abort();
  const action = w.mod.sshTerminalAction(deps(w, parts));

  await assert.rejects(action.run({ ...CTX, signal: request.signal }, {}), (error: Error) => error.name === 'AbortError');
});

// ---- rule B (`research/PLAN_agent_refusal_names_unlisted_entry_E2.md`): over the world of `secondEntryWorld.ts`, whose resolver is the product's --------

/** The journal lines of the two relations, written out. The line names the relation and the addressed entry, never the second entry. */
const TOLD = '(the agent was told only that another entry stopped the call)';
const KEY_NOTE = `prod: its linked key entry did not open for an automatic use (a PIN of its own, or a damaged value) ${TOLD}`;
const hopNote = (entry: string): string => `${entry}: a jump host in its chain has an address that is not a valid host ${TOLD}`;

async function inWorld(options: SecondOptions, scenario: (w: SecondWorld) => Promise<void>): Promise<void> {
  const w = await secondEntryWorld(options);
  try {
    await scenario(w);
  } finally {
    w.cleanup();
  }
}

/** The refusal an agent reads when a hidden second entry stopped the call: the whole answer, nothing hidden in it, nothing in the journal that names it. */
async function assertFixedRefusal(w: SecondWorld, door: 'exec' | 'run', entry: string, note: string): Promise<void> {
  const result = await w.call[door]();
  assert.deepEqual(result, { status: 409, body: errorBody('no_credential', SECOND_ENTRY_REFUSED(entry)) });
  assert.deepEqual(w.spawned, [], 'nothing was spawned');
  assert.deepEqual(w.notes, [note], 'exactly one line in the journal');
  assert.deepEqual(w.leaks(`${JSON.stringify(result.body)}\n${w.notes.join('\n')}`), [], 'no hidden name and no hidden id in the answer or in the journal');
}

test('B1 and B4: a hidden key entry that stops the call reads as the fixed sentence, with one journal line that names the relation', async () => {
  await inWorld({ key: 'plain' }, async (w) => assert.equal((await w.call.exec()).status, 200, 'the fixture: the same world with a key that works reaches ssh'));
  await inWorld({ key: 'sealed' }, (w) => assertFixedRefusal(w, 'exec', 'prod', KEY_NOTE));
});

test('B2 and B4: a hidden jump host with an unsafe address at depth 1, 2 or 3 reads the same sentence, with the line of the relation jump host', async () => {
  for (const unsafeAt of [1, 2, 3]) {
    await inWorld({ hops: 3, unsafeAt }, async (w) => {
      await assertFixedRefusal(w, 'exec', 'prod', hopNote('prod'));
      assert.deepEqual(w.materialised.map((file) => fs.existsSync(file)), [false], 'the key of e1 had been written, and is gone');
    });
  }
});

test('X5: a chain of four hidden hops is inside the cap, and an unsafe hop at depth 4 reads the fixed sentence on exec and on the linked run', async () => {
  await inWorld({ hops: 4, unsafeAt: 4 }, (w) => assertFixedRefusal(w, 'exec', 'prod', hopNote('prod')));
  await inWorld({ hops: 4, unsafeAt: 4 }, (w) => assertFixedRefusal(w, 'run', 'deploy', hopNote('deploy')));
});

test('X5 control: a VISIBLE unsafe hop on the linked run keeps the resolver\'s sentence, with no note (pins the mayView binding of the linked road)', async () => {
  await inWorld({ hops: 1, unsafeAt: 1, visibleHops: [1] }, async (w) => {
    const chain = resolveJumpChain(w.storage.getNode(ACCOUNT, 'e1')?.details as never, (id) => w.storage.getNode(ACCOUNT, id)?.details);
    assert.ok(!chain.ok, 'the fixture: the real resolver refuses this chain');
    const said = chain.ok ? '' : chain.reason;
    assert.equal(said, `The jump host "${w.names.hop(1)}" cannot be used: its address is not a valid host.`);
    assert.deepEqual(await w.call.run(), { status: 409, body: errorBody('no_credential', said) });
    assert.deepEqual(w.notes, [], '0 new notes');
  });
});

test('X6: a chain of five hops is refused by the depth cap with the sentence that names the STARTING entry, and no second entry', async () => {
  const cap = errorBody('no_credential', '"prod" chains more than 4 jump hosts, which is a mistake rather than a network.');
  for (const door of ['exec', 'run'] as const) {
    await inWorld({ hops: 5 }, async (w) => {
      const result = await w.call[door]();
      assert.deepEqual(result, { status: 409, body: cap }, door);
      assert.deepEqual(w.notes, [], 'a refusal that names the addressed entry writes no line');
      assert.deepEqual(w.leaks(JSON.stringify(result.body)), []);
    });
  }
});

/** The error that a call rejects with, when it does not answer. */
const rejectedWith = (w: SecondWorld, door: 'exec' | 'run'): Promise<string | undefined> => w.call[door]().then(() => undefined, (error: Error) => error.message);

test('X4 (a): a hidden key entry and a journal that throws — the refusal is outside the try, so the call rejects with the error of the journal', async () => {
  await inWorld({ key: 'sealed', noteThrows: true }, async (w) => assert.equal(await rejectedWith(w, 'exec'), JOURNAL_BROKEN));
});

test('X4 (b): a hidden unsafe hop on exec and a journal that throws — the catch answers 500, with no second line and no hidden name', async () => {
  await inWorld({ hops: 3, unsafeAt: 1, noteThrows: true }, async (w) => {
    const result = await w.call.exec();
    assert.deepEqual(result, { status: 500, body: errorBody('internal', `Could not run ssh: ${JOURNAL_BROKEN}`) });
    assert.deepEqual(w.leaks(JSON.stringify(result.body)), []);
  });
});

test('X4 (c): a hidden unsafe hop in a linked run and a journal that throws — the call rejects with the error of the journal', async () => {
  await inWorld({ hops: 3, unsafeAt: 1, noteThrows: true }, async (w) => assert.equal(await rejectedWith(w, 'run'), JOURNAL_BROKEN));
});
