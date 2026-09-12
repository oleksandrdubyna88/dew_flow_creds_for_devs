import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { McpFolderHooks } from '../brokerFolderDoor';
import { call, share, world } from './brokerWorld';
import type { World } from './brokerWorld';

/**
 * The HEAD of the consent sentence — who the modal says is asking.
 *
 * <p>Every earlier assertion on this dialog was on its tail (`Allowing covers every later call`,
 * the entity name), which is how a hardcoded product name survived four doors: Codex, Gemini,
 * the `creds` CLI in a plain terminal and every other MCP client were all announced as
 * "Claude Code". The one thing a consent modal must be is accurate about what it authorises, so
 * the head is pinned here, through every door, against the real broker under the stub.</p>
 *
 * <p>The caller is a LABEL the body reports. It never reaches a decision — nothing here asserts
 * that a caller was refused or admitted, only that the person is told who is asking and told,
 * in the same dialog, that the name is the caller's own claim.</p>
 */

const CALLER = { agent: 'Claude Code 2.1.268', session: '98bf9f23', sessionName: 'clauderag-d6', cwd: 'ClaudeRag' };
const LABEL = 'Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in ClaudeRag';
const DISCLAIMER = 'Identity as reported by the caller — a label, not a check.';

test('the modal names WHO is asking — the caller the body reports, never a product by default', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime', caller: CALLER } });

    assert.equal(w.dialogs.length, 1);
    assert.ok(w.dialogs[0].startsWith(`${LABEL} wants to run a command on "prod"`), w.dialogs[0]);
  } finally {
    w.server.dispose();
  }
});

test('no caller means "An agent" — the default must not name a product', async () => {
  // The whole fix in one clause: an old `creds`, an old `creds-mcp`, or any client that reports
  // nothing is exactly the caller about which the least is known.
  const w = world({});
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.ok(w.dialogs[0].startsWith('An agent wants to run a command on "prod"'), w.dialogs[0]);
    assert.equal(w.dialogs[0].includes('Claude Code'), false, w.dialogs[0]);
  } finally {
    w.server.dispose();
  }
});

test('the dialog says the identity is the caller\'s own claim, in its own sentence', async () => {
  // A label a person mistakes for a check is worse than no label.
  const w = world({});
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime', caller: CALLER } });

    assert.ok(w.dialogs[0].includes(DISCLAIMER), w.dialogs[0]);
    assert.match(w.dialogs[0], /Allowing covers every later call/, 'the tail is still there');
  } finally {
    w.server.dispose();
  }
});

/** A folder open to creation, answering the way `mcpFolderHooks` would for one accepted request. */
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

/**
 * Every door that can raise the modal, and the request that raises it through that door.
 *
 * <p>Six, not one. `consent` is called from four places behind six routes, and the discipline
 * `credsAgentServer.test.ts` states for the token and alias doors — every guarantee through BOTH —
 * holds for the four MCP routes too, because the door that gets forgotten is always the newest.</p>
 */
const DOORS: {
  name: string;
  make: () => World;
  path: string;
  body: Record<string, unknown>;
  token?: (secret: string) => string;
}[] = [
  { name: 'token', make: () => world({}), path: '/v1/use/exec', body: { command: 'uptime' }, token: (s) => s },
  {
    name: 'alias',
    make: () => world({ alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' } }),
    path: '/v1/alias/exec',
    body: { alias: 'prod', command: 'uptime' },
  },
  { name: 'mcp use', make: () => world({ mcpUse: 'usable' }), path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'uptime' } },
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

for (const door of DOORS) {
  test(`the ${door.name} door names the caller in its modal, and records it on the audit line`, async () => {
    const w = door.make();
    try {
      const { port, secret } = await share(w);

      const answer = await call(port, door.path, { token: door.token?.(secret), body: { ...door.body, caller: CALLER } });

      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(w.dialogs.length, 1, 'the human was asked');
      assert.ok(w.dialogs[0].includes(`${LABEL} wants to `), w.dialogs[0]);
      assert.ok(w.dialogs[0].includes(DISCLAIMER), w.dialogs[0]);
      // The journal is the other place the label goes: between the door and the outcome.
      assert.ok(
        w.audit.some((line) => line.includes(` by ${LABEL} → `)),
        `no audit line carries the caller:\n${w.audit.join('\n')}`,
      );
    } finally {
      w.server.dispose();
    }
  });
}

test('a caller that reports nothing but its own name — the CLI in a plain terminal — is named as itself', async () => {
  // "creds CLI · in ClaudeRag", never "An agent": the record is not empty, it merely has no
  // session, and a person's own terminal must not read as an unknown agent.
  const w = world({ alias: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' } });
  try {
    const { port } = await share(w);

    await call(port, '/v1/alias/exec', {
      body: { alias: 'prod', command: 'uptime', caller: { agent: 'creds CLI', session: '', sessionName: '', cwd: 'ClaudeRag' } },
    });

    assert.ok(w.dialogs[0].startsWith('creds CLI · in ClaudeRag wants to run a command on "prod"'), w.dialogs[0]);
  } finally {
    w.server.dispose();
  }
});
