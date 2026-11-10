import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, share, world } from './brokerWorld';

/**
 * The authorisation of the agent's run over SSH (E3.S2; spec `todo/PLAN_terminal_command_over_ssh_E3_S2_security.md`, scenarios G1-G22).
 * Each test is named for the guarantee; each was watched RED first, and the commit that builds the guarantee says what the failure read.
 */

/** An action of the real shape that records what the broker handed it: the target `validate` and `summarize` got, and `ctx.summary` in `run`. */
function recordingAction() {
  const seen = { validated: [] as unknown[], summarized: [] as unknown[], ranWith: [] as (string | undefined)[], texts: [] as string[] };
  const action = {
    kind: 'ssh',
    action: 'exec',
    mutatesSecrets: false,
    verb: 'run a command on',
    describeOutcome: (): string => 'exit 0',
    validate: (_body: unknown, target: unknown): unknown => {
      seen.validated.push(target);
      return { ok: true };
    },
    summarize: (body: { command?: string }, target: { entityName?: string }): string => {
      const text = `the line "${String(body.command)}" for ${String(target?.entityName)}`;
      seen.texts.push(text);
      seen.summarized.push(target);
      return text;
    },
    run: async (ctx: { summary?: string }): Promise<unknown> => {
      seen.ranWith.push(ctx.summary);
      return { status: 200, body: { exitCode: 0, stdout: 'ok\n', stderr: '' } };
    },
  };
  return { action, seen };
}

test('the_broker_hands_run_the_summary_it_showed', async () => {
  // A dialog (token door, Allow) and a quiet call (MCP door, already answered): both hand `run` the very text `summarize` answered,
  // and both hand `validate` and `summarize` the grant as their target (spec §5, G17).
  const asked = recordingAction();
  const w = world({ realActions: { exec: asked.action }, answers: ['Allow'] });
  try {
    const { port, secret } = await share(w);
    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(w.dialogs.length, 1, 'the dialog was shown');
    assert.ok(w.dialogs[0].includes(asked.seen.texts[0]), `the dialog shows the summary: ${w.dialogs[0]}`);
    assert.deepEqual(asked.seen.ranWith, [asked.seen.texts[0]], 'run got the summary the dialog showed');
    assert.equal((asked.seen.summarized[0] as { entityName?: string }).entityName, 'prod', 'summarize got the grant');
    assert.equal((asked.seen.validated[0] as { entityId?: string }).entityId, 'e1', 'validate got the grant');
  } finally {
    w.server.dispose();
  }

  const quiet = recordingAction();
  const q = world({ realActions: { exec: quiet.action }, mcpUse: 'usable', mcpPreConsented: true });
  try {
    const { port } = await share(q);
    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(q.dialogs.length, 0, 'no dialog was shown');
    assert.deepEqual(quiet.seen.ranWith, [quiet.seen.texts[0]], 'a quiet call hands run its summary too');
    assert.notEqual(quiet.seen.ranWith[0], undefined);
  } finally {
    q.server.dispose();
  }
});
