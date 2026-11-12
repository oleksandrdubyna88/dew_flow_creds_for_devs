import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { AgentUseDeps, credentialExportEnvAction, dbQueryAction, scriptRunAction, terminalRunAction, vpnAction } from '../agentUseActions';
import { rotateAction } from '../rotateAction';
import type { SshUseDeps } from '../sshUseActions';
import { asksAfter } from '../useActions';
import type { OverSsh, UseAction } from '../useActions';
import { LEDGER, LedgerRow } from './promptSiteLedger';
import { PromptSite, WindowRead, scanSource } from './promptSiteScan';
import { Walker, rootsOf, walkerOver } from './promptSiteWalk';
import { memoryStorage } from './pinWorld';
import { discoverSources } from './tempSiteScan';
import { loadWithVscode } from './vscodeStub';
import { recordingLog } from './liveColourStorage';

/**
 * The prompt-site ledger (parent §7, §4.10's follow-up contract): every place the extension can ask a person something is a row of
 * `promptSiteLedger.ts`, held exact in both directions; a caller walk from the broker's own roots fails a `person-only` row that the
 * broker can reach; and every action a row says may prompt after its Allow carries the follow-up flag on its REAL factory.
 *
 * <p><b>Its limits, so nobody reads it as proof.</b> A reference path is not run-time truth. The walk sees no IPC (the signing modal
 * arrives through the agent's socket), no `executeCommand` by string, no timer or event hop and no child process's prompt. It proves
 * that a new site gets CLASSED, not that its class is right: that stays the review's.</p>
 */

// `out/test` and `src/test` are both two folders below `src_vs_code`.
const PROJECT = path.resolve(__dirname, '..', '..');
const SRC = path.join(PROJECT, 'src');

function scanTree(): { sites: PromptSite[]; windowReads: WindowRead[] } {
  const files = discoverSources(SRC, new Map([['test', 'the test tree: not shipped, and it makes no prompt of its own']]));
  const scanned = files.map((file) => scanSource(fs.readFileSync(path.join(SRC, file), 'utf8'), file));
  return { sites: scanned.flatMap((one) => one.sites), windowReads: scanned.flatMap((one) => one.windowReads) };
}

/** The ids in neither direction of the exact-set rule: sites with no row, and rows with no site. */
function mismatch(sites: readonly PromptSite[], ledger: Readonly<Record<string, LedgerRow>>): { unclassed: string[]; stale: string[] } {
  const found = new Set(sites.map((site) => site.id));
  return { unclassed: [...found].filter((id) => ledger[id] === undefined).sort(), stale: Object.keys(ledger).filter((id) => !found.has(id)).sort() };
}

/** The `person-only` rows whose site the broker reaches: what the walk must find empty. */
function personOnlyReached(sites: readonly PromptSite[], ledger: Readonly<Record<string, LedgerRow>>, reaches: (site: PromptSite) => boolean): string[] {
  return sites.filter((site) => ledger[site.id]?.class === 'person-only' && reaches(site)).map((site) => site.id);
}

/* ---------------------------------------------------------------------------------------------------------------
 * The scan
 * ------------------------------------------------------------------------------------------------------------- */

test('the scan reads a prompt site by its syntax: calls with two arguments, bare references, getSession — and not a comment, a string or a one-argument notice', () => {
  const planted = [
    "import * as vscode from 'vscode';",
    '// vscode.window.showQuickPick(x) in a comment',
    "const text = 'vscode.window.showInputBox()';",
    'export function a() {',
    "  void vscode.window.showWarningMessage('only a notice');",
    "  void vscode.window.showWarningMessage('a question', { modal: true }, 'Allow');",
    "  void vscode.window.showWarningMessage('and another', 'Yes');",
    '  void vscode.window.showQuickPick([]);',
    '  void vscode.window.showInputBox();',
    '  void vscode.authentication.getSession(\'github\', []);',
    '}',
    'export const ask = vscode.window.showQuickPick;',
    'export class K { m() { return vscode.window.createWebviewPanel; } }',
  ].join('\n');
  const { sites, windowReads } = scanSource(planted, 'planted.ts');
  assert.deepEqual(windowReads, []);
  assert.deepEqual(sites.map((site) => site.id), [
    'planted.ts#a#showWarningMessage#1',
    'planted.ts#a#showWarningMessage#2',
    'planted.ts#a#showQuickPick#1',
    'planted.ts#a#showInputBox#1',
    'planted.ts#a#getSession#1',
    'planted.ts#ask#ref:showQuickPick#1',
    'planted.ts#K.m#ref:createWebviewPanel#1',
  ]);
  assert.equal(sites.every((site) => !/\bline\b|:\d+$/.test(site.id)), true, 'an identity carries no line number');
});

test('`window` read any way but a direct member access fails BY NAME, one regression for each form', () => {
  const forms: Array<[WindowRead['form'], string]> = [
    ['alias', "import * as vscode from 'vscode';\nconst w = vscode.window;\nvoid w.showQuickPick([]);"],
    ['destructure', "import * as vscode from 'vscode';\nconst { window } = vscode;\nvoid window.showQuickPick([]);"],
    ['destructure', "import * as vscode from 'vscode';\nconst { showQuickPick } = vscode.window;\nvoid showQuickPick([]);"],
    ['named-import', "import { window } from 'vscode';\nvoid window.showQuickPick([]);"],
    ['named-import', "import { window as w } from 'vscode';\nvoid w.showQuickPick([]);"],
    ['element-access', "import * as vscode from 'vscode';\nvoid vscode['window'].showQuickPick([]);"],
  ];
  for (const [form, source] of forms) {
    const { windowReads } = scanSource(source, 'planted.ts');
    assert.deepEqual(windowReads.map((read) => read.form), [form], `${form}: ${source}`);
  }
});

test('more ways to hide a prompt fail BY NAME too: a spread call, a cast require, a hop through globalThis, a dynamic import', () => {
  const forms: Array<[WindowRead['form'], string]> = [
    ['spread-call', "import * as vscode from 'vscode';\nconst args: [string] = ['x'];\nvoid vscode.window.showWarningMessage(...args);"],
    ['require-cast', "import type * as vscode from 'vscode';\nconst editor = require('vscode') as typeof vscode;\nvoid editor.window.showQuickPick([]);"],
    ['global-hop', "void globalThis.window;"],
    ['global-hop', "void (globalThis as { vscode?: { window: { showQuickPick(items: string[]): void } } }).vscode?.window.showQuickPick([]);"],
    ['global-hop', "void (globalThis).vscode;"],
    ['global-hop', "void (<{ window?: unknown }>globalThis).window;"],
    ['dynamic-import', "async function ask(): Promise<void> {\n  const editor = await import('vscode');\n  void editor.window.showQuickPick([]);\n}\nvoid ask;"],
  ];
  for (const [form, source] of forms) {
    const { windowReads } = scanSource(source, 'planted.ts');
    assert.ok(windowReads.some((read) => read.form === form), `${form}: ${source} gave ${JSON.stringify(windowReads.map((read) => read.form))}`);
  }
});

test('a spread that leaves the count known is a site, not a hidden one: `showWarningMessage(text, ...buttons)` has two arguments', () => {
  const source = "import * as vscode from 'vscode';\nexport const ask = (buttons: string[]) => vscode.window.showWarningMessage('text', ...buttons);";
  const scanned = scanSource(source, 'planted.ts');
  assert.deepEqual([scanned.sites.map((site) => site.id), scanned.windowReads], [['planted.ts#ask#showWarningMessage#1'], []]);
});

test('a require of the editor, cast or not, is still followed: its sites are found', () => {
  const source = ["import type * as vscode from 'vscode';", "const editor = require('vscode') as typeof vscode;", 'export const ask = () => editor.window.showQuickPick([]);', "export const direct = () => require('vscode').window.showInputBox();"].join('\n');
  assert.deepEqual(scanSource(source, 'planted.ts').sites.map((site) => site.id), ['planted.ts#ask#showQuickPick#1', 'planted.ts#direct#showInputBox#1']);
});

test('a variable or a property that is merely named `window` is not the editor\'s window', () => {
  const source = ["import * as vscode from 'vscode';", 'const [scope, window] = entry;', 'const { window: covering } = book;', 'covering.window.until = 1;', 'void vscode.workspace;'].join('\n');
  assert.deepEqual(scanSource(source, 'planted.ts'), { sites: [], windowReads: [] });
});

test('the real tree has no `window` the scan cannot follow, and the scan finds the sites the audit counted (172)', () => {
  const { sites, windowReads } = scanTree();
  assert.deepEqual(windowReads, [], 'a window read as an alias or a destructure hides sites: write it as a direct member access');
  assert.equal(sites.length, 172, 'the audit of 2026-11-06 found 172; a different count is a new or a removed site, and the exact-set test names it');
});

/* ---------------------------------------------------------------------------------------------------------------
 * The ledger: exact in both directions
 * ------------------------------------------------------------------------------------------------------------- */

test('every prompt site has a row, and every row has a site: a new site fails until it is classed, a stale row until it is removed', () => {
  const { unclassed, stale } = mismatch(scanTree().sites, LEDGER);
  assert.deepEqual(unclassed, [], 'sites with no row in promptSiteLedger.ts: class them (and name the actions that can reach them)');
  assert.deepEqual(stale, [], 'rows whose site is gone: remove them');
});

test('the exact-set rule has teeth: an unclassed site and a stale row are each found', () => {
  const { sites } = scanTree();
  const without = Object.fromEntries(Object.entries(LEDGER).filter(([id]) => id !== sites[0].id));
  assert.deepEqual(mismatch(sites, without).unclassed, [sites[0].id]);
  assert.deepEqual(mismatch(sites, { ...LEDGER, 'gone.ts#nothing#showQuickPick#1': LEDGER[sites[0].id] }).stale, ['gone.ts#nothing#showQuickPick#1']);
});

/* ---------------------------------------------------------------------------------------------------------------
 * The walk
 * ------------------------------------------------------------------------------------------------------------- */

let walker: Walker | undefined;
const walk = (): Walker => (walker ??= walkerOver(SRC, PROJECT));
const reaches = (site: PromptSite): boolean => walk().reachesBroker(path.join(SRC, site.file), site.position);

test('the broker\'s roots are derived from extension.ts: the action factories, the hooks, and what the deps variables are built from', () => {
  const { names, ranges } = rootsOf(fs.readFileSync(path.join(SRC, 'extension.ts'), 'utf8'));
  for (const root of ['sshExecAction', 'sshTerminalAction', 'vpnAction', 'rotateAction', 'dbQueryAction', 'maskEntriesWithLink', 'mcpCreateHooks', 'sshDepsFor', 'agentVpnOpener', 'storeRotated']) {
    assert.ok(names.has(root), `${root} is a root`);
  }
  assert.ok(ranges.length > 10, 'the register calls and the broker construction are ranges of the wiring');
});

test('no `person-only` row has a path from the broker; the walk is not blind (the consent dialog and the install offer are reached)', () => {
  const { sites } = scanTree();
  assert.deepEqual(personOnlyReached(sites, LEDGER, reaches), [], 'a person-only row the broker can reach: class it, with the actions that reach it');
  for (const reached of ['brokerConsent.ts#ConsentGate.shown#showWarningMessage#1', 'toolEnsure.ts#confirmInstall#showWarningMessage#1', 'rotationStore.ts#storedUnderPin#showWarningMessage#1', 'vpnRun.ts#openVpnConnect#showInformationMessage#1']) {
    const site = sites.find((candidate) => candidate.id === reached);
    assert.ok(site !== undefined && reaches(site), `${reached} is reached: the walk walks`);
  }
});

test('the person-only check has teeth: a site the broker reaches, classed person-only, is named', () => {
  const { sites } = scanTree();
  const install = 'toolEnsure.ts#confirmInstall#showWarningMessage#1';
  const wrong = { ...LEDGER, [install]: { class: 'person-only' as const, actions: [] } };
  assert.deepEqual(personOnlyReached(sites, wrong, reaches), [install]);
});

/* ---------------------------------------------------------------------------------------------------------------
 * The flags, on the real factories
 * ------------------------------------------------------------------------------------------------------------- */

const TARGET = { accountId: 'a1', entityId: 'e1', entityName: 'prod' };

/** The real factories over deps that are never used: only the declared flag is read. */
function realFactories(): Record<string, UseAction> {
  const stub = { window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined), showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined) } };
  const ssh = loadWithVscode<typeof import('../sshUseActions')>('../sshUseActions', stub);
  const sshDeps: SshUseDeps = { storage: memoryStorage(stub), storageDir: '/unused', log: recordingLog().log, signal: new AbortController().signal, acquireExecSlot: () => undefined, note: () => undefined, agentSocket: () => undefined };
  const agent: AgentUseDeps & { onPath: (exe: string) => boolean; overSsh: OverSsh } = {
    storage: memoryStorage(stub),
    storageDir: '/unused',
    signal: new AbortController().signal,
    acquireExecSlot: () => undefined,
    note: () => undefined,
    trustStore: { get: () => [], update: () => Promise.resolve() },
    applyEnv: () => Promise.resolve({ written: [], withheld: [] }),
    onPath: () => false,
    overSsh: () => Promise.reject(new Error('this world has no SSH road')),
  };
  const vpn = { storage: { getNode: () => undefined }, open: () => Promise.resolve(false) };
  const exec = ssh.sshExecAction(sshDeps);
  return {
    exec,
    terminal: ssh.sshTerminalAction(sshDeps),
    up: vpnAction(vpn, 'up'),
    down: vpnAction(vpn, 'down'),
    rotate: rotateAction(exec, 'command', { generate: () => ({ ok: false, kind: 'x509', message: '' }), entity: () => undefined, current: () => Promise.resolve(undefined), snapshot: () => Promise.reject(new Error('unused')), record: () => Promise.resolve(), store: () => Promise.reject(new Error('unused')) }),
    query: dbQueryAction(agent),
    run: terminalRunAction(agent),
    script: scriptRunAction(agent),
    exportEnv: credentialExportEnvAction({ ...agent, remoteName: undefined }),
  };
}

/** The actions the ledger says can prompt after an Allow (a class of `after-allow`), by name. */
const afterAllowActions = (): Set<string> => new Set(Object.values(LEDGER).filter((row) => row.class === 'after-allow').flatMap((row) => row.actions));

test('every action an `after-allow` row names carries the follow-up flag on its real factory, and no other action does', () => {
  const factories = realFactories();
  const named = afterAllowActions();
  const flagged = (action: UseAction): boolean => typeof action.asksAfterConsent === 'function' || action.asksAfterConsent === true;
  for (const name of named) {
    if (name !== 'create') {
      assert.ok(flagged(factories[name]), `${name} can prompt after its Allow (the ledger says so) and its factory does not say so: the place would be freed under the prompt`);
    }
  }
  const carrying = Object.entries(factories).filter(([, action]) => flagged(action)).map(([name]) => name).sort();
  assert.deepEqual(carrying, [...named].filter((name) => name !== 'create').sort(), 'the factories that carry the flag are exactly the actions the ledger names (create is held below)');
  assert.deepEqual(['query', 'script', 'exportEnv'].filter((name) => flagged(factories[name])), [], 'query, script and exportEnv keep nothing');
});

test('`exec` declares it per entity — a function of the target, and true only for a forwarding entry with the agent socket up', () => {
  const exec = realFactories().exec;
  assert.equal(typeof exec.asksAfterConsent, 'function');
  assert.equal(asksAfter(exec, TARGET), false, 'no entry, no socket: nothing');
});

test('`create` declares it at the door: the consent call of confirmAndCreate passes the follow-up flag true (K1 holds the behaviour)', () => {
  const door = fs.readFileSync(path.join(SRC, 'brokerMcpDoor.ts'), 'utf8');
  assert.match(door, /door\.consent\(grant, 'create', [^;]*, caller, true\)/);
  assert.ok(afterAllowActions().has('create'), 'and a ledger row names it');
});

test('the flag check has teeth: an action the ledger names that its factory does not flag is found', () => {
  const factories = realFactories();
  const flagged = (action: UseAction): boolean => typeof action.asksAfterConsent === 'function' || action.asksAfterConsent === true;
  assert.equal(flagged({ ...factories.down, asksAfterConsent: undefined }), false, 'a factory without the flag reads as unflagged');
  assert.equal(flagged(factories.down), true);
});
