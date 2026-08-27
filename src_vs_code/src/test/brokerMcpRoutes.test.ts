import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, code, share, world } from './brokerWorld';

/**
 * The two routes an MCP client uses, driven over real HTTP against the real broker.
 *
 * <p>They share a server, a harness and a `perform` with the token and alias doors next door —
 * that is the property worth protecting, and it is why the harness is a module rather than a
 * block at the top of one file.</p>
 */

/**
 * `GET /v1/mcp/entries` — what an agent may see, and what stands in for a token there.
 *
 * <p>The third read-only route on this server, and the third that authenticates nothing. It
 * discloses considerably more than the alias listing does — a host, a user, a port, a
 * connection string — so the argument that covers that one does not stretch to cover this. What
 * covers it is that nothing appears at all unless somebody turned a switch on for that entry:
 * the set is one a person assembled deliberately, not "what this vault holds".</p>
 *
 * <p>The shaping is tested next door in `mcpEntries.test.ts`, which is where the decision about
 * WHICH fields cross lives. These tests are about the door.</p>
 */
test('the entries route answers without a token, like the other two read routes', async () => {
  const w = world({ mcpEntries: [{ id: 'e1', name: 'orders-db', kind: 'db', hasPassword: true }] });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/entries', { method: 'GET' });

    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.entries, [
      { id: 'e1', name: 'orders-db', kind: 'db', hasPassword: true },
    ]);
  } finally {
    w.server.dispose();
  }
});

test('a window whose vault has opened nothing answers an empty list, not a refusal', async () => {
  // The common case by a wide margin, and the one that must not look like a malfunction: every
  // entry is invisible to agents until somebody says otherwise.
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/entries', { method: 'GET' });

    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.entries, []);
  } finally {
    w.server.dispose();
  }
});

test('the entries route raises no dialog and is therefore not throttled', async () => {
  const w = world({ mcpEntries: [{ id: 'e1', name: 'prod', kind: 'ssh' }] });
  try {
    const { port } = await share(w);
    const before = w.dialogs.length;

    for (let i = 0; i < 20; i += 1) {
      assert.equal((await call(port, '/v1/mcp/entries', { method: 'GET' })).status, 200, `call ${i}`);
    }

    assert.equal(w.dialogs.length, before, 'nobody was asked anything');
  } finally {
    w.server.dispose();
  }
});

test('it is a GET only — a POST to it is not an action route', async () => {
  const w = world({ mcpEntries: [] });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/entries', { body: {} })), 'not_found');
  } finally {
    w.server.dispose();
  }
});

/**
 * `POST /v1/mcp/use/<action>` — an agent using an entry it can see.
 *
 * <p>The route's whole reason for existing is the gate in front of it, so that is what these
 * assert: an entry whose <b>Usable by agents</b> switch is off is refused, and refused in words
 * that name the switch rather than in words that read as a malfunction.</p>
 *
 * <p>Everything BEHIND the gate is deliberately not re-tested here. It is the same `perform` the
 * token route and the alias route reach — consent, masking, the audit line, the one-use burn —
 * and the tests above already drive all of it through both existing doors. What matters is that
 * this door leads to the same place, which the "it still asks" test below is for.</p>
 */
test('an entry whose Usable switch is on can be used, and the human is still asked', async () => {
  const w = world({ mcpUse: 'usable' });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(w.dialogs.length, 1, 'the switch says you may ask; the modal still says yes');
    assert.deepEqual(w.ran.map((r) => r.action), ['exec']);
  } finally {
    w.server.dispose();
  }
});

test('a Deny still refuses, because the switch is a precondition and not a decision', async () => {
  const w = world({ mcpUse: 'usable', answers: ['Deny'] });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'x' } })), 'denied');
    assert.deepEqual(w.ran, [], 'nothing ran');
  } finally {
    w.server.dispose();
  }
});

test('an entry that is NOT open to agents is refused before anybody is asked', async () => {
  // The gate. A modal raised for an entry the switches forbid would train a person to click
  // Allow on questions the product had already answered.
  const w = world({ mcpUse: 'closed' });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'x' } });

    assert.equal(code(answer), 'denied');
    assert.equal(w.dialogs.length, 0, 'nobody was asked');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('the refusal names the switch, so an agent can say what to turn on', async () => {
  const w = world({ mcpUse: 'closed' });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'x' } });
    const message = String((answer.body.error as Record<string, unknown>).message);

    assert.ok(message.includes('Usable by agents'), message);
    assert.ok(message.includes('prod'), message);
  } finally {
    w.server.dispose();
  }
});

test('an id this window does not serve is not found, and says nothing more', async () => {
  const w = world({ mcpUse: 'usable' });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e-nope', command: 'x' } });
    const message = String((answer.body.error as Record<string, unknown>).message);

    assert.equal(code(answer), 'not_found');
    assert.equal(message.includes('e-nope'), false, 'the id is not echoed back');
  } finally {
    w.server.dispose();
  }
});

test('a window that serves no MCP use calls refuses them all rather than crashing', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'x' } })), 'not_found');
  } finally {
    w.server.dispose();
  }
});

test('a body with no entry id is refused as a bad request, not as a missing entry', async () => {
  const w = world({ mcpUse: 'usable' });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/use/exec', { body: { command: 'x' } })), 'invalid_request');
    assert.equal(code(await call(port, '/v1/mcp/use/exec', { body: { entry: '', command: 'x' } })), 'invalid_request');
  } finally {
    w.server.dispose();
  }
});

test('an action this entity does not support is refused, exactly as on the other two doors', async () => {
  const w = world({ mcpUse: 'usable', supports: ['exec'] });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/use/query', { body: { entry: 'e1', query: 'select 1' } })), 'not_supported');
  } finally {
    w.server.dispose();
  }
});

test('a GET to the action route is not the entries route', async () => {
  const w = world({ mcpUse: 'usable' });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/use/exec', { method: 'GET' })), 'not_found');
  } finally {
    w.server.dispose();
  }
});

/**
 * `POST /v1/mcp/delete` — an agent moving an entry to the Trash.
 *
 * <p>Its own route because deleting is not a use of a credential: nothing is connected to,
 * nothing is run, no secret is touched. What it shares with the use route is everything that
 * matters — the same body, the same gate one rung higher, the same throttle, the same prompt.</p>
 *
 * <p><b>The Trash is the whole permission, not an option within it.</b> There is no argument that
 * would delete permanently, which is what made this grantable at all: the objection was that
 * deletion has no undo and travels by sync to every machine, carrying the version history with
 * it, and a destination that is a folder answers all of it.</p>
 */
test('an agent may move an entry to the Trash, and the human is still asked', async () => {
  const w = world({ mcpUse: 'usable', trash: true });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.deleted, true);
    assert.equal(answer.body.restorable, true, 'the answer says it can be undone');
    assert.deepEqual(w.trashed, ['e1']);
    assert.equal(w.dialogs.length, 1);
  } finally {
    w.server.dispose();
  }
});

test('the prompt says the Trash, not "delete" — they are different promises', async () => {
  const w = world({ mcpUse: 'usable', trash: true });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } });

    assert.ok(w.dialogs[0].includes('move to the Trash'), w.dialogs[0]);
  } finally {
    w.server.dispose();
  }
});

test('a Deny leaves the entry where it was', async () => {
  const w = world({ mcpUse: 'usable', trash: true, answers: ['Deny'] });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } })), 'denied');
    assert.deepEqual(w.trashed, []);
  } finally {
    w.server.dispose();
  }
});

test('an entry whose delete switch is off is refused before anybody is asked', async () => {
  const w = world({ mcpUse: 'closed', trash: true });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } })), 'denied');
    assert.equal(w.dialogs.length, 0);
    assert.deepEqual(w.trashed, []);
  } finally {
    w.server.dispose();
  }
});

test('a window with no Trash refuses rather than deleting some other way', async () => {
  // The refusal that must never become "well, delete it properly then".
  const w = world({ mcpUse: 'usable' });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } })), 'not_supported');
    assert.equal(w.dialogs.length, 0);
  } finally {
    w.server.dispose();
  }
});

test('an id this window does not serve is not found', async () => {
  const w = world({ mcpUse: 'usable', trash: true });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/delete', { body: { entry: 'e-nope' } })), 'not_found');
    assert.deepEqual(w.trashed, []);
  } finally {
    w.server.dispose();
  }
});

test('the delete route is a POST with an entry, like every other MCP call', async () => {
  const w = world({ mcpUse: 'usable', trash: true });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/delete', { method: 'GET' })), 'not_found');
    assert.equal(code(await call(port, '/v1/mcp/delete', { body: {} })), 'invalid_request');
  } finally {
    w.server.dispose();
  }
});
