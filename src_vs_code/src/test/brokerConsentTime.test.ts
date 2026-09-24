import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRequestTimeLine } from '../requestTime';
import { call, share, world } from './brokerWorld';

/**
 * Issue #131 — the consent modal says WHEN it was asked, driven through the real broker under the
 * stub. The arithmetic is `requestTime.test.ts`; this pins where the line sits and that it is the
 * moment of THIS request, not a constant or a stale value.
 */

const SHAPE = /^Requested \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)\.$/;

test('the line right after the head sentence says when the agent asked, in local time', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);
    // Whole seconds either side, because the line is second-resolution.
    const before = Math.floor(Date.now() / 1000) * 1000;

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    const after = Math.ceil(Date.now() / 1000) * 1000;
    assert.equal(w.dialogs.length, 1);
    const [head, when] = w.dialogs[0].split('\n');
    assert.match(head, /^An agent wants to run a command on "prod" using its stored credential\.$/);
    assert.match(when, SHAPE, w.dialogs[0]);
    const candidates = new Set<string>();
    for (let t = before; t <= after; t += 1000) {
      candidates.add(localRequestTimeLine(new Date(t)));
    }
    assert.ok(candidates.has(when), `${when} is not between ${[...candidates].join(' and ')}`);
    assert.match(w.dialogs[0], /\n\nuptime\n\n/, 'the command still follows, after a blank line');
  } finally {
    w.server.dispose();
  }
});

test('a second call while the dialog is open joins it — one dialog, one time, whoever asked next', async () => {
  // The answer is held: `showWarningMessage` resolves to this promise, so the dialog stays "open"
  // while a second request arrives a moment later. It must join the pending consent, not raise a
  // second modal with a later time on it.
  let answer: (choice: string) => void = () => undefined;
  const held = new Promise<string>((resolve) => {
    answer = resolve;
  });
  const w = world({ answers: [held as unknown as string] });
  try {
    const { port, secret } = await share(w);
    // A SIGNAL, not a delay (CodeRabbit): count the requests that entered the consent path, and
    // answer only once both are waiting on it. A second request that arrived after the answer would
    // find the grant allowed and raise no dialog, and the test would pass with the join broken.
    const entered = countConsentEntries(w.server);
    const first = call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    const second = call(port, '/v1/use/exec', { token: secret, body: { command: 'hostname' } });
    await until(() => entered.count === 2);
    answer('Allow');
    await Promise.all([first, second]);

    assert.equal(w.dialogs.length, 1, w.dialogs.join('\n---\n'));
    assert.match(w.dialogs[0].split('\n')[1], SHAPE);
  } finally {
    w.server.dispose();
  }
});

/** Wraps the server's own `consent` — the one path every door takes before a dialog — with a counter. */
function countConsentEntries(server: object): { count: number } {
  const counter = { count: 0 };
  const target = server as unknown as { consent: (...args: unknown[]) => Promise<unknown> };
  const original = target.consent.bind(server);
  target.consent = (...args: unknown[]) => {
    counter.count += 1;
    return original(...args);
  };
  return counter;
}

/** Resolves once `condition` holds, polling the event loop; fails after two seconds instead of hanging. */
async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'the condition never came true');
    await new Promise((resolve) => setImmediate(resolve));
  }
}
