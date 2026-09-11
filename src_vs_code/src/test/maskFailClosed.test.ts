import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, code, share, world } from './brokerWorld';

/**
 * An output that cannot be masked is withheld, never sent raw (audit 2026-09-09, finding #1).
 *
 * <p>The broker's promise is that an agent USES a credential and never sees it. Response bodies
 * carry the child's stdout, so the masker is the only thing between a command that prints its own
 * password and the agent that composed the command. And it <b>failed open</b>: any error building
 * the table was caught, and the ORIGINAL body went out with `hits: 0` — indistinguishable, in the
 * audit line, from "there was nothing to mask".</p>
 *
 * <p>The comment that defended it argued that failing closed would trade a possible leak for a
 * certain outage. True of a COMPLETED action, and that is why the table is read BEFORE the action
 * now: a read that fails then costs a refused call, not a result somebody already earned.</p>
 *
 * <p>The sharpest case is rotation, and it is the one the review gate found this plan getting
 * wrong: the new secret is written DURING the run, so no table read before it can hold that value.
 * A failed refresh there may not fall back — the one value that matters is the one no table we hold
 * contains.</p>
 */

const SECRET_VALUE = 'synthetic-audit-password-ONLY';
const ROTATED = 'the-freshly-committed-one';

/** What both doors look like from a caller: a token call and an alias call at the same entry. */
async function bothDoors(
  w: ReturnType<typeof world>,
  body: Record<string, unknown> = { command: 'echo hi' },
): Promise<{ token: Awaited<ReturnType<typeof call>>; alias: Awaited<ReturnType<typeof call>> }> {
  const { port, secret } = await share(w);
  const token = await call(port, '/v1/use/exec', { token: secret, body });
  const alias = await call(port, '/v1/alias/exec', { body: { ...body, alias: 'prod' } });
  return { token, alias };
}

test('a masker that fails BEFORE the action refuses the call, and nothing runs — both doors', async () => {
  // The rule that makes the rest affordable. A storage read that will not answer is a reason not to
  // START, and refusing here costs an agent a retry rather than a credential.
  const w = world({
    secrets: [{ value: SECRET_VALUE, label: 'PASSWORD' }],
    maskerFails: 'before',
    alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' },
    // Two calls, two grants, two dialogs: the alias door mints its own.
    answers: ['Allow', 'Allow'],
  });
  try {
    const { token, alias } = await bothDoors(w);

    assert.equal(code(token), 'internal');
    assert.equal(code(alias), 'internal');
    assert.deepEqual(w.ran, [], 'the action never started, so there is no side effect to explain');
  } finally {
    w.server.dispose();
  }
});

test('an ENTITY that is gone is a refusal, not an empty table', async () => {
  // The quiet half of the finding: no exception is needed. An entry deleted or renamed during a
  // grant's life used to produce an empty table, and an empty table masks nothing while reporting
  // `hits: 0` — which reads in the audit exactly like "this entry holds no secrets".
  const w = world({ maskerFails: 'entityGone' });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo hi' } });

    assert.equal(code(answer), 'internal');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('an entity that exists and holds NO secrets runs normally — an empty table is not a failure', async () => {
  // The other side of the test above, and the reason it cannot simply refuse on an empty list: a
  // script entry with no password has nothing to mask and every right to run.
  const w = world({ secrets: [] });
  w.result = { status: 200, body: { stdout: 'nothing secret here', exitCode: 0 } };
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo hi' } });

    assert.equal(answer.status, 200);
    assert.equal((answer.body as { stdout?: string }).stdout, 'nothing secret here');
    assert.equal(w.ran.length, 1);
  } finally {
    w.server.dispose();
  }
});

test('a masker that fails AFTER an ordinary action still masks, from the table read before it', async () => {
  // Nothing wrote to storage during this run, so the pre-run table is complete by construction and
  // using it costs the agent nothing. Withholding here would be the "certain outage for a possible
  // leak" trade taken in the one case where there is no possible leak.
  const w = world({ secrets: [{ value: SECRET_VALUE, label: 'PASSWORD' }], maskerFails: 'after' });
  w.result = { status: 200, body: { stdout: `it printed ${SECRET_VALUE}`, exitCode: 0 } };
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo hi' } });

    assert.equal(answer.status, 200);
    const stdout = String((answer.body as { stdout?: unknown }).stdout);
    assert.ok(!stdout.includes(SECRET_VALUE), `the secret must not be in: ${stdout}`);
    assert.match(stdout, /CREDS_MASKED:PASSWORD/);
  } finally {
    w.server.dispose();
  }
});

test('a ROTATION whose refresh fails is WITHHELD — the new value is in no table we hold', async () => {
  // Found by all three review vendors against this plan's first draft, which fell back to the
  // pre-run table here. That table cannot contain the value the run has just written, so the fall
  // back would have sent a freshly committed production credential out in the clear — the exact
  // case the whole change exists for.
  const w = world({
    secrets: [{ value: SECRET_VALUE, label: 'PASSWORD' }],
    maskerFails: 'after',
    rotatesTo: ROTATED,
  });
  w.result = { status: 200, body: { rotated: true, stdout: `new password is ${ROTATED}`, exitCode: 0 } };
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'rotate' } });

    assert.equal(code(answer), 'internal');
    const body = JSON.stringify(answer.body);
    assert.ok(!body.includes(ROTATED), `the rotated value must not be in: ${body}`);
    assert.equal(
      (answer.body as { actionRan?: unknown }).actionRan,
      true,
      'an agent that cannot tell "it did not happen" from "you cannot see it" rotates twice',
    );
  } finally {
    w.server.dispose();
  }
});

test('a rotation whose refresh WORKS masks the value the run wrote, not only the one it replaced', async () => {
  const w = world({ secrets: [{ value: SECRET_VALUE, label: 'PASSWORD' }], rotatesTo: ROTATED });
  w.result = { status: 200, body: { rotated: true, stdout: `old ${SECRET_VALUE} new ${ROTATED}`, exitCode: 0 } };
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'rotate' } });

    assert.equal(answer.status, 200);
    const stdout = String((answer.body as { stdout?: unknown }).stdout);
    assert.ok(!stdout.includes(ROTATED), `the NEW value must be masked too: ${stdout}`);
    assert.ok(!stdout.includes(SECRET_VALUE), `and the old one still is: ${stdout}`);
  } finally {
    w.server.dispose();
  }
});

test('a rotation that THREW after writing does not put the new value in the journal', async () => {
  // Found by the review gate against the first implementation, which masked the error reason with
  // the pre-run table only. A rotation can store its new credential and THEN fail — and then say so
  // in the message it throws. The pre-run table redacts the old value and writes the new one to a
  // local file that gets read, copied and backed up.
  const w = world({ secrets: [{ value: SECRET_VALUE, label: 'PASSWORD' }], rotatesTo: ROTATED });
  w.result = new Error(`could not confirm the new password ${ROTATED}`);
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'rotate' } });

    const lines = w.audit.join(' | ');
    assert.ok(!lines.includes(ROTATED), `the audit must not carry the new value: ${lines}`);
    assert.equal(
      (answer.body as { actionRan?: unknown }).actionRan,
      true,
      '"it threw" does not mean "it did nothing" — the write may already have happened',
    );
  } finally {
    w.server.dispose();
  }
});

test('when a rotation throws AND the re-read fails, the reason is not written at all', async () => {
  // The end of that road: nothing this window holds can redact the message, so it does not go in
  // the journal. The plan said so as a rule and the first implementation did not hold it.
  const w = world({
    secrets: [{ value: SECRET_VALUE, label: 'PASSWORD' }],
    rotatesTo: ROTATED,
    maskerFails: 'after',
  });
  w.result = new Error(`could not confirm the new password ${ROTATED}`);
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'rotate' } });

    const lines = w.audit.join(' | ');
    assert.ok(!lines.includes(ROTATED), lines);
    assert.match(lines, /reason withheld/);
  } finally {
    w.server.dispose();
  }
});

test('the journal never carries a raw reason when the masker cannot answer', async () => {
  // The reason moved out of the response and into the journal for good reasons, and the journal is
  // a local file that gets read, copied and backed up. A driver's message is exactly where a
  // credential turns up.
  const w = world({ secrets: [{ value: SECRET_VALUE, label: 'PASSWORD' }], maskerFails: 'after' });
  w.result = new Error(`authentication failed for ${SECRET_VALUE}`);
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo hi' } });

    const lines = w.audit.join(' | ');
    assert.ok(!lines.includes(SECRET_VALUE), `the audit must not carry it: ${lines}`);
  } finally {
    w.server.dispose();
  }
});
