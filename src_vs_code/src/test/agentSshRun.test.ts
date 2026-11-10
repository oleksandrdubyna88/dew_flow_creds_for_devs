import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { terminalRunAction } from '../agentUseActions';
import { clampExecTimeout } from '../brokerProtocol';
import { commandFingerprint } from '../commandTrust';
import { planLaunch, refusalSaid, sshLinkOf } from '../remoteLaunch';
import { resolveJumpChain } from '../sshOptions';
import type { UseActionResult } from '../useActions';
import { ACCOUNT_1, GateWorld, OK_BODY, detailsOf, gateWorld } from './agentSshWorld';
import { sshNode } from './sshRoadWorld';

/**
 * What the agent's `creds_run` does with a linked Terminal entry once the gate has let it through (E3.S2, stories §S2.5): the bare line over
 * `execOverSsh`, the trust line as the key, the slot, one read of the SSH entry. The gate itself is `agentSshGate.test.ts`.
 */

const errorOf = (result: UseActionResult): { code: string; message: string } => (result.body as { error: { code: string; message: string } }).error;

const run = (w: GateWorld): Promise<UseActionResult> => terminalRunAction(w.deps).run(w.ctx, {});

test('a_usable_trusted_linked_entry_runs_the_bare_line_over_ssh', async () => {
  const w = gateWorld();
  w.trust(detailsOf(w, 's1'));

  const result = await run(w);

  assert.equal(w.overSsh.calls.length, 1);
  const { call } = w.overSsh.calls[0];
  assert.equal(call.ssh, detailsOf(w, 's1'), 'the SAME object the storage returned for s1');
  assert.equal(call.remoteCommand, 'echo linked', 'the bare line: no eval, no exec, no wrapper');
  assert.deepEqual(call.jump(), resolveJumpChain(detailsOf(w, 's1'), () => undefined));
  assert.equal(call.timeoutMs, clampExecTimeout(undefined));
  assert.equal(call.ownAgentOnly, true, 'the linked run may use only the extension\'s own agent (D17)');
  assert.equal(call.noTty, true, 'and asks ssh for no remote pty (D16)');
  assert.deepEqual(result, { status: 200, body: OK_BODY }, 'the answer is overSsh\'s');
  assert.equal(w.slots.taken, 1);
  assert.equal(w.slots.released, 1, 'and the slot was given back');
});

test('the_trust_key_is_the_trust_line_not_the_local_line', async () => {
  const w = gateWorld();
  w.trusted.push(commandFingerprint('e1', 'echo linked'));

  const error = errorOf(await run(w));

  assert.equal(error.code, 'no_credential');
  assert.match(error.message, /"deploy" has not been run on this machine yet\. Run it once from the tree so a person sees the line, then retry\./);
  assert.equal(w.overSsh.calls.length, 0);
  assert.equal(w.slots.taken, 0);
});

test('a_busy_window_answers_too_many_and_runs_nothing', async () => {
  const w = gateWorld({ busy: true });
  w.trust(detailsOf(w, 's1'));

  assert.equal(errorOf(await run(w)).code, 'too_many_requests');
  assert.equal(w.overSsh.calls.length, 0);
});

test('the_slot_is_released_when_the_ssh_call_throws', async () => {
  const w = gateWorld({ overSshRejects: true });
  w.trust(detailsOf(w, 's1'));

  await assert.rejects(run(w), { message: 'ssh fell over' });

  assert.equal(w.slots.taken, 1);
  assert.equal(w.slots.released, 1, 'released exactly once');
});

test('snapshot_the_ssh_entry_is_read_once', async () => {
  const w = gateWorld();
  w.trust(detailsOf(w, 's1'));
  w.storage.calls.length = 0;

  await run(w);

  assert.equal(w.storage.calls.filter(([account, id]) => account === ACCOUNT_1 && id === 's1').length, 2, 'the two reads the gate makes (linkTo and lookedUp), and none after it');
  assert.equal(w.overSsh.calls.length, 1);
});

test('a_linked_entry_written_for_windows_is_refused_after_the_gate_naming_only_the_terminal_entry', async () => {
  const w = gateWorld({ terminal: { terminalOs: 'windows' } });
  w.trust(detailsOf(w, 's1'));
  const entry = detailsOf(w, 'e1');
  const plan = planLaunch(entry, sshLinkOf(entry, (id) => w.storage.getNode(ACCOUNT_1, id)), { stayOpen: false });
  assert.equal(plan.kind, 'refused');

  const error = errorOf(await run(w));

  assert.equal(error.code, 'not_supported');
  assert.equal(error.message, refusalSaid(entry, (plan as { reason: string }).reason));
  assert.ok(error.message.includes('"deploy"') && !error.message.includes('prod box') && !error.message.includes('prod.example'));
  assert.equal(w.overSsh.calls.length, 0);
  assert.equal(w.slots.taken, 0);
});

test('an_unlinked_entry_runs_here_as_before', async () => {
  const w = gateWorld({ terminal: { sshEntityId: undefined, command: 'echo local-run-probe-7' }, acct1: [] });
  w.trusted.push(commandFingerprint('e1', 'echo local-run-probe-7'));

  const result = await run(w);

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.match((result.body as { stdout?: string }).stdout ?? '', /local-run-probe-7/);
  assert.equal(w.overSsh.calls.length, 0, 'an unlinked entry never calls overSsh');
});

test('a_linked_entry_never_reaches_the_local_captured_run', async () => {
  // Parent §4.5 (5): the temporary bypass of the gate (it answers `local` for every entry) makes `runHere` print the probe, and this goes red.
  const probe = 'echo local-run-probe-8';
  const open = gateWorld({ terminal: { command: probe } });
  open.trust(detailsOf(open, 's1'), probe);
  open.trusted.push(commandFingerprint('e1', probe));

  const answer = await run(open);

  assert.ok(!JSON.stringify(answer.body).includes('local-run-probe-8'), `a local run printed the probe: ${JSON.stringify(answer.body)}`);
  assert.equal(open.overSsh.calls.length, 1, 'a usable SSH entry: exactly one call over SSH');

  const closed = gateWorld({ terminal: { command: probe }, acct1: [sshNode('s1', { mcp: { view: true } })] });
  closed.trusted.push(commandFingerprint('e1', probe));
  const refused = await run(closed);

  assert.ok(!JSON.stringify(refused.body).includes('local-run-probe-8'), `a local run printed the probe: ${JSON.stringify(refused.body)}`);
  assert.equal(errorOf(refused).code, 'denied');
  assert.equal(closed.overSsh.calls.length, 0);
  assert.equal(closed.slots.taken, 0, 'the closed SSH entry took no slot');
});
