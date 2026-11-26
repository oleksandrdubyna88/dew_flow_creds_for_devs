import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { scriptRunAction, terminalRunAction } from '../agentUseActions';
import type { BridgeContext } from '../bridgeContext';
import { MAX_SERVER_SCRIPT_BYTES, SITE_CHANGED, serverScriptCommand } from '../bridgedRun';
import { BRIDGE_USE_REFUSED } from '../bridgeScope';
import { commandFingerprint } from '../commandTrust';
import { resolveCommand } from '../commandLine';
import { loginShellCommand } from '../remoteLaunch';
import { REFERENCE_ON_SERVER, VARIABLES_ON_SERVER } from '../runSite';
import { placeholderFor } from '../secretMasker';
import { runBounded } from '../sshExecRunner';
import type { RefSource } from '../secretRef';
import type { EntityMetadata, TreeNode } from '../types';
import type { OverSshCall, UseAction, UseActionContext, UseActionResult } from '../useActions';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { send, viaBridge, wallWorld } from './bridgeWallWorld';

/**
 * A stored command or script run through a Remote Bridge (change 11.1, the 72-hour slice, S4; parent plan §4.6), through the REAL
 * `terminalRunAction` and `scriptRunAction`:
 *
 * <ul>
 *   <li>the server row hands E1's contained `ssh` (`overSsh`, recorded here) the bridge's OWN entry, the line or the script's interpreter as
 *       the one remote command and a script's body on standard input, and no value of the vault;</li>
 *   <li>this computer's row (the Windows row, run here with a POSIX shell in its place) puts each `creds://` value in the child's environment
 *       only and masks it out of the output, a value printed in two writes too;</li>
 *   <li>a reference or a variable that would have to reach the server, a scope that no longer serves the reference, a site that changed while
 *       the dialog stood and an untrusted body each launch nothing.</li>
 * </ul>
 */

const scope = cleanupScope();
after(() => scope.close());

const ACCOUNT = 'acct-1';
const BRIDGE: BridgeContext = { bridgeId: 'bridge-1', accountId: ACCOUNT, serverEntityId: 'srv', serverName: 'build box', target: 'me@box:22', remoteOs: 'linux' };
const SERVER_PASSWORD = 'server-login-password-5150';
const DB_PASSWORD = 'db-password-Zq7-long-enough';
const VAR_VALUE = 'script-variable-value-0042';
const REF = 'creds://me@x.test/db/password';

const SERVER: EntityMetadata = { id: 'srv', name: 'build box', kind: 'ssh', host: 'box.example.test', user: 'me', isSshEnabled: true };
const DB: EntityMetadata = { id: 'db', name: 'db', kind: 'db', host: 'db.example.test', isSshEnabled: false };

const node = (details: EntityMetadata): TreeNode => ({ id: details.id, name: details.name, type: 'entity', details, parentId: null });

/** The storage the run reads: the entries by id, the server's password (for its mask), nothing else stored. */
function storageOf(nodes: Map<string, TreeNode>): never {
  const none = (): Promise<undefined> => Promise.resolve(undefined);
  return {
    getNode: (accountId: string, id: string) => (accountId === ACCOUNT ? nodes.get(id) : undefined),
    getPassword: (_accountId: string, id: string) => Promise.resolve(id === 'srv' ? SERVER_PASSWORD : undefined),
    getPrivateKey: none,
    getVpnConfig: none,
    getDbConnection: none,
    getNotes: none,
    getSecondRaw: none,
  } as never;
}

/** The reference reader of the vault: `db`'s password; and a wall whose scope is the set `inScope`, read at each call. */
function bridgeRefsOf(inScope: Set<string>, reads: string[]): { refSource: RefSource; wall: never } {
  const refSource: RefSource = {
    accounts: () => [{ accountId: ACCOUNT, email: 'me@x.test' }],
    entities: () => [{ id: 'db', name: 'db', path: ['db'] }],
    fieldReading: (_accountId, entityId) => {
      reads.push(entityId);
      return Promise.resolve(entityId === 'db' ? { kind: 'value', value: DB_PASSWORD } : { kind: 'absent' });
    },
  };
  const wall = { scopes: { read: () => ({ admits: (_accountId: string, entityId: string) => inScope.has(entityId) }) } };
  return { refSource, wall: wall as never };
}

interface World {
  readonly terminal: UseAction;
  readonly script: UseAction;
  readonly ssh: { ctx: UseActionContext; call: OverSshCall }[];
  readonly notes: string[];
  readonly reads: string[];
  readonly inScope: Set<string>;
  readonly nodes: Map<string, TreeNode>;
  readonly dir: string;
  trust(id: string, text: string): void;
}

/** What `overSsh` answers in a world: the output a server could print, its login password among it. */
const SERVER_ANSWER = { exitCode: 0, stdout: `connected; the login was ${SERVER_PASSWORD}\n`, stderr: '', stdoutTruncated: false, stderrTruncated: false, timedOut: false, durationMs: 3 };

function world(entries: EntityMetadata[]): World {
  const nodes = new Map<string, TreeNode>([SERVER, DB, ...entries].map((details) => [details.id, node(details)]));
  const trusted: string[] = [];
  const ssh: World['ssh'] = [];
  const notes: string[] = [];
  const reads: string[] = [];
  const inScope = new Set(['db', ...entries.map((entry) => entry.id)]);
  const dir = ownedDir(scope, 'bridged-run');
  const deps = {
    storage: storageOf(nodes),
    storageDir: dir,
    signal: new AbortController().signal,
    acquireExecSlot: () => () => undefined,
    note: (message: string) => void notes.push(message),
    trustStore: { get: () => trusted, update: async () => undefined },
    applyEnv: async () => ({ written: [] as string[], withheld: [] }),
    onPath: () => false,
    overSsh: async (ctx: UseActionContext, call: OverSshCall): Promise<UseActionResult> => {
      ssh.push({ ctx, call });
      return { status: 200, body: SERVER_ANSWER };
    },
    bridgeRefs: bridgeRefsOf(inScope, reads),
    laptop: { platform: 'win32' as const, shell: { shellPath: '/bin/sh', family: 'posix' as const } },
  };
  return {
    terminal: terminalRunAction(deps as never),
    script: scriptRunAction(deps as never),
    ssh,
    notes,
    reads,
    inScope,
    nodes,
    dir,
    trust: (id, text) => void trusted.push(commandFingerprint(id, text)),
  };
}

const targetOf = (entry: EntityMetadata) => ({ accountId: ACCOUNT, entityId: entry.id, entityName: entry.name, bridge: BRIDGE });

/** The context the broker hands the run: the bridge, and the site `bridgedSite` answered before the dialog. */
function ctxOf(action: UseAction, entry: EntityMetadata): UseActionContext {
  const target = targetOf(entry);
  return { ...target, signal: new AbortController().signal, summary: action.summarize({}, target), site: action.bridgedSite?.(target) };
}

const errorOf = (result: UseActionResult): { code: string; message: string } => (result.body as { error: { code: string; message: string } }).error;
const outOf = (result: UseActionResult): { exitCode: number | null; stdout: string; stderr: string } => result.body as { exitCode: number | null; stdout: string; stderr: string };

const lineOf = (entry: EntityMetadata): string => (resolveCommand(entry) as { line: string }).line;

// ---- the server -----------------------------------------------------------------------------------------------------------------

const VPN_UP: EntityMetadata = { id: 'vpn-up', name: 'vpn-up', isTerminal: true, isSshEnabled: false, command: 'sudo -n /usr/local/bin/vpn-up', commandArgs: [{ value: '--wait' }] };

test('S4-1: a trusted line with no reference runs on the server: the bridge\'s own entry, the line as its one remote command, no input, no value of the vault', async () => {
  const w = world([VPN_UP]);
  w.trust(VPN_UP.id, lineOf(VPN_UP));
  assert.deepEqual(w.terminal.validate({}, targetOf(VPN_UP)), { ok: true });
  assert.equal(w.terminal.bridgedSite?.(targetOf(VPN_UP)), 'server', 'the dialog says: It runs on that server.');

  const result = await w.terminal.run(ctxOf(w.terminal, VPN_UP), {});

  assert.equal(result.status, 200);
  assert.equal(w.ssh.length, 1, 'one ssh, through E1\'s contained road');
  const { ctx, call } = w.ssh[0];
  assert.equal(call.ssh, w.nodes.get('srv')?.details, 'to the bridge\'s OWN entry, as the vault holds it');
  assert.equal(ctx.accountId, BRIDGE.accountId);
  assert.equal(call.remoteCommand, loginShellCommand('sudo -n /usr/local/bin/vpn-up --wait'), 'the line as the remote login shell\'s one command');
  assert.deepEqual([call.stdin, call.ownAgentOnly, call.noTty], [undefined, true, true]);
  const sent = JSON.stringify({ ...call, ssh: undefined, jump: undefined });
  for (const secret of [SERVER_PASSWORD, DB_PASSWORD]) {
    assert.ok(!sent.includes(secret), 'no value of the vault is in what goes to the server');
  }
  assert.equal(outOf(result).exitCode, 0, 'the exit status comes back');
  assert.ok(!outOf(result).stdout.includes(SERVER_PASSWORD), 'the bridge entry\'s own password is masked out of the answer');
  assert.ok(outOf(result).stdout.includes(placeholderFor('PASSWORD')), outOf(result).stdout);
});

const PY_SCRIPT: EntityMetadata = { id: 'py', name: 'report', isScript: true, isSshEnabled: false, scriptLanguage: 'python', script: 'import sys\nprint("ok", sys.stdin.read() == "")' };

test('S4-2: a script runs on the server with its body on standard input, the interpreter of Ubuntu (python3), and no word of the body on the command line', async () => {
  const w = world([PY_SCRIPT]);
  w.trust(PY_SCRIPT.id, PY_SCRIPT.script as string);
  assert.equal(w.script.bridgedSite?.(targetOf(PY_SCRIPT)), 'server');

  const result = await w.script.run(ctxOf(w.script, PY_SCRIPT), {});

  assert.equal(result.status, 200, JSON.stringify(result.body));
  const { call } = w.ssh[0];
  assert.equal(call.stdin, `${PY_SCRIPT.script as string}\n`, 'the body, whole, on standard input');
  assert.equal(call.remoteCommand, loginShellCommand(serverScriptCommand('python3', '.py')));
  assert.ok(!call.remoteCommand.includes('sys.stdin'), 'no word of the body is on the command line');
});

test('S4-3: the remote side of a script, run by a real shell: the body from standard input, its own input empty, the exit status kept, nothing left behind', async () => {
  // `serverScriptCommand` as the server's login shell would run it, here with `sh` for the interpreter and HOME at an owned folder.
  const home = ownedDir(scope, 'server-home');
  const body = 'read -r line && echo "ate: $line" || echo "own input empty"\necho "args: $#"\nexit 7\n';
  const ran = spawnSync('/bin/sh', ['-c', serverScriptCommand('sh', '.sh')], { input: body, env: { PATH: process.env.PATH, HOME: home }, encoding: 'utf8' });
  assert.equal(ran.stdout, 'own input empty\nargs: 0\n', ran.stderr);
  assert.equal(ran.status, 7, 'the exit status is the script\'s');
  assert.deepEqual(fs.readdirSync(path.join(home, '.creds-for-devs', 'run')), [], 'the private folder is left empty');
  assert.equal(fs.statSync(path.join(home, '.creds-for-devs', 'run')).mode & 0o777, 0o700, 'and owner-only');
});

test('S4-3b: the runner writes `input` to the child and closes it; without it the child reads the null device, as before', async () => {
  const run =(input?: string) => runBounded('/bin/sh', ['-c', 'cat; echo "|end"'], false, { env: { PATH: process.env.PATH }, timeoutMs: 10_000, input });
  assert.equal((await run('a body\nwith two lines\n')).stdout, 'a body\nwith two lines\n|end\n');
  assert.equal((await run()).stdout, '|end\n', 'no input: end of file at once, nothing waited for');
  const early = await runBounded('/bin/sh', ['-c', 'exit 3'], false, { env: { PATH: process.env.PATH }, timeoutMs: 10_000, input: 'x'.repeat(4 * 1024 * 1024) });
  assert.equal(early.exitCode, 3, 'a child that leaves before reading its input ends with its own status; the closed pipe throws nothing');
});

test('S4-4: a script longer than the bound is not sent, and nothing runs', async () => {
  const long: EntityMetadata = { ...PY_SCRIPT, id: 'long', script: `print(1)\n${'#'.repeat(MAX_SERVER_SCRIPT_BYTES)}` };
  const w = world([long]);
  w.trust(long.id, long.script as string);
  const result = await w.script.run(ctxOf(w.script, long), {});
  assert.equal(errorOf(result).code, 'not_supported');
  assert.equal(w.ssh.length, 0);
});

// ---- the refusals before anything runs ------------------------------------------------------------------------------------------

const WITH_REF: EntityMetadata = { id: 'deploy', name: 'deploy', isTerminal: true, isSshEnabled: false, command: `deploy --password ${REF}` };

test('S4-5: a line with a creds:// reference and "Runs on" not set is refused before any dialog, and at the run nothing reaches the server', async () => {
  const w = world([WITH_REF]);
  w.trust(WITH_REF.id, lineOf(WITH_REF));
  assert.deepEqual(w.terminal.validate({}, targetOf(WITH_REF)), { ok: false, code: 'denied', message: REFERENCE_ON_SERVER('deploy') });
  assert.equal(w.terminal.bridgedSite?.(targetOf(WITH_REF)), undefined, 'no site for a dialog that never opens');

  const result = await w.terminal.run({ ...ctxOf(w.terminal, WITH_REF), site: 'server' }, {});
  assert.deepEqual(errorOf(result), { code: 'denied', message: REFERENCE_ON_SERVER('deploy') });
  assert.deepEqual([w.ssh.length, w.reads.length], [0, 0], 'nothing went to the server and no value was read');
});

test('S4-6: a script that injects a variable is refused on the server row, and the variable never travels', async () => {
  const withVar: EntityMetadata = { ...PY_SCRIPT, id: 'withvar', scriptLanguage: 'bash', script: 'echo "${TOKEN}"', scriptVars: [{ name: 'TOKEN', value: VAR_VALUE }] };
  const w = world([withVar]);
  w.trust(withVar.id, withVar.script as string);
  assert.deepEqual(w.script.validate({}, targetOf(withVar)), { ok: false, code: 'denied', message: VARIABLES_ON_SERVER('report') });
  const result = await w.script.run({ ...ctxOf(w.script, withVar), site: 'server' }, {});
  assert.equal(errorOf(result).message, VARIABLES_ON_SERVER('report'));
  assert.equal(w.ssh.length, 0);
});

test('S4-7: an entry whose "Runs on" changed while the dialog stood runs nowhere: the site the dialog said is checked again', async () => {
  const w = world([VPN_UP]);
  w.trust(VPN_UP.id, lineOf(VPN_UP));
  const ctx = ctxOf(w.terminal, VPN_UP);
  assert.equal(ctx.site, 'server');
  (w.nodes.get(VPN_UP.id) as TreeNode).details = { ...VPN_UP, terminalOs: 'windows' };

  const result = await w.terminal.run(ctx, {});
  assert.deepEqual(errorOf(result), { code: 'denied', message: SITE_CHANGED('vpn-up') });
  assert.equal(w.ssh.length, 0);
});

test('S4-8: a line no person has run on this machine is refused on the server row too', async () => {
  const w = world([VPN_UP]);
  const result = await w.terminal.run(ctxOf(w.terminal, VPN_UP), {});
  assert.equal(errorOf(result).code, 'no_credential');
  assert.match(errorOf(result).message, /has not been run on this machine yet/);
  assert.equal(w.ssh.length, 0);
});

test('S4-12: through the real door and broker, `run` on an entry in scope asks a person first, and a dialog not answered Allow launches nothing', async () => {
  const ww = await wallWorld({ allows: 0, supports: ['exec', 'query', 'run'] });
  try {
    for (const ask of [{ path: '/v1/mcp/use/run', body: { entry: 'e1' } }, { path: '/v1/alias/run', body: { alias: 'one' } }]) {
      const reply = await send(viaBridge(ww.bridge), ask);
      assert.notEqual(reply.status, 200, `${ask.path}: ${reply.body}`);
    }
    assert.equal(ww.w.dialogs.length, 2, 'a person was asked, once per call');
    assert.deepEqual(ww.w.ran, [], 'and nothing ran');
  } finally {
    ww.dispose();
  }
});

// ---- this computer --------------------------------------------------------------------------------------------------------------

/**
 * The Windows row's line, for a POSIX shell: prints the referenced value in TWO writes 300 ms apart (two chunks of output), then the command
 * line its shell was started with. A value on the command line would show there, and would be masked there too, so the placeholder is counted.
 */
const PRINTS_SPLIT = `printf %s ${REF} | head -c 6; sleep 0.3; printf %s ${REF} | tail -c +7; echo; tr '\\000' ' ' < /proc/$$/cmdline`;
const ON_LAPTOP: EntityMetadata = { id: 'win', name: 'sign-in', isTerminal: true, isSshEnabled: false, terminalOs: 'windows', command: PRINTS_SPLIT };

test('S4-9: "Runs on" Windows runs here: the value in the child\'s environment only, printed in two chunks and masked, never on its command line', async () => {
  const w = world([ON_LAPTOP]);
  w.trust(ON_LAPTOP.id, lineOf(ON_LAPTOP));
  assert.deepEqual(w.terminal.validate({}, targetOf(ON_LAPTOP)), { ok: true });
  assert.equal(w.terminal.bridgedSite?.(targetOf(ON_LAPTOP)), 'laptop');

  const result = await w.terminal.run(ctxOf(w.terminal, ON_LAPTOP), {});

  const out = outOf(result);
  assert.equal(out.exitCode, 0, out.stderr);
  assert.equal(w.ssh.length, 0, 'nothing went to the server');
  assert.ok(!out.stdout.includes(DB_PASSWORD), 'the value, printed across two chunks, is masked');
  assert.equal(out.stdout.split(placeholderFor('CREDS_REF_1')).length - 1, 1, `the value stood once, in the printed output only: ${out.stdout}`);
  assert.ok(out.stdout.includes('"$CREDS_REF_1"'), `the shell's command line reads the value by name: ${out.stdout}`);
  assert.deepEqual(w.reads, ['db'], 'the reference was read once, through the bridge\'s scope');
  assert.ok(!w.notes.join('\n').includes(DB_PASSWORD), 'no journal line holds it');
});

test('S4-10: a reference the bridge\'s scope no longer serves launches nothing: the generic sentence to the agent, the real reason in the journal', async () => {
  const marker = (dir: string): string => path.join(dir, 'ran');
  const w = world([]);
  const entry: EntityMetadata = { ...ON_LAPTOP, id: 'revoked', command: `touch ${marker(w.dir)}; echo ${REF}` };
  w.nodes.set(entry.id, node(entry));
  w.trust(entry.id, lineOf(entry));
  const ctx = ctxOf(w.terminal, entry);
  w.inScope.delete('db'); // the person narrowed the scope while the dialog stood

  const result = await w.terminal.run(ctx, {});

  assert.deepEqual(errorOf(result), { code: 'no_credential', message: BRIDGE_USE_REFUSED('sign-in') });
  assert.equal(fs.existsSync(marker(w.dir)), false, 'the line never ran');
  assert.deepEqual(w.reads, [], 'and the vault was never read for it');
  assert.ok(w.notes.some((line) => line.startsWith('creds_run — "sign-in": ')), w.notes.join('\n'));
});

test('S4-11: a script on this computer: its variable and its reference in the child\'s environment, both masked, the file removed', async () => {
  const entry: EntityMetadata = {
    id: 'winscript', name: 'winscript', isScript: true, isSshEnabled: false, terminalOs: 'windows', scriptLanguage: 'bash',
    script: `echo "var=\${TOKEN}"\necho "ref=${REF}"`, scriptVars: [{ name: 'TOKEN', value: VAR_VALUE }],
  };
  const w = world([entry]);
  w.trust(entry.id, entry.script as string);
  assert.equal(w.script.bridgedSite?.(targetOf(entry)), 'laptop');

  const result = await w.script.run(ctxOf(w.script, entry), {});

  const out = outOf(result);
  assert.equal(out.exitCode, 0, out.stderr);
  assert.equal(out.stdout, `var=${placeholderFor('TOKEN')}\nref=${placeholderFor('CREDS_REF_1')}\n`);
  assert.equal(w.ssh.length, 0);
  assert.deepEqual(fs.readdirSync(w.dir, { recursive: true }).filter((name) => String(name).startsWith('agent-script') || String(name).includes('/agent-script')), [], 'the script file is gone');
});
