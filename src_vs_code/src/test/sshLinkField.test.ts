import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { collectSshCandidates } from '../commandTargets';
import { renderHtml } from '../entityFormPage';
import type { EntityFormOptions } from '../entityFormShape';
import { execDetails, sshLinkField } from '../execFormFields';
import { isEntityMetadata } from '../typeGuards';
import type { EntityMetadata, TreeNode } from '../types';

/** E1.S1: the SSH-link picker, its guard, its candidates and its wiring (`PLAN_terminal_command_over_ssh_E1.md` S1.4). */

const CANDIDATES = [
  { id: 's1', name: 'prod' },
  { id: 's2', name: 'stage' },
];

const src = (file: string): string => fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', file), 'utf8');

test('the_guard_accepts_a_string_link_and_refuses_a_number', () => {
  const base = { id: 'e', name: 'x', isSshEnabled: false };
  assert.equal(isEntityMetadata({ ...base, sshEntityId: 's1' }), true);
  assert.equal(isEntityMetadata({ ...base, sshEntityId: 7 }), false);
});

test('the_picker_starts_on_do_not_use_then_lists_the_candidates', () => {
  const html = sshLinkField(undefined, CANDIDATES);
  const none = html.indexOf('<option value="" selected>— Do not use —</option>');
  const prod = html.indexOf('<option value="s1">prod</option>');
  const stage = html.indexOf('<option value="s2">stage</option>');
  assert.ok(none >= 0 && none < prod && prod < stage, html);
  assert.ok(html.includes('<label for="sshEntityId">Runs over SSH</label>'), html);
  assert.ok(html.includes('<select id="sshEntityId">'), html);
});

test('a_stored_link_is_selected', () => {
  const html = sshLinkField({ id: 't', name: 't', isSshEnabled: false, sshEntityId: 's2' }, CANDIDATES);
  assert.ok(html.includes('<option value="s2" selected>stage</option>'), html);
  assert.equal(html.includes('<option value="" selected>'), false, html);
});

test('a_link_that_is_no_longer_offered_shows_missing_and_stays_selected', () => {
  const html = sshLinkField({ id: 't', name: 't', isSshEnabled: false, sshEntityId: 'gone' }, []);
  assert.ok(html.includes('<option value="gone" selected>(missing entry)</option>'), html);
});

test('a_candidate_name_is_escaped', () => {
  const html = sshLinkField(undefined, [{ id: 's1', name: '<b>x</b>' }]);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'), html);
  assert.equal(html.includes('<b>'), false, html);
});

test('the_save_keeps_a_link_only_on_a_terminal_entry_never_itself_never_empty', () => {
  assert.equal(execDetails({ sshEntityId: 's1' }, 'terminal', 0, 't1').sshEntityId, 's1');
  assert.equal(execDetails({ sshEntityId: 's1' }, 'ssh', 0, 't1').sshEntityId, undefined);
  assert.equal(execDetails({ sshEntityId: 's1' }, 'vpn', 0, 't1').sshEntityId, undefined);
  assert.equal(execDetails({ sshEntityId: 't1' }, 'terminal', 0, 't1').sshEntityId, undefined);
  assert.equal(execDetails({ sshEntityId: '' }, 'terminal', 0, 't1').sshEntityId, undefined);
});

function formOptions(over: Partial<EntityFormOptions>): EntityFormOptions {
  return {
    mode: 'edit',
    entityId: 'e1',
    initial: { id: 'e1', name: 'x', isSshEnabled: false, isTerminal: true, command: 'ls' },
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    jumpCandidates: [],
    dependencyFolders: [],
    dependencyColors: {},
    ...over,
  };
}

test('the_page_shows_the_picker_in_the_terminal_section_after_runs_on', () => {
  const html = renderHtml(formOptions({ sshCandidates: [{ id: 's1', name: 'prod' }] }));
  assert.equal(html.split('id="sshEntityId"').length - 1, 1, 'exactly one picker');
  const os = html.indexOf('id="terminalOs"');
  const link = html.indexOf('id="sshEntityId"');
  const note = html.indexOf('id="commandNote"');
  assert.ok(os >= 0 && os < link && link < note, `${os} < ${link} < ${note}`);
});

test('the_page_posts_the_link_on_save_on_the_terminalOs_line', () => {
  const line = src('entityFormScript.ts')
    .split('\n')
    .find((l) => l.includes("sshEntityId: val('sshEntityId')"));
  assert.ok(line !== undefined, 'the save payload does not post the link');
  assert.ok(line.includes("terminalOs: val('terminalOs')"), line);
});

test('both_forms_fill_the_ssh_candidates', () => {
  assert.ok(src('entityEditCommands.ts').includes('sshCandidates: collectSshCandidates(storage, accountId, node.id),'));
  assert.ok(src('commands/treeMutationCommands.ts').includes('sshCandidates: collectSshCandidates(storage, location.accountId, id),'));
  assert.ok(src('commands/shareCommands.ts').includes('sshCandidates: [],'));
});

// ---- the candidates --------------------------------------------------------------------------------------------

function entity(id: string, name: string, details: Partial<EntityMetadata>, parentId: string | null = null): TreeNode {
  return { id, name, type: 'entity', parentId, details: { id, name, isSshEnabled: false, ...details } };
}

function folder(id: string, parentId: string | null = null, isTrash = false): TreeNode {
  return { id, name: id, type: 'folder', parentId, ...(isTrash ? { isTrash: true } : {}) } as TreeNode;
}

function storageOf(nodes: TreeNode[]): never {
  return {
    getNodes: () => nodes,
    getNode: (_account: string, id: string) => nodes.find((n) => n.id === id),
  } as never;
}

test('only_live_ssh_entries_with_a_safe_host_are_offered_never_itself', () => {
  const nodes: TreeNode[] = [
    entity('ok', 'ok', { kind: 'ssh', isSshEnabled: true, host: 'prod.corp.com' }),
    entity('flags', 'flags', { isSshEnabled: true, host: 'a.corp.com' }),
    entity('nohost', 'nohost', { kind: 'ssh', isSshEnabled: true }),
    entity('badhost', 'badhost', { kind: 'ssh', isSshEnabled: true, host: '-oProxyCommand=x' }),
    entity('cred', 'cred', { kind: 'credential', host: 'c.corp.com' }),
    entity('term', 'term', { kind: 'terminal', isTerminal: true, command: 'ls' }),
    entity('me', 'me', { kind: 'ssh', isSshEnabled: true, host: 'me.corp.com' }),
    folder('trash', null, true),
    entity('gone', 'gone', { kind: 'ssh', isSshEnabled: true, host: 'gone.corp.com' }, 'trash'),
    folder('plain'),
  ];
  const offered = collectSshCandidates(storageOf(nodes), 'a1', 'me');
  assert.deepEqual(offered.map((c) => c.id), ['ok', 'flags']);
  assert.deepEqual(offered[0], { id: 'ok', name: 'ok' });
});

test('the_trash_is_read_at_any_depth', () => {
  const nodes: TreeNode[] = [
    folder('trash', null, true),
    folder('deep', 'trash'),
    entity('gone', 'gone', { kind: 'ssh', isSshEnabled: true, host: 'gone.corp.com' }, 'deep'),
    entity('live', 'live', { kind: 'ssh', isSshEnabled: true, host: 'live.corp.com' }),
  ];
  assert.deepEqual(collectSshCandidates(storageOf(nodes), 'a1', 'me').map((c) => c.id), ['live']);
});
