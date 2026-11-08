import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { McpFolderHooks } from '../brokerFolderDoor';
import { ASK_WINDOW_MS, ConsentStamps, stampKey } from '../mcpConsentPolicy';
import { MCP_ASK_CHOICES } from '../mcpSwitches';
import type { McpAccess } from '../mcpAccess';
import type { TreeNode } from '../types';
import { call, share, world } from './brokerWorld';
import type { World } from './brokerWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * What the consent dialog's LAST paragraph says an Allow covers, door by door — beside what the
 * next call then does (`PLAN_consent_coverage_per_door.md` §4).
 *
 * <p>The rule of this file: every assertion on a tail stands beside an assertion on the fact the
 * tail states. An exact-string test alone is how a sentence true on the token door survived, false,
 * on the alias and MCP doors. The tails are written out as literals on purpose, so a changed word is
 * a red and not a drift; the dialog derives its hours from `ASK_WINDOW_MS`, and C8 is what keeps the
 * literals here equal to that.</p>
 */

const FROZEN_NOW = 1_700_000_000_000;

const TOKEN_TAIL = 'Allowing covers every later call on this token, not just this one: with it the agent can ';
const CALL_TAIL = 'Allowing covers this call only, not any later one.';
const WINDOW_TAIL =
  'Allowing covers this call. For up to 12 hours on this machine, later MCP calls from any agent to run a command on "prod" ' +
  'may also skip asking because of this Allow — only while this entry is set to "Ask once every 12 hours" and its agent ' +
  'switches are as they are now. Deleting still asks.';
const WINDOW_CONDITION = 'only while this entry is set to "Ask once every 12 hours" and its agent switches are as they are now';

/** The state a window keeps on this machine, as a plain map. */
function memento(): { held: Map<string, unknown>; get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> } {
  const held = new Map<string, unknown>();
  return {
    held,
    get: <T,>(key: string): T | undefined => held.get(key) as T | undefined,
    update: (key: string, value: unknown): Thenable<void> => Promise.resolve(void held.set(key, value)),
  };
}

/** The two-node vault of production's own lookup: folder `f1` with the policy, entity `e1` named "prod". */
function vault(mcp: McpAccess): { nodes: TreeNode[]; source: { getAccounts(): { accountId: string }[]; getNode(a: string, id: string): TreeNode | undefined } } {
  const nodes: TreeNode[] = [
    { id: 'f1', name: 'Projects', type: 'folder', parentId: null, mcp },
    { id: 'e1', name: 'prod', type: 'entity', parentId: 'f1', details: { id: 'e1', name: 'prod', kind: 'ssh', isSshEnabled: true } },
  ];
  return { nodes, source: { getAccounts: () => [{ accountId: 'a1' }], getNode: (_a: string, id: string) => nodes.find((n) => n.id === id) } };
}

/** The broker over production's own lookup and write — `mcpUseHooks` — the way `brokerMcpRoutes.test.ts` builds it. */
function mcpWorld(
  mcp: McpAccess,
  options: { answers?: (string | undefined)[]; holdDialogs?: boolean; supports?: string[]; verbs?: Record<string, string>; clock?: { now: number }; tree?: ReturnType<typeof vault> } = {},
) {
  const hooks = loadWithVscode<typeof import('../mcpHooks')>('../mcpHooks', { window: {} });
  const state = memento();
  const { clock = { now: FROZEN_NOW }, tree = vault(mcp), ...rest } = options;
  const { nodes, source } = tree;
  const both = hooks.mcpUseHooks(source, state, () => clock.now);
  const w = world({ mcpResolve: both.resolveMcpUse, mcpRemember: both.rememberMcpConsent, trash: true, ...rest });
  return { w, state, nodes, lookup: both.resolveMcpUse, stamp: (at: number = clock.now) => new ConsentStamps(state).get(stampKey('a1', 'e1'), at) };
}

const USE = { entry: 'e1', command: 'uptime' };

/** Poll until `ready`, failing with `what` rather than hanging the suite. */
async function until(ready: () => boolean, what: string, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('C1 token: one Allow covers the next call too — the dialog says so, and the second call is not asked', async () => {
  const w = world({ answers: ['Allow'] });
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'df -h' } });

    assert.equal(w.ran.length, 2);
    assert.equal(w.dialogs.length, 1, 'the second call did not ask — the tail is true here');
    assert.ok(w.dialogs[0].includes(TOKEN_TAIL), w.dialogs[0]);
    assert.match(w.dialogs[0], /"prod" until it goes unused for \d+ minutes, and never past this window closing\. Each call is logged/);
    assert.equal(w.dialogs[0].includes(CALL_TAIL), false, w.dialogs[0]);
  } finally {
    w.server.dispose();
  }
});

test('C2 alias: an Allow covers this call only — the second call asks again and nothing is remembered', async () => {
  const w = world({ alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' }, answers: ['Allow', 'Allow'] });
  try {
    const { port } = await share(w);

    await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'uptime' } });
    await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'uptime' } });

    assert.equal(w.ran.length, 2);
    assert.equal(w.dialogs.length, 2, 'the second call asked again, so "every later call" would be false');
    assert.deepEqual(w.consents, [], 'nothing was remembered');
    for (const dialog of w.dialogs) {
      assert.ok(dialog.includes(CALL_TAIL), dialog);
      assert.equal(dialog.includes('every later call'), false, dialog);
    }
  } finally {
    w.server.dispose();
  }
});

for (const [name, mcp] of [
  ['always', { use: true, ask: 'always' }],
  ['ask absent', { use: true }],
] as const) {
  test(`C3 MCP use, ${name}: an Allow covers this call only — the second call asks and no stamp is written`, async () => {
    const { w, state } = mcpWorld(mcp, { answers: ['Allow', 'Allow'] });
    try {
      const { port } = await share(w);

      await call(port, '/v1/mcp/use/exec', { body: USE });
      await call(port, '/v1/mcp/use/exec', { body: USE });

      assert.equal(w.dialogs.length, 2, 'the second call asked again');
      assert.equal(w.ran.length, 2);
      assert.equal(state.held.size, 0, 'no stamp was written');
      for (const dialog of w.dialogs) {
        assert.ok(dialog.includes(CALL_TAIL), dialog);
        assert.equal(dialog.includes('12 hours'), false, dialog);
      }
    } finally {
      w.server.dispose();
    }
  });
}

test('C4 MCP use, every12h: the dialog says the window, the stamp and the quiet second call are the window, the delete still asks', async () => {
  const { w, stamp, lookup } = mcpWorld({ use: true, delete: 'any', ask: 'every12h' }, { answers: ['Allow', 'Allow'] });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/use/exec', { body: USE });
    const written = stamp();
    assert.notEqual(written, undefined, 'the Allow wrote a stamp');
    const resolved = lookup('e1', 'exec');
    assert.equal(resolved?.kind === 'usable' ? resolved.rungs : undefined, written?.rungs, 'the stamp names the ladder that was shown');

    await call(port, '/v1/mcp/use/exec', { body: USE });
    assert.equal(w.dialogs.length, 1, 'the second call went quiet — "every later call … without asking" is true');
    assert.equal(w.ran.length, 2);
    assert.ok(w.audit.some((line) => line.includes('allowed without a prompt')), w.audit.join(' | '));

    const deleted = await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal(w.dialogs.length, 2, 'deleting still asks — the tail says so');
    assert.deepEqual(w.trashed, ['e1']);

    assert.ok(w.dialogs[0].includes(WINDOW_TAIL), w.dialogs[0]);
    assert.ok(w.dialogs[1].includes(CALL_TAIL), w.dialogs[1]);
  } finally {
    w.server.dispose();
  }
});

for (const run of [
  { name: 'a: the policy flipped to always', halves: 'the entry no longer stays set to "Ask once every 12 hours"', change: (nodes: TreeNode[]) => { nodes[0].mcp = { use: true, ask: 'always' }; } },
  { name: 'b: a switch turned on', halves: 'the entry\'s agent switches were changed', change: (nodes: TreeNode[]) => { nodes[0].mcp = { use: true, ask: 'every12h', edit: true }; } },
]) {
  test(`C4b MCP use, every12h, run ${run.name} while the dialog is open: the sentence shown is the one whose condition failed — no window opens`, async () => {
    const { w, state, nodes, stamp } = mcpWorld({ use: true, ask: 'every12h' }, { holdDialogs: true });
    try {
      const { port } = await share(w);
      const first = call(port, '/v1/mcp/use/exec', { body: USE });
      await until(() => w.openDialogs.length === 1, 'the consent modal');

      run.change(nodes);
      w.openDialogs.shift()?.('Allow');
      const answer = await first;

      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(w.ran.length, 1, 'the person\'s Allow still runs THIS call');
      assert.equal(stamp(), undefined, 'the write was refused');
      assert.equal(state.held.size, 0, 'nothing was stored');
      assert.ok(w.dialogs[0].includes(WINDOW_CONDITION), `the clause that failed (${run.halves}) is missing from: ${w.dialogs[0]}`);
      assert.ok(w.dialogs[0].includes(WINDOW_TAIL), w.dialogs[0]);

      const second = call(port, '/v1/mcp/use/exec', { body: USE });
      await until(() => w.openDialogs.length === 1, 'the second consent modal');
      assert.equal(w.dialogs.length, 2, 'the second call asked: no window opened');
      w.openDialogs.shift()?.('Deny');
      await second;
    } finally {
      w.server.dispose();
    }
  });
}

test('C9 MCP use, every12h, no stamp store: a lookup that reads nothing says nothing is remembered', async () => {
  const hooks = loadWithVscode<typeof import('../mcpHooks')>('../mcpHooks', { window: {} });
  const { source } = vault({ use: true, ask: 'every12h' });
  const w = world({ mcpResolve: (entryId: string, action: string) => hooks.mcpUseLookup(source, entryId, action), answers: ['Allow', 'Allow'] });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/use/exec', { body: USE });
    await call(port, '/v1/mcp/use/exec', { body: USE });

    assert.equal(w.dialogs.length, 2, 'both calls asked: the store-less lookup is never quiet');
    assert.equal(w.ran.length, 2);
    for (const dialog of w.dialogs) {
      assert.ok(dialog.includes(CALL_TAIL), dialog);
      assert.equal(dialog.includes('12 hours'), false, dialog);
    }
  } finally {
    w.server.dispose();
  }
});

test('C4c MCP use, always, the reverse race: a dialog that said "this call only" writes no stamp, even if the policy turned to every12h meanwhile', async () => {
  const { w, state, nodes, stamp } = mcpWorld({ use: true, ask: 'always' }, { holdDialogs: true });
  try {
    const { port } = await share(w);
    const first = call(port, '/v1/mcp/use/exec', { body: USE });
    await until(() => w.openDialogs.length === 1, 'the consent modal');

    nodes[0].mcp = { use: true, ask: 'every12h' };
    w.openDialogs.shift()?.('Allow');
    const answer = await first;

    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(w.ran.length, 1, 'the person\'s Allow still runs THIS call');
    assert.equal(JSON.stringify(stamp()), undefined, `a stamp was written after a dialog that said "this call only": ${JSON.stringify([...state.held])}`);
    assert.equal(state.held.size, 0, 'nothing was stored');
    assert.ok(w.dialogs[0].includes(CALL_TAIL), w.dialogs[0]);
    assert.equal(w.dialogs[0].includes('12 hours'), false, w.dialogs[0]);

    const second = call(port, '/v1/mcp/use/exec', { body: USE });
    await until(() => w.openDialogs.length === 1, 'the second consent modal');
    const asked = [...w.dialogs];
    w.openDialogs.shift()?.('Deny');
    await second;
    assert.equal(asked.length, 2, 'the second call asked: no window opened');
    assert.ok(asked[1].includes(WINDOW_TAIL), `the policy is read fresh per call: ${asked[1]}`);
  } finally {
    w.server.dispose();
  }
});

test('C4d MCP use, every12h, the actions one Allow quiets: the dialog names the rotate verb the person never clicked for', async () => {
  const { w } = mcpWorld(
    { use: true, edit: true, ask: 'every12h' },
    { answers: ['Allow'], supports: ['exec', 'rotate'], verbs: { rotate: 'change the stored secret of' } },
  );
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/use/exec', { body: USE });
    const rotated = await call(port, '/v1/mcp/use/rotate', { body: { entry: 'e1' } });

    assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
    assert.equal(w.dialogs.length, 1, 'one Allow on "run a command" quieted the rotate call: no second dialog');
    assert.deepEqual(w.ran.map((r) => r.action), ['exec', 'rotate']);
    assert.ok(w.audit.some((line) => line.includes('allowed without a prompt')), w.audit.join(' | '));
    assert.ok(w.dialogs[0].includes('run a command on, or change the stored secret of "prod"'), w.dialogs[0]);
    assert.ok(w.dialogs[0].includes('from any agent'), w.dialogs[0]);
  } finally {
    w.server.dispose();
  }
});

test('C4e MCP use, every12h, the moving clock: a quiet call does not slide the window, and the window ends', async () => {
  const clock = { now: FROZEN_NOW };
  const { w, stamp } = mcpWorld({ use: true, ask: 'every12h' }, { answers: ['Allow', 'Allow'], clock });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/use/exec', { body: USE });
    assert.equal(stamp()?.at, FROZEN_NOW, 'the Allow stamped t0');

    clock.now = FROZEN_NOW + 3_600_000;
    await call(port, '/v1/mcp/use/exec', { body: USE });
    assert.equal(w.dialogs.length, 1, 'an hour later the call is quiet');
    assert.equal(w.ran.length, 2);
    assert.equal(stamp()?.at, FROZEN_NOW, 'a quiet call did not slide the window: the stamp is still t0');

    clock.now = FROZEN_NOW + ASK_WINDOW_MS + 1;
    await call(port, '/v1/mcp/use/exec', { body: USE });
    assert.equal(w.dialogs.length, 2, 'past the window the call asks again');
  } finally {
    w.server.dispose();
  }
});

test('C10 MCP use, every12h, two stores: an Allow on one machine opens nothing on another', async () => {
  const tree = vault({ use: true, ask: 'every12h' });
  const a = mcpWorld({ use: true, ask: 'every12h' }, { answers: ['Allow'], tree });
  const b = mcpWorld({ use: true, ask: 'every12h' }, { answers: ['Allow'], tree });
  try {
    await call((await share(a.w)).port, '/v1/mcp/use/exec', { body: USE });
    const aStamp = a.stamp();
    assert.notEqual(aStamp, undefined, 'A\'s Allow wrote A\'s stamp');

    assert.equal(b.stamp(), undefined, 'B\'s store is empty before its call');
    assert.equal(b.state.held.size, 0);
    await call((await share(b.w)).port, '/v1/mcp/use/exec', { body: USE });

    assert.equal(b.w.dialogs.length, 1, 'B\'s call raised a dialog: A\'s Allow did not travel');
    assert.ok(b.w.dialogs[0].includes(WINDOW_TAIL), b.w.dialogs[0]);
    assert.notEqual(b.stamp(), undefined, 'after B\'s Allow, B holds its own stamp');
    assert.deepEqual(a.stamp(), aStamp, 'and A\'s is unchanged');
  } finally {
    a.w.server.dispose();
    b.w.server.dispose();
  }
});

test('C5 MCP never: a use call shows no dialog at all, and each delete asks with the call tail', async () => {
  const { w, state } = mcpWorld({ use: true, delete: 'any', ask: 'never' }, { answers: ['Allow', 'Allow'] });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/use/exec', { body: USE });
    assert.equal(w.dialogs.length, 0, 'a use call under never reaches no dialog, so no sentence exists for it');
    assert.equal(w.ran.length, 1);
    assert.ok(w.audit.some((line) => line.includes('allowed without a prompt')), w.audit.join(' | '));
    assert.equal(state.held.size, 0);

    await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } });
    assert.equal(w.dialogs.length, 1);
    await call(port, '/v1/mcp/delete', { body: { entry: 'e1' } });
    assert.equal(w.dialogs.length, 2, 'each delete asks');
    assert.equal(state.held.size, 0);
    for (const dialog of w.dialogs) {
      assert.ok(dialog.includes(CALL_TAIL), dialog);
    }
  } finally {
    w.server.dispose();
  }
});

const FOLDER_HOOKS: McpFolderHooks = {
  list: () => [],
  choose: () => ({
    ok: true,
    target: { accountId: 'a1', entityId: 'f1', entityName: 'Servers', kind: 'folder' },
    summary: 'staging in "Servers"',
    edit: {},
  }),
  create: () => Promise.resolve({ id: 'f2', name: 'staging' }),
  edit: () => Promise.resolve(true),
  remove: () => Promise.resolve(true),
};

/** Every door but the token one, on a stubbed lookup — which carries no `remembers`, and must read as `call`. */
const OTHER_DOORS: { name: string; make: () => World; path: string; body: Record<string, unknown> }[] = [
  {
    name: 'alias',
    make: () => world({ alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' } }),
    path: '/v1/alias/exec',
    body: { alias: 'prod', command: 'uptime' },
  },
  { name: 'mcp use', make: () => world({ mcpUse: 'usable' }), path: '/v1/mcp/use/exec', body: USE },
  { name: 'mcp delete', make: () => world({ mcpUse: 'usable', trash: true }), path: '/v1/mcp/delete', body: { entry: 'e1' } },
  { name: 'mcp create', make: () => world({ create: 'open' }), path: '/v1/mcp/create', body: { name: 'app-03', kind: 'ssh' } },
  {
    name: 'folder verb',
    make: () => {
      const w = world({});
      w.server.setFolderHooks(FOLDER_HOOKS);
      return w;
    },
    path: '/v1/mcp/folder/create',
    body: { name: 'staging', parent: 'f1' },
  },
];

for (const door of OTHER_DOORS) {
  test(`C6 the ${door.name} door, stubbed: the dialog says this call only`, async () => {
    const w = door.make();
    try {
      const { port } = await share(w);

      const answer = await call(port, door.path, { body: door.body });

      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(w.dialogs.length, 1);
      assert.ok(w.dialogs[0].includes(CALL_TAIL), w.dialogs[0]);
      assert.equal(w.dialogs[0].includes('every later call'), false, w.dialogs[0]);
    } finally {
      w.server.dispose();
    }
  });
}

test('C7 coverageOf: a token grant never widens, a call grant widens only when it remembers', () => {
  const gate = loadWithVscode<typeof import('../brokerConsent')>('../brokerConsent', { window: {} });

  assert.equal(gate.coverageOf('token', true), 'token');
  assert.equal(gate.coverageOf('token', false), 'token');
  assert.equal(gate.coverageOf('call', false), 'call');
  assert.equal(gate.coverageOf('call', true), 'every12h');
});

test('C7b opensWindow: only a dialog that announced the window, and was asked, writes a stamp', () => {
  const gate = loadWithVscode<typeof import('../brokerConsent')>('../brokerConsent', { window: {} });
  const question = (coverage: 'token' | 'call' | 'every12h') => ({ coverage }) as import('../brokerConsent').ConsentQuestion;

  assert.equal(gate.opensWindow(question('every12h'), true), true);
  assert.equal(gate.opensWindow(question('every12h'), false), false);
  assert.equal(gate.opensWindow(question('call'), true), false);
  assert.equal(gate.opensWindow(question('token'), true), false);
});

test('C8 the number: the constant, the switch label and this file\'s literals say one and the same twelve', () => {
  const hours = ASK_WINDOW_MS / 3_600_000;
  const label = MCP_ASK_CHOICES.find((choice) => choice.value === 'every12h')?.label ?? '';
  const where = 'ASK_WINDOW_MS (mcpConsentPolicy.ts), the every12h switch label (mcpSwitches.ts) and this file\'s TOKEN/WINDOW literals must agree';

  assert.equal(hours, 12, where);
  assert.ok(label.includes(`${hours} hours`), `${where}; the label reads "${label}"`);
  assert.ok(WINDOW_TAIL.includes(`up to ${hours} hours`) && WINDOW_CONDITION.includes(`every ${hours} hours`), where);
});
