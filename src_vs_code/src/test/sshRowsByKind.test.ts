import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGENT_KIND_FIELDS } from '../agentKindFields';
import { canConnectSsh, stampKind } from '../entityKind';
import { cliCommandFor } from '../cliCommandText';
import { formatEntityBlock } from '../entityText';
import type { EntityViewOptions } from '../entityViewPage';
import { renderEntityViewHtml } from '../entityViewPage';
import type { Revision } from '../revisionHistory';
import { describeTarget } from '../treeRowText';
import { ENTITY_KINDS, EntityKind, EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';
import { ACCOUNT, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * SSH rows only on an SSH entry — plan `PLAN_agent_creates_what_the_folder_holds.md` §4.5, defect 3.
 *
 * <p>The owner's report (2026-09-29): an agent stored a PowerShell quota check in a Terminal folder and
 * put the API endpoint into `host`, because that was the only field its tool had. The viewer then drew
 * **Host** and **SSH command** `ssh token-plan.ap-southeast-1.maas.aliyuncs.com` on a Terminal entry —
 * `buildSshCommand` checks only that the host is a safe ssh target, never the kind, and every page that
 * shows an ssh line asked it for every entry. A VPN with its endpoint in `host` got an `ssh …` line
 * too.</p>
 *
 * <p>The live viewer and the revision viewer are driven for real, over the real `StorageManager`;
 * only the webview is a spy. The Host row is asserted for every kind against the agent table — the
 * kinds whose table entry has a `host` — and against `canConnectSsh`, so a kind that gains one cannot
 * be missed here. The SSH rows follow `canConnectSsh` too (plan §11): the viewer and the tree's
 * *Connect via SSH* give one answer to one question.</p>
 */

const HOST = 'token-plan.ap-southeast-1.maas.aliyuncs.com';

function entry(kind: EntityKind, over: Partial<EntityMetadata> = {}): EntityMetadata {
  return stampKind({ id: `e-${kind}`, name: `${kind} entry`, isSshEnabled: false, kind, host: HOST, ...over } as EntityMetadata);
}

interface Viewers {
  live(): Promise<EntityViewOptions>;
  kept(): Promise<EntityViewOptions>;
}

async function viewers(details: EntityMetadata): Promise<Viewers> {
  const stub = clickVscode([], sinks());
  const storage = memoryStorage(stub);
  await seedEntry(storage, details, {});
  const node = storage.getNode(ACCOUNT, details.id) as TreeNode;
  assert.ok(node !== undefined, 'precondition: the store took the fixture');
  assert.equal(node.details?.host, HOST, 'precondition: the stray host is on the record, as the owner’s was');
  const shown: EntityViewOptions[] = [];
  const mod = loadWithVscode<typeof import('../entityViewerCommands')>('../entityViewerCommands', stub, {
    './entityViewPanel': { showEntityView: (options: EntityViewOptions): void => void shown.push(options) },
  });
  const doors = { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false };
  const opened = async (open: () => Promise<void>): Promise<EntityViewOptions> => {
    shown.length = 0;
    await open();
    assert.equal(shown.length, 1, 'the viewer opened');
    return shown[0];
  };
  return {
    live: () => opened(() => mod.openEntityViewer(ACCOUNT, node, storage, doors as never)),
    kept: async () => {
      await storage.recordRevision(ACCOUNT, details.id, { at: 1_700_000_000_000, name: `${details.name} (old)`, details, secrets: {} } as Revision);
      const [recorded] = await storage.getHistory(ACCOUNT, details.id);
      assert.ok(recorded !== undefined, 'precondition: the revision validator took the fixture');
      return opened(() => mod.openRevisionViewer(ACCOUNT, node, recorded, storage));
    },
  };
}

test('a Terminal (and a VPN) entry with a host shows no SSH command; an SSH entry still does', async () => {
  for (const details of [entry('terminal', { command: 'pwsh' }), entry('vpn')]) {
    const v = await viewers(details);
    assert.equal((await v.live()).sshCommand, undefined, `a ${details.kind} entry drew an SSH command in the viewer`);
    assert.equal((await v.kept()).sshCommand, undefined, `a kept version of a ${details.kind} entry drew an SSH command`);
  }
  const ssh = await viewers(entry('ssh', { isSshEnabled: true, user: 'root' }));
  assert.match(String((await ssh.live()).sshCommand), /^ssh root@token-plan\.ap-southeast-1/, 'the SSH entry lost its line');
  assert.match(String((await ssh.kept()).sshCommand), /^ssh root@token-plan\.ap-southeast-1/, 'and its kept version too');
});

test('the Host row is drawn only for the kinds whose agent table has a host, or a record the tree can Connect to', () => {
  const hosted = ENTITY_KINDS.filter((kind) => AGENT_KIND_FIELDS[kind].some((field) => field.name === 'host'));
  assert.deepEqual([...hosted].sort(), ['ssh', 'vpn'], 'precondition: the table says what the plan says');
  const connectable = ENTITY_KINDS.filter((kind) => !hosted.includes(kind) && canConnectSsh(entry(kind)));
  assert.deepEqual(connectable, ['credential'], 'precondition: only a credential with a host is Connect’s legacy breadth');
  for (const kind of ENTITY_KINDS) {
    const html = renderEntityViewHtml(viewPage(entry(kind)));
    const expected = hosted.includes(kind) || connectable.includes(kind);
    assert.equal(html.includes('<label>Host</label>'), expected, `the Host row on a ${kind} entry`);
  }
});

test('Copy all, Connect, the CLI verb and the tree description do not treat a Terminal’s host as an SSH machine', () => {
  const terminal = entry('terminal', { command: 'pwsh' });
  assert.doesNotMatch(formatEntityBlock(entry('config'), undefined), /SSH:/, 'Copy all wrote an ssh line for a config entry');
  assert.equal(canConnectSsh(terminal), false, 'the tree offered Connect via SSH on a Terminal entry');
  assert.equal(canConnectSsh(entry('vpn')), false, 'and on a VPN');
  assert.equal(cliCommandFor(terminal, 'q'), 'creds run q', 'the CLI row named the ssh verb for a command');
  assert.equal(describeTarget({ id: 't', name: 't', type: 'entity', parentId: null, details: terminal } as TreeNode), '', 'the tree row described the stray host');
  // The legacy case `canConnectSsh` keeps on purpose: a record with a host and no kind of its own.
  const legacy = { id: 'l', name: 'old box', isSshEnabled: false, host: 'box.example.com' } as EntityMetadata;
  assert.equal(canConnectSsh(legacy), true, 'the documented legacy credential keeps Connect');
  assert.equal(cliCommandFor(legacy, 'b'), 'creds ssh b');
  assert.match(formatEntityBlock(entry('ssh', { isSshEnabled: true }), undefined), /SSH: ssh /, 'an SSH entry keeps its line in Copy all');
});

test('a legacy host-only record the tree can Connect to shows its Host and SSH command', async () => {
  // A record written before `kind` existed, with a host and no ssh flag: its kind falls back to
  // credential, and `canConnectSsh` keeps *Connect via SSH* for it on purpose. The viewer answers the
  // same question the tree does, so it shows the machine Connect would log in to.
  const legacy = { id: 'e-legacy', name: 'old box', isSshEnabled: false, host: HOST, user: 'root' } as EntityMetadata;
  assert.equal(canConnectSsh(legacy), true, 'precondition: the tree offers Connect via SSH on this record');
  const v = await viewers(legacy);
  assert.match(String((await v.live()).sshCommand), /^ssh root@token-plan\.ap-southeast-1/, 'the viewer hid the SSH command the tree connects with');
  assert.match(String((await v.kept()).sshCommand), /^ssh root@token-plan\.ap-southeast-1/, 'and its kept version hid it too');
  assert.ok(renderEntityViewHtml(viewPage(legacy)).includes('<label>Host</label>'), 'the viewer hid the Host the tree connects to');
  assert.match(formatEntityBlock(legacy, undefined), /SSH: ssh root@/, 'Copy all left out the line Connect uses');
});

function viewPage(details: EntityMetadata): EntityViewOptions {
  return {
    details,
    hasPassword: false,
    hasPrivateKey: false,
    hasVpnConfig: false,
    hasDbConnection: false,
    dbPortIsDefault: false,
    dbHasPassword: false,
    hasAttachment: false,
    history: [],
    resolveSecret: () => Promise.resolve(undefined),
    copyAllText: () => Promise.resolve(''),
    saveVpnConfig: () => Promise.resolve(),
    saveAttachment: () => Promise.resolve(),
    setEnv: () => Promise.resolve(true),
    checkEnv: () => undefined,
  } as EntityViewOptions;
}
