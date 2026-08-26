import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseTarget, describeTarget, tagLabel } from '../treeRowText';
import { TreeNode } from '../types';

/**
 * The grey text beside a row — now a pure module, so it is testable at all.
 *
 * <p>It was inside `treeDataProvider.ts` and only reachable through a stubbed `vscode`, which is
 * why none of this had a test before tags pushed the file over its line limit and forced the
 * extraction. The same trade `entityText.ts` made.</p>
 */

function entity(details: Partial<TreeNode['details']>): TreeNode {
  return {
    id: 'e1',
    name: 'row',
    type: 'entity',
    details: { id: 'e1', name: 'row', isSshEnabled: false, ...details },
  } as TreeNode;
}

test('an SSH row shows user@host, and the port only when it is not 22', () => {
  assert.equal(baseTarget(entity({ host: 'h.example.com', user: 'deploy' })), 'deploy@h.example.com');
  assert.equal(baseTarget(entity({ host: 'h.example.com', user: 'deploy', port: 22 })), 'deploy@h.example.com');
  assert.equal(baseTarget(entity({ host: 'h.example.com', user: 'deploy', port: 2222 })), 'deploy@h.example.com:2222');
});

test('a host with no user is shown bare, and a row with no host shows its kind', () => {
  assert.equal(baseTarget(entity({ host: '10.0.0.5' })), '10.0.0.5');
  assert.equal(baseTarget(entity({ isDb: true, dbType: 'postgres' })), 'postgres');
  assert.equal(baseTarget(entity({ isVpn: true, vpnType: 'wireguard' })), 'wireguard');
  assert.equal(baseTarget(entity({})), '', 'nothing to say is said as nothing');
});

test('tags render as #labels, normalized — a synced tag cannot become anything else', () => {
  assert.equal(tagLabel(entity({ tags: ['production', 'eu-west 1'] })), '#production #eu-west 1');
  // Anything that is not a label is dropped by normalizeTags, so the row cannot be forged.
  assert.equal(tagLabel(entity({ tags: ['<script>', 'ok'] })), '#ok');
  assert.equal(tagLabel(entity({})), '');
});

test('the description joins the target and the tags, and omits either when empty', () => {
  assert.equal(
    describeTarget(entity({ host: 'h', user: 'u', tags: ['prod'] })),
    'u@h  #prod',
  );
  assert.equal(describeTarget(entity({ host: 'h', user: 'u' })), 'u@h');
  assert.equal(describeTarget(entity({ tags: ['prod'] })), '#prod');
  assert.equal(describeTarget(entity({})), '');
});

test('no secret field can reach the row text', () => {
  // The rule this shares with the tree filter: if the row does not say it out loud, it is not
  // here. A password or a key must never become part of what is rendered beside a name.
  const text = describeTarget(
    entity({
      host: 'h',
      user: 'u',
      tags: ['prod'],
      publicKey: 'ssh-ed25519 AAAA',
      notes: 'hunter2',
    }),
  );

  for (const secret of ['hunter2', 'AAAA', 'ssh-ed25519']) {
    assert.equal(text.includes(secret), false, `${secret} must not appear in a tree row`);
  }
});
