import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test } from 'node:test';
import { resolveCommand } from '../commandLine';
import { planLaunch, sshLinkOf, sshLinkRefusal, trustLineFor, typedLine } from '../remoteLaunch';
import type { EntityMetadata, TreeNode } from '../types';
import { ArrowWorld, arrowWorld, vaultOf } from './arrowWorld';
import { FakeRoad, fakeRoad, sshNode } from './sshRoadWorld';
import { hostOs, memoryTrust, ownerChain, seedTrusted, startVpn, world } from './vpnWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/**
 * No local sink (parent `PLAN_terminal_command_over_ssh.md` §4.5 (5); E3.S1 rows LN1-LN11). The road scan reads imports, not where
 * a resolved line flows. Five roads resolve the line before they read the link, or treat the link as absent by construction, so
 * the guarantee "a linked entry's command never runs on this machine" is held here, per road, for each of three links:
 *
 * <ul>
 *   <li>VALID: the SSH entry `s1` is in storage and a fake road answers ready;</li>
 *   <li>MISSING: there is no `s1` in storage;</li>
 *   <li>REFUSED: `s1` is there but `sshLinkOf` refuses it (it is not an SSH entry, or its host is `-oProxyCommand=x`).</li>
 * </ul>
 *
 * <p>The local sinks: the arrow's `typeIntoEntryTerminal` (seen as a terminal whose `sent` holds BARE as one whole send), the local
 * masked run (an `aw.masked` record with `commandLine`), the chain's typed step (`terminal.sendText` or `executeCommand`: BARE in a
 * terminal's `sent` OR its `executed`, so every chain test checks BOTH) and the launcher's local send.</p>
 *
 * <p><b>Trust in the fixture.</b> In every trusted case the trust store ALSO trusts BARE, the bare local line. Without that, a
 * bypassed road would stop at the local trust modal and the test would stay green for the wrong reason. Each test here was
 * watched RED by a temporary local edit that bypasses EVERY wall its road has (the routing branch made to answer "no link" for every
 * entry, and the local road's own `sshLinkRefusal` where it has one); the bypass was never committed (the pass and the RED
 * messages are in the commit that added this file).</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const S1 = sshNode('s1');
const NOT_SSH: TreeNode = { id: 's1', name: 'plain box', type: 'entity', details: { id: 's1', name: 'plain box', isSshEnabled: false, isTerminal: true, command: 'x' }, parentId: null };
const UNSAFE_HOST = sshNode('s1', { host: '-oProxyCommand=x' });

type Link = 'valid' | 'missing' | 'not-ssh' | 'unsafe-host';
const LINKS: Record<Link, TreeNode[]> = { valid: [S1], missing: [], 'not-ssh': [NOT_SSH], 'unsafe-host': [UNSAFE_HOST] };

/** The vault `lookup` over the nodes a case seeds. */
const lookupOver = (nodes: readonly TreeNode[]) => (id: string): TreeNode | undefined => nodes.find((n) => n.id === id);

/** The REFUSED fixtures are refused by the real validator, and the MISSING one is missing: a fixture the code accepts proves nothing (testing.md). */
function assertLinkIs(entry: EntityMetadata, link: Link): void {
  const kind = sshLinkOf(entry, lookupOver(LINKS[link])).kind;
  assert.equal(kind, link === 'valid' ? 'linked' : 'refused', `the ${link} fixture is not what it says`);
}

const only = <T>(list: readonly T[]): T => {
  assert.equal(list.length, 1, `expected one, got ${list.length}`);
  return list[0];
};
const sentAnywhere = (aw: { terminals: { sent: string[] }[] }): string[] => aw.terminals.flatMap((t) => t.sent);
const executedAnywhere = (aw: { terminals: { executed: string[] }[] }): string[] => aw.terminals.flatMap((t) => t.executed);
const bareOf = (entry: EntityMetadata): string => {
  const resolved = resolveCommand(entry);
  assert.equal(resolved.kind, 'ready');
  return (resolved as { line: string }).line;
};

interface Case {
  aw: ArrowWorld;
  road: FakeRoad;
  vault: { calls: string[] };
}

/** The trust lines a VALID case approves, and BARE too: so the local trust modal can never stop a bypassed road. */
function trustedFor(entry: EntityMetadata, link: Link, extra: readonly (readonly [string, string])[] = []): (readonly [string, string])[] {
  const trusted: (readonly [string, string])[] = [[entry.id, bareOf(entry)], ...extra];
  const plan = planLaunch(entry, sshLinkOf(entry, lookupOver(LINKS[link])), { stayOpen: true });
  return plan.kind === 'remote' ? [...trusted, [entry.id, trustLineFor(S1.details as EntityMetadata, undefined, plan.line)]] : trusted;
}

function caseOf(entry: EntityMetadata, link: Link, others: readonly TreeNode[] = [], trusted: readonly (readonly [string, string])[] = []): Case {
  assertLinkIs(entry, link);
  const aliveNodes = new Map<string, TreeNode>();
  const road = fakeRoad(undefined, (id) => aliveNodes.get(id));
  const vault = vaultOf(['alert'], () => ({ kind: 'value', value: 'correct-horse-battery-staple' }));
  const aw = arrowWorld({ others: [...LINKS[link], ...others], sshRoad: road }, [...trustedFor(entry, link), ...trusted], vault.source);
  for (const node of [...LINKS[link], ...others]) {
    aliveNodes.set(node.id, node);
  }
  return { aw, road, vault };
}

// ---- the arrow -----------------------------------------------------------------------------------------------------------------

const ARROW: EntityMetadata = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' };

test('the_arrow_never_types_the_bare_line_of_a_valid_link', async () => {
  const { aw, road } = caseOf(ARROW, 'valid');
  await aw.run(ARROW);
  const sent = sentAnywhere(aw);
  assert.ok(!sent.includes(bareOf(ARROW)), `the bare line was typed: ${JSON.stringify(sent)}`);
  const plan = planLaunch(ARROW, sshLinkOf(ARROW, lookupOver(LINKS.valid)), { stayOpen: true });
  assert.equal(plan.kind, 'remote');
  if (plan.kind === 'remote') {
    const typed = typedLine(plan, only(road.readies), { shellPath: '/bin/bash', family: 'posix' });
    assert.equal(typed.kind, 'typed');
    assert.deepEqual(sent, [typed.kind === 'typed' ? typed.line : '']);
  }
});

test('the_arrow_never_types_the_bare_line_of_a_missing_link', async () => {
  const { aw } = caseOf(ARROW, 'missing');
  await aw.run(ARROW);
  assert.deepEqual(sentAnywhere(aw), []);
  assert.deepEqual(aw.warnings, [(sshLinkOf(ARROW, lookupOver([])) as { reason: string }).reason]);
});

test('the_arrow_never_types_the_bare_line_of_a_refused_link', async () => {
  for (const link of ['not-ssh', 'unsafe-host'] as const) {
    const { aw } = caseOf(ARROW, link);
    await aw.run(ARROW);
    assert.deepEqual(sentAnywhere(aw), [], link);
  }
});

// ---- Run with Secrets -----------------------------------------------------------------------------------------------------------

const SECRETS: EntityMetadata = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'printenv', commandArgs: [{ value: 'creds://me/alert/password' }], sshEntityId: 's1' };

test('run_with_secrets_never_runs_a_valid_link_here', async () => {
  const { aw } = caseOf(SECRETS, 'valid');
  await aw.runWithSecrets(SECRETS);
  const run = only(aw.masked);
  assert.equal(run.commandLine, undefined, 'a local child through a shell');
  assert.ok(run.argv !== undefined, 'the child is ssh by argv');
  assert.ok(aw.masked.every((record) => record.commandLine === undefined));
});

test('run_with_secrets_never_runs_a_missing_link_here', async () => {
  const { aw, vault } = caseOf(SECRETS, 'missing');
  await aw.runWithSecrets(SECRETS);
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(vault.calls, []);
});

test('run_with_secrets_never_runs_a_refused_link_here', async () => {
  for (const link of ['not-ssh', 'unsafe-host'] as const) {
    const { aw, vault } = caseOf(SECRETS, link);
    await aw.runWithSecrets(SECRETS);
    assert.deepEqual(aw.masked, [], link);
    assert.deepEqual(vault.calls, [], link);
  }
});

// ---- the dependency chain --------------------------------------------------------------------------------------------------------

const STEP: EntityMetadata = { id: 'st', name: 'migrate', isSshEnabled: false, isTerminal: true, command: 'migrate', sshEntityId: 's1' };
const ROOT: EntityMetadata = { id: 'r', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo root', terminalOs: hostOs, dependsOn: ['st'], runDependencies: true };
const STEP_NODE: TreeNode = { id: 'st', name: 'migrate', type: 'entity', details: STEP, parentId: null };

/** A local root that depends on the linked step; the step's link is the one under test. */
function chainCase(link: Link): Case {
  assertLinkIs(STEP, link);
  const aliveNodes = new Map<string, TreeNode>([[STEP_NODE.id, STEP_NODE], ...LINKS[link].map((n) => [n.id, n] as [string, TreeNode])]);
  const road = fakeRoad(undefined, (id) => aliveNodes.get(id));
  const plan = planLaunch(STEP, sshLinkOf(STEP, lookupOver(LINKS[link])), { stayOpen: false });
  const stepTrust: (readonly [string, string])[] = [['st', bareOf(STEP)], ...(plan.kind === 'remote' ? [['st', trustLineFor(S1.details as EntityMetadata, undefined, plan.line)] as const] : [])];
  const aw = arrowWorld({ others: [...LINKS[link], STEP_NODE], sshRoad: road }, [['r', 'echo root'], ...stepTrust]);
  return { aw, road, vault: { calls: [] } };
}

test('a_chain_never_types_the_bare_line_of_a_valid_linked_step', async () => {
  const { aw } = chainCase('valid');
  await aw.run(ROOT);
  assert.ok(!sentAnywhere(aw).includes(bareOf(STEP)), `the bare step was sent: ${JSON.stringify(sentAnywhere(aw))}`);
  assert.ok(!executedAnywhere(aw).includes(bareOf(STEP)), `the bare step was executed: ${JSON.stringify(executedAnywhere(aw))}`);
  assert.ok(executedAnywhere(aw).some((line) => line.includes('deploy@prod.example')), 'the linked step runs over SSH (E2.S3)');
});

test('a_chain_never_types_the_bare_line_of_a_missing_linked_step', async () => {
  const { aw } = chainCase('missing');
  await aw.run(ROOT);
  assert.ok(!sentAnywhere(aw).includes(bareOf(STEP)) && !executedAnywhere(aw).includes(bareOf(STEP)));
  assert.deepEqual([...sentAnywhere(aw), ...executedAnywhere(aw)], [], 'the chain is refused before any step is typed');
});

test('a_chain_never_types_the_bare_line_of_a_refused_linked_step', async () => {
  for (const link of ['not-ssh', 'unsafe-host'] as const) {
    const { aw } = chainCase(link);
    await aw.run(ROOT);
    assert.ok(!sentAnywhere(aw).includes(bareOf(STEP)) && !executedAnywhere(aw).includes(bareOf(STEP)), link);
    assert.deepEqual([...sentAnywhere(aw), ...executedAnywhere(aw)], [], link);
  }
});

// ---- the roads that treat the link as absent by construction ---------------------------------------------------------------------

test('an_agents_vpn_start_never_types_a_linked_launcher_here', async () => {
  // An agent's start passes no road, so `linkOf` answers `none` (E2-D2): the launcher's own wall (`launcherRefusal`) is the only one.
  const { start, vpn } = ownerChain();
  const launcher: EntityMetadata = { ...start, name: 'start-openvpn', command: 'echo start-vpn', dependsOn: [], runDependencies: false, sshEntityId: 's1' };
  const nodes = { start: launcher, vpn: { ...vpn, dependsOn: [], runDependencies: false } };
  const trust = memoryTrust();
  seedTrusted(trust, [['start', bareOf(launcher)]]);
  const w = world({});
  const { started, dir } = await startVpn(scope, w, nodes, { trust });
  try {
    assert.equal(started, false);
    assert.deepEqual(w.terminals.flatMap((t) => [...t.sent, ...t.executed]), [], 'nothing typed anywhere');
    assert.ok(w.warnings.some((text) => text.includes(sshLinkRefusal(launcher) as string)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a_chain_with_no_lookup_never_types_a_linked_step_here', async () => {
  // The same agent start, the launcher unlinked, one chain step linked: the walk has no lookup, so every step is unlinked by construction
  // (`NO_LINK`) and `stepRefusal`'s `sshLinkRefusal` is the only wall.
  const nodes = ownerChain();
  nodes.install = { ...nodes.install, sshEntityId: 's1' };
  const trust = memoryTrust();
  seedTrusted(trust, [['install', bareOf(nodes.install)], ['start', bareOf(nodes.start)]]);
  const w = world({});
  const { started, dir } = await startVpn(scope, w, nodes, { trust });
  try {
    assert.equal(started, false);
    const bare = bareOf(nodes.install);
    assert.ok(!w.terminals.flatMap((t) => t.sent).includes(bare), 'the bare step was sent');
    assert.ok(!w.terminals.flatMap((t) => t.executed).includes(bare), 'the bare step was executed');
    assert.ok(w.warnings.some((text) => text.includes(sshLinkRefusal(nodes.install) as string)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

