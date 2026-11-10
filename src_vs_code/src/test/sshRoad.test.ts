import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import type { EntityMetadata } from '../types';
import type { SpawnLaunch, SshRoad, SshRoadDeps } from '../sshRoad';
import type { ReadySsh, RefusedSsh } from '../sshSession';
import { E3_INHERITED_DROP, NO_AGENT_TO_FORWARD } from '../sshProgram';
import { OPTIONS, WSL_NO_RELAY, entity, storage, world } from './sshConnectWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * The road host of the SSH roads (E2.S1 of `PLAN_terminal_command_over_ssh.md`, `sshRoad.ts`): how a road prepares, how it
 * says a refusal, and how ONE terminal owns ONE session (E2-D4, lead amendment A1). The seam under it is
 * `sshSession.test.ts`'s; here `prepareSshSession` is a recorder.
 */

type Road = typeof import('../sshRoad');

const REMOTE_WINDOW = { marker: 'the window of this click' };
const SSH = { id: 's1', name: 'prod box', isSshEnabled: true, host: 'prod.example' } as EntityMetadata;

interface Listeners {
  readonly list: ((closed: unknown) => void)[];
}

/** The `vscode` the owner sees: `onDidCloseTerminal` with a listener list a test can count and fire. */
function closeEvents(): { listeners: Listeners; vscode: Record<string, unknown>; fire(terminal: unknown): void } {
  const list: ((closed: unknown) => void)[] = [];
  const onDidCloseTerminal = (listener: (closed: unknown) => void): { dispose(): void } => {
    list.push(listener);
    return {
      dispose: () => {
        const at = list.indexOf(listener);
        if (at >= 0) {
          list.splice(at, 1);
        }
      },
    };
  };
  return { listeners: { list }, vscode: { window: { onDidCloseTerminal } }, fire: (terminal) => [...list].forEach((l) => l(terminal)) };
}

function loadRoad(vscode: Record<string, unknown>, mocks: Record<string, unknown> = {}): Road {
  return loadWithVscode<Road>('../sshRoad', vscode, { './sshSession': {}, './sshConnect': {}, './remoteConnectHost': {}, ...mocks });
}

/** The deps of a road over the shared typed storage (these tests never read it): a typed partial, so a field added to `SshRoadDeps` is a compile error here and not a cast. */
function roadDeps(over: Partial<SshRoadDeps> = {}): SshRoadDeps {
  return { storage, storageDir: '/storage', ...over };
}

/** A ready whose `cleanup()` is counted. */
function counted(): { ready: ReadySsh; cleaned(): number } {
  let n = 0;
  return { ready: { cleanup: () => void (n += 1) } as unknown as ReadySsh, cleaned: () => n };
}

const terminal = (): { exitStatus: undefined } => ({ exitStatus: undefined });

// H1
test('the_road_prepares_isolated_with_this_windows_route_and_the_agents_answer', async () => {
  const calls: unknown[][] = [];
  const remoteArgs: unknown[][] = [];
  const mocks = {
    './sshSession': { prepareSshSession: (...a: unknown[]) => (calls.push(a), Promise.resolve({ kind: 'stopped', why: 'no-host' })), windowOf: (o: { remote?: unknown }) => o.remote },
    './remoteConnectHost': { remoteWindowDeps: (...a: unknown[]) => (remoteArgs.push(a), REMOTE_WINDOW), remedyRunner: (target: unknown) => ({ runner: target }) },
  };
  const relays = { serving: () => undefined };
  const other = { ...SSH, id: 's2' } as EntityMetadata;
  const deps = { storage: { tag: 'storage' }, storageDir: '/dir', relays, servesKeyForEntity: (e: EntityMetadata) => e === SSH } as never;
  const road = loadRoad(closeEvents().vscode, mocks).sshRoadOf(deps);

  await road.prepare('a1', SSH);
  await road.prepare('a1', other);

  assert.equal(calls.length, 2);
  const [accountId, ssh, options] = calls[0] as [string, EntityMetadata, Record<string, unknown>];
  assert.equal(accountId, 'a1');
  assert.equal(ssh, SSH, 'the entity as handed in: the one snapshot');
  assert.equal(options.isolate, true);
  assert.equal(options.agentServesKey, true, 'the agent serves the key of THIS entity');
  assert.deepEqual(options.storage, { tag: 'storage' });
  assert.equal(options.storageDir, '/dir');
  assert.equal(options.remote, REMOTE_WINDOW, 'this window, as remoteWindowDeps reads it');
  assert.equal(remoteArgs[0][0], relays);
  assert.equal((calls[1][2] as Record<string, unknown>).agentServesKey, false, 'the answer is asked per entity');

  const local = loadRoad(closeEvents().vscode, mocks).sshRoadOf(roadDeps({ storageDir: '/dir' }));
  calls.length = 0;
  await local.prepare('a1', SSH);
  assert.equal((calls[0][2] as Record<string, unknown>).remote, undefined, 'no relays: a local window');
  assert.equal((calls[0][2] as Record<string, unknown>).agentServesKey, false);
});

// H2
test('a_refusal_shows_the_remedy_once_and_never_retries', async () => {
  const offered: unknown[][] = [];
  const prepared: unknown[][] = [];
  const mocks = {
    './sshSession': { prepareSshSession: (...a: unknown[]) => (prepared.push(a), Promise.resolve({ kind: 'stopped', why: 'no-host' })), windowOf: (o: { remote?: unknown }) => o.remote },
    './sshConnect': { offerTheFix: (...a: unknown[]) => (offered.push(a), Promise.resolve(true)) },
    './remoteConnectHost': { remoteWindowDeps: () => REMOTE_WINDOW, remedyRunner: () => undefined },
  };
  const road = loadRoad(closeEvents().vscode, mocks).sshRoadOf({ storage: {}, storageDir: '/dir', relays: {} } as never);
  const refused: RefusedSsh = { kind: 'refused', reasons: ['relay-off'], retryable: true };

  await road.sayRefused(refused, SSH);

  assert.equal(offered.length, 1);
  assert.deepEqual(offered[0], [refused, SSH, REMOTE_WINDOW]);
  assert.equal(prepared.length, 0, 'nothing prepared again');

  // The real one: a remedy that answers true still prepares nothing again — the person runs the entry again (parent §4.3).
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' }, options: OPTIONS, chooseButton: true });
  const remedies: string[] = [];
  await w.mod.offerTheFix(refused, entity(), {
    ...WSL_NO_RELAY,
    runRemedy: async (action: string): Promise<boolean> => {
      remedies.push(action);
      return true;
    },
  });
  assert.equal(w.warnings.length, 1, 'one modal, not two');
  assert.deepEqual(remedies, ['setUpRelay']);
  assert.deepEqual(w.openers, [], 'no credential was looked up: nothing was prepared again');
  assert.deepEqual(w.materialised, []);
  assert.deepEqual(w.sshTerminals, []);
  void storage;
});

// H3
test('owned_sessions_clean_what_is_not_handed_over_and_hand_over_the_rest', () => {
  const events = closeEvents();
  const { ownedSessions } = loadRoad(events.vscode);

  const unsent = counted();
  const first = ownedSessions();
  first.own(unsent.ready);
  first.cleanAll();
  assert.equal(unsent.cleaned(), 1, 'nothing was handed over: the owner cleans');
  first.cleanAll();
  assert.equal(unsent.cleaned(), 1, 'the list is empty after cleanAll: nothing is cleaned twice');

  const before = events.listeners.list.length;
  const handed = counted();
  const other = counted();
  const t = terminal();
  const owner = ownedSessions();
  owner.own(handed.ready);
  owner.own(other.ready);
  owner.handOver(handed.ready, t as never);
  owner.cleanAll();
  assert.equal(handed.cleaned(), 0, 'handed over: the terminal owns it now, and cleanAll leaves it');
  assert.equal(other.cleaned(), 1, 'not handed over: cleanAll cleans it');
  assert.equal(events.listeners.list.length, before + 1);
  events.fire(terminal());
  assert.equal(handed.cleaned(), 0, 'ANOTHER terminal closing does not clean it');
  events.fire(t);
  assert.equal(handed.cleaned(), 1, 'THAT terminal closing does');
  events.fire(t);
  assert.equal(handed.cleaned(), 1, 'fired again: still one');
  assert.equal(events.listeners.list.length, before, 'the listener is gone');
});

// H4
test('a_terminal_already_closed_at_the_hand_over_is_cleaned_at_once', () => {
  const events = closeEvents();
  const { ownedSessions } = loadRoad(events.vscode);
  const owned = counted();
  const owner = ownedSessions();
  owner.own(owned.ready);
  owner.handOver(owned.ready, { exitStatus: { code: 0 } } as never);
  assert.equal(owned.cleaned(), 1);
  assert.equal(events.listeners.list.length, 0, 'no listener was added');
});

// H5 (lead amendment A1)
test('a_reused_terminal_keeps_one_listener_and_cleans_the_earlier_session_when_the_last_command_had_finished', () => {
  const events = closeEvents();
  const { ownedSessions } = loadRoad(events.vscode);
  const t = terminal();
  const first = counted();
  const second = counted();
  const owner = ownedSessions();

  owner.handOver(first.ready, t as never);
  assert.equal(first.cleaned(), 0);
  assert.equal(events.listeners.list.length, 1);

  owner.handOver(second.ready, t as never, true);
  assert.equal(first.cleaned(), 1, 'a `finished` verdict: the earlier ssh ended, cleaned at the second hand-over');
  assert.equal(second.cleaned(), 0);
  assert.equal(events.listeners.list.length, 1, 'exactly one listener remains');

  events.fire(t);
  assert.equal(second.cleaned(), 1, 'close cleans the current session');
  assert.equal(first.cleaned(), 1, 'and not the first again');
  assert.equal(events.listeners.list.length, 0);
});

// H6 (both reviews): Type It Anyway into a busy or unknown terminal does not say the earlier ssh ended.
test('a_terminal_that_was_not_finished_keeps_both_sessions_and_one_listener_until_it_closes', () => {
  const events = closeEvents();
  const { ownedSessions } = loadRoad(events.vscode);
  const t = terminal();
  const first = counted();
  const second = counted();
  const third = counted();
  const owner = ownedSessions();

  owner.handOver(first.ready, t as never);
  owner.handOver(second.ready, t as never, false);
  assert.deepEqual([first.cleaned(), second.cleaned()], [0, 0], 'the earlier ssh may still be running: nothing is cleaned');
  assert.equal(events.listeners.list.length, 1, 'still one listener');

  owner.handOver(third.ready, t as never, true);
  assert.deepEqual([first.cleaned(), second.cleaned(), third.cleaned()], [1, 1, 0], 'a later `finished` verdict ends everything the terminal held before');

  events.fire(t);
  assert.deepEqual([first.cleaned(), second.cleaned(), third.cleaned()], [1, 1, 1]);
  assert.equal(events.listeners.list.length, 0);
});

// H7: the link read again after the approval, the one reader of the folder run and the chain.
test('a_link_read_again_is_the_link_or_the_sentence_why_not', () => {
  const { linkedNow } = loadRoad(closeEvents().vscode);
  const lookup = (id: string): never | undefined => (id === 's1' ? ({ id: 's1', name: 'prod box', type: 'entity', details: SSH, parentId: null } as never) : undefined);
  const entry = (extra: Partial<EntityMetadata>): EntityMetadata => ({ id: 'e', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'x', ...extra }) as EntityMetadata;

  const linked = linkedNow(entry({ sshEntityId: 's1' }), lookup, 'changed');
  assert.equal(typeof linked, 'object');
  assert.equal(linkedNow(undefined, lookup, 'changed'), 'changed', 'gone or trashed: changed');
  assert.equal(linkedNow(entry({}), lookup, 'changed'), 'changed', 'no longer linked: changed');
  const gone = linkedNow(entry({ sshEntityId: 'zz' }), lookup, 'changed');
  assert.equal(typeof gone, 'string');
  assert.notEqual(gone, 'changed', 'the link\'s own refusal is said as it is');
});

// ---- E3.S1: the spawn use of the road, the spawn launch and the hand-over to a run (H6-H10 of the E3 stories) ---------------

const SSH_SESSION_MOCK = (calls: unknown[][]): Record<string, unknown> => ({
  './sshSession': { prepareSshSession: (...a: unknown[]) => (calls.push(a), Promise.resolve({ kind: 'stopped', why: 'no-host' })), windowOf: (o: { remote?: unknown }) => o.remote },
});

test('a_spawn_preparation_never_relies_on_the_agent', async () => {
  const calls: unknown[][] = [];
  const road = loadRoad(closeEvents().vscode, SSH_SESSION_MOCK(calls)).sshRoadOf(roadDeps({ storageDir: '/dir', servesKeyForEntity: () => true }));

  await road.prepare('a1', SSH, 'spawn');
  await road.prepare('a1', SSH);

  const optionsOf = (n: number): Record<string, unknown> => calls[n][2] as Record<string, unknown>;
  assert.equal(optionsOf(0).agentServesKey, false, 'a child of the extension host does not reach the extension agent: its key is always written to a file');
  assert.equal(optionsOf(0).isolate, true);
  assert.equal(optionsOf(1).agentServesKey, true, 'a terminal still does');
});

test('spawn_launch_names_the_client_its_folder_and_the_extensions_agent_for_a_forwarding_entry', () => {
  const sshProgram = require('../sshProgram') as typeof import('../sshProgram');
  const road = loadRoad(closeEvents().vscode).sshRoadOf(roadDeps({ agentSocket: () => '/tmp/agent.sock' }));
  const forwarding = { ...SSH, agentForward: true } as EntityMetadata;

  const launch = road.spawnLaunch(forwarding, { SSH_ASKPASS: '/keys/askpass.sh' });

  const program = sshProgram.spawnableSshProgram(sshProgram.openSshBinary('ssh', true, process.platform), process.platform, process.env.PATH, fs.existsSync);
  assert.deepEqual(launch, { kind: 'spawn', program, cwd: '/storage', env: { SSH_AUTH_SOCK: '/tmp/agent.sock', SSH_ASKPASS: '/keys/askpass.sh' }, ownAgent: true, withoutEnv: E3_INHERITED_DROP });
  const plain = road.spawnLaunch(SSH, undefined);
  assert.equal(plain.kind === 'spawn' ? plain.env.SSH_AUTH_SOCK : 'refused', undefined, 'no forwarding: the extension agent is not handed over');
  assert.equal(plain.kind === 'spawn' ? plain.cwd : '', '/storage', 'the extension\'s own folder, never the workspace (B1)');
});

test('spawn_launch_says_so_when_no_client_can_be_started_and_carries_the_agent_warning', () => {
  const sshProgram = require('../sshProgram') as typeof import('../sshProgram');
  const none = loadRoad(closeEvents().vscode, { './sshProgram': { ...sshProgram, spawnableSshProgram: () => undefined } }).sshRoadOf(roadDeps());
  assert.deepEqual(none.spawnLaunch(SSH, undefined), { kind: 'refused', reason: sshProgram.NO_SSH_TO_SPAWN });

  const noAgent = loadRoad(closeEvents().vscode).sshRoadOf(roadDeps({ agentSocket: () => undefined }));
  const launch = noAgent.spawnLaunch({ ...SSH, agentForward: true } as EntityMetadata, undefined);
  assert.equal(launch.kind === 'spawn' ? launch.warning : 'refused', sshProgram.NO_AGENT_TO_FORWARD, 'the warning travels to the banner (E3-D12)');
});

test('spawn_launch_says_whether_the_agent_is_ours', () => {
  const road = (socket: string | undefined): SshRoad => loadRoad(closeEvents().vscode).sshRoadOf(roadDeps({ agentSocket: () => socket }));
  const spawned = (ssh: EntityMetadata, socket: string | undefined): Extract<SpawnLaunch, { kind: 'spawn' }> => {
    const launch = road(socket).spawnLaunch(ssh, undefined);
    assert.equal(launch.kind, 'spawn', JSON.stringify(launch));
    return launch as Extract<SpawnLaunch, { kind: 'spawn' }>;
  };
  const forwarding = { ...SSH, agentForward: true } as EntityMetadata;

  const ours = spawned(forwarding, '/tmp/agent.sock');
  assert.equal(ours.ownAgent, true, 'the entry forwards and the extension agent is up');
  assert.equal(ours.env.SSH_AUTH_SOCK, '/tmp/agent.sock');

  const down = spawned(forwarding, undefined);
  assert.equal(down.ownAgent, false, 'the entry forwards and the agent is not up');
  assert.equal(down.warning, NO_AGENT_TO_FORWARD);
  assert.equal('SSH_AUTH_SOCK' in down.env, false);

  const quiet = spawned(SSH, '/tmp/agent.sock');
  assert.equal(quiet.ownAgent, false, 'an entry that does not forward: the agent is not ours to hand over');
  assert.equal(quiet.warning, undefined);

  for (const launch of [ours, down, quiet]) {
    assert.deepEqual(launch.withoutEnv, E3_INHERITED_DROP, 'every answer takes the host\'s socket and the CREDS_REF_ names out of the inheritance');
  }
});

/** A ready whose `cleanup()` counts EVERY call (the real one is idempotent: this one is not, so a double clean is visible). */
function everyCall(): { ready: ReadySsh; calls(): number } {
  let n = 0;
  return { ready: { cleanup: () => void (n += 1) } as unknown as ReadySsh, calls: () => n };
}

test('hand_over_to_run_leaves_the_list_only_after_the_run_exists_and_shares_one_end', () => {
  const { ownedSessions } = loadRoad(closeEvents().vscode);
  const r = everyCall();
  const owner = ownedSessions();
  owner.own(r.ready);
  let ended: (() => void) | undefined;
  owner.handOverToRun(r.ready, (e) => {
    ended = e;
  });
  owner.cleanAll();
  assert.equal(r.calls(), 0, 'the run owns it now');
  assert.ok(ended !== undefined);
  ended();
  ended();
  assert.equal(r.calls(), 1, 'the run\'s end is once-only');
});

test('a_hand_over_of_a_session_never_owned_still_cleans_once', () => {
  const { ownedSessions } = loadRoad(closeEvents().vscode);
  const r = everyCall();
  const owner = ownedSessions();
  let ended: (() => void) | undefined;
  owner.handOverToRun(r.ready, (e) => {
    ended = e;
  });
  assert.ok(ended !== undefined);
  ended();
  ended();
  assert.equal(r.calls(), 1);
  owner.cleanAll();
  assert.equal(r.calls(), 1);
});

test('a_throw_while_the_run_is_made_leaves_the_session_to_the_owner_once', () => {
  const { ownedSessions } = loadRoad(closeEvents().vscode);

  const a = everyCall();
  const ownerA = ownedSessions();
  ownerA.own(a.ready);
  assert.throws(() => ownerA.handOverToRun(a.ready, () => { throw new Error('no run'); }), /no run/);
  ownerA.cleanAll();
  assert.equal(a.calls(), 1, '(a) the start threw: still on the list, cleaned by the owner');

  const b = everyCall();
  const ownerB = ownedSessions();
  ownerB.own(b.ready);
  assert.throws(() => ownerB.handOverToRun(b.ready, (e) => { e(); throw new Error('ended, then threw'); }), /ended, then threw/);
  assert.equal(b.calls(), 1, '(b) the run ended and then threw: cleaned by the run\'s end');
  ownerB.cleanAll();
  assert.equal(b.calls(), 1, 'one shared once-only end: the owner does not clean it twice');

  const c = everyCall();
  const ownerC = ownedSessions();
  assert.throws(() => ownerC.handOverToRun(c.ready, () => { throw new Error('no run'); }), /no run/);
  ownerC.cleanAll();
  assert.equal(c.calls(), 1, '(c) never owned: put on the list for the throw, cleaned once');
});
