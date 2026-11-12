import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { callKeyName } from '../materializedKeys';
import { locked, memoryStorage, seedEntry } from './pinWorld';
import type { EntityMetadata } from '../types';
import type { OverSshCall, UseActionContext } from '../useActions';
import type { SshUseDeps } from '../sshUseActions';
import { buildSshExecArgv } from '../sshExecCommand';
import { resolveJumpChain } from '../sshOptions';
import { E3_INHERITED_DROP, NO_AGENT_TO_FORWARD, envWithout, sshSpawnLaunch } from '../sshProgram';
import { pinRefusalFor } from '../pinGate';
import { clampExecTimeout } from '../brokerProtocol';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { sshNode } from './sshRoadWorld';
import { HOST_SOCKET, OUR_SOCKET } from './fakePaths';

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

/**
 * `execOverSsh` (E3.S2, E3-D9, stories §S2.2): the body `ssh:exec` has always had — credential, argv from `buildSshExecArgv`, the spawn,
 * the key file removed — taken out so the agent's run of a linked Terminal entry reaches the SAME code with its own command. Only the
 * I/O edges are substituted (the same ones `sshUseActions.test.ts` substitutes); `buildSshExecArgv`, `resolveJumpChain` and `sshSpawnLaunch`
 * are the real ones, so an assertion about the argv is an assertion about what would be executed.
 */

type Actions = typeof import('../sshUseActions');

interface Run {
  readonly argv: string[];
  readonly program?: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  /** Whether the key file was on disk while the child ran: the cleanup is observed by asking the filesystem. */
  readonly keyOnDisk: boolean;
}

interface World {
  readonly mod: Actions;
  readonly deps: SshUseDeps;
  readonly runs: Run[];
  readonly materialised: string[];
  readonly notes: string[];
  readonly slots: { taken: number };
  /** The path `materializeKnownHosts` answered: read back, never guessed. */
  readonly knownHosts: string;
  /** How many times `deps.agentSocket()` was read. */
  readonly socketReads: () => number;
}

/** The SSH entry of this file: `sshNode` is built against the real link validator at load (testing.md), so no cast stands in for the type. */
function sshEntity(extra: Partial<EntityMetadata> = {}): EntityMetadata {
  const details = sshNode('s1', extra).details;
  assert.ok(details !== undefined, 'sshNode() always carries details');
  return details;
}

const SSH = sshEntity();

const KEY = { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE KEY BODY' };
const CTX: UseActionContext = { accountId: 'a1', entityId: 't1', entityName: 'deploy', signal: new AbortController().signal };

interface Parts {
  readonly source: Record<string, unknown>;
  readonly runFails?: boolean;
  readonly agentSocket?: string;
  /** The answers of the first, second, … read of `deps.agentSocket()`; a read past the list answers nothing (an agent that went away between two reads). */
  readonly agentSocketReads?: readonly (string | undefined)[];
}

async function world(parts: Parts, seeded: readonly EntityMetadata[] = []): Promise<World> {
  const storageDir = ownedDir(scope, 'over');
  const runs: Run[] = [];
  const materialised: string[] = [];
  const notes: string[] = [];
  const knownHosts = path.join(storageDir, 'known_hosts-s1');
  const stub = { window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined), showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined) } };
  const writeKey = (dir: string, id: string, content: string): string => {
    const keyPath = path.join(dir, `${id}.key`);
    fs.writeFileSync(keyPath, content, { mode: 0o600 });
    materialised.push(keyPath);
    return keyPath;
  };
  const mod = loadWithVscode<Actions>('../sshUseActions', stub, {
    './sshCredential': { resolveSshCredential: (): Promise<unknown> => Promise.resolve(parts.source) },
    './keyInstaller': {
      materializePrivateKey: writeKey,
      materializeCallKey: (dir: string, content: string): string => writeKey(dir, callKeyName(), content),
      writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
    },
    './hostKeyTrust': { materializeKnownHosts: (): string => knownHosts },
    './sshExecRunner': {
      runSshExec: (argv: string[], o: { env: NodeJS.ProcessEnv; timeoutMs: number; program?: string }): Promise<unknown> => {
        runs.push({ argv, program: o.program, env: o.env, timeoutMs: o.timeoutMs, keyOnDisk: materialised.some((file) => fs.existsSync(file)) });
        return parts.runFails === true ? Promise.reject(new Error('ssh is not installed')) : Promise.resolve({ exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false });
      },
    },
    './sshConnect': { connectEntity: (): Promise<boolean> => Promise.resolve(true) },
    './terminalManager': { describeSshTarget: (e: { host?: string }): string | undefined => e.host },
    './sshAskpass': { askpassEnv: (_s: string, password: string): Record<string, string> => ({ SSH_ASKPASS_REQUIRE: 'force', CREDS_PASSWORD: password }) },
  });
  const storage = memoryStorage(stub);
  for (const entity of seeded) {
    await seedEntry(storage, entity, {});
  }
  const slots = { taken: 0 };
  let socketReads = 0;
  const deps: SshUseDeps = {
    storage,
    storageDir,
    signal: new AbortController().signal,
    acquireExecSlot: (): (() => void) => {
      slots.taken += 1;
      return (): void => {
        slots.taken -= 1;
      };
    },
    note: (message: string): void => {
      notes.push(message);
    },
    agentSocket: (): string | undefined => {
      socketReads += 1;
      return parts.agentSocketReads === undefined ? parts.agentSocket : parts.agentSocketReads[socketReads - 1];
    },
  };
  return { mod, deps, runs, materialised, notes, slots, knownHosts, socketReads: () => socketReads };
}

function callOf(over: Partial<OverSshCall> = {}): OverSshCall {
  return { ssh: SSH, jump: () => ({ ok: true, value: undefined }), remoteCommand: 'echo linked', timeoutMs: clampExecTimeout(undefined), ownAgentOnly: false, ...over };
}

type Answer = { status: number; body: Record<string, unknown> };

test('the_argv_is_buildSshExecArgv_with_the_snapshots_jump_and_pin', async () => {
  const w = await world({ source: KEY });
  const jumped = callOf({ jump: () => ({ ok: true, value: 'hop@jump.example' }), ownAgentOnly: true });

  const answer = (await w.mod.execOverSsh(w.deps)(CTX, jumped)) as Answer;

  assert.equal(w.runs.length, 1, `the spawn recorder was called ${w.runs.length} times; the answer was ${JSON.stringify(answer.body)}`);
  assert.equal(answer.status, 200);
  assert.equal(w.materialised.length, 1, 'the stored key was written once, for this call');
  const expected = buildSshExecArgv(SSH, w.materialised[0], 'echo linked', 'key', { jump: 'hop@jump.example', knownHostsFile: w.knownHosts, bridged: false, ownAgent: false });
  assert.deepEqual(w.runs[0].argv, expected);
  assert.equal(w.runs[0].program, sshSpawnLaunch(SSH, undefined, process.platform).program);
  assert.equal(w.runs[0].timeoutMs, clampExecTimeout(undefined));
  assert.ok(w.runs[0].argv.includes('hop@jump.example'), 'and the jump really is in it');
  assert.ok(w.runs[0].argv.includes(w.knownHosts) || w.runs[0].argv.some((arg) => arg.includes(w.knownHosts)), 'and so is the pin file');
});

test('the_written_key_is_removed_after_the_call_and_after_a_throw', async () => {
  const fine = await world({ source: KEY });
  const answer = (await fine.mod.execOverSsh(fine.deps)(CTX, callOf())) as Answer;
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(fine.runs[0]?.keyOnDisk, true, 'the key file existed while the child ran');
  assert.equal(fs.existsSync(fine.materialised[0]), false, 'and is gone after the call');

  const broken = await world({ source: KEY, runFails: true });
  const failed = (await broken.mod.execOverSsh(broken.deps)(CTX, callOf())) as Answer;
  assert.equal((failed.body.error as { code: string }).code, 'internal');
  assert.match((failed.body.error as { message: string }).message, /^Could not run ssh: /);
  assert.equal(broken.runs.length, 1, 'ssh was started');
  assert.equal(fs.existsSync(broken.materialised[0]), false, 'the key is gone after a throw too');
});

test('a_password_entry_uses_askpass_and_puts_no_password_in_argv', async () => {
  const w = await world({ source: { kind: 'password', password: 'hunter2-hunter2' } });

  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;

  assert.equal(w.runs.length, 1, JSON.stringify(answer.body));
  assert.ok(w.runs[0].argv.includes('NumberOfPasswordPrompts=1'), w.runs[0].argv.join(' '));
  assert.equal(w.runs[0].env.SSH_ASKPASS_REQUIRE, 'force');
  assert.equal(w.runs[0].env.CREDS_PASSWORD, 'hunter2-hunter2');
  assert.ok(!w.runs[0].argv.join(' ').includes('hunter2'), 'no argv element holds the password');
  assert.ok(!JSON.stringify(answer).includes('hunter2'), 'and the answer does not');
});

test('a_pin_locked_password_is_refused_and_nothing_is_spawned', async () => {
  const sealed = await locked('hunter2-hunter2');
  const w = await world({ source: { kind: 'password', password: sealed } });

  const answer = (await w.mod.execOverSsh(w.deps)(CTX, callOf())) as Answer;

  assert.equal((answer.body.error as { code: string }).code, 'no_credential');
  assert.equal((answer.body.error as { message: string }).message, pinRefusalFor(SSH.name));
  assert.deepEqual(w.runs, [], 'nothing was spawned');
  assert.deepEqual(w.materialised, [], 'and nothing was written');
});

test('a_chain_that_does_not_resolve_is_refused_after_the_credential_and_the_key_is_removed', async () => {
  const w = await world({ source: KEY });
  const looping = callOf({ jump: () => ({ ok: false, reason: 'The jump hosts of "prod box" lead in a circle.' }) });

  const answer = (await w.mod.execOverSsh(w.deps)(CTX, looping)) as Answer;

  assert.equal((answer.body.error as { code: string }).code, 'no_credential');
  assert.equal((answer.body.error as { message: string }).message, 'The jump hosts of "prod box" lead in a circle.');
  assert.deepEqual(w.runs, []);
  assert.equal(w.materialised.length, 1, 'the credential was resolved first (ssh:exec order)');
  assert.equal(fs.existsSync(w.materialised[0]), false, 'and its key file is gone');
});

test('ssh_exec_still_resolves_its_chain_after_the_credential', async () => {
  // A guard (green before and after): `ssh:exec` hands `execOverSsh` a THUNK, so a looping chain on an entry with no credential is
  // refused with the CREDENTIAL's sentence, as it was when the body lived in `sshExecAction`.
  const looping = sshEntity({ id: 'e1', name: 'prod', jumpHostEntityId: 'e1' });
  assert.equal(resolveJumpChain(looping, () => looping).ok, false, 'the fixture is a loop');
  const w = await world({ source: { kind: 'none' } }, [looping]);

  const result = (await w.mod.sshExecAction(w.deps).run({ ...CTX, entityId: 'e1', entityName: 'prod' }, { command: 'uptime' })) as Answer;

  assert.equal((result.body.error as { code: string }).code, 'no_credential');
  assert.equal((result.body.error as { message: string }).message, '"prod" has no stored password or key any more.');
  assert.deepEqual(w.runs, []);
  assert.equal(w.slots.taken, 0, 'the slot came back');
});

// ---- E3.4 F-S2: -T and the child's environment on the agent's linked run (parent D16, D17; spec §18) ------------------------------------


/** What the linked run sends: the call its action makes (`ownAgentOnly` and `noTty`), over a key entry. */
const linkedCall = (over: Partial<OverSshCall> = {}): OverSshCall => callOf({ ownAgentOnly: true, noTty: true, ...over });

/** Run `body` with the host's agent socket and a `CREDS_REF_` name in `process.env`, and put both back (a test must leave the environment as it found it). */
async function withHostEnv(body: () => Promise<void>): Promise<void> {
  const saved = { sock: process.env.SSH_AUTH_SOCK, ref: process.env.CREDS_REF_7 };
  process.env.SSH_AUTH_SOCK = HOST_SOCKET;
  process.env.CREDS_REF_7 = 'seeded';
  try {
    await body();
  } finally {
    for (const [name, value] of [['SSH_AUTH_SOCK', saved.sock], ['CREDS_REF_7', saved.ref]] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test('the_linked_run_says_no_tty_and_ssh_exec_does_not', async () => {
  const linked = await world({ source: KEY });
  await linked.mod.execOverSsh(linked.deps)(CTX, linkedCall());

  assert.equal(linked.runs[0].argv[0], '-T', linked.runs[0].argv.join(' '));
  assert.equal(linked.runs[0].argv.filter((arg) => arg === '-T').length, 1, 'exactly one -T');
  const without = buildSshExecArgv(SSH, linked.materialised[0], 'echo linked', 'key', { jump: undefined, knownHostsFile: linked.knownHosts, bridged: false, ownAgent: false });
  assert.deepEqual(linked.runs[0].argv.slice(1), without, 'the option adds one word and moves nothing: the rest is the same call without noTty');

  // The GUARD half: ssh:exec (no noTty) keeps today's argv. Green before and after the build.
  const exec = await world({ source: KEY }, [sshEntity({ id: 'e1', name: 'prod' })]);
  await exec.mod.sshExecAction(exec.deps).run({ ...CTX, entityId: 'e1', entityName: 'prod' }, { command: 'uptime' });
  assert.equal(exec.runs.length, 1);
  assert.ok(!exec.runs[0].argv.includes('-T'), exec.runs[0].argv.join(' '));
  assert.equal(exec.runs[0].argv[0], '-o');
});

test('the_linked_run_never_sends_dash_a_without_our_agent_and_ssh_exec_is_not_changed', async () => {
  const forwarding = sshEntity({ agentForward: true });

  const noAgent = await world({ source: KEY });
  await noAgent.mod.execOverSsh(noAgent.deps)(CTX, linkedCall({ ssh: forwarding }));
  assert.ok(!noAgent.runs[0].argv.includes('-A'), noAgent.runs[0].argv.join(' '));
  assert.ok(noAgent.runs[0].argv.includes('ForwardAgent=no'), noAgent.runs[0].argv.join(' '));
  assert.ok(noAgent.notes.some((note) => note.includes(NO_AGENT_TO_FORWARD)), noAgent.notes.join(' | '));

  const withAgent = await world({ source: KEY, agentSocket: OUR_SOCKET });
  await withAgent.mod.execOverSsh(withAgent.deps)(CTX, linkedCall({ ssh: forwarding }));
  assert.ok(withAgent.runs[0].argv.includes('-A'), withAgent.runs[0].argv.join(' '));
  assert.equal(withAgent.runs[0].env.SSH_AUTH_SOCK, OUR_SOCKET);

  // The guard: ssh:exec's own word (`ownAgentOnly: false`) keeps `-A` with no socket of ours, as the shipped road does.
  const shipped = await world({ source: KEY });
  await shipped.mod.execOverSsh(shipped.deps)(CTX, callOf({ ssh: forwarding, ownAgentOnly: false }));
  assert.ok(shipped.runs[0].argv.includes('-A'), shipped.runs[0].argv.join(' '));
  assert.ok(!shipped.runs[0].argv.includes('ForwardAgent=no'));
});

test('the_hosts_agent_socket_does_not_reach_the_ssh_of_e3s_two_roads', async () => {
  await withHostEnv(async () => {
    const forwarding = sshEntity({ agentForward: true });

    const bare = await world({ source: KEY });
    await bare.mod.execOverSsh(bare.deps)(CTX, linkedCall());
    assert.ok(!('SSH_AUTH_SOCK' in bare.runs[0].env), 'the host socket was removed');
    assert.deepEqual(Object.keys(bare.runs[0].env).filter((name) => name.toUpperCase().startsWith('CREDS_REF_')), [], 'and every inherited CREDS_REF_ name');
    assert.equal(bare.runs[0].env.PATH, process.env.PATH, 'ordinary variables are inherited (the positive control)');
    assert.deepEqual(envWithout(process.env, E3_INHERITED_DROP, process.platform), Object.fromEntries(Object.entries(bare.runs[0].env)), 'the child has the inherited environment less the drop, and adds nothing for a key entry');

    const served = await world({ source: KEY, agentSocket: OUR_SOCKET });
    await served.mod.execOverSsh(served.deps)(CTX, linkedCall({ ssh: forwarding }));
    assert.equal(served.runs[0].env.SSH_AUTH_SOCK, OUR_SOCKET, 'when our agent serves the run its socket is laid on top');

    const quiet = await world({ source: KEY, agentSocket: OUR_SOCKET });
    await quiet.mod.execOverSsh(quiet.deps)(CTX, linkedCall());
    assert.ok(!('SSH_AUTH_SOCK' in quiet.runs[0].env), 'an entry that does not forward gets no socket');

    // The GUARD: ssh:exec keeps the host's socket. Green before and after.
    const exec = await world({ source: KEY }, [sshEntity({ id: 'e1', name: 'prod' })]);
    await exec.mod.sshExecAction(exec.deps).run({ ...CTX, entityId: 'e1', entityName: 'prod' }, { command: 'uptime' });
    assert.equal(exec.runs[0].env.SSH_AUTH_SOCK, HOST_SOCKET);
  });
});

test('one_call_reads_the_agent_socket_once_so_the_argv_and_the_environment_agree', async () => {
  const forwarding = sshEntity({ agentForward: true });

  // The agent answers on the first read and has gone on the second: the argv said -A, the child's environment had no socket.
  const goesAway = await world({ source: KEY, agentSocketReads: [OUR_SOCKET, undefined] });
  await goesAway.mod.execOverSsh(goesAway.deps)(CTX, linkedCall({ ssh: forwarding }));
  assert.ok(goesAway.runs[0].argv.includes('-A'), goesAway.runs[0].argv.join(' '));
  assert.equal(goesAway.runs[0].env.SSH_AUTH_SOCK, OUR_SOCKET, '-A and the socket the child forwards from are the same read');
  assert.equal(goesAway.socketReads(), 1, 'the socket is read once per call');

  // The other way: no agent on the first read, one on the second: no -A, and no socket in the environment either.
  const comesUp = await world({ source: KEY, agentSocketReads: [undefined, OUR_SOCKET] });
  await comesUp.mod.execOverSsh(comesUp.deps)(CTX, linkedCall({ ssh: forwarding }));
  assert.ok(!comesUp.runs[0].argv.includes('-A'), comesUp.runs[0].argv.join(' '));
  assert.ok(comesUp.runs[0].argv.includes('ForwardAgent=no'), comesUp.runs[0].argv.join(' '));
  assert.ok(!('SSH_AUTH_SOCK' in comesUp.runs[0].env), 'no socket in the environment when the argv forwards nothing');
});

test('an_empty_agent_socket_is_no_agent_for_the_argv_as_it_is_for_the_environment', async () => {
  const empty = await world({ source: KEY, agentSocket: '' });
  await empty.mod.execOverSsh(empty.deps)(CTX, linkedCall({ ssh: sshEntity({ agentForward: true }) }));

  assert.ok(!empty.runs[0].argv.includes('-A'), empty.runs[0].argv.join(' '));
  assert.ok(empty.runs[0].argv.includes('ForwardAgent=no'), empty.runs[0].argv.join(' '));
  assert.ok(!('SSH_AUTH_SOCK' in empty.runs[0].env), 'an empty socket is not laid in the environment');
  assert.ok(empty.notes.some((note) => note.includes(NO_AGENT_TO_FORWARD)), empty.notes.join(' | '));
});
