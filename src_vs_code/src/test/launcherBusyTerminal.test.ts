import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test } from 'node:test';
import { chainTerminalTitle } from '../terminalTitles';
import { World, noteOurSend, ownerChain, rootTitle, startVpn, terminalNamed, until, world } from './vpnWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

/**
 * The VPN launcher takes the same busy-terminal guard as the green arrow (`terminalGuard.ts`): its line is typed
 * into the launcher's own terminal only when that terminal's last command is known to have finished. The person is
 * asked otherwise; an agent-served start (`startGate`) is refused instead, with no await before the send (E4.S3).
 *
 * <p>The world is `vpnWorld.ts`; the launcher's terminal is the one `ownerChain().start` names.</p>
 */

const S = rootTitle('start openvpn');
const QUESTION = /was not typed/;

/** The launcher's terminal is open before the start and the extension has typed into it; `ran` says whether a command ran in it and ended with code 0. */
function busyWorld(ran: boolean): { w: World; shellEvents: () => void } {
  const w = world({}, { preopened: [S], holdDialogs: QUESTION });
  const shellEvents = (): void => {
    noteOurSend(w.live[S]);
    const execution = w.shell.start(w.live[S]);
    if (ran) {
      w.shell.end(w.live[S], execution, 0);
    }
  };
  return { w, shellEvents };
}

test('the_launcher_never_types_into_its_terminal_while_a_command_runs_there', async () => {
  const { w, shellEvents } = busyWorld(false);
  const pending = startVpn(scope, w, ownerChain(), { shellEvents });
  await until(() => w.held.length === 1, 'the busy-terminal question');
  assert.match(w.held[0].text, /is still running a command/);
  w.held[0].answer(undefined);
  const { started, dir } = await pending;
  try {
    assert.equal(started, false);
    assert.deepEqual(terminalNamed(w, S).sent, []);
    assert.deepEqual(terminalNamed(w, chainTerminalTitle('ops relay stage')).executed, ['install-openvpn'], 'the installer ran before the launcher, as today');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a_finished_launcher_terminal_is_typed_into_as_today', async () => {
  const { w, shellEvents } = busyWorld(true);
  const { started, dir } = await startVpn(scope, w, ownerChain(), { shellEvents });
  try {
    assert.equal(started, true, w.warnings.join('\n'));
    const launcher = terminalNamed(w, S);
    assert.equal(launcher.sent.length, 1);
    assert.match(launcher.sent[0], /^openvpn --config '.*ops_relay_stage\.ovpn'$/);
    assert.equal(w.terminals.filter((t) => t.name === S).length, 1, 'the live terminal was reused');
    assert.equal(launcher.shown, 1, 'the terminal was brought to the front');
    assert.deepEqual(w.held, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an_agent_served_start_refuses_a_busy_terminal_instead_of_asking', async () => {
  const { w, shellEvents } = busyWorld(false);
  const { started, dir } = await startVpn(scope, w, ownerChain(), { shellEvents, startGate: new AbortController().signal });
  try {
    assert.equal(started, false);
    assert.deepEqual(w.held, [], 'no question for an agent');
    assert.deepEqual(terminalNamed(w, S).sent, []);
    assert.ok(w.warnings.some((t) => /a request from an agent does not type over it/.test(t)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an_agent_served_start_types_into_a_finished_terminal_without_a_question', async () => {
  const { w, shellEvents } = busyWorld(true);
  const { started, dir } = await startVpn(scope, w, ownerChain(), { shellEvents, startGate: new AbortController().signal });
  try {
    assert.equal(started, true, w.warnings.join('\n'));
    assert.equal(terminalNamed(w, S).sent.length, 1);
    assert.deepEqual(w.held, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a_start_and_end_with_no_send_of_ours_make_the_launcher_ask', async () => {
  const w = world({}, { preopened: [S], holdDialogs: QUESTION });
  const shellEvents = (): void => w.shell.end(w.live[S], w.shell.start(w.live[S]), 0);
  const pending = startVpn(scope, w, ownerChain(), { shellEvents });
  const settled = { done: false };
  void pending.then(() => {
    settled.done = true;
  });
  await until(() => w.held.length === 1 || settled.done, 'the launcher to ask or to type');
  w.held[0]?.answer(undefined);
  const { started, dir } = await pending;
  try {
    assert.deepEqual(terminalNamed(w, S).sent, [], 'typed on a start and end the extension had no part in');
    assert.equal(started, false);
    assert.match(w.held[0].text, /cannot tell/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a_start_and_end_with_no_send_of_ours_make_an_agent_served_start_refuse', async () => {
  const w = world({}, { preopened: [S] });
  const shellEvents = (): void => w.shell.end(w.live[S], w.shell.start(w.live[S]), 0);
  const { started, dir } = await startVpn(scope, w, ownerChain(), { shellEvents, startGate: new AbortController().signal });
  try {
    assert.equal(started, false);
    assert.deepEqual(terminalNamed(w, S).sent, []);
    assert.ok(w.warnings.some((t) => /a request from an agent does not type over it/.test(t)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
