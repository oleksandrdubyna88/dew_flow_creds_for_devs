import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigHolder, ConfigReadAudit, configRouteResult } from '../brokerConfigRoute';
import { configKeyHash, newConfigKey } from '../configKey';
import { isConfigReadRoute } from '../brokerProtocol';

/**
 * The one authenticated route on the broker that is not a use.
 *
 * <p>Everything else there either discloses something small without a token, or performs an
 * action and ends in a human answering a modal. This returns a config file entire, to a caller
 * that answered no dialog — so what stands in the modal's place is asserted here: the key, the
 * fact that it opens exactly one entry, and that every attempt reaches the log.</p>
 */

function world(bodies: Record<string, string> = {}) {
  const audit: ConfigReadAudit[] = [];
  const holders: ConfigHolder[] = [];
  return {
    audit,
    holders,
    add(entityId: string, key: string, format = 'json'): void {
      holders.push({
        accountId: 'acc',
        entityId,
        entityName: entityId,
        format,
        configKeyHash: configKeyHash(key),
      });
    },
    sources: {
      holders: (): readonly ConfigHolder[] => holders,
      body: (holder: ConfigHolder): Promise<string | undefined> =>
        Promise.resolve(bodies[holder.entityId]),
      audit: (line: ConfigReadAudit): void => {
        audit.push(line);
      },
    },
  };
}

test('the route is one exact path, never a prefix', () => {
  assert.equal(isConfigReadRoute('/v1/config/read'), true);
  assert.equal(isConfigReadRoute('/v1/config/read/'), false);
  assert.equal(isConfigReadRoute('/v1/config/read/../use/exec'), false);
  assert.equal(isConfigReadRoute('/v1/config'), false);
});

test('a key serves its own config, and says what format it is', () => {
  const key = newConfigKey();
  const w = world({ appsettings: '{"a": 1}' });
  w.add('appsettings', key);

  return configRouteResult(key, w.sources).then((result) => {
    assert.equal(result.status, 200);
    assert.deepEqual(result.status === 200 ? result.body : undefined, {
      format: 'json',
      body: '{"a": 1}',
    });
  });
});

test('a key opens exactly one entry, never a neighbour', async () => {
  const mine = newConfigKey();
  const theirs = newConfigKey();
  const w = world({ mine: 'MINE=1', theirs: 'THEIRS=1' });
  w.add('mine', mine, 'env');
  w.add('theirs', theirs, 'env');

  const result = await configRouteResult(mine, w.sources);

  assert.equal(result.status === 200 ? result.body.body : '', 'MINE=1');
});

test('a key nobody minted is refused', async () => {
  const w = world({ x: '{}' });
  w.add('x', newConfigKey());

  const result = await configRouteResult(newConfigKey(), w.sources);

  assert.equal(result.status, 401);
});

test('a revoked entry stops answering, because the hash went with it', async () => {
  // Revoking clears `configKeyHash`, and this is what that means at the wire.
  const key = newConfigKey();
  const w = world({ x: '{}' });
  w.add('x', key);
  assert.equal((await configRouteResult(key, w.sources)).status, 200);

  w.holders.length = 0;

  assert.equal((await configRouteResult(key, w.sources)).status, 401);
});

test('a real key whose body is gone is refused in exactly the same words', async () => {
  // Deliberately indistinguishable from a wrong key. Telling the two apart would turn this route
  // into an oracle for which keys are real, which is the one useful thing an unauthenticated
  // caller could learn from it.
  const key = newConfigKey();
  const w = world({}); // the entry exists; its body does not
  w.add('emptied', key);

  const real = await configRouteResult(key, w.sources);
  const invented = await configRouteResult(newConfigKey(), w.sources);

  assert.equal(real.status, invented.status);
  assert.deepEqual(real, invented, 'the two refusals differ, so the route can be probed');
});

test('the audit line DOES tell them apart, because the owner is reading it', async () => {
  const key = newConfigKey();
  const w = world({ served: '{}' });
  w.add('served', key);
  w.add('emptied', newConfigKey());

  await configRouteResult(key, w.sources);
  await configRouteResult(newConfigKey(), w.sources);

  assert.deepEqual(
    w.audit.map((line) => line.outcome),
    ['served', 'unknown key'],
  );
  assert.equal(w.audit[0].entityName, 'served');
});

test('the audit never carries the key itself', async () => {
  const key = newConfigKey();
  const w = world({ x: '{}' });
  w.add('x', key);

  await configRouteResult(key, w.sources);

  assert.equal(w.audit[0].key.includes(key), false, 'the whole key reached the log');
  assert.ok(w.audit[0].key.endsWith('…'), 'the label is not truncated');
  assert.ok(key.startsWith(w.audit[0].key.slice(0, -1)), 'the label is not a prefix of the key');
});

test('the keychain is not touched until a key has matched', async () => {
  // A wrong key must cost a hash comparison and nothing else. Reading first and checking after
  // would make every probe a keychain read, which is both slow and a thing to notice.
  const reads: string[] = [];
  const w = world();
  w.add('x', newConfigKey());

  await configRouteResult(newConfigKey(), {
    holders: () => w.holders,
    body: (holder) => {
      reads.push(holder.entityId);
      return Promise.resolve('{}');
    },
  });

  assert.deepEqual(reads, []);
});

test('a window with no vault open refuses rather than failing', async () => {
  // A build, a test, or a window that has not unlocked anything is a legitimate configuration.
  const result = await configRouteResult(newConfigKey(), {});

  assert.equal(result.status, 401);
});
