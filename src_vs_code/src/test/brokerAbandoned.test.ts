import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { VpnUseDeps, vpnAction } from '../agentUseActions';
import { endedAfter } from '../requestLife';
import * as sshProgram from '../sshProgram';
import type { SshUseDeps } from '../sshUseActions';
import { World, call, share, world } from './brokerWorld';
import { memoryStorage, seedEntry } from './pinWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * A request whose client is gone can authorise nothing (`PLAN_wsl_bridge_outlives_its_client.md` §2.3,
 * §5.7, story E4.S1).
 *
 * <p>The defect, as it stood: the broker never observed a caller leaving. An MCP client closed while its
 * consent modal was open left the modal behind; a person clicking <i>Allow</i> on it later allowed the
 * grant and RAN the action for a request nobody was waiting for, and wrote the answer to a dead socket.
 * The modal itself cannot be closed from code — the owner decided a defused one is enough (§3.3) — so
 * what is asserted here is that clicking it changes nothing, and that every later point on the path
 * (the consent memory, the mask read, the one-use queue, the action start and the action itself) sees
 * the client gone.</p>
 *
 * <p>Every test drives the real broker over real HTTP and hangs up the way a client does: by destroying
 * its connection with the response still pending.</p>
 */

interface Hanging {
  /** Destroy the connection, response still pending — what a closed MCP client's transport does. */
  hangUp(): void;
  /** The status the client received, or `'hung up'` when it left first. */
  answered: Promise<number | 'hung up'>;
}

function hanging(port: number, path: string, body: unknown, token?: string): Hanging {
  const payload = JSON.stringify(body);
  const req = http.request({
    host: '127.0.0.1',
    port,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
  });
  const answered = new Promise<number | 'hung up'>((resolve) => {
    req.on('response', (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', () => resolve('hung up'));
    req.on('close', () => resolve('hung up'));
  });
  req.end(payload);
  return { hangUp: () => req.destroy(), answered };
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until `ready`, failing with `what` rather than hanging the suite. */
async function until(ready: () => boolean, what: string, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${what}`);
    }
    await pause(5);
  }
}

/** Long enough for the broker to observe a loopback connection closing. */
const CLOSE_SEEN_MS = 100;

const abandonedLines = (w: World): string[] => w.audit.filter((line) => /ABANDONED/.test(line));

/** Wait for the broker to have SEEN the client leave: its one ABANDONED line is written then. */
const abandonedSeen = (w: World): Promise<void> => until(() => abandonedLines(w).length > 0, 'the broker to see the client leave');

/** Wait for a late answer to have been read and set aside — the gate writes one `ignored` line. */
const ignoredSeen = (w: World): Promise<void> => until(() => w.audit.some((line) => / ignored /.test(line)), 'the late answer to be ignored');

test('a client that leaves while the modal is open: a late Allow grants nothing and runs nothing', async () => {
  const w = world({ holdDialogs: true });
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'uptime' }, secret);
    await until(() => w.openDialogs.length === 1, 'the consent modal');

    gone.hangUp();
    await abandonedSeen(w);
    w.openDialogs.shift()?.('Allow');
    await ignoredSeen(w);

    assert.deepEqual(w.ran, [], 'the action ran for a request nobody was waiting for');
    assert.ok(!w.audit.some((line) => /ALLOWED/.test(line)), `the late click allowed the grant: ${w.audit.join(' | ')}`);
    assert.equal(abandonedLines(w).length, 1, `one ABANDONED line: ${w.audit.join(' | ')}`);
    assert.equal(w.presence, 0, 'a click on a dead prompt decides nothing, presence included');

    // The grant is still unanswered, so the next live call on it is ASKED rather than waved through.
    const next = hanging(port, '/v1/use/exec', { command: 'df -h' }, secret);
    await until(() => w.openDialogs.length === 1, 'a fresh consent modal for the next call');
    w.openDialogs.shift()?.('Deny');
    assert.equal(await next.answered, 403);
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('the MCP door: a late Allow after the client left runs nothing and remembers nothing', async () => {
  const w = world({ holdDialogs: true, mcpUse: 'usable' });
  try {
    const { port } = await share(w);
    const gone = hanging(port, '/v1/mcp/use/exec', { entry: 'e1', command: 'uptime' });
    await until(() => w.openDialogs.length === 1, 'the consent modal');

    gone.hangUp();
    await abandonedSeen(w);
    w.openDialogs.shift()?.('Allow');
    await ignoredSeen(w);

    assert.deepEqual(w.ran, [], 'the action ran for a request nobody was waiting for');
    assert.deepEqual(w.consents, [], 'a consent nobody was waiting for was remembered for next time');
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('the alias door: a late Allow after the client left runs nothing', async () => {
  const w = world({ holdDialogs: true, alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' } });
  try {
    const { port } = await share(w);
    const gone = hanging(port, '/v1/alias/exec', { alias: 'prod', command: 'uptime' });
    await until(() => w.openDialogs.length === 1, 'the consent modal');

    gone.hangUp();
    await abandonedSeen(w);
    w.openDialogs.shift()?.('Allow');
    await ignoredSeen(w);

    assert.deepEqual(w.ran, []);
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('one token, two waiters on one modal: the one that left does not decide it for the one still there', async () => {
  const w = world({ holdDialogs: true });
  try {
    const { port, secret } = await share(w);
    const stays = hanging(port, '/v1/use/exec', { command: 'uptime' }, secret);
    const leaves = hanging(port, '/v1/use/exec', { command: 'df -h' }, secret);
    await until(() => w.openDialogs.length === 1, 'one shared consent modal');
    await pause(CLOSE_SEEN_MS);
    assert.equal(w.dialogs.length, 1, 'two calls on one token share one modal');

    leaves.hangUp();
    await abandonedSeen(w);
    w.openDialogs.shift()?.('Allow');

    assert.equal(await stays.answered, 200, 'the live request still got its answer');
    assert.deepEqual(
      w.ran.map((r) => r.body.command),
      ['uptime'],
      'only the live request ran',
    );
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));

    // The Allow the live request received stands for the token, as the modal says it does: detaching
    // the waiter that left stopped ITS execution and revoked nothing (the risk consultation, point b).
    const later = await call(port, '/v1/use/exec', { token: secret, body: { command: 'hostname' } });
    assert.equal(later.status, 200);
    assert.equal(w.dialogs.length, 1, 'the next call on the allowed token was asked again');
  } finally {
    w.server.dispose();
  }
});

test('the client leaves after consent, before the action starts: the action never starts', async () => {
  // The mask table is the last thing read before the start, so a hang-up inside that read is a
  // hang-up at the boundary: nothing awaits between it and the start but the check itself.
  let gone: Hanging | undefined;
  const w = world({
    masker: async () => {
      gone?.hangUp();
      await pause(CLOSE_SEEN_MS);
      return [];
    },
  });
  try {
    const { port, secret } = await share(w);
    gone = hanging(port, '/v1/use/exec', { command: 'uptime' }, secret);

    await until(() => abandonedLines(w).length > 0 || w.ran.length > 0, 'the call to end', 3000);
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(w.ran, [], 'the action started for a client that had already gone');
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('a one-use call queued behind another, whose client leaves while it waits, never starts', async () => {
  // The one-use lane is the longest wait on the path, and it sits immediately before the start. The
  // first call FAILS, so the entry is not spent and the queued call would otherwise take its turn.
  const w = world({ oneUse: true });
  w.result = { status: 502, body: { error: 'the far side refused' } };
  let release = (): void => undefined;
  w.hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  try {
    const { port, secret } = await share(w);
    const first = hanging(port, '/v1/use/exec', { command: 'first' }, secret);
    await until(() => w.ran.length === 1, 'the first call inside the action');
    const queued = hanging(port, '/v1/use/exec', { command: 'second' }, secret);
    await pause(CLOSE_SEEN_MS);

    queued.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.hold = undefined;
    release();
    assert.equal(await first.answered, 502);
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(
      w.ran.map((r) => r.body.command),
      ['first'],
      'the queued call started after its client had gone',
    );
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('the client leaves after the action started: the action is handed a signal, and it fires', async () => {
  const w = world({});
  let release = (): void => undefined;
  w.hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'sleep 600' }, secret);
    await until(() => w.ran.length === 1, 'the action to start');
    const signal = w.actionSignals[0];
    assert.ok(signal !== undefined, 'the action was started without the request’s signal, so nothing can cancel it');
    assert.equal(signal.aborted, false, 'a live request does not start an action already cancelled');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);

    assert.equal(signal.aborted, true, 'the client left and the action’s signal did not fire');
  } finally {
    release();
    w.server.dispose();
  }
});

test('a finished request never fires its signal — keep-alive reuse included', async () => {
  // The other half of the contract: `close` after a COMPLETED response is not a client leaving.
  const w = world({});
  try {
    const { port, secret } = await share(w);
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'one' } });
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'two' } });
    await pause(CLOSE_SEEN_MS);

    assert.equal(w.actionSignals.length, 2);
    assert.ok(
      w.actionSignals.every((signal) => signal?.aborted === false),
      'a request that was answered had its signal fired afterwards',
    );
    assert.deepEqual(abandonedLines(w), []);
  } finally {
    w.server.dispose();
  }
});

test('an MCP delete whose client left during the modal moves nothing to the Trash', async () => {
  const w = world({ holdDialogs: true, mcpUse: 'usable', trash: true });
  try {
    const { port } = await share(w);
    const gone = hanging(port, '/v1/mcp/delete', { entry: 'e1' });
    await until(() => w.openDialogs.length === 1, 'the delete prompt');

    gone.hangUp();
    await abandonedSeen(w);
    w.openDialogs.shift()?.('Allow');
    await ignoredSeen(w);

    assert.deepEqual(w.trashed, []);
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('an MCP create whose client left during the folder PIN step makes nothing, and the step is told', async () => {
  const w = world({ create: 'open' });
  let gone: Hanging | undefined;
  w.holdSettle = async () => {
    gone?.hangUp();
    await pause(CLOSE_SEEN_MS);
  };
  try {
    const { port } = await share(w);
    gone = hanging(port, '/v1/mcp/create', { name: 'new-box', kind: 'ssh' });

    await until(() => w.settleDeadlines.length === 1, 'the PIN step');
    await pause(CLOSE_SEEN_MS * 2);

    assert.deepEqual(w.created, [], 'an entry was made for a client that had gone');
    assert.equal(w.settleSignals.length, 1, 'the PIN step was not handed the request’s signal, so its box could not close');
    assert.equal(w.settleSignals[0].aborted, true);
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('a folder change whose client left during the modal changes nothing', async () => {
  const w = world({ holdDialogs: true });
  const made: string[] = [];
  w.server.setFolderHooks({
    list: () => [],
    choose: () => ({
      ok: true,
      target: { accountId: 'a1', entityId: 'f1', entityName: 'Servers', kind: 'folder' },
      summary: 'a folder "new-dir" in "Servers"',
      edit: { name: 'new-dir' },
    }),
    create: (_decision, body) => {
      made.push(String(body.name));
      return Promise.resolve({ id: 'f2', name: String(body.name) });
    },
    edit: () => Promise.resolve(true),
    remove: () => Promise.resolve(true),
  });
  try {
    const { port } = await share(w);
    const gone = hanging(port, '/v1/mcp/folder/create', { name: 'new-dir', parent: 'f1' });
    await until(() => w.openDialogs.length === 1, 'the folder prompt');

    gone.hangUp();
    await abandonedSeen(w);
    w.openDialogs.shift()?.('Allow');
    await pause(CLOSE_SEEN_MS);

    assert.deepEqual(made, [], 'a folder was made for a client that had gone');
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
  } finally {
    w.server.dispose();
  }
});

test('an action that fails because its client left is that request’s abandonment, not an internal failure', async () => {
  // What a child killed by the request's signal looks like to the broker: the action throws. Reported
  // as `internal`, the journal would carry a failure nobody caused and a reply written to a dead socket.
  const w = world({});
  let release = (): void => undefined;
  w.hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const killed = new Error('the child was killed');
  killed.name = 'AbortError';
  w.result = killed;
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'sleep 600' }, secret);
    await until(() => w.ran.length === 1, 'the action to start');

    gone.hangUp();
    await until(() => w.actionSignals[0]?.aborted === true, 'the action signal to fire');
    release();
    await abandonedSeen(w);

    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
    assert.ok(!w.audit.some((line) => / internal /.test(line)), `a cancelled action was journalled as an internal failure: ${w.audit.join(' | ')}`);
  } finally {
    release();
    w.server.dispose();
  }
});

test('a queued call whose client left spends no use of a capped grant', async () => {
  // The review gate's finding on E4.S1, raised three times: the use was reserved BEFORE the one-use
  // lane's queue, so a call abandoned while it waited never ran and still counted — and a grant capped
  // at N calls then refused a live call after fewer than N had run.
  const w = world({ oneUse: true, maxCalls: 2 });
  w.result = { status: 502, body: { error: 'the far side refused' } };
  let release = (): void => undefined;
  w.hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  try {
    const { port, secret } = await share(w);
    const first = hanging(port, '/v1/use/exec', { command: 'first' }, secret);
    await until(() => w.ran.length === 1, 'the first call inside the action');
    const queued = hanging(port, '/v1/use/exec', { command: 'queued' }, secret);
    await pause(CLOSE_SEEN_MS);

    queued.hangUp();
    await pause(CLOSE_SEEN_MS);
    w.hold = undefined;
    release();
    assert.equal(await first.answered, 502);
    await abandonedSeen(w);

    const third = await call(port, '/v1/use/exec', { token: secret, body: { command: 'third' } });

    assert.equal(third.status, 502, `the second of two allowed calls was refused: ${JSON.stringify(third.body)}`);
    assert.deepEqual(
      w.ran.map((r) => r.body.command),
      ['first', 'third'],
    );
  } finally {
    release();
    w.server.dispose();
  }
});

test('a VPN start whose client left while it was prepared is that request’s ABANDONED, never a refusal (E4.S3)', async () => {
  // The real VPN action, over an `open` that stands for `runVpn`: it waits (the dependency chain, the
  // config read) and then honours its gate — a fired one starts nothing. Before E4.S3 the action had
  // no gate to hand on, and a VPN that did not start answered `no_credential` to a socket nobody read.
  let release = (): void => undefined;
  const gates: AbortSignal[] = [];
  const deps: VpnUseDeps = {
    storage: { getNode: () => ({ id: 'e1', name: 'prod', type: 'entity', details: { id: 'e1', name: 'prod', isSshEnabled: false, isVpn: true, vpnType: 'wireguard' } }) },
    open: (_accountId, _entityId, _action, startGate) => {
      gates.push(startGate);
      return new Promise<boolean>((resolve) => {
        release = () => resolve(startGate?.aborted !== true);
      });
    },
  };
  const realAction = vpnAction(deps, 'up');
  const w = world({ realAction });
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'up' }, secret);
    await until(() => gates.length === 1, 'the VPN start to begin');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);
    release();
    await until(() => w.audit.some((line) => /ABANDONED| opened | 409 /.test(line)), 'the call to be journalled');

    assert.ok(!w.audit.some((line) => / (opened|409|internal) /.test(line)), `a VPN start for a gone request was journalled as something other than its abandonment: ${w.audit.join(' | ')}`);
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
    assert.match(abandonedLines(w)[0], /it was not launched/);
  } finally {
    release();
    w.server.dispose();
  }
});

test('a VPN start whose chain had typed a step when the client left is journalled as exactly that, never "not launched" (E4.S4)', async () => {
  // The chain reports the step it had handed to the shell by throwing the request's end with that stage
  // (`requestLife.endedAfter`); the broker's line used to read "as the action was starting — it was not
  // launched" for every non-rotating action, which was true of the VPN and false of the step.
  let release = (): void => undefined;
  const gates: AbortSignal[] = [];
  const deps: VpnUseDeps = {
    storage: { getNode: () => ({ id: 'e1', name: 'prod', type: 'entity', details: { id: 'e1', name: 'prod', isSshEnabled: false, isVpn: true, vpnType: 'wireguard' } }) },
    open: (_accountId, _entityId, _action, startGate) => {
      gates.push(startGate);
      return new Promise<boolean>((resolve, reject) => {
        release = () => (startGate.aborted ? reject(endedAfter('a dependency step had been typed')) : resolve(true));
      });
    },
  };
  const w = world({ realAction: vpnAction(deps, 'up') });
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'up' }, secret);
    await until(() => gates.length === 1, 'the VPN start to begin');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);
    release();
    await until(() => w.audit.some((line) => /ABANDONED| opened | 409 | internal /.test(line)), 'the call to be journalled');

    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
    assert.match(abandonedLines(w)[0], /the client left after a dependency step had been typed/, 'the journal does not name the step the shell already has');
    assert.doesNotMatch(abandonedLines(w)[0], /not launched/, 'the journal claims nothing was launched although a step was typed');
  } finally {
    release();
    w.server.dispose();
  }
});

/**
 * The real SSH terminal action behind the real broker, its credential lookup held open (the entry's PIN box,
 * in the window) — the plan round's first finding: the signal a real request's close fires must reach the
 * gate BEFORE the host-key question, not only the one before the terminal.
 */
/** What the stubbed SSH path records — one object the stubs and the test share by reference. */
interface SshLog {
  lookups: number;
  hostKeyAsked: unknown[];
  terminals: number;
  releaseLookup: () => void;
}

interface SshTerminalWorld {
  readonly actions: typeof import('../sshUseActions');
  readonly log: SshLog;
  deps(): Promise<SshUseDeps>;
}

function sshTerminalWorld(): SshTerminalWorld {
  const stub = {
    window: {
      terminals: [],
      showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined),
      showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
      showErrorMessage: (): Promise<undefined> => Promise.resolve(undefined),
      onDidCloseTerminal: (): { dispose(): void } => ({ dispose: (): void => undefined }),
    },
  };
  const log: SshLog = { lookups: 0, hostKeyAsked: [], terminals: 0, releaseLookup: (): void => undefined };
  const actions = loadWithVscode<typeof import('../sshUseActions')>('../sshUseActions', stub, {
    './sshCredential': {
      resolveSshCredential: (): Promise<unknown> =>
        new Promise((resolve) => {
          log.lookups += 1;
          log.releaseLookup = () => resolve({ kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' });
        }),
    },
    './connectionOptions': {
      connectionOptions: (_a: unknown, _e: unknown, _s: unknown, _d: unknown, startGate: unknown): Promise<unknown> => {
        log.hostKeyAsked.push(startGate);
        return Promise.resolve({ knownHostsFile: undefined });
      },
    },
    './keyInstaller': { materializePrivateKey: (): string => '/k', forgetMaterializedKey: (): void => undefined, writeAskpassScriptFile: (): string => '/a' },
    './terminalManager': {
      openSshTerminal: (): unknown => {
        log.terminals += 1;
        return { name: 'ssh', dispose: (): void => undefined };
      },
      buildSshCommand: (): string => 'ssh prod',
      describeSshTarget: (): string => 'prod',
    },
    './sshProgram': { ...sshProgram, sshClientPresent: (): boolean => true },
    './pinnedTerminal': { composedShellPath: (): undefined => undefined },
  });
  const deps = async (): Promise<SshUseDeps> => {
    const storage = memoryStorage(stub);
    await seedEntry(storage, { id: 'e1', name: 'prod', isSshEnabled: true, kind: 'ssh', host: 'prod.example.com' }, {});
    return {
      storage,
      storageDir: fs.mkdtempSync(path.join(os.tmpdir(), 'creds-abandoned-')),
      signal: new AbortController().signal,
      acquireExecSlot: () => (): void => undefined,
      note: (): void => undefined,
      agentSocket: (): undefined => undefined,
    };
  };
  return { actions, log, deps };
}

test('an SSH terminal whose client left during the credential lookup is asked no host-key question, through the real broker (E4.S4)', async () => {
  const ssh = sshTerminalWorld();
  const deps = await ssh.deps();
  const w = world({ realAction: ssh.actions.sshTerminalAction(deps) });
  try {
    const { port, secret } = await share(w);
    const gone = hanging(port, '/v1/use/exec', { command: 'terminal' }, secret);
    await until(() => ssh.log.lookups === 1, 'the credential lookup to begin');

    gone.hangUp();
    await pause(CLOSE_SEEN_MS);
    ssh.log.releaseLookup();
    await until(() => w.audit.some((line) => /ABANDONED| opened | internal /.test(line)), 'the call to be journalled');

    assert.deepEqual(ssh.log.hostKeyAsked, [], 'the host-key question was raised for a request whose client had gone');
    assert.equal(ssh.log.terminals, 0, 'a terminal opened for a request whose client had gone');
    assert.equal(abandonedLines(w).length, 1, w.audit.join(' | '));
    assert.match(abandonedLines(w)[0], /not launched/);
  } finally {
    ssh.log.releaseLookup();
    w.server.dispose();
    fs.rmSync(deps.storageDir, { recursive: true, force: true });
  }
});
