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

function deps(applied: string[]): never {
  return {
    remoteName: 'ssh-remote',
    storage: { getNode: () => ({ details: { id: 'e1', name: 'prod', envBindings: { password: 'PROD_PW' } } }) },
    applyEnv: async () => {
      applied.push('applied');
      return { written: ['PROD_PW'], withheld: [] };
    },
  } as never;
}

test('X3: /v1/use/exec with a token answers 404 not_supported with EXPORT_REFUSED, asks nobody, applies nothing', async () => {
  const applied: string[] = [];
  const w = world({ realAction: credentialExportEnvAction(deps(applied)), supports: ['exec'] });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: {} });

    assert.equal(answer.status, 404);
    assert.deepEqual(answer.body, { error: { code: 'not_supported', message: EXPORT_REFUSED } });
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

    assert.equal(answer.status, 404);
    assert.deepEqual(answer.body, { error: { code: 'not_supported', message: EXPORT_REFUSED } });
    assert.deepEqual(w.dialogs, []);
    assert.deepEqual(applied, []);
  } finally {
    w.server.dispose();
  }
});
