import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test } from 'node:test';
import { commandFingerprint } from '../commandTrust';
import { terminalRunAction } from '../agentUseActions';
import { planDependencyRun, StepRefusal } from '../dependencyRun';
import { FolderFacts, planFolderRun } from '../folderRun';
import { osMismatch } from '../hostShell';
import { sshLinkRefusal } from '../remoteLaunch';
import { CommandArg, EntityMetadata, TreeNode } from '../types';
import { arrowWorld, vaultOf } from './arrowWorld';
import { L, folderWorld, named, session } from './folderWorld';
import { loadWithVscode } from './vscodeStub';
import { memoryTrust, ownerChain, rootTitle, startVpn, terminalNamed, world } from './vpnWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/**
 * E1.S1 of `PLAN_terminal_command_over_ssh.md`: EVERY road that runs a Terminal entry refuses a linked one with the one
 * sentence, before any question, dependency, secret read or spawn. The shape of `commandNameRoads.test.ts`.
 */

const scope = cleanupScope();
after(() => scope.close());

const SENTENCE = (name: string): string => sshLinkRefusal({ id: 'x', name, sshEntityId: 's1' }) as string;

const LINKED: EntityMetadata = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' };

const RUN_THIS = /Run this command/;

test('the_arrow_refuses_a_linked_entry_before_any_question_even_when_trusted', async () => {
  const aw = arrowWorld({}, [['e1', 'echo linked']]);
  await aw.run({ ...LINKED, runDependencies: true, dependsOn: ['dep'] });
  assert.deepEqual(aw.warnings, [SENTENCE('deploy')]);
  assert.deepEqual(aw.terminals, []);
});

// W1b: the stored line is NOT trusted. A refusal that came after the trust question would show the modal first,
// so only an untrusted world can see "refused before any question" (the trusted W1 cannot: no modal is asked there).
test('the_arrow_refuses_a_linked_entry_before_the_trust_question_when_the_line_is_not_trusted', async () => {
  const aw = arrowWorld({}, []);
  await aw.run({ ...LINKED, runDependencies: true, dependsOn: ['dep'] });
  assert.deepEqual(aw.warnings, [SENTENCE('deploy')], 'the sentence is the only thing shown');
  assert.deepEqual(aw.warnings.filter((t) => RUN_THIS.test(t)), [], 'no trust modal');
  assert.deepEqual(aw.terminals, []);
});

test('run_with_secrets_refuses_a_linked_entry_and_reads_no_secret', async () => {
  const vault = vaultOf(['alert']);
  const aw = arrowWorld({}, [['e1', 'echo linked creds://me/alert/password']], vault.source);
  const args: CommandArg[] = [{ value: 'creds://me/alert/password' }];
  await aw.runWithSecrets({ ...LINKED, commandArgs: args });
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(vault.calls, []);
  assert.deepEqual(aw.warnings, [SENTENCE('deploy')]);
});

test('run_with_secrets_refuses_a_linked_entry_before_the_trust_question_and_reads_no_secret', async () => {
  const vault = vaultOf(['alert']);
  const aw = arrowWorld({}, [], vault.source);
  const args: CommandArg[] = [{ value: 'creds://me/alert/password' }];
  await aw.runWithSecrets({ ...LINKED, commandArgs: args });
  assert.deepEqual(aw.warnings, [SENTENCE('deploy')], 'the sentence is the only thing shown');
  assert.deepEqual(aw.warnings.filter((t) => RUN_THIS.test(t)), [], 'no trust modal');
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(vault.calls, []);
});

// ---- the folder run -------------------------------------------------------------------------------------------

const FACTS: FolderFacts = { shellRefusal: () => undefined, isOpen: () => false };
const ARGS: CommandArg[] = [{ value: '-t {name}' }];

function term(name: string, command = 'tmux attach', args: CommandArg[] | undefined = ARGS, extra: Partial<EntityMetadata> = {}): TreeNode {
  const details: EntityMetadata = { id: name, name, isSshEnabled: false, isTerminal: true, command, commandArgs: args, ...extra };
  return { id: details.id, name, type: 'entity', details };
}

test('the_folder_plan_does_not_run_a_linked_row', () => {
  const plan = planFolderRun([term('a'), term('b', 'tmux attach', ARGS, { sshEntityId: 's1' })], FACTS);
  const rows = (plan as unknown as { rows: { kind: string; name: string; reason?: string }[] }).rows;
  const a = rows.find((r) => r.name === 'a');
  const b = rows.find((r) => r.name === 'b');
  assert.equal(a?.kind, 'run');
  assert.equal(b?.kind, 'notRun');
  assert.equal(b?.reason, SENTENCE('b'));
});

test('a_folder_run_types_the_other_rows_and_reports_the_linked_one', async () => {
  const w = folderWorld([session('a'), { ...session('b'), sshEntityId: 's1' }]);
  await w.click();
  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
  assert.deepEqual(named(w, 'b'), []);
  assert.ok(w.infos.concat(w.warnings).join('\n').includes(SENTENCE('b').replace(/\.$/u, '')), w.infos.concat(w.warnings).join('\n'));
});

// ---- a dependency chain, a launcher ----------------------------------------------------------------------------

const here: StepRefusal = (name, os) => osMismatch(name, os, process.platform);

function terminalEntity(id: string, command: string, extra: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id, name: id, isSshEnabled: false, isTerminal: true, command, ...extra };
}

test('a_linked_step_refuses_the_whole_chain_in_the_planner', () => {
  const step = terminalEntity('step', 'x', { sshEntityId: 's1' });
  const root = terminalEntity('root', 'y', { dependsOn: ['step'], runDependencies: true });
  const byId = new Map([step, root].map((n) => [n.id, n]));
  assert.deepEqual(planDependencyRun([root], (id) => byId.get(id), here), { ok: false, reason: SENTENCE('step') });
});

test('a_linked_step_whose_line_uses_config_gets_the_one_shared_sentence_not_the_vpn_one', () => {
  // Refusal order: the link comes first, so a linked step always says the same sentence, whatever its line holds.
  const step = terminalEntity('step', 'openvpn --config {config}', { sshEntityId: 's1' });
  const root = terminalEntity('root', 'y', { dependsOn: ['step'], runDependencies: true });
  const byId = new Map([step, root].map((n) => [n.id, n]));
  assert.deepEqual(planDependencyRun([root], (id) => byId.get(id), here), { ok: false, reason: SENTENCE('step') });
});

test('a_linked_step_types_nothing_anywhere', async () => {
  const nodes = ownerChain();
  nodes.install = { ...nodes.install, sshEntityId: 's1' };
  const w = world({});
  const { started, dir } = await startVpn(scope, w, nodes);
  try {
    assert.equal(started, false);
    assert.deepEqual(w.terminals.flatMap((t) => [...t.executed, ...t.sent]), []);
    assert.ok(w.warnings.some((t) => t.includes(SENTENCE('install openvpn'))), w.warnings.join('\n'));
    assert.ok(!w.warnings.some((t) => /^Before /.test(t)), 'the chain modal never opened');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a_linked_launcher_starts_nothing_and_asks_nothing', async () => {
  const { start, vpn } = ownerChain();
  const nodes = {
    start: { ...start, name: 'start-openvpn', command: 'openvpn --config {config} --remote {name}', dependsOn: [], sshEntityId: 's1' },
    vpn: { ...vpn, dependsOn: [], runDependencies: false },
  };
  const w = world({});
  const { started, dir } = await startVpn(scope, w, nodes);
  try {
    assert.equal(started, false);
    assert.deepEqual(w.terminals, []);
    assert.ok(w.warnings.some((t) => t.includes(SENTENCE('start-openvpn'))), w.warnings.join('\n'));
    assert.deepEqual(w.warnings.filter((t) => RUN_THIS.test(t)), [], 'no trust modal');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the agent --------------------------------------------------------------------------------------------------

test('the_agent_run_refuses_a_linked_entry_before_the_trust_check_and_the_slot', async () => {
  let slotCalls = 0;
  const deps = {
    storage: { getNode: () => ({ details: LINKED }), getDbConnection: async () => '' },
    storageDir: '/tmp/does-not-matter',
    signal: new AbortController().signal,
    acquireExecSlot: () => {
      slotCalls += 1;
      return undefined;
    },
    note: () => undefined,
    trustStore: { get: () => [commandFingerprint('e1', 'echo linked')], update: async () => undefined },
    applyEnv: async () => ({ written: [] as string[], withheld: [] }),
    onPath: () => false,
  } as never;
  const ctx = { accountId: 'acct-1', entityId: 'e1', entityName: 'deploy', signal: new AbortController().signal };
  const result = await terminalRunAction(deps).run(ctx, {});
  const error = (result.body as { error?: { code?: string; message?: string } }).error;
  assert.equal(error?.code, 'not_supported');
  assert.equal(error?.message, SENTENCE('deploy'));
  assert.equal(slotCalls, 0);
});

// ---- Copy Command -----------------------------------------------------------------------------------------------

type Handler = (target: unknown) => Promise<void>;

function copyWorld() {
  const warnings: string[] = [];
  const infos: string[] = [];
  const copied: string[] = [];
  const stub = {
    window: {
      showWarningMessage: (m: string) => (warnings.push(m), Promise.resolve(undefined)),
      showInformationMessage: (m: string) => (infos.push(m), Promise.resolve(undefined)),
      showTextDocument: () => Promise.resolve(undefined),
    },
    env: { clipboard: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } },
    workspace: { openTextDocument: () => Promise.resolve({}) },
  };
  const mod = loadWithVscode<typeof import('../commands/entityCommands')>('../commands/entityCommands', stub, { '../extension': { maskingBanner: () => '' } });
  const registered: Record<string, Handler> = {};
  const register = (command: string, handler: Handler): void => void (registered[command] = handler);
  const storage = { getNode: () => undefined, getHistory: () => Promise.resolve([]) };
  const host = new Proxy({ register, storage, vaultKeys: { noteUserActivity: () => undefined } }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => undefined) });
  mod.registerEntityCommands(host as never);
  const copy = (node: unknown): Promise<void> => registered['credSshManager.copyCommand']({ kind: 'node', accountId: 'a1', node });
  return { warnings, infos, copied, copy };
}

test('copy_command_copies_nothing_for_a_linked_entry', async () => {
  const h = copyWorld();
  await h.copy({ id: 'e1', name: 'deploy', type: 'entity', details: LINKED });
  assert.deepEqual(h.copied, []);
  assert.deepEqual(h.infos, []);
  assert.deepEqual(h.warnings, [SENTENCE('deploy')]);
});

test('an_unlinked_entry_runs_as_before', async () => {
  const { sshEntityId: _link, ...plain } = LINKED;
  const aw = arrowWorld({}, [['e1', 'echo linked']]);
  await aw.run(plain);
  assert.deepEqual(terminalNamed(aw, rootTitle('deploy')).sent, ['echo linked']);
});

void memoryTrust;
