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
    const first = call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = call(port, '/v1/use/exec', { token: secret, body: { command: 'hostname' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    answer('Allow');
    await Promise.all([first, second]);

    assert.equal(w.dialogs.length, 1, w.dialogs.join('\n---\n'));
    assert.match(w.dialogs[0].split('\n')[1], SHAPE);
  } finally {
    w.server.dispose();
  }
});
