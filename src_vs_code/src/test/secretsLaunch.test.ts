import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planRefs } from '../runPlan';
import {
  PreparedForSpawn,
  RemotePlan,
  SECRETS_REMOTE_COMMAND,
  maskedOverSshBanner,
  planLaunch,
  secretsLaunch,
  secretsLocalOnly,
  secretsOverSshBanner,
  secretsRemoteLine,
  sshLinkOf,
} from '../remoteLaunch';
import { shortValuesCaveat } from '../outputMask';
import { buildSshExecArgv } from '../sshExecCommand';
import { noHostSentence } from '../sshCommand';
import { sshOptionArgv } from '../sshOptions';
import { NO_AGENT_TO_FORWARD } from '../sshProgram';
import { EntityMetadata, PortForward } from '../types';
import { fakeRoad, sshNode } from './sshRoadWorld';

/**
 * E3.S1 of `PLAN_terminal_command_over_ssh.md` (rows K1-K8, K10): the PURE half of Run with Secrets over SSH. What the spawned
 * `ssh` is given (`secretsLaunch`), the line the remote shell runs (`secretsRemoteLine`), and the two banner texts. Nothing is
 * spawned here; `maskedTerminal.test.ts` runs the argv against a real child.
 */

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
const lookup = (id: string) => (id === 's1' ? S1 : undefined);

function planOf(entry: EntityMetadata = LINKED, node = S1): RemotePlan {
  const link = sshLinkOf(entry, (id) => (id === node.id ? node : undefined));
  const plan = planLaunch(entry, link, { stayOpen: false });
  assert.equal(plan.kind, 'remote', 'the fixture must plan a remote launch, or every test of this file runs on a refusal');
  return plan as RemotePlan;
}

/** The fake road's first ready: the real `ReadySsh` shape, as a spawn is given it. */
async function readyOf(ssh: EntityMetadata = S1.details as EntityMetadata, password = false) {
  const road = fakeRoad(() => (password ? { password: true } : {}), lookup);
  await road.prepare('a1', ssh);
  const ready = road.readies[0];
  assert.ok(ready !== undefined, 'the fake road answered ready');
  return ready;
}

/** The elements of `words` appear in `argv` one after the other, in that order. */
function containsRun(argv: readonly string[], words: readonly string[]): boolean {
  return argv.some((_, at) => words.every((word, i) => argv[at + i] === word));
}

function spawnArgv(plan: RemotePlan, prepared: PreparedForSpawn): readonly string[] {
  const launch = secretsLaunch(plan, prepared);
  assert.equal(launch.kind, 'spawn', launch.kind === 'refused' ? launch.reason : '');
  return launch.kind === 'spawn' ? launch.argv : [];
}

const SECRETS = [{ value: 'x'.repeat(12), label: 'CREDS_REF_1' }];

test('the_argv_ends_with_the_remote_login_shell_reading_stdin_after_the_destination', async () => {
  const ready = await readyOf();
  const prepared: PreparedForSpawn = { ...ready, entity: { ...ready.entity, sshKeyPath: '/keys/s1.key' }, env: undefined };
  const plan = planOf();
  const launch = secretsLaunch(plan, prepared);
  assert.equal(launch.kind, 'spawn');
  if (launch.kind !== 'spawn') {
    return;
  }
  const expected = buildSshExecArgv(prepared.entity, '/keys/s1.key', SECRETS_REMOTE_COMMAND, 'key', { jump: prepared.jump, knownHostsFile: prepared.options.knownHostsFile });
  assert.ok(expected !== undefined, 'the entity passes the host check');
  assert.deepEqual(launch.argv, expected);
  assert.equal(launch.argv[launch.argv.length - 1], SECRETS_REMOTE_COMMAND);
  assert.deepEqual(launch.argv.slice(-3, -1), ['--', 'deploy@prod.example']);
  assert.ok(!launch.argv.includes('-t'), 'no remote pty');
  assert.ok(containsRun(launch.argv, ['-o', 'ConnectTimeout=10']), 'the connect bound is SENT (hand check 3 observes its effect)');
  assert.ok(containsRun(launch.argv, ['-o', 'BatchMode=yes']), 'a key session answers no prompt from stdin');
  assert.equal(launch.target, 'deploy@prod.example');
});

test('a_password_session_uses_askpass_one_prompt_and_a_connect_timeout', async () => {
  const ready = await readyOf(S1.details as EntityMetadata, true);
  assert.ok(ready.env !== undefined, 'the fixture is a password session');
  const argv = spawnArgv(planOf(), ready);
  assert.ok(argv.includes('NumberOfPasswordPrompts=1'));
  assert.ok(argv.includes('ConnectTimeout=10'));
  assert.ok(!argv.includes('BatchMode=yes'));
  for (const value of Object.values(ready.env ?? {})) {
    assert.ok(!argv.some((element) => element.includes(value)), `no argv element holds ${value}`);
  }
});

test('a_pinned_host_is_enforced', async () => {
  const ready = await readyOf();
  const pinned = spawnArgv(planOf(), { ...ready, options: { ...ready.options, knownHostsFile: '/keys/kh-s1' } });
  assert.ok(pinned.includes('StrictHostKeyChecking=yes'));
  assert.ok(pinned.includes('UserKnownHostsFile=/keys/kh-s1'));
  const unpinned = spawnArgv(planOf(), { ...ready, options: { ...ready.options, knownHostsFile: undefined } });
  assert.ok(unpinned.includes('StrictHostKeyChecking=accept-new'));
  assert.ok(!unpinned.includes('StrictHostKeyChecking=yes'));
});

test('the_jump_and_the_forwards_are_the_trust_lines', async () => {
  const forward: PortForward = { kind: 'local', bindPort: 8080, host: 'db.internal', hostPort: 5432 };
  const ssh = { ...(S1.details as EntityMetadata), agentForward: true, portForwards: [forward] };
  const ready = await readyOf(ssh);
  const prepared: PreparedForSpawn = { ...ready, jump: 'deploy@bastion', options: { ...ready.options, jump: 'deploy@bastion' } as PreparedForSpawn['options'] };
  const words = sshOptionArgv(ready.entity, 'deploy@bastion');
  assert.ok(words.length >= 4, `the fixture has a jump, -A and a forward: ${words.join(' ')}`);
  assert.ok(containsRun(spawnArgv(planOf(), prepared), words), `every word of the trust line's options, in order: ${words.join(' ')}`);
});

test('a_relay_prefix_or_a_client_program_is_refused_as_not_local', async () => {
  const ready = await readyOf();
  const expected = { kind: 'refused', reason: secretsLocalOnly('deploy') };
  assert.notEqual(expected.reason, '', 'the sentence exists');
  assert.deepEqual(secretsLaunch(planOf(), { ...ready, prefix: "env SSH_AUTH_SOCK='/run/x.sock' " }), expected);
  assert.deepEqual(secretsLaunch(planOf(), { ...ready, options: { ...ready.options, program: '/mnt/c/Windows/System32/OpenSSH/ssh.exe' } as PreparedForSpawn['options'] }), expected);
});

test('an_entity_with_no_safe_host_is_refused_with_the_no_host_sentence', async () => {
  const ready = await readyOf();
  const launch = secretsLaunch(planOf(), { ...ready, entity: { ...ready.entity, host: '-oProxyCommand=x' } });
  assert.deepEqual(launch, { kind: 'refused', reason: noHostSentence('prod box') });
});

test('the_remote_line_reads_each_reference_from_the_posix_environment', () => {
  const plan = planOf();
  const line = secretsRemoteLine(plan, planRefs([plan.line]));
  assert.equal(line, 'printenv "$CREDS_REF_1"');
  assert.ok(!line.includes('creds://'));
});

test('the_banner_is_exact_and_names_the_target', () => {
  const exact =
    'Over SSH to deploy@prod.example:2222. The values go to the remote login shell on its standard input, never on a command line, and are replaced with ' +
    '<CREDS_MASKED:NAME> in what it prints here. This run is not interactive: there is no terminal, and the command reads an empty input, so a command that asks ' +
    'a question usually stops. To answer questions, use Run in Terminal instead; the values are not injected there.';
  assert.equal(secretsOverSshBanner('deploy@prod.example:2222', SECRETS), exact);
  const short = [{ value: '123456', label: 'CREDS_REF_1' }];
  const banner = secretsOverSshBanner('deploy@prod.example', short);
  assert.ok(banner.includes(shortValuesCaveat(short)));
  assert.ok(banner.includes('CREDS_REF_1'));
});

test('the_launch_warning_is_a_banner_line_before_the_secrets_text', () => {
  const described = 'CREDS_REF_1 = password of me/alert';
  const target = 'deploy@prod.example';
  assert.equal(
    maskedOverSshBanner(described, NO_AGENT_TO_FORWARD, target, SECRETS),
    [described, `Note: ${NO_AGENT_TO_FORWARD}.`, secretsOverSshBanner(target, SECRETS)].join('\r\n'),
  );
  const plain = maskedOverSshBanner(described, undefined, target, SECRETS);
  assert.equal(plain, [described, secretsOverSshBanner(target, SECRETS)].join('\r\n'));
  assert.ok(!plain.includes('Note:'));
});
