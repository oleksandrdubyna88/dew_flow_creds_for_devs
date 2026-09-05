import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { SERVICE_NAME } from '../brokerProtocol';

/**
 * The agent broker, driven over real HTTP (audit A3).
 *
 * <p>Every test here starts the real listener, mints a real grant through `share()`, and makes
 * the request an agent's CLI would make. Nothing about the routing, the token check or the
 * consent gate is asserted from the inside.</p>
 *
 * <p><b>The seam that matters is `perform()`.</b> Two entry points reach it — a bearer token
 * and a CLI alias — and behind it sit the capability check, consent, masking, the audit line
 * and the one-use burn, each exactly once. A test that only exercised the token path would say
 * nothing about whether the alias path shares them, and the path that gets forgotten is always
 * the newer one. So every guarantee below is asserted through BOTH doors.</p>
 *
 * <p>Two orderings are load-bearing and easy to lose. A refused or still-pending call must not
 * touch the grant — otherwise a denial extends the token's idle life or spends one of its
 * uses. And the burn happens only AFTER the answer is on the wire, so a storage failure while
 * burning cannot cost the agent a result it already earned.</p>
 */

import { INTERNAL_FAILURE } from '../brokerProtocol';
import { SECRET, call, code, message, share, world } from './brokerWorld';

test('health is unauthenticated — it is what lets the CLI check the port before sending a token', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/health', { method: 'GET' });

    assert.equal(answer.status, 200);
    assert.equal(answer.body.service, SERVICE_NAME);
  } finally {
    w.server.dispose();
  }
});

test('a call with NO token is refused, and nothing runs', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/use/exec', { body: { command: 'uptime' } });

    assert.equal(code(answer), 'unauthorized');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('a token from another window is refused', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: 'not-a-real-secret', body: { command: 'uptime' } });

    assert.equal(code(answer), 'unauthorized');
  } finally {
    w.server.dispose();
  }
});

test('an allowed call runs, and the human is asked exactly once', async () => {
  // Consent is per GRANT: one Allow covers every later call on that token, which is why the
  // dialog has to say so.
  const w = world({ answers: ['Allow'] });
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'df -h' } });

    assert.equal(w.ran.length, 2);
    assert.equal(w.dialogs.length, 1, 'the second call did not ask again');
    assert.equal(w.presence, 1, 'answering a dialog is the provable moment of presence');
  } finally {
    w.server.dispose();
  }
});

test('the consent dialog names EVERY action the grant covers, not just this one', async () => {
  // Otherwise "open a terminal" is what the person reads while "run any command" is what
  // they grant.
  const w = world({ answers: ['Allow'], supports: ['exec', 'terminal'] });
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.match(w.dialogs[0], /Allowing covers every later call/);
    assert.match(w.dialogs[0], /"prod"/);
  } finally {
    w.server.dispose();
  }
});

test('a DENIED grant refuses this call and every later one, without running anything', async () => {
  const w = world({ answers: ['Deny'] });
  try {
    const { port, secret } = await share(w);

    const first = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    const second = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(code(first), 'denied');
    assert.equal(code(second), 'denied');
    assert.deepEqual(w.ran, []);
    assert.equal(w.dialogs.length, 1, 'a denial is remembered, not re-asked');
  } finally {
    w.server.dispose();
  }
});

test('a DISMISSED dialog refuses this call but leaves the grant re-promptable', async () => {
  // A mis-click must not lock an agent out for the window's life.
  const w = world({ answers: [undefined, 'Allow'] });
  try {
    const { port, secret } = await share(w);

    const first = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    const second = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(code(first), 'consent_timeout');
    assert.equal(second.status, 200, 'the next call asked again and was allowed');
    assert.equal(w.dialogs.length, 2);
  } finally {
    w.server.dispose();
  }
});

test('an action the entity kind does not support is not_supported, and asks nobody', async () => {
  // A capability check before the dialog: nobody should be asked to approve something that
  // cannot happen.
  const w = world({ supports: ['exec'] });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/terminal', { token: secret, body: {} });

    assert.equal(code(answer), 'not_supported');
    assert.deepEqual(w.dialogs, []);
  } finally {
    w.server.dispose();
  }
});

test('a body the action rejects is refused BEFORE the human is asked', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: '' } });

    assert.equal(code(answer), 'invalid_request');
    assert.deepEqual(w.dialogs, [], 'no dialog for a call that could never run');
  } finally {
    w.server.dispose();
  }
});

test('a body that is not a JSON object is refused', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, raw: 'not json' });

    assert.equal(code(answer), 'invalid_request');
  } finally {
    w.server.dispose();
  }
});

test('an unknown endpoint is not_found rather than a stack trace', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);

    assert.equal(code(await call(port, '/v1/use/../etc/passwd', { token: secret, body: {} })), 'not_found');
  } finally {
    w.server.dispose();
  }
});

test("the entity's own secrets are masked out of the output it produced", async () => {
  // The broker's promise — no response field a secret can travel in — is true of the SHAPES
  // and false of what stdout carries: an agent that composes a command can make it print the
  // very password the broker supplied to run it.
  const w = world({ secrets: [{ value: SECRET, label: 'PASSWORD' }] });
  w.result = { status: 200, body: { exitCode: 0, stdout: `the password is ${SECRET}\n`, stderr: '' } };
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo $PW' } });

    assert.ok(!JSON.stringify(answer.body).includes(SECRET), JSON.stringify(answer.body));
    assert.match(String(answer.body.stdout), /PASSWORD/, 'and it says which value stood there');
  } finally {
    w.server.dispose();
  }
});

test('the audit line records HOW MANY values were masked, never which', async () => {
  const w = world({ secrets: [{ value: SECRET, label: 'PASSWORD' }] });
  w.result = { status: 200, body: { exitCode: 0, stdout: `${SECRET}\n`, stderr: '' } };
  try {
    const { port, secret } = await share(w);
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo $PW' } });

    const masked = w.audit.filter((l) => /masked/.test(l));
    assert.equal(masked.length, 1, w.audit.join(' | '));
    assert.ok(!masked[0].includes(SECRET), masked[0]);
  } finally {
    w.server.dispose();
  }
});

test('a ONE-USE entity is burned after the answer, not before it', async () => {
  // A storage failure while burning must not cost the agent the result it already earned.
  const w = world({ burns: true });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(answer.status, 200, 'the result arrived');
    assert.deepEqual(w.burned, ['e1']);
  } finally {
    w.server.dispose();
  }
});

test('a REFUSED call burns nothing — a denial does not spend a use', async () => {
  const w = world({ answers: ['Deny'], burns: true });
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.deepEqual(w.burned, []);
  } finally {
    w.server.dispose();
  }
});

test('an ALIAS call reaches the same seam: it is consented, run and audited', async () => {
  // The alias route mints its own grant and then follows the token path exactly. Anything
  // duplicated for it would be a way for consent to apply to one caller and not the other.
  const w = world({ alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' } });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'uptime' } });

    assert.equal(answer.status, 200);
    assert.equal(w.dialogs.length, 1, 'an alias call is consented like any other');
    assert.deepEqual(w.ran.map((r) => r.entityId), ['e9'], 'and it ran against the aliased entity');
  } finally {
    w.server.dispose();
  }
});

test('an alias call the human DENIES runs nothing', async () => {
  const w = world({
    answers: ['Deny'],
    alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' },
  });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'uptime' } });

    assert.equal(code(answer), 'denied');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('an alias call is MASKED and BURNED like a token call', async () => {
  // The three things the seam exists to share, asserted through the newer door.
  const w = world({
    secrets: [{ value: SECRET, label: 'PASSWORD' }],
    burns: true,
    alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' },
  });
  w.result = { status: 200, body: { exitCode: 0, stdout: `${SECRET}\n`, stderr: '' } };
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'echo $PW' } });

    assert.ok(!JSON.stringify(answer.body).includes(SECRET), 'masked');
    assert.deepEqual(w.burned, ['e9'], 'burned');
  } finally {
    w.server.dispose();
  }
});

test('an unknown alias answers exactly like a known one nobody enabled', async () => {
  // Whether a name exists is not something an unauthenticated caller should enumerate.
  const w = world({ alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' } });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'no-such-entry', command: 'uptime' } });

    assert.equal(code(answer), 'not_found');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('a window serving NO aliases refuses alias calls entirely', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'x' } })), 'not_found');
  } finally {
    w.server.dispose();
  }
});

test('disposing stops serving — the port answers nothing afterwards', async () => {
  const w = world({});
  const { port, secret } = await share(w);
  w.server.dispose();

  await assert.rejects(() => call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } }));
});

/**
 * The alias route carries no bearer token, so the consent modal is the whole of its
 * authorization. That makes the RATE of modals a security property rather than a nicety.
 *
 * <p>A local process that knows a name — and names are not secret — can otherwise ask this
 * window to raise dialogs as fast as it can post. Two consequences, both bad: the editor is
 * unusable while it happens, and the twentieth identical dialog is the one somebody clicks
 * through to make it stop. Consent fatigue is not a theoretical failure mode; it is the
 * documented way this kind of gate is defeated.</p>
 */
test('an unauthenticated caller cannot raise unbounded consent dialogs', async () => {
  const w = world({
    alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' },
    // Every call is refused, so nothing runs and the count is purely how many times the
    // person was asked.
    answers: Array.from({ length: 40 }, () => 'Deny'),
  });
  try {
    const { port } = await share(w);
    const dialogsBefore = w.dialogs.length;

    const answers = [];
    for (let i = 0; i < 20; i += 1) {
      answers.push(await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: `probe-${i}` } }));
    }

    const asked = w.dialogs.length - dialogsBefore;
    assert.ok(asked < 20, `20 unauthenticated calls raised ${asked} dialogs`);
    assert.ok(
      answers.some((a) => code(a) === 'too_many_requests'),
      'and the excess is refused with a code the caller can act on',
    );
  } finally {
    w.server.dispose();
  }
});

test('a token call is not throttled by somebody else spamming aliases', async () => {
  // The limit must sit on the unauthenticated door only. A person whose agent holds a real
  // token has already been consented; punishing them for a local process's behaviour would
  // turn a defence into an outage.
  const w = world({
    alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' },
    answers: Array.from({ length: 40 }, () => 'Allow'),
  });
  try {
    const { port, secret } = await share(w);
    for (let i = 0; i < 20; i += 1) {
      await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'x' } });
    }

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  } finally {
    w.server.dispose();
  }
});

/**
 * `creds ls` — the listing, and the line it deliberately does not cross.
 *
 * <p>Unauthenticated like the action route, because the CLI that needs it most is on a
 * Remote-SSH host where the registry is on the other machine and cannot be read from disk. What
 * it gives up is inventory — a local process learns which names exist — and what it must never
 * give up is anything stored.</p>
 */
test('the listing answers without a token, because a remote CLI has none to give', async () => {
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }, { name: 'staging-db', kind: 'db' }] });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/aliases', { method: 'GET' });

    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.aliases, [
      { name: 'prod', kind: 'ssh' },
      { name: 'staging-db', kind: 'db' },
    ]);
  } finally {
    w.server.dispose();
  }
});

test('the listing carries names and kinds and NOTHING else', async () => {
  // The whole safety argument rests on this: a name is something the person chose, a kind is
  // one of seven words. An accountId or entityId here would hand a local process the addresses
  // it would otherwise have to be given.
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }] });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/aliases', { method: 'GET' });
    const entry = (answer.body.aliases as Record<string, unknown>[])[0];

    assert.deepEqual(Object.keys(entry).sort(), ['kind', 'name']);
    assert.equal(JSON.stringify(answer.body).includes('a1'), false, 'no account id');
    assert.equal(JSON.stringify(answer.body).includes('e9'), false, 'no entity id');
  } finally {
    w.server.dispose();
  }
});

test('a window with no registry answers an empty list rather than failing', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/aliases', { method: 'GET' });

    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.aliases, []);
  } finally {
    w.server.dispose();
  }
});

test('the listing raises no dialog, and therefore is not throttled', async () => {
  // The action route is rate-limited because there the modal IS the authorization. A listing
  // asks nobody anything, so throttling it would only break `creds ls` in a loop.
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }] });
  try {
    const { port } = await share(w);
    const before = w.dialogs.length;

    for (let i = 0; i < 20; i += 1) {
      const answer = await call(port, '/v1/aliases', { method: 'GET' });
      assert.equal(answer.status, 200, `call ${i}`);
    }

    assert.equal(w.dialogs.length, before, 'nobody was asked anything');
  } finally {
    w.server.dispose();
  }
});

test('the listing is a GET only — a POST to it is not an action route', async () => {
  const w = world({ aliasList: [{ name: 'prod', kind: 'ssh' }] });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/aliases', { body: {} });

    assert.equal(code(answer), 'not_found');
  } finally {
    w.server.dispose();
  }
});

/**
 * An internal failure tells the AGENT nothing about the implementation, and tells the JOURNAL
 * everything.
 *
 * <p>CodeQL raised `js/stack-trace-exposure` (medium) here, and it was right about the shape even
 * though the reader is a local agent rather than the internet: the caught error's own message went
 * straight onto the wire. An `Error` from anywhere under `run` — a driver, a parser, a filesystem
 * call — carries paths, versions, table names and query fragments, and this product's whole design
 * treats an agent as a party that is told the RESULT and never the machinery.</p>
 *
 * <p>The half that must not be lost is the diagnosis, so it moves rather than disappearing: the
 * journal line, which is local and is what a person reads when an agent reports a failure, now
 * carries the real reason where it used to carry only the summary.</p>
 */
test('an internal failure gives the agent a fixed sentence, never the error’s own text', async () => {
  // Asserted as an EQUALITY, not as the absence of three strings — two reviewers made the same
  // point and they were right: a negative assertion passes on the unfixed code for any error whose
  // message happens not to contain them, so `Error('query failed')` would have gone green while
  // still handing its own text to the agent. What is promised is a CONSTANT, so that is what is
  // checked, and then the realistic leak is checked on top of it.
  const w = world({});
  w.result = new Error('ENOENT: /home/dev/.ssh/id_ed25519_prod, open failed at Connection.parse:214');
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(code(answer), 'internal');
    assert.equal(message(answer), INTERNAL_FAILURE, 'the wire carries the constant and nothing else');
    const said = JSON.stringify(answer.body);
    assert.ok(!said.includes('ENOENT'), said);
    assert.ok(!said.includes('id_ed25519_prod'), 'a path names a machine and an account');
    assert.ok(!said.includes('Connection.parse'), 'and a frame names the implementation');
  } finally {
    w.server.dispose();
  }
});

test('a plain error leaks nothing either — the guarantee is the constant, not a filter', async () => {
  // The case the negative-only assertion would have missed entirely.
  const w = world({});
  w.result = new Error('query failed: SELECT * FROM billing.card WHERE id=42');
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(message(answer), INTERNAL_FAILURE);
    assert.ok(!JSON.stringify(answer.body).includes('billing.card'), 'a table name is machinery too');
  } finally {
    w.server.dispose();
  }
});

test('…and the journal keeps the reason, because that is where a person looks', async () => {
  const w = world({});
  w.result = new Error('ENOENT: /home/dev/.ssh/id_ed25519_prod, open failed');
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    const journal = w.audit.join('\n');
    assert.match(journal, /ENOENT/, 'the diagnosis moved here rather than disappearing');
    assert.match(journal, /uptime/, 'beside what was asked for');
    // Three reviewers asked for this one: `respondError` has always taken the door a refusal came
    // in by, and this call site was the one not passing it — so a refused use was the only kind of
    // refusal the journal could not place. Asserted, or it can regress to `undefined` in silence.
    assert.match(journal, /via token/, 'and the door it arrived by');
  } finally {
    w.server.dispose();
  }
});
