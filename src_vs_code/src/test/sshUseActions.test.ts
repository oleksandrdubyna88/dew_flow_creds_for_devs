import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

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

interface World {
  mod: Actions;
  storageDir: string;
  /** Every key file this run materialised, in order. */
  materialised: string[];
  /** The argv and env `runSshExec` was called with. */
  runs: { argv: string[]; env: NodeJS.ProcessEnv; timeoutMs: number }[];
  notes: string[];
  warnings: string[];
  slotsHeld: number;
  connected: number;
}

interface Parts {
  source: Record<string, unknown>;
  entity?: EntityMetadata | undefined;
  noSlot?: boolean;
  runFails?: boolean;
}

const ENTITY = {
  id: 'e1',
  name: 'prod',
  kind: 'ssh',
  host: 'prod.corp.com',
  user: 'deploy',
  isSshEnabled: true,
} as unknown as EntityMetadata;

function world(parts: Parts): World {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-use-'));
  const w: World = {
    mod: undefined as never,
    storageDir,
    materialised: [],
    runs: [],
    notes: [],
    warnings: [],
    slotsHeld: 0,
    connected: 0,
  };
  w.mod = loadWithVscode<Actions>(
    '../sshUseActions',
    {
      window: {
        showWarningMessage: (m: string): Promise<undefined> => {
          w.warnings.push(m);
          return Promise.resolve(undefined);
        },
        showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
      },
    },
    {
      './sshCredential': {
        resolveSshCredential: (): Promise<unknown> => Promise.resolve(parts.source),
      },
      './keyInstaller': {
        // A REAL file, so the `finally` cleanup is observed by asking the filesystem rather
        // than by counting calls to a stub.
        materializePrivateKey: (dir: string, id: string, content: string): string => {
          const keyPath = path.join(dir, `${id}.key`);
          fs.writeFileSync(keyPath, content, { mode: 0o600 });
          w.materialised.push(keyPath);
          return keyPath;
        },
        writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
      },
      './hostKeyTrust': { materializeKnownHosts: (): string | undefined => undefined },
      './sshExecRunner': {
        runSshExec: (argv: string[], o: { env: NodeJS.ProcessEnv; timeoutMs: number }): Promise<unknown> => {
          w.runs.push({ argv, env: o.env, timeoutMs: o.timeoutMs });
          return parts.runFails === true
            ? Promise.reject(new Error('ssh is not installed'))
            : Promise.resolve({ exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false });
        },
      },
      './sshConnect': {
        connectEntity: (): Promise<void> => {
          w.connected += 1;
          return Promise.resolve();
        },
      },
      './terminalManager': { describeSshTarget: (e: { host?: string }): string | undefined => e.host },
      './sshAskpass': {
        askpassEnv: (_s: string, password: string): Record<string, string> => ({
          SSH_ASKPASS_REQUIRE: 'force',
          CREDS_PASSWORD: password,
        }),
      },
    },
  );
  return w;
}

function deps(w: World, parts: Parts): unknown {
  const entity = 'entity' in parts ? parts.entity : ENTITY;
  return {
    storage: { getNode: (): unknown => (entity === undefined ? undefined : { details: entity }) },
    storageDir: w.storageDir,
    signal: new AbortController().signal,
    acquireExecSlot: (): (() => void) | undefined => {
      if (parts.noSlot === true) {
        return undefined;
      }
      w.slotsHeld += 1;
      return (): void => {
        w.slotsHeld -= 1;
      };
    },
    note: (m: string): void => {
      w.notes.push(m);
    },
  };
}

const CTX = { accountId: 'a1', entityId: 'e1', entityName: 'prod' } as never;
const cleanup = (w: World): void => fs.rmSync(w.storageDir, { recursive: true, force: true });

const KEY_SOURCE = { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE KEY BODY' };

/** Run the exec action once and hand back its result. */
async function exec(w: World, parts: Parts, command = 'uptime'): Promise<{ status: number; body: Record<string, unknown> }> {
  const action = w.mod.sshExecAction(deps(w, parts) as never);
  return (await action.run(CTX, { command })) as { status: number; body: Record<string, unknown> };
}

test('an entity deleted since the grant was minted is not_found', async () => {
  // The entity is re-read on every call, never snapshotted at grant time.
  const parts: Parts = { source: KEY_SOURCE, entity: undefined };
  const w = world(parts);
  try {
    const result = await exec(w, parts);

    assert.equal(result.status, 404);
    assert.equal((result.body.error as { code: string }).code, 'not_found');
  } finally {
    cleanup(w);
  }
});

test('an entity whose HOST was cleared is refused BEFORE any key is written', async () => {
  // The recorded defect: writing key material only to then refuse the call left a decrypted
  // key on disk until the next activate.
  const parts: Parts = {
    source: KEY_SOURCE,
    entity: { ...ENTITY, host: undefined } as unknown as EntityMetadata,
  };
  const w = world(parts);
  try {
    const result = await exec(w, parts);

    assert.equal((result.body.error as { code: string }).code, 'no_credential');
    assert.deepEqual(w.materialised, [], 'nothing was decrypted to disk');
  } finally {
    cleanup(w);
  }
});

test('a runaway agent is refused a slot rather than allowed to pile up SSH processes', async () => {
  const parts: Parts = { source: KEY_SOURCE, noSlot: true };
  const w = world(parts);
  try {
    const result = await exec(w, parts);

    assert.equal((result.body.error as { code: string }).code, 'too_many_requests');
    assert.deepEqual(w.runs, [], 'and nothing ran');
  } finally {
    cleanup(w);
  }
});

test('an entity with no credential left is refused, and the slot is given back', async () => {
  // A slot leaked on a refusal would let a handful of dead grants exhaust the pool.
  const parts: Parts = { source: { kind: 'none' } };
  const w = world(parts);
  try {
    const result = await exec(w, parts);

    assert.equal((result.body.error as { code: string }).code, 'no_credential');
    assert.equal(w.slotsHeld, 0);
  } finally {
    cleanup(w);
  }
});

test('a stored key is written, used, and DELETED before the call returns', async () => {
  const parts: Parts = { source: KEY_SOURCE };
  const w = world(parts);
  try {
    await exec(w, parts);

    assert.equal(w.materialised.length, 1);
    assert.equal(fs.existsSync(w.materialised[0]), false, 'the decrypted key is gone');
    assert.ok(w.runs[0].argv.includes(w.materialised[0]), 'and it really was the key ssh was given');
  } finally {
    cleanup(w);
  }
});

test('the key is deleted even when ssh itself FAILS', async () => {
  // The `finally` is what makes this true; a delete on the success path only would leave a
  // decrypted key behind on exactly the runs someone is investigating.
  const parts: Parts = { source: KEY_SOURCE, runFails: true };
  const w = world(parts);
  try {
    const result = await exec(w, parts);

    assert.equal((result.body.error as { code: string }).code, 'internal');
    assert.equal(fs.existsSync(w.materialised[0]), false);
    assert.equal(w.slotsHeld, 0, 'and the slot came back too');
  } finally {
    cleanup(w);
  }
});

test('two calls get two DIFFERENT key files — one name would break both', async () => {
  // The recorded defect: a shared file name meant the first call to finish pulled the key out
  // from under every other still authenticating with it, human terminals included.
  const parts: Parts = { source: KEY_SOURCE };
  const w = world(parts);
  try {
    await exec(w, parts);
    await exec(w, parts);

    assert.equal(w.materialised.length, 2);
    assert.notEqual(w.materialised[0], w.materialised[1]);
  } finally {
    cleanup(w);
  }
});

test('a password goes into the spawned process ENVIRONMENT, never the argv', async () => {
  const parts: Parts = { source: { kind: 'password', password: 'hunter2' } };
  const w = world(parts);
  try {
    await exec(w, parts);

    assert.equal(w.runs[0].env.CREDS_PASSWORD, 'hunter2');
    assert.ok(!w.runs[0].argv.join(' ').includes('hunter2'), w.runs[0].argv.join(' '));
  } finally {
    cleanup(w);
  }
});

test('the spawned environment carries PATH — spawn REPLACES it rather than merging', async () => {
  // Without this, `ssh` is unresolvable and known_hosts is not found, and the failure looks
  // like a broken credential rather than a missing variable.
  const parts: Parts = { source: { kind: 'password', password: 'hunter2' } };
  const w = world(parts);
  try {
    await exec(w, parts);

    const env = w.runs[0].env;
    assert.ok(env.PATH !== undefined || env.Path !== undefined, Object.keys(env).slice(0, 10).join());
  } finally {
    cleanup(w);
  }
});

test('the secret never appears in what the action RETURNS', async () => {
  const parts: Parts = { source: { kind: 'password', password: 'hunter2' } };
  const w = world(parts);
  try {
    const result = await exec(w, parts);

    assert.ok(!JSON.stringify(result).includes('hunter2'), JSON.stringify(result));
  } finally {
    cleanup(w);
  }
});

test('a credential warning reaches the AUDIT as well as the screen', async () => {
  // The agent path used to drop it — the one case where an entity authenticates with
  // different key material than its configuration names and nobody is told.
  const parts: Parts = { source: { ...KEY_SOURCE, warning: 'the referenced key entity is gone' } };
  const w = world(parts);
  try {
    await exec(w, parts);

    assert.ok(w.notes.some((n) => /key entity is gone/.test(n)), w.notes.join(' | '));
    assert.ok(w.warnings.some((n) => /key entity is gone/.test(n)));
  } finally {
    cleanup(w);
  }
});

test('a command the validator rejects never reaches run()', async () => {
  const parts: Parts = { source: KEY_SOURCE };
  const w = world(parts);
  try {
    const action = w.mod.sshExecAction(deps(w, parts) as never);

    assert.equal(action.validate({ command: '' }).ok, false, 'an empty command is not a command');
    assert.equal(action.validate({ command: 'uptime' }).ok, true);
  } finally {
    cleanup(w);
  }
});

test('the outcome an audit line shows names the exit code, and says when it timed out', async () => {
  const parts: Parts = { source: KEY_SOURCE };
  const w = world(parts);
  try {
    const action = w.mod.sshExecAction(deps(w, parts) as never);

    assert.match(action.describeOutcome({ status: 200, body: { exitCode: 7 } } as never), /exit 7/);
    assert.match(action.describeOutcome({ status: 200, body: { timedOut: true } } as never), /timed out/);
  } finally {
    cleanup(w);
  }
});

test('the terminal action goes through the human Connect path, verbatim', async () => {
  // Same terminal name, same askpass env, same key cleanup on close — one implementation, so
  // the agent's terminal cannot drift from the one a person opens.
  const parts: Parts = { source: KEY_SOURCE };
  const w = world(parts);
  try {
    const action = w.mod.sshTerminalAction(deps(w, parts) as never);

    const result = (await action.run(CTX, {})) as { status: number; body: { opened: boolean } };

    assert.equal(w.connected, 1);
    assert.equal(result.body.opened, true);
  } finally {
    cleanup(w);
  }
});

test('the terminal action refuses a deleted entity rather than opening an empty session', async () => {
  const parts: Parts = { source: KEY_SOURCE, entity: undefined };
  const w = world(parts);
  try {
    const action = w.mod.sshTerminalAction(deps(w, parts) as never);

    const result = (await action.run(CTX, {})) as { status: number; body: Record<string, unknown> };

    assert.equal((result.body.error as { code: string }).code, 'not_found');
    assert.equal(w.connected, 0);
  } finally {
    cleanup(w);
  }
});
