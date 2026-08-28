import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentDoorRows } from '../agentDoors';
import { renderHtml } from '../entityFormPage';
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
  const rows = agentDoorRows({ cliAliases: ['prod-db'], codeAccess: true, bridgeOpen: true, wslRelay: true });
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
  assert.deepEqual(agentDoorRows({ cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false }), []);
  const html = renderHtml(form({ agentDoors: { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false } }));
  assert.ok(!html.includes('Other ways agents can reach this entry'));
});

test('a live door renders under the switches with its manage link', () => {
  const html = renderHtml(form({ agentDoors: { cliAliases: ['prod-db'], codeAccess: false, bridgeOpen: false, wslRelay: false } }));
  const switches = html.indexOf('id="mcpView"');
  const footer = html.indexOf('Other ways agents can reach this entry');
  assert.ok(switches !== -1 && footer !== -1, 'both the switches and the footer render');
  assert.ok(footer > switches, 'the footer sits UNDER the switches');
  assert.ok(html.includes('data-command="credSshManager.enableCliAccess"'));
});
