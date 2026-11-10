import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { commandRefusal } from '../commandLine';
import { formatEntityBlock } from '../entityText';
import { EntityViewOptions, copyValueFor, renderEntityViewHtml } from '../entityViewPage';
import { COPY_NOTE, copiedLineOf, planLaunch, sshLinkOf, trustLineFor } from '../remoteLaunch';
import { resolveJumpChain } from '../sshOptions';
import { escapeHtml } from '../webviewHtml';
import type { EntityMetadata, TreeNode } from '../types';
import { sshNode } from './sshRoadWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * E2.S1: the copies of a linked line — Copy Command, the viewer's *Full command* row and copy, and Copy All — show the
 * TRUST line (`ssh … -- user@host '<line>'`, no key, no pin file) with the one sentence of what it is (`COPY_NOTE`).
 */

const LINKED: EntityMetadata = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' };

function vault(...nodes: TreeNode[]): (id: string) => TreeNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id) => byId.get(id);
}

const S1 = sshNode('s1');
const lookup = vault(S1);

/** The expected trust line, from the SSH entry and the jump chain as storage holds them. */
function trustLine(ssh: TreeNode, find: (id: string) => TreeNode | undefined, line: string): string {
  const details = ssh.details as EntityMetadata;
  const chain = resolveJumpChain(details, (id) => find(id)?.details);
  assert.equal(chain.ok, true);
  return trustLineFor(details, chain.ok ? chain.value : undefined, line);
}

const refusedReason = (copy: ReturnType<typeof copiedLineOf>): string => {
  assert.equal(copy.kind, 'refused');
  return (copy as { reason: string }).reason;
};

// U1
test('copied_line_of_an_unlinked_entry_is_local', () => {
  const plain = { ...LINKED, sshEntityId: undefined, command: 'ls' };
  assert.deepEqual(copiedLineOf(plain, lookup), { kind: 'local' });
  assert.deepEqual(copiedLineOf({ ...plain, sshEntityId: '' }, lookup), { kind: 'local' });
});

// U2
test('copied_line_of_a_linked_entry_is_the_trust_line_with_the_jump_and_the_note', () => {
  const jumped = sshNode('s1', { jumpHostEntityId: 'j1' });
  const find = vault(jumped, sshNode('j1', { name: 'bastion', host: 'bastion.example' }));
  const copy = copiedLineOf(LINKED, find);
  assert.equal(copy.kind, 'linked');
  const { line, note } = copy as { line: string; note: string };
  assert.equal(line, trustLine(jumped, find, 'echo linked'));
  assert.ok(line.includes('-J'), line);
  assert.ok(!/ -i /.test(line) && !line.includes('known_hosts') && !line.includes('keys/'), line);
  assert.equal(note, COPY_NOTE);
});

// U3
test('copied_line_of_a_broken_link_or_a_bad_plan_is_refused', () => {
  const missing = sshLinkOf(LINKED, () => undefined);
  assert.equal(missing.kind, 'refused');
  assert.equal(refusedReason(copiedLineOf(LINKED, () => undefined)), (missing as { reason: string }).reason);

  const windows = { ...LINKED, terminalOs: 'windows' };
  const windowsPlan = planLaunch(windows, sshLinkOf(windows, lookup), { stayOpen: false });
  assert.equal(windowsPlan.kind, 'refused');
  assert.equal(refusedReason(copiedLineOf(windows, lookup)), (windowsPlan as { reason: string }).reason);

  const broken = { ...LINKED, command: 'echo a\necho b' };
  const brokenPlan = planLaunch(broken, sshLinkOf(broken, lookup), { stayOpen: false });
  assert.equal(brokenPlan.kind, 'refused');
  assert.equal(refusedReason(copiedLineOf(broken, lookup)), (brokenPlan as { reason: string }).reason);

  const looping = sshNode('s1', { jumpHostEntityId: 'j1' });
  const find = vault(looping, sshNode('j1', { name: 'bastion', host: 'bastion.example', jumpHostEntityId: 's1' }));
  const chain = resolveJumpChain(looping.details as EntityMetadata, (id) => find(id)?.details);
  assert.equal(chain.ok, false);
  assert.equal(refusedReason(copiedLineOf(LINKED, find)), (chain as { reason: string }).reason);
});

// U4
test('copied_line_of_a_linked_entry_with_a_refused_name_says_will_not_run', () => {
  const entry = { ...LINKED, name: 'a b', command: 'x {name}' };
  const reason = commandRefusal(entry);
  assert.notEqual(reason, undefined);
  assert.equal(refusedReason(copiedLineOf(entry, lookup)), `"a b" will not run: ${reason}`);
});

// ---- Copy Command ---------------------------------------------------------------------------------------------------

type Handler = (target: unknown) => Promise<void>;

function copyWorld(find: (id: string) => TreeNode | undefined) {
  const warnings: string[] = [];
  const infos: string[] = [];
  const copied: string[] = [];
  const stub = {
    window: {
      showWarningMessage: (m: string) => (warnings.push(m), Promise.resolve(undefined)),
      showInformationMessage: (m: string) => (infos.push(m), Promise.resolve(undefined)),
      showTextDocument: () => Promise.resolve(undefined),
    },
    env: { clipboard: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } },
    workspace: { openTextDocument: () => Promise.resolve({}) },
  };
  const mod = loadWithVscode<typeof import('../commands/entityCommands')>('../commands/entityCommands', stub, { '../extension': { maskingBanner: () => '' } });
  const registered: Record<string, Handler> = {};
  const register = (command: string, handler: Handler): void => void (registered[command] = handler);
  const storage = { getNode: (_account: string, id: string) => find(id), getHistory: () => Promise.resolve([]) };
  const host = new Proxy({ register, storage, vaultKeys: { noteUserActivity: () => undefined } }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => undefined) });
  mod.registerEntityCommands(host as never);
  const copy = (node: unknown): Promise<void> => registered['credSshManager.copyCommand']({ kind: 'node', accountId: 'a1', node });
  return { warnings, infos, copied, copy };
}

const LINKED_NODE: TreeNode = { id: 'e1', name: 'deploy', type: 'entity', details: LINKED };

// C1
test('copy_command_copies_the_trust_line_and_says_the_note', async () => {
  const h = copyWorld(lookup);
  await h.copy(LINKED_NODE);
  const line = trustLine(S1, lookup, 'echo linked');
  assert.deepEqual(h.copied, [line]);
  assert.deepEqual(h.infos, [`Copied: ${line} — ${COPY_NOTE}`]);
});

// C2
test('copy_command_of_a_broken_link_copies_nothing_and_says_why', async () => {
  const h = copyWorld(() => undefined);
  await h.copy(LINKED_NODE);
  const missing = sshLinkOf(LINKED, () => undefined);
  assert.deepEqual(h.copied, []);
  assert.deepEqual(h.warnings, [(missing as { reason: string }).reason]);
});

// ---- the viewer and Copy All ----------------------------------------------------------------------------------------

function viewOptions(overrides: Partial<EntityViewOptions> = {}): EntityViewOptions {
  return {
    details: LINKED,
    /** The caller always reads it with storage; here, with no lookup, unless a test says otherwise. */
    sshCopy: copiedLineOf(overrides.details ?? LINKED, () => undefined),
    hasPassword: false,
    hasPrivateKey: false,
    hasVpnConfig: false,
    hasDbConnection: false,
    dbPortIsDefault: false,
    dbHasPassword: false,
    hasAttachment: false,
    history: [],
    resolveSecret: async () => undefined,
    copyAllText: async () => '',
    saveVpnConfig: async () => {},
    saveAttachment: async () => {},
    setEnv: async () => true,
    checkEnv: () => {},
    ...overrides,
  } as EntityViewOptions;
}

const linkedOptions = (): EntityViewOptions => viewOptions({ sshLinkName: 'prod box', sshCopy: copiedLineOf(LINKED, lookup) });

// V1
test('the_viewer_shows_the_trust_line_and_the_note_not_a_refusal', () => {
  const line = trustLine(S1, lookup, 'echo linked');
  const html = renderEntityViewHtml(linkedOptions());
  const full = html.indexOf('Full command');
  assert.ok(full >= 0 && html.indexOf(escapeHtml(line), full) > full, 'the trust line is in the Full command row');
  const about = html.indexOf('About this line');
  assert.ok(about >= 0 && html.indexOf(escapeHtml(COPY_NOTE), about) > about, 'the note is in the About this line row');
  assert.ok(!html.includes('Will not run'), 'no refusal row');
});

// V2
test('the_viewer_copies_the_trust_line_and_the_note', async () => {
  const options = linkedOptions();
  assert.equal(await copyValueFor(options, 'fullCommand'), trustLine(S1, lookup, 'echo linked'));
  assert.equal(await copyValueFor(options, 'sshCopyNote'), COPY_NOTE);
  assert.equal(await copyValueFor(options, 'commandRefusal'), undefined);
});

// V3
test('the_viewer_and_copy_all_are_wired_with_storage', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'entityViewerCommands.ts'), 'utf8');
  const compute = 'const sshCopy = copiedLineOf(details, (id) => storage.getNode(accountId, id));';
  assert.equal(source.split(compute).length - 1, 2, 'the entry page and the revision page each compute it once');
  const calls = source.split('\n').filter((l) => l.includes('formatEntityBlock(') && !l.includes('import'));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((l) => l.trimEnd().endsWith(', sshCopy),') || l.trimEnd().endsWith(', sshCopy)')), calls.join('\n'));
});

// V4
test('copy_all_of_a_linked_entry_holds_the_trust_line_and_the_note_not_the_local_line', () => {
  const block = formatEntityBlock(LINKED, undefined, undefined, undefined, undefined, copiedLineOf(LINKED, lookup));
  assert.ok(block.includes(trustLine(S1, lookup, 'echo linked')), block);
  assert.ok(block.includes(COPY_NOTE), block);
  assert.ok(!block.includes('\necho linked'), block);
});

// V6 (coai, accepted): the copied line is REQUIRED — a Terminal entry's Copy All never guesses one without storage.
test('copy_all_of_a_terminal_entry_without_its_copied_line_is_a_programming_error', () => {
  assert.throws(() => formatEntityBlock(LINKED, undefined), /copied line/);
  assert.throws(() => formatEntityBlock({ ...LINKED, sshEntityId: undefined, command: 'ls' }, undefined), /copied line/);
});

// V5 — a guard, green before and after (testing.md: one positive per file).
test('an_unlinked_viewer_and_block_are_unchanged', () => {
  const plain = { ...LINKED, sshEntityId: undefined, command: 'ls' };
  const bare = viewOptions({ details: plain });
  const withLocal = viewOptions({ details: plain, sshCopy: { kind: 'local' } });
  // The page's nonce is random per render: the one thing that may differ.
  const stable = (html: string): string => html.replace(/nonce-[\w-]+/g, 'nonce-X').replace(/nonce="[^"]+"/g, 'nonce="X"');
  assert.equal(stable(renderEntityViewHtml(withLocal)), stable(renderEntityViewHtml(bare)));
  assert.ok(renderEntityViewHtml(bare).includes('Full command'), 'the local line is still shown');
  assert.equal(formatEntityBlock(plain, undefined, undefined, undefined, undefined, { kind: 'local' }), 'Name: deploy\n\nls');
});
