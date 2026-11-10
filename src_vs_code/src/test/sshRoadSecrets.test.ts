import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { isCommandTrusted } from '../commandTrust';
import { RemotePlan, maskedOverSshBanner, planLaunch, secretsLaunch, secretsLocalOnly, secretsOverSshBanner, secretsStdin, sshLinkOf, sshLinkRefusal, trustLineFor } from '../remoteLaunch';
import { E3_INHERITED_DROP, NO_AGENT_TO_FORWARD, NO_SSH_TO_SPAWN } from '../sshProgram';
import type { ReadySsh } from '../sshSession';
import type { CommandArg, EntityMetadata, TreeNode } from '../types';
import { ArrowOptions, ArrowWorld, MaskedRecord, arrowWorld, runCommandsModule, vaultOf } from './arrowWorld';
import { OUR_SOCKET } from './fakePaths';
import { FakeRoad, RoadScript, fakeRoad, recordDialogs, sshNode } from './sshRoadWorld';
import { hostOs, until } from './vpnWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/**
 * E3.S1 of `PLAN_terminal_command_over_ssh.md`: *Run with Secrets* on a linked Terminal entry runs the line on the chosen host, in
 * the order link, plan, prepare, trust, dependencies, resolve the values, spawn, from ONE snapshot, with ONE OWNER for the prepared
 * session and a once-only hand-over to the masked run. The seam is the fake road (`sshRoadWorld.ts`); the masked run is recorded
 * (`arrowWorld.ts`), and what it does with a real child is `maskedTerminal.test.ts`'s. Everything the road does with the answers
 * is the real code. One positive per file (testing.md): S7 is the happy run, and it fails when the fixture is wrong.
 */

const scope = cleanupScope();
after(() => scope.close());

const VALUE = 'correct-horse-battery-staple';
const LINKED: EntityMetadata = {
  id: 'e1',
  name: 'deploy',
  isSshEnabled: false,
  isTerminal: true,
  command: 'printenv',
  commandArgs: [{ value: 'creds://me/alert/password' }],
  sshEntityId: 's1',
};
const S1 = sshNode('s1');
const RUN_THIS = /Run this command/;

const lookupOf = (aw: { nodes: Record<string, unknown> }) => (id: string): TreeNode | undefined => aw.nodes[id] as TreeNode | undefined;

function planFor(entry: EntityMetadata, lookup: (id: string) => TreeNode | undefined): RemotePlan {
  const plan = planLaunch(entry, sshLinkOf(entry, lookup), { stayOpen: false });
  assert.equal(plan.kind, 'remote', `the plan of ${entry.name} is not remote: ${JSON.stringify(plan)}`);
  return plan as RemotePlan;
}

/** The plan over a vault that holds `S1`, before any road ran: the line the person approves. */
const PLAN = planFor(LINKED, (id) => (id === 's1' ? S1 : undefined));
const TRUST_LINE = trustLineFor(S1.details as EntityMetadata, undefined, PLAN.line);
/** The bare local line: every trusted fixture trusts it too, so a bypassed road would not stop at a local trust modal (parent §4.5 (5)). */
const BARE = PLAN.line;

/** A vault of one entity `alert` whose password is `VALUE`; each read pushes `resolve` to `events`. */
function recordingVault(events: string[]) {
  const vault = vaultOf(['alert'], () => ({ kind: 'value', value: VALUE }));
  const source = {
    ...vault.source,
    fieldReading: (...args: Parameters<typeof vault.source.fieldReading>) => {
      events.push('resolve');
      return vault.source.fieldReading(...args);
    },
  };
  return { source, calls: vault.calls };
}

interface Setup {
  aw: ArrowWorld;
  road: FakeRoad;
  events: string[];
  vault: { calls: string[] };
}

interface SetupOptions {
  script?: RoadScript;
  arrow?: ArrowOptions;
  trusted?: readonly (readonly [string, string])[];
  others?: TreeNode[];
  warning?: string;
  refused?: string;
  source?: unknown;
}

function withDefaults(o: SetupOptions): { trusted: readonly (readonly [string, string])[]; others: TreeNode[] } {
  return { trusted: o.trusted ?? [['e1', TRUST_LINE], ['e1', BARE]], others: o.others ?? [S1] };
}

/** The world: the entry is stored by the click, the SSH entry `s1` is in storage, and the trust line AND the bare line are trusted. */
function setup(o: SetupOptions = {}): Setup {
  const { trusted, others } = withDefaults(o);
  const events: string[] = [];
  const box: { aw?: ArrowWorld } = {};
  const lookup = (id: string): TreeNode | undefined => box.aw?.nodes[id] as TreeNode | undefined;
  const road = fakeRoad(o.script, lookup, events, o.warning, o.refused);
  const vault = recordingVault(events);
  const aw = arrowWorld({ others, sshRoad: road, events, ...o.arrow }, trusted, o.source ?? vault.source);
  box.aw = aw;
  recordDialogs(aw, events);
  return { aw, road, events, vault };
}

const only = <T>(list: readonly T[]): T => {
  assert.equal(list.length, 1, `expected one, got ${list.length}`);
  return list[0];
};

/** The one masked run, narrowed to its argv variant. */
function theRun(aw: ArrowWorld): MaskedRecord & { argv: readonly string[]; stdinText: string; cwd: string } {
  const run = only(aw.masked);
  assert.ok(run.argv !== undefined && run.stdinText !== undefined && run.cwd !== undefined, `not an argv run: ${JSON.stringify(run)}`);
  return run as MaskedRecord & { argv: readonly string[]; stdinText: string; cwd: string };
}

const secretsOf = (r: ReadySsh): { value: string; label: string }[] => {
  assert.ok(r.kind === 'ready');
  return [{ value: VALUE, label: 'CREDS_REF_1' }];
};

const DEP: TreeNode = { id: 'dep', name: 'dep', type: 'entity', details: { id: 'dep', name: 'dep', isSshEnabled: false, isTerminal: true, command: 'echo dep', terminalOs: hostOs } };

// ---- the road, in its order ---------------------------------------------------------------------------------------------------

test('the_order_is_prepare_trust_dependencies_resolve_spawn', async () => {
  const { aw, events } = setup({ arrow: { others: [S1, DEP], onExecute: (line) => events.push(`execute: ${line}`) }, trusted: [['dep', 'echo dep']] });
  await aw.runWithSecrets({ ...LINKED, dependsOn: ['dep'], runDependencies: true });
  const marks: [RegExp, string][] = [[/^prepare /, 'prepare'], [/^dialog: [\s\S]*Run this command/, 'trust'], [/^execute: echo dep$/, 'dep'], [/^resolve$/, 'resolve'], [/^spawn$/, 'spawn']];
  const labels = events.flatMap((e) => marks.filter(([pattern]) => pattern.test(e)).map(([, label]) => label));
  assert.deepEqual(labels, ['prepare', 'trust', 'dep', 'resolve', 'spawn'], events.join('\n'));
  assert.equal(events[0], 'prepare s1#1');
});

test('no_child_and_no_value_before_the_trust_answer', async () => {
  const { aw, road, vault } = setup({ arrow: { holdDialogs: RUN_THIS }, trusted: [['e1', BARE]] });
  const running = aw.runWithSecrets(LINKED);
  await until(() => aw.held.length === 1, 'the trust modal');
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(vault.calls, []);
  assert.equal(road.calls.length, 1, 'prepared, so the host-key question could come first');
  aw.held[0].answer('Run');
  await running;
  assert.equal(aw.masked.length, 1);
});

test('the_child_is_ssh_by_argv_with_no_value_in_argv_or_env', async () => {
  const { aw, road } = setup();
  await aw.runWithSecrets(LINKED);
  const r1 = only(road.readies);
  const run = theRun(aw);
  const spawn = only(road.launches);
  const launch = secretsLaunch(PLAN, r1, spawn.kind === 'spawn' && spawn.ownAgent);
  assert.equal(launch.kind, 'spawn');
  assert.deepEqual(run.argv, ['ssh', ...(launch.kind === 'spawn' ? launch.argv : [])]);
  assert.equal(run.commandLine, undefined);
  assert.ok(!run.argv.some((element) => element.includes(VALUE)), 'no value in argv');
  assert.ok(!Object.values(run.env).some((value) => value.includes(VALUE)), 'no value in the environment');
  assert.deepEqual(road.uses, ['spawn']);
  assert.equal(run.cwd, only(road.launches).kind === 'spawn' ? (road.launches[0] as { cwd: string }).cwd : undefined, 'the folder spawnLaunch gave');
  assert.equal(run.cwd, '/storage', 'never the workspace (B1)');
});

test('stdin_carries_the_exports_and_the_line_in_a_group_then_exit', async () => {
  const { aw } = setup();
  await aw.runWithSecrets(LINKED);
  const run = theRun(aw);
  assert.equal(run.stdinText, secretsStdin({ CREDS_REF_1: VALUE }, 'printenv "$CREDS_REF_1"'));
  assert.ok(run.stdinText.includes('} </dev/null'));
  assert.ok(run.stdinText.endsWith('exit $?\n'));
});

test('the_output_is_masked_and_the_banner_says_not_interactive', async () => {
  const { aw, road } = setup();
  await aw.runWithSecrets(LINKED);
  const r1 = only(road.readies);
  const run = theRun(aw);
  assert.deepEqual(run.secrets, secretsOf(r1));
  assert.ok(run.banner.endsWith(secretsOverSshBanner(r1.target as string, run.secrets)), run.banner);
  assert.ok(!run.banner.includes('Note:'), 'the fake road gives no warning');
  assert.ok(run.banner.startsWith('CREDS_REF_1 = password of me/alert'), run.banner);
});

test('trust_is_asked_on_the_trust_line_and_one_approval_covers_the_arrow', async () => {
  const asked = setup({ trusted: [['e1', BARE]] });
  await asked.aw.runWithSecrets(LINKED);
  const r1 = only(asked.road.readies);
  const line = trustLineFor(r1.entity, r1.jump, PLAN.line);
  assert.ok(only(asked.aw.warnings.filter((t) => RUN_THIS.test(t))).includes(line), 'the modal shows the trust line');
  assert.equal(isCommandTrusted(asked.aw.trust, 'e1', line), true, 'and the approval is recorded under it');

  const local = setup({ trusted: [['e1', BARE]], arrow: { modal: 'dismiss' } });
  await local.aw.runWithSecrets(LINKED);
  assert.equal(local.aw.warnings.filter((t) => RUN_THIS.test(t)).length, 1, 'a trusted LOCAL line does not skip the SSH question');
  assert.deepEqual(local.aw.masked, []);
});

test('a_linked_entry_runs_with_secrets_over_ssh', async () => {
  const { aw, road } = setup();
  await aw.runWithSecrets(LINKED);
  const run = only(aw.masked);
  assert.ok(run.onEnded !== undefined);
  assert.deepEqual(road.cleaned, [], 'the hand-over took the session off the owner\'s list once the run existed');
  assert.deepEqual(road.cleanupCalls, [], 'and the owner\'s finally did not touch it');
  run.onEnded?.();
  run.onEnded?.();
  assert.deepEqual(road.cleanupCalls, ['s1#1'], 'the run\'s end cleans it, once');
});

test('a_password_entry_puts_askpass_in_the_child_env_never_in_argv', async () => {
  const { aw, road } = setup({ script: () => ({ password: true }) });
  await aw.runWithSecrets(LINKED);
  const r1 = only(road.readies);
  const run = theRun(aw);
  assert.ok(r1.env !== undefined);
  for (const [name, value] of Object.entries(r1.env ?? {})) {
    assert.equal(run.env[name], value, `${name} reaches the child through the environment`);
  }
  assert.ok(run.argv.includes('NumberOfPasswordPrompts=1'));
  assert.ok(!run.argv.some((element) => element.includes((r1.env as Record<string, string>).CREDS_ASKPASS_PASSWORD)), 'the password is not in argv');
});

test('the_run_adds_only_the_askpass_and_agent_variables_and_no_value', async () => {
  for (const script of [(): { password?: true } => ({}), (): { password?: true } => ({ password: true })]) {
    const { aw, road } = setup({ script });
    await aw.runWithSecrets(LINKED);
    const r1 = only(road.readies);
    const run = theRun(aw);
    const allowed = new Set([...Object.keys(r1.env ?? {}), 'SSH_AUTH_SOCK']);
    for (const [name, value] of Object.entries(run.env)) {
      assert.ok(allowed.has(name), `an unexpected variable in the ssh environment: ${name}`);
      assert.ok(!name.startsWith('CREDS_REF_'), name);
      assert.ok(!value.includes(VALUE), `a resolved value in ${name}`);
    }
    assert.ok(run.stdinText.includes(VALUE), 'the value went somewhere: stdin, and only there');
  }
});

test('the_spawn_warning_is_in_the_banner_and_no_toast_races_the_run', async () => {
  const { aw, road, events } = setup({ warning: NO_AGENT_TO_FORWARD });
  await aw.runWithSecrets(LINKED);
  const r1 = only(road.readies);
  const run = theRun(aw);
  const lines = run.banner.split('\r\n');
  assert.equal(run.banner, maskedOverSshBanner(lines[0], NO_AGENT_TO_FORWARD, r1.target as string, run.secrets));
  assert.equal(lines[1], `Note: ${NO_AGENT_TO_FORWARD}.`);
  assert.equal(lines[2], secretsOverSshBanner(r1.target as string, run.secrets));
  assert.deepEqual(events.filter((e) => e.startsWith('dialog:') && e.includes(NO_AGENT_TO_FORWARD)), [], 'a toast would race the run');
});

// ---- the agent socket and the child's environment (F3, F6 (3); parent D16, D17) -----------------------------------------------

const FORWARDING = sshNode('s1', { agentForward: true });

/** The world of a forwarding SSH entry: only the bare line is trusted, so the trust modal is asked, with the trust line that was approved. */
function forwardingWorld(o: SetupOptions = {}): Setup {
  return setup({ ...o, others: [FORWARDING], trusted: [['e1', BARE]] });
}

test('a_run_with_secrets_that_forwards_with_no_agent_up_sends_no_dash_a', async () => {
  const { aw, events } = forwardingWorld({ warning: NO_AGENT_TO_FORWARD });
  await aw.runWithSecrets(LINKED);
  const run = theRun(aw);
  assert.ok(!run.argv.includes('-A'), `no -A while the banner says that nothing is forwarded: ${run.argv.join(' ')}`);
  assert.ok(run.argv.some((word, i) => word === '-o' && run.argv[i + 1] === 'ForwardAgent=no'), 'and -o ForwardAgent=no');
  assert.ok(run.banner.includes(`Note: ${NO_AGENT_TO_FORWARD}.`), 'the banner says it');
  const trustLine = trustLineFor(FORWARDING.details as EntityMetadata, undefined, PLAN.line);
  assert.ok(trustLine.includes(' -A '), 'the fixture: the approval shows -A');
  assert.ok(events.some((e) => e.startsWith('dialog: ') && e.includes(trustLine)), 'the trust line that was asked still holds -A: the launch does less than was approved');
});

test('a_forwarding_entry_with_our_agent_up_sends_dash_a_and_our_socket', async () => {
  const { aw } = forwardingWorld();
  await aw.runWithSecrets(LINKED);
  const run = theRun(aw);
  assert.ok(run.argv.includes('-A'), `the positive control: our agent serves, so -A: ${run.argv.join(' ')}`);
  assert.ok(!run.argv.includes('ForwardAgent=no'));
  assert.equal(run.env.SSH_AUTH_SOCK, OUR_SOCKET, 'and its socket is what the run adds');
});

test('a_run_with_secrets_removes_the_hosts_socket_and_the_reference_names_on_every_session', async () => {
  const forwarding = (): { password?: true } => ({});
  for (const [script, world] of [[forwarding, setup], [(): { password?: true } => ({ password: true }), setup], [forwarding, forwardingWorld]] as const) {
    const { aw } = world({ script });
    await aw.runWithSecrets(LINKED);
    assert.deepEqual(theRun(aw).withoutEnv, E3_INHERITED_DROP, 'a key session, a password session and a forwarding entry alike');
  }
});

// ---- ONE OWNER ----------------------------------------------------------------------------------------------------------------

test('owner_a_declined_trust_spawns_nothing_and_cleans', async () => {
  const { aw, road, vault } = setup({ trusted: [['e1', BARE]], arrow: { modal: 'dismiss' } });
  await aw.runWithSecrets(LINKED);
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(vault.calls, []);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

test('owner_a_cancelled_dependency_spawns_nothing_and_cleans', async () => {
  const { aw, road, vault } = setup({ arrow: { others: [S1, DEP], holdDialogs: /^Before / } });
  const running = aw.runWithSecrets({ ...LINKED, dependsOn: ['dep'], runDependencies: true });
  await until(() => aw.held.length === 1, 'the chain modal');
  aw.held[0].answer(undefined);
  await running;
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(vault.calls, []);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

test('owner_a_failed_resolution_spawns_nothing_and_cleans', async () => {
  const gone: CommandArg[] = [{ value: 'creds://me/gone/password' }];
  const entry = { ...LINKED, commandArgs: gone };
  const plan = planFor(entry, (id) => (id === 's1' ? S1 : undefined));
  const { aw, road } = setup({ trusted: [['e1', trustLineFor(S1.details as EntityMetadata, undefined, plan.line)], ['e1', plan.line]] });
  await aw.runWithSecrets(entry);
  assert.ok(aw.warnings.some((w) => w.startsWith('Nothing was run: ')), aw.warnings.join('\n'));
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

test('owner_a_thrown_error_cleans', async () => {
  const exploding = {
    accounts: (): never => {
      throw new Error('vault exploded');
    },
    entities: () => [],
    fieldReading: () => Promise.reject(new Error('vault exploded')),
  };
  const { aw, road } = setup({ source: exploding });
  await assert.rejects(aw.runWithSecrets(LINKED), /vault exploded/);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

test('owner_a_failed_terminal_creation_cleans_exactly_once', async () => {
  const { aw, road } = setup({
    arrow: {
      onMasked: () => {
        throw new Error('no terminal');
      },
    },
  });
  await assert.rejects(aw.runWithSecrets(LINKED), /no terminal/);
  assert.deepEqual(road.cleanupCalls, ['s1#1'], 'ONE call, by the owner\'s finally: the session was still on its list');
});

test('owner_a_run_that_ended_while_its_terminal_was_made_and_then_threw_cleans_once', async () => {
  const { aw, road } = setup({
    arrow: {
      onMasked: (options) => {
        options.onEnded?.();
        throw new Error('no show');
      },
    },
  });
  await assert.rejects(aw.runWithSecrets(LINKED), /no show/);
  assert.deepEqual(road.cleanupCalls, ['s1#1'], 'the run\'s end cleaned it; the owner\'s finally called the same once-only end, which did nothing');
});

test('owner_a_close_before_start_cleans_once_and_a_late_end_does_nothing', async () => {
  const { aw, road } = setup({
    arrow: {
      onMasked: (options) => {
        options.onEnded?.();
      },
    },
  });
  await aw.runWithSecrets(LINKED);
  assert.deepEqual(road.cleanupCalls, ['s1#1']);
  only(aw.masked).onEnded?.();
  assert.deepEqual(road.cleanupCalls, ['s1#1']);
});

test('a_refused_spawn_launch_asks_nothing_and_cleans', async () => {
  const { aw, road, vault } = setup({ refused: NO_SSH_TO_SPAWN, trusted: [['e1', BARE]] });
  await aw.runWithSecrets(LINKED);
  assert.deepEqual(aw.warnings, [NO_SSH_TO_SPAWN]);
  assert.deepEqual(vault.calls, []);
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(road.cleanupCalls, ['s1#1']);
});

test('a_stopped_preparation_asks_nothing_and_spawns_nothing', async () => {
  const { aw, road } = setup({ script: () => 'stopped', trusted: [['e1', BARE]] });
  await aw.runWithSecrets(LINKED);
  assert.deepEqual(aw.warnings, []);
  assert.deepEqual(aw.masked, []);
  assert.equal(road.refusedShown, 0);
});

test('a_refused_preparation_shows_the_remedy_and_spawns_nothing', async () => {
  const { aw, road } = setup({ script: () => 'refused', trusted: [['e1', BARE]] });
  await aw.runWithSecrets(LINKED);
  assert.equal(road.refusedShown, 1);
  assert.deepEqual(aw.warnings.filter((t) => RUN_THIS.test(t)), [], 'no trust modal');
  assert.deepEqual(aw.masked, []);
});

// ---- one snapshot -------------------------------------------------------------------------------------------------------------

test('snapshot_a_host_changed_during_the_trust_question_does_not_reach_the_child', async () => {
  const box: { aw?: ArrowWorld; readsAtPrepare?: number } = {};
  const { aw } = setup({
    arrow: { holdDialogs: RUN_THIS },
    trusted: [['e1', BARE]],
    script: (ssh) => {
      box.readsAtPrepare = box.aw?.reads(ssh.id);
      return {};
    },
  });
  box.aw = aw;
  const running = aw.runWithSecrets(LINKED);
  await until(() => aw.held.length === 1, 'the trust modal');
  aw.nodes.s1 = sshNode('s1', { host: 'evil.example' });
  aw.held[0].answer('Run');
  await running;
  const run = theRun(aw);
  assert.ok(run.argv.includes('deploy@prod.example'), run.argv.join(' '));
  assert.ok(!JSON.stringify(run).includes('evil'), 'nothing of the child names the changed host');
  assert.equal(aw.reads('s1'), box.readsAtPrepare, 'nothing read the SSH entry again after prepare returned');
});

// ---- the refusals that come before anything is prepared -----------------------------------------------------------------

test('a_windows_remote_is_refused_before_prepare', async () => {
  const windows = { ...LINKED, terminalOs: 'windows' };
  const { aw, road, vault } = setup();
  await aw.runWithSecrets(windows);
  const plan = planLaunch(windows, sshLinkOf(windows, lookupOf(aw)), { stayOpen: false });
  assert.equal(plan.kind, 'refused');
  assert.deepEqual(aw.warnings, [(plan as { reason: string }).reason]);
  assert.deepEqual(road.calls, []);
  assert.deepEqual(vault.calls, []);
});

test('a_remote_window_is_refused_before_prepare', async () => {
  const { aw, road } = setup({ arrow: { remoteName: 'ssh-remote' } });
  await aw.runWithSecrets(LINKED);
  assert.deepEqual(aw.warnings, [secretsLocalOnly('deploy')]);
  assert.deepEqual(road.calls, []);
  assert.deepEqual(aw.masked, []);
});

test('no_reference_is_said_before_prepare', async () => {
  const plain = { ...LINKED, commandArgs: [{ value: 'hello' }] };
  const { aw, road } = setup({ trusted: [['e1', 'printenv hello']] });
  await aw.runWithSecrets(plain);
  assert.deepEqual(aw.warnings, [runCommandsModule().NO_REFERENCE('deploy')]);
  assert.deepEqual(road.calls, []);
});

test('a_missing_ssh_entry_says_why_and_prepares_nothing', async () => {
  const { aw, road, vault } = setup({ others: [] });
  await aw.runWithSecrets(LINKED);
  const missing = sshLinkOf(LINKED, () => undefined);
  assert.equal(missing.kind, 'refused');
  assert.deepEqual(aw.warnings, [(missing as { reason: string }).reason]);
  assert.deepEqual(road.calls, []);
  assert.deepEqual(vault.calls, []);
});

// R5 is a guard, GREEN before and after: a script that a sync linked keeps E1's shared sentence (a script cannot carry a link written by this build).
test('a_linked_script_is_still_refused_with_the_shared_sentence', async () => {
  const script: EntityMetadata = { id: 'sc', name: 'scr', isSshEnabled: false, isScript: true, script: 'echo creds://me/alert/password', scriptLanguage: 'bash', sshEntityId: 's1' };
  const { aw, road } = setup({ trusted: [] });
  await aw.runWithSecrets(script);
  assert.deepEqual(aw.warnings, [sshLinkRefusal(script)]);
  assert.deepEqual(road.calls, []);
});

// R6 is a guard, GREEN before and after: the local road is unchanged for an entry with no link.
test('an_unlinked_command_runs_here_as_before', async () => {
  const { aw, road } = setup({ trusted: [['e1', BARE]] });
  await aw.runWithSecrets({ ...LINKED, sshEntityId: undefined });
  const run = only(aw.masked);
  assert.ok(run.commandLine !== undefined && run.commandLine.includes('CREDS_REF_1'), JSON.stringify(run));
  assert.equal(run.argv, undefined);
  assert.equal(run.env.CREDS_REF_1, VALUE);
  assert.deepEqual(road.calls, []);
});
