import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityMetadata } from '../types';
import { MAX_CHAIN_DEPTH, describeRunPlan, planDependencyRun } from '../dependencyRun';

/**
 * Issue #103 — which dependencies run before an entry is used, and in what order. The owner's
 * example is the first test; every other one is a graph shape an annotation could ignore and a
 * chain cannot.
 */

const hostOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';

function terminal(id: string, command: string, extra: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id, name: id, isSshEnabled: false, isTerminal: true, command, ...extra };
}

function graph(...nodes: EntityMetadata[]): (id: string) => EntityMetadata | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id) => byId.get(id);
}

const vpn = (extra: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id: 'vpn',
  name: 'org meter stage',
  isSshEnabled: false,
  isVpn: true,
  vpnType: 'openvpn',
  ...extra,
});

test('the owner\'s chain: install, then start, before the VPN — each once, dependencies first', () => {
  const install = terminal('install', 'winget install OpenVPN');
  const start = terminal('start', 'openvpn --config {config}', { dependsOn: ['install'], runDependencies: true });
  const root = vpn({ dependsOn: ['start'], runDependencies: true });

  const plan = planDependencyRun([root], graph(install, start, root), process.platform);

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.steps.map((s) => s.id), ['install', 'start']);
});

test('the launcher is excluded — it runs as the VPN\'s own action, never twice', () => {
  const install = terminal('install', 'winget install OpenVPN');
  const start = terminal('start', 'openvpn', { dependsOn: ['install'], runDependencies: true });
  const root = vpn({ dependsOn: ['start'], runDependencies: true, vpnLauncherEntityId: 'start' });

  const plan = planDependencyRun([root, start], graph(install, start, root), process.platform, new Set(['start']));

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.steps.map((s) => s.id), ['install']);
});

test('nothing runs unless the ROOT asks', () => {
  const plan = planDependencyRun([vpn({ dependsOn: ['a'] })], graph(terminal('a', 'x')), process.platform);
  assert.deepEqual(plan, { ok: true, steps: [], missing: [] });
});

test('a dependency\'s own dependencies are followed only when it asks too', () => {
  const inner = terminal('inner', 'inner');
  const middle = terminal('middle', 'middle', { dependsOn: ['inner'] }); // runDependencies off
  const plan = planDependencyRun([vpn({ dependsOn: ['middle'], runDependencies: true })], graph(inner, middle), process.platform);

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.steps.map((s) => s.id), ['middle']);
});

test('a diamond runs the shared dependency once, first', () => {
  const base = terminal('base', 'base');
  const left = terminal('left', 'left', { dependsOn: ['base'], runDependencies: true });
  const right = terminal('right', 'right', { dependsOn: ['base'], runDependencies: true });
  const root = vpn({ dependsOn: ['left', 'right'], runDependencies: true });

  const plan = planDependencyRun([root], graph(base, left, right), process.platform);

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.steps.map((s) => s.id), ['base', 'left', 'right']);
});

test('a cycle refuses the WHOLE run and names it — nothing is half-run', () => {
  const a = terminal('a', 'a', { dependsOn: ['b'], runDependencies: true });
  const b = terminal('b', 'b', { dependsOn: ['a'], runDependencies: true });

  const plan = planDependencyRun([vpn({ dependsOn: ['a'], runDependencies: true })], graph(a, b), process.platform);

  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.reason, /in a circle.*a → b → a/);
});

test('a chain back to the root itself is a cycle too', () => {
  const a = terminal('a', 'a', { dependsOn: ['vpn'], runDependencies: true });
  const root = vpn({ dependsOn: ['a'], runDependencies: true });

  const plan = planDependencyRun([root], graph(a, root), process.platform);

  assert.equal(plan.ok, false);
});

test('a chain deeper than the bound is refused rather than followed', () => {
  const nodes = Array.from({ length: MAX_CHAIN_DEPTH + 2 }, (_, i) =>
    terminal(`n${i}`, `step ${i}`, { dependsOn: [`n${i + 1}`], runDependencies: true }),
  );
  const plan = planDependencyRun([vpn({ dependsOn: ['n0'], runDependencies: true })], graph(...nodes), process.platform);

  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.reason, /deeper than 16/);
});

test('a dangling id is REPORTED as missing, never dropped in silence', () => {
  const plan = planDependencyRun([vpn({ dependsOn: ['gone', 'a'], runDependencies: true })], graph(terminal('a', 'a')), process.platform);

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.missing, ['gone']);
  assert.deepEqual(plan.steps.map((s) => s.id), ['a']);
  assert.match(describeRunPlan('vpn', plan.steps, plan.missing), /Missing — a dependency no longer exists and cannot run: gone/);
});

test('a non-executable dependency is an annotation: passed over, not followed', () => {
  const host = { id: 'host', name: 'bastion', isSshEnabled: true, host: 'h', dependsOn: ['x'], runDependencies: true };
  const plan = planDependencyRun([vpn({ dependsOn: ['host'], runDependencies: true })], graph(host, terminal('x', 'x')), process.platform);

  assert.deepEqual(plan, { ok: true, steps: [], missing: [] });
});

test('a Terminal entry with an empty command is not a step', () => {
  const plan = planDependencyRun([vpn({ dependsOn: ['e'], runDependencies: true })], graph(terminal('e', '   ')), process.platform);
  assert.deepEqual(plan, { ok: true, steps: [], missing: [] });
});

test('a step written for another OS refuses the chain before anything runs', () => {
  const other = hostOs === 'windows' ? 'linux' : 'windows';
  const plan = planDependencyRun(
    [vpn({ dependsOn: ['a'], runDependencies: true })],
    graph(terminal('a', 'a', { terminalOs: other })),
    process.platform,
  );

  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.reason, /is written for/);
});

test('the pre-run sentence lists every step in order with its line', () => {
  const text = describeRunPlan('org meter stage', [
    { id: 'i', name: 'install openvpn', line: 'winget install OpenVPN' },
    { id: 's', name: 'start openvpn', line: 'openvpn' },
  ], []);
  assert.match(text, /Before "org meter stage", these run in order/);
  assert.match(text, /1\. install openvpn: winget install OpenVPN\n2\. start openvpn: openvpn/);
  assert.doesNotMatch(text, /Missing/);
});
