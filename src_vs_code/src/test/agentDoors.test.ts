import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import { agentDoorRows, standingConsentFor } from '../agentDoors';
import type { McpAskPolicy } from '../mcpAccess';
import type { TreeNode } from '../types';
import type { EntityFormOptions } from '../entityFormPanel';

/**
 * T24b — the agent-doors footer under the MCP switches: it names every OTHER live door, and
 * says nothing when there is none.
 */

function form(over: Partial<EntityFormOptions> = {}): EntityFormOptions {
  return {
    mode: 'edit',
    entityId: 'e1',
    initial: { id: 'e1', name: 'x' } as never,
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    dependencyFolders: [],
    dependencyColors: {},
    jumpCandidates: [],
    ...over,
  } as EntityFormOptions;
}

test('the modal-free doors come first, and each names the command that manages it', () => {
  const rows = agentDoorRows({ cliAliases: ['prod-db'], codeAccess: true, bridgeOpen: true, wslRelay: true, standingConsent: false });
  assert.deepEqual(
    rows.map((r) => r.command),
    [
      'credSshManager.revokeConfigAccess',
      'credSshManager.enableCliAccess',
      'credSshManager.closeRemoteBridge',
      'credSshManager.setUpWslRelay',
    ],
  );
  assert.ok(rows[1].label.includes('creds … prod-db'));
});

test('no live door, no footer — a footer saying "nothing" everywhere is the noise that hides the one that matters', () => {
  assert.deepEqual(agentDoorRows({ cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false, standingConsent: false }), []);
  const html = renderHtml(form({ agentDoors: { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false, standingConsent: false } }));
  assert.ok(!html.includes('Other ways agents can reach this entry'));
});

test('a live door renders under the switches with its manage link', () => {
  const html = renderHtml(form({ agentDoors: { cliAliases: ['prod-db'], codeAccess: false, bridgeOpen: false, wslRelay: false, standingConsent: false } }));
  const switches = html.indexOf('id="mcpView"');
  const footer = html.indexOf('Other ways agents can reach this entry');
  assert.ok(switches !== -1 && footer !== -1, 'both the switches and the footer render');
  assert.ok(footer > switches, 'the footer sits UNDER the switches');
  assert.ok(html.includes('data-command="credSshManager.enableCliAccess"'));
});

/**
 * The standing-consent door (#95, S3.3).
 *
 * <p>This footer exists to refuse to hide a door. An entry set to never-ask IS one: the switches
 * above say what an agent may do, and nothing there says that no dialog will stand between the
 * agent and doing it. It is placed first, with the modal-free doors, because that is what it is.</p>
 */
const NO_DOORS = { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false, standingConsent: false };

function tree(...nodes: TreeNode[]): (id: string) => TreeNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id: string) => byId.get(id);
}

function folder(id: string, mcp?: TreeNode['mcp']): TreeNode {
  return { id, name: id, type: 'folder', parentId: null, mcp };
}

function entry(id: string, parentId: string, mcp?: TreeNode['mcp']): TreeNode {
  return { id, name: id, type: 'entity', parentId, details: { id, name: id, isSshEnabled: false, mcp } };
}

/** The detail of one row, or an empty string — a missing row fails the assertion, not the lookup. */
function detailOf(rows: readonly { label: string; detail: string }[], startsWith: string): string {
  return rows.find((row) => row.label.startsWith(startsWith))?.detail ?? '';
}

/** The entry and the tree it lives in, built once — the walk needs both to agree about the ids. */
function consentOf(mcp: TreeNode['mcp'], folderMcp?: TreeNode['mcp']): boolean {
  const child = entry('e1', 'f1', mcp);
  return standingConsentFor(child, tree(folder('f1', folderMcp), child));
}

test('a never-ask entry renders a standing-consent row FIRST, naming the command that changes it', () => {
  const rows = agentDoorRows({ ...NO_DOORS, standingConsent: true, codeAccess: true });

  assert.equal(rows[0].command, 'credSshManager.editNode', `first row was ${rows[0].label}`);
  assert.match(rows[0].label, /No consent prompt/);
  assert.match(rows[0].detail, /without being asked/);
});

test('an entry that still asks renders no such row', () => {
  for (const ask of ['always', 'every12h'] as McpAskPolicy[]) {
    const consent = consentOf({ use: true, ask });

    assert.equal(consent, false, ask);
    assert.deepEqual(agentDoorRows({ ...NO_DOORS, standingConsent: consent }), []);
  }
});

test('a never-ask entry agents may not USE is not a door — nothing can walk through it', () => {
  // The row says an agent may use this entry without asking. With `use` off, no agent can use it at
  // all, so the row would be describing a door that is not there — and this footer's whole promise
  // is that what it lists is LIVE.
  assert.equal(consentOf({ ask: 'never' }), false);
});

test('an entry that INHERITS never from its folder has the door too', () => {
  // The row is about what the DOOR will do, not about where the answer was written. An entry under
  // a never-ask folder is reached without a dialog exactly as one that says so itself.
  assert.equal(consentOf(undefined, { use: true, ask: 'never' }), true);
});

test('the CLI row no longer claims there is no consent modal — because there is one', () => {
  // `handleAlias` mints a grant and calls `perform`, which calls `consent`: an alias call raises the
  // same dialog a token call does. In the one module whose job is saying which doors have no modal,
  // that sentence was the opposite of the truth.
  const rows = agentDoorRows({ ...NO_DOORS, cliAliases: ['prod'], codeAccess: true });

  assert.doesNotMatch(detailOf(rows, 'CLI'), /no consent modal/);
  assert.match(detailOf(rows, 'Code access'), /no consent modal/, 'the key really has none — that one is true');
});

test('the footer still says nothing when nothing is live', () => {
  assert.deepEqual(agentDoorRows({ ...NO_DOORS, standingConsent: false }), []);
});

test('the rendered form carries the standing-consent row, not just the row builder', () => {
  // The builder can be right while the form never shows it. This is the flow: options in, markup out.
  const html = renderHtml(form({ agentDoors: { ...NO_DOORS, standingConsent: true } }));

  assert.match(html, /No consent prompt/);
  assert.match(html, /credSshManager\.editNode/);
});
