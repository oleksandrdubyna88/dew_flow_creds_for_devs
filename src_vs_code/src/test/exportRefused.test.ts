import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPORT_REFUSED } from '../brokerProtocol';
import { credentialExportEnvAction } from '../agentUseActions';
import { call, share, world } from './brokerWorld';

/**
 * E1.1, X3 — an agent's `exportEnv` in a Remote-SSH window is refused through the real broker, on
 * both token doors, before any dialog (`PLAN_remote_bridge_scoped_E1.md`).
 *
 * <p>The action is the REAL one over a stubbed `applyEnv`; the broker is the real server over real
 * HTTP. The scripted harness registers whichever action it is given under the `exec` route, which is
 * all the broker needs: the action's own `validate` is the subject.</p>
 */

function deps(applied: string[], local = false): never {
  return {
    remoteName: local ? undefined : 'ssh-remote',
    storage: { getNode: () => ({ details: { id: 'e1', name: 'prod', envBindings: { password: 'PROD_PW' } } }) },
    applyEnv: async () => {
      applied.push('applied');
      return { written: ['PROD_PW'], withheld: [] };
    },
  } as never;
}

test('X3: /v1/use/exec with a token answers 403 denied with EXPORT_REFUSED, asks nobody, applies nothing', async () => {
  const applied: string[] = [];
  const w = world({ realAction: credentialExportEnvAction(deps(applied)), supports: ['exec'] });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: {} });

    assert.equal(answer.status, 403);
    assert.deepEqual(answer.body, { error: { code: 'denied', message: EXPORT_REFUSED } });
    assert.deepEqual(w.dialogs, [], 'a person was asked to allow something that is refused');
    assert.deepEqual(applied, []);
  } finally {
    w.server.dispose();
  }
});

test('X3: /v1/alias/exec answers the same', async () => {
  const applied: string[] = [];
  const w = world({
    realAction: credentialExportEnvAction(deps(applied)),
    supports: ['exec'],
    alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' },
  });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'prod' } });

    assert.equal(answer.status, 403);
    assert.deepEqual(answer.body, { error: { code: 'denied', message: EXPORT_REFUSED } });
    assert.deepEqual(w.dialogs, []);
    assert.deepEqual(applied, []);
  } finally {
    w.server.dispose();
  }
});

/**
 * The same refusal on the routes a client really posts to: `exportEnv` is the action's own name, on a
 * `credential` grant. The two tests above serve the action under `exec` and prove the broker's side
 * of `validate`; these prove the route grammar and the registry lookup reach the action at all.
 */

test('X3: /v1/use/exportEnv with a credential token answers 403 denied with EXPORT_REFUSED, asks nobody, applies nothing', async () => {
  const applied: string[] = [];
  const w = world({ kind: 'credential', realAction: credentialExportEnvAction(deps(applied)), supports: ['exportEnv'] });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exportEnv', { token: secret, body: {} });

    assert.equal(answer.status, 403);
    assert.deepEqual(answer.body, { error: { code: 'denied', message: EXPORT_REFUSED } });
    assert.deepEqual(w.dialogs, [], 'a person was asked to allow something that is refused');
    assert.deepEqual(applied, []);
  } finally {
    w.server.dispose();
  }
});

test('X3: /v1/mcp/use/exportEnv answers the same', async () => {
  const applied: string[] = [];
  const w = world({
    kind: 'credential',
    realAction: credentialExportEnvAction(deps(applied)),
    supports: ['exportEnv'],
    mcpUse: 'usable',
  });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/use/exportEnv', { body: { entry: 'e1' } });

    assert.equal(answer.status, 403);
    assert.deepEqual(answer.body, { error: { code: 'denied', message: EXPORT_REFUSED } });
    assert.deepEqual(w.dialogs, []);
    assert.deepEqual(applied, []);
  } finally {
    w.server.dispose();
  }
});

test('X3 control: the same route in a local window reaches the action, asks once, and applies', async () => {
  // Every case above is a refusal. This one makes something happen with the same fixture, so a
  // fixture the broker quietly declined (wrong kind, wrong route) cannot pass for a refusal.
  const applied: string[] = [];
  const w = world({ kind: 'credential', realAction: credentialExportEnvAction(deps(applied, true)), supports: ['exportEnv'] });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exportEnv', { token: secret, body: {} });

    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body, { written: ['PROD_PW'] });
    assert.equal(w.dialogs.length, 1, 'the person is asked once, as before');
    assert.deepEqual(applied, ['applied']);
  } finally {
    w.server.dispose();
  }
});

test('the sentence promises nothing it cannot keep: no claim that no secret leaves, no creds:// reference', () => {
  // Owner decision 5 lets a person put values on the server, and no agent executor resolves a
  // `creds://` reference before E3, so either claim would be false the day it is read.
  assert.doesNotMatch(EXPORT_REFUSED, /no secret leaves/i);
  assert.doesNotMatch(EXPORT_REFUSED, /creds:\/\//);
  assert.match(EXPORT_REFUSED, /^An agent cannot export a secret here: /);
});
