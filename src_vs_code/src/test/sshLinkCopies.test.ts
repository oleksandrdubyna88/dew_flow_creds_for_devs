import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { buildExternalBundle, remapExternalIds } from '../externalBundle';
import { exportedNode } from '../exportSecrets';
import { formatEntityBlock } from '../entityText';
import { EntityViewOptions, copyValueFor, renderEntityViewHtml } from '../entityViewPage';
import { quarantineUnsafeIds } from '../idQuarantine';
import { copiedLineOf, sshLinkOf } from '../remoteLaunch';
import { shareableDetails } from '../shareFormat';
import { escapeHtml } from '../webviewHtml';
import type { BackupBundle, EntityMetadata, TreeNode } from '../types';

/** E1.S1: the link is kept by a backup and a sync, removed by a share and an export, shown by the viewer as a name. */

/** E2.S1: without `sshCopy` (no lookup was made) a linked entry fails closed with `sshLinkOf`'s missing-entry sentence. */
const MISSING = (details: EntityMetadata): string => {
  const link = sshLinkOf(details, () => undefined);
  assert.equal(link.kind, 'refused');
  return (link as { reason: string }).reason;
};

function terminal(extra: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 't1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'ls', ...extra };
}

function nodeOf(details: EntityMetadata): TreeNode {
  return { id: details.id, name: details.name, type: 'entity', parentId: null, details };
}

test('a_share_carries_no_ssh_link', () => {
  const shared = shareableDetails(terminal({ sshEntityId: 's1', terminalOs: 'linux' }), false);
  assert.equal(shared?.sshEntityId, undefined);
  assert.equal(shared?.terminalOs, 'linux');
});

test('an_export_carries_no_ssh_link_and_keeps_its_other_fields', () => {
  const node = nodeOf(terminal({ sshEntityId: 's1' }));
  const out = exportedNode(node);
  assert.equal(out.details?.sshEntityId, undefined);
  assert.equal(out.details?.command, 'ls');
  assert.equal(JSON.stringify(out).includes('sshEntityId'), false);
});

test('an_export_still_drops_the_pin_claim', () => {
  const out = exportedNode(nodeOf(terminal({ pinProtected: true, sshEntityId: 's1' })));
  assert.equal(out.details?.pinProtected, undefined);
  assert.equal(out.details?.sshEntityId, undefined);
});

test('an_import_never_arrives_linked', () => {
  const bundle = buildExternalBundle([nodeOf(terminal({ sshEntityId: 's1' }))], {});
  const out = remapExternalIds(bundle, () => 'n1', null);
  assert.equal(out.nodes[0].details?.sshEntityId, undefined);
});

function backupOf(nodes: TreeNode[]): BackupBundle {
  return { nodes, passwords: {} } as unknown as BackupBundle;
}

test('a_backup_import_that_renames_the_ssh_entry_renames_the_link', () => {
  const ssh = nodeOf({ id: 'bad:id', name: 'prod', isSshEnabled: true, kind: 'ssh', host: 'prod.corp.com' });
  const linked = nodeOf(terminal({ sshEntityId: 'bad:id' }));
  const result = quarantineUnsafeIds(backupOf([ssh, linked]), {}, () => 'fresh-1');
  assert.equal(result.bundle.nodes.find((n) => n.id === 't1')?.details?.sshEntityId, 'fresh-1');
});

// A guard, green before the change: `remappedRef` keeps an absent reference absent.
test('an_entry_without_a_link_gets_no_link_key_after_a_remap', () => {
  const input = backupOf([nodeOf({ id: 'bad:id', name: 'x', isSshEnabled: false })]);
  const details = quarantineUnsafeIds(input, {}, () => 'fresh-1').bundle.nodes[0].details ?? {};
  assert.equal('sshEntityId' in details, false);
});

// ---- the viewer ------------------------------------------------------------------------------------------------

function viewOptions(overrides: Partial<EntityViewOptions> = {}): EntityViewOptions {
  return {
    details: terminal(),
    /** The caller always reads it with storage; with no lookup a linked entry reads as the missing-entry sentence. */
    sshCopy: copiedLineOf(overrides.details ?? terminal(), () => undefined),
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

const linked = (): EntityViewOptions => viewOptions({ details: terminal({ sshEntityId: 's1' }), sshLinkName: 'prod box' });

test('the_viewer_names_the_ssh_entry_and_shows_the_sentence_not_the_line', () => {
  const html = renderEntityViewHtml(linked());
  assert.match(html, /Runs over SSH[\s\S]*?<input readonly value="prod box">/);
  assert.doesNotMatch(html, /Full command/);
  assert.ok(html.includes(escapeHtml(MISSING(terminal({ sshEntityId: 's1' })))), 'the sentence is in the "Will not run" row');
});

test('the_viewer_copies_no_line_for_a_linked_entry', async () => {
  const options = linked();
  assert.equal(await copyValueFor(options, 'fullCommand'), undefined);
  assert.equal(await copyValueFor(options, 'commandRefusal'), MISSING(terminal({ sshEntityId: 's1' })));
  assert.equal(await copyValueFor(options, 'sshLink'), 'prod box');
});

// V4: "Copy All" is a third road to the line. The viewer hands `copyAllText` the block `formatEntityBlock` writes for
// the entry (`entityViewerCommands.ts`, for the entry and for a revision), so the block is where the line must go.
const LOCAL_LINE = 'ls -la /srv/app';

test('the_viewer_copy_all_of_a_linked_entry_holds_the_sentence_and_not_the_local_line', async () => {
  const details = terminal({ command: LOCAL_LINE, sshEntityId: 's1' });
  const options = viewOptions({ details, sshLinkName: 'prod box', copyAllText: async () => formatEntityBlock(details, undefined, undefined, undefined, undefined, copiedLineOf(details, () => undefined)) });
  const all = await copyValueFor(options, 'all');
  assert.ok(all?.includes(MISSING(details)), `the sentence is in the block: ${all}`);
  assert.equal(all?.includes(LOCAL_LINE), false, `the local line is not in the block: ${all}`);
});

// A guard, green before the change: an entry with no link, or an empty one, gets the block it always got.
test('the_block_of_an_unlinked_entry_is_unchanged', () => {
  const block = 'Name: deploy\n\nls -la /srv/app';
  const unlinked = terminal({ command: LOCAL_LINE });
  const blank = terminal({ command: LOCAL_LINE, sshEntityId: '' });
  assert.equal(formatEntityBlock(unlinked, undefined, undefined, undefined, undefined, copiedLineOf(unlinked, () => undefined)), block);
  assert.equal(formatEntityBlock(blank, undefined, undefined, undefined, undefined, copiedLineOf(blank, () => undefined)), block);
});

test('the_viewer_wires_the_name_of_the_link', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'entityViewerCommands.ts'), 'utf8');
  assert.ok(source.includes('sshLinkName: nameOf(storage, accountId, details.sshEntityId || undefined),'));
});
