import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { STUB_RUNGS, call, code, share, world } from './brokerWorld';
import { loadWithVscode } from './vscodeStub';
import { ConsentStamps } from '../mcpConsentPolicy';
import type { TreeNode } from '../types';

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

/**
 * `POST /v1/mcp/create` — an agent storing a credential it just made.
 *
 * <p>The only MCP body that names no entry, because there is not one yet. What it names is a
 * folder, and only one somebody opened: given a free choice an agent would make one, and the one
 * it made would be wherever seemed convenient.</p>
 *
 * <p>It is also the one call where a secret travels TOWARD the vault. The product's answer is not
 * to pretend otherwise but to record it — which is why the audit line below says so in words the
 * journal can count.</p>
 */
test('an agent may create into an open folder, and the human is asked first', async () => {
  const w = world({ create: 'open' });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh', secret: 'k' } });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.created, true);
    assert.deepEqual(w.created, ['app-03']);
    assert.equal(w.dialogs.length, 1);
  } finally {
    w.server.dispose();
  }
});

test('the prompt says what is being made and where', async () => {
  const w = world({ create: 'open' });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh', secret: 'k' } });

    assert.ok(w.dialogs[0].includes('app-03 (ssh) in "Servers"'), w.dialogs[0]);
    assert.ok(w.dialogs[0].includes('create an entry in'), w.dialogs[0]);
  } finally {
    w.server.dispose();
  }
});

test('a secret that came from the AGENT is recorded as such', async () => {
  // The price of this level, said out loud. Every other level is built so no secret passes
  // through an agent's context; here one does, and the journal counts them.
  const w = world({ create: 'open' });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh', secret: 'k' } });
    await call(port, '/v1/mcp/create', { body: { name: 'no-secret-yet', kind: 'ssh' } });

    assert.ok(w.audit.some((line) => line.includes('created with agent secret')), w.audit.join('\n'));
    assert.ok(w.audit.some((line) => line.includes('→ created ')), w.audit.join('\n'));
  } finally {
    w.server.dispose();
  }
});

test('a Deny makes nothing', async () => {
  const w = world({ create: 'open', answers: ['Deny'] });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh' } })), 'denied');
    assert.deepEqual(w.created, []);
  } finally {
    w.server.dispose();
  }
});

test('a vault with no open folder refuses before anybody is asked', async () => {
  const w = world({ create: 'closed' });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh' } })), 'denied');
    assert.equal(w.dialogs.length, 0);
    assert.deepEqual(w.created, []);
  } finally {
    w.server.dispose();
  }
});

test('a window that cannot create says so rather than crashing', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh' } })), 'not_supported');
  } finally {
    w.server.dispose();
  }
});

test('a body with no name is a bad request, not a refused creation', async () => {
  const w = world({ create: 'open' });
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/mcp/create', { body: { kind: 'ssh' } })), 'invalid_request');
    assert.equal(w.dialogs.length, 0);
  } finally {
    w.server.dispose();
  }
});

/**
 * The quiet path (issue #95): a call whose dialog the person already answered.
 *
 * <p>The vault decides `preConsented` — that is S2.1 and its own tests — and these are about what
 * the DOOR does with the answer. The one that matters most is the sixth call: the modal budget is
 * five a minute, and spending a slot on a call that raises no modal refuses a later one for a
 * dialog nobody was ever going to see.</p>
 */
test('six pre-consented calls in a row all succeed, and none raises a dialog', async () => {
  const w = world({ mcpUse: 'usable', mcpPreConsented: true });
  try {
    const { port } = await share(w);

    const answers = [];
    for (let i = 0; i < 6; i += 1) {
      answers.push(await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } }));
    }

    assert.deepEqual(
      answers.map((a) => a.status),
      [200, 200, 200, 200, 200, 200],
      `the sixth call was refused: ${JSON.stringify(answers[5].body)}`,
    );
    assert.equal(w.dialogs.length, 0, 'a call the person already answered must not ask again');
    assert.equal(w.ran.length, 6, 'and all six must actually run');
  } finally {
    w.server.dispose();
  }
});

test('a silent call leaves nobody present, and says in the journal that nobody was asked', async () => {
  // Presence is the one thing a dialog proves. A call that raised none proves the opposite, and
  // agent traffic deliberately does not postpone the idle auto-lock. The audit line is the other
  // half: "which calls ran with nobody being asked" is the first question a reviewer has.
  const w = world({ mcpUse: 'usable', mcpPreConsented: true });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });

    assert.equal(w.presence, 0, 'a call nobody answered must not count as a person being present');
    const quiet = w.audit.filter((line) => line.includes('allowed without a prompt'));
    assert.equal(quiet.length, 1, `no line said the call was allowed without a prompt: ${w.audit.join(' | ')}`);
    assert.match(quiet[0], /consent/, 'and it names the moment it stands in for');
  } finally {
    w.server.dispose();
  }
});

test('a pre-consented entry is still deleted only after a dialog', async () => {
  // D2, at the consumer: the delete route calls the same `readMcpUse` and never reads the flag.
  const w = world({ mcpUse: 'usable', mcpPreConsented: true, trash: true });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(w.dialogs.length, 1, 'deleting went quiet on a policy that governs use');
    assert.deepEqual(w.trashed, ['e1']);
  } finally {
    w.server.dispose();
  }
});

test('a pre-consented entry is still created only after a dialog', async () => {
  const w = world({ mcpUse: 'usable', mcpPreConsented: true, create: 'open' });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/create', { body: { name: 'new-one' } });

    assert.equal(w.dialogs.length, 1, 'creating went quiet on a policy that governs use');
  } finally {
    w.server.dispose();
  }
});

test('a call the person ANSWERED is remembered; a quiet one is not', async () => {
  // The sliding window: refreshing the stamp on a call that raised no modal turns "once every
  // twelve hours" into "once, ever".
  const asked = world({ mcpUse: 'usable' });
  try {
    const { port } = await share(asked);
    await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });
    assert.deepEqual(
      asked.consents.map((c) => c.entityId),
      ['e1'],
      'an answered dialog was not remembered',
    );
    assert.equal(asked.consents[0].rungs, STUB_RUNGS, 'and it names the ladder the person was shown');
  } finally {
    asked.server.dispose();
  }

  const quiet = world({ mcpUse: 'usable', mcpPreConsented: true });
  try {
    const { port } = await share(quiet);
    await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });
    assert.deepEqual(quiet.consents, [], 'a call nobody answered moved the window forward');
  } finally {
    quiet.server.dispose();
  }
});

test('a token call never writes the MCP stamp', async () => {
  // The two dialogs say different things, so allowing one must not silence the other.
  const w = world({});
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(w.dialogs.length, 1, 'the token door still asks');
    assert.deepEqual(w.consents, [], 'a token answer silenced the MCP door');
  } finally {
    w.server.dispose();
  }
});

test('a quiet call spends no modal slot, so a prompting one afterwards still gets its five', async () => {
  // Releasing a slot that was never taken would free ANOTHER call's, and two modals would stack.
  const w = world({ mcpUse: 'usable', mcpPreConsented: true });
  try {
    const { port } = await share(w);
    for (let i = 0; i < 4; i += 1) {
      await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });
    }

    assert.equal(w.dialogs.length, 0);
    // The budget is untouched, which the alias route can still spend: it always prompts.
    const answer = await call(port, '/v1/alias/exec', { body: { name: 'nope', command: 'x' } });
    assert.notEqual(code(answer), 'too_many_requests', 'four quiet calls ate the modal budget');
  } finally {
    w.server.dispose();
  }
});

test('an entry that INHERITS never-ask from its folder runs quiet through the real lookup', async () => {
  // The other tests hand the world a stubbed verdict, so they prove what the DOOR does with an
  // answer. This one builds the answer the way production does — the real `mcpUseLookup` over a
  // real tree and a real stamp store — so the folder-to-entry inheritance is exercised end to end
  // rather than assumed. Without it, a break anywhere between the folder's policy and the door
  // would leave every test in this file green.
  const hooks = loadWithVscode<typeof import('../mcpHooks')>('../mcpHooks', { window: {} });
  const nodes: TreeNode[] = [
    { id: 'f1', name: 'Projects', type: 'folder', parentId: null, mcp: { use: true, ask: 'never' } },
    { id: 'e1', name: 'prod', type: 'entity', parentId: 'f1', details: { id: 'e1', name: 'prod', kind: 'ssh', isSshEnabled: true } },
  ];
  const source = {
    getAccounts: () => [{ accountId: 'a1' }],
    getNode: (_a: string, id: string): TreeNode | undefined => nodes.find((n) => n.id === id),
  };
  const stamps = new ConsentStamps({
    get: () => undefined,
    update: () => Promise.resolve(),
  });
  const w = world({ mcpResolve: (entryId: string, action: string) => hooks.mcpUseLookup(source, entryId, action, stamps, Date.now()) });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(w.dialogs.length, 0, 'a policy inherited from the folder did not reach the door');
    assert.deepEqual(w.ran.map((r) => r.action), ['exec']);
  } finally {
    w.server.dispose();
  }
});

test('the same entry under a folder that says ask-every-time still raises a dialog', async () => {
  // The control. Without it the test above could pass because nothing was resolved at all.
  const hooks = loadWithVscode<typeof import('../mcpHooks')>('../mcpHooks', { window: {} });
  const nodes: TreeNode[] = [
    { id: 'f1', name: 'Projects', type: 'folder', parentId: null, mcp: { use: true } },
    { id: 'e1', name: 'prod', type: 'entity', parentId: 'f1', details: { id: 'e1', name: 'prod', kind: 'ssh', isSshEnabled: true } },
  ];
  const source = {
    getAccounts: () => [{ accountId: 'a1' }],
    getNode: (_a: string, id: string): TreeNode | undefined => nodes.find((n) => n.id === id),
  };
  const stamps = new ConsentStamps({ get: () => undefined, update: () => Promise.resolve() });
  const w = world({ mcpResolve: (entryId: string, action: string) => hooks.mcpUseLookup(source, entryId, action, stamps, Date.now()) });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });

    assert.equal(w.dialogs.length, 1, 'the default must still ask');
  } finally {
    w.server.dispose();
  }
});
