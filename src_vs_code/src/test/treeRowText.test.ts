import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseTarget, describeTarget, entityContextValue, tagLabel } from '../treeRowText';
import { EntityMetadata, TreeNode } from '../types';

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

/**
 * The context value is what decides which menu items an entry offers.
 *
 * <p><b>Why the bridge needed a second token.</b> The *Open Remote Bridge…* item kept that title
 * while a bridge was open — the command toggled, the label did not. A person looking for "close"
 * found nothing and had to click "open" on an already-open bridge to discover the choice hidden
 * behind it. That is the project's rule 8 in miniature: an action that changes state must show the
 * state it is in, and in a tree the only place that can live is the row's `contextValue`.</p>
 *
 * <p>Two tokens rather than one, following the `:agenton` / `:agentoff` pair already here: with a
 * single `:bridged`, the "open" item would need `when` to say "ssh AND NOT bridged", which VS Code
 * expresses awkwardly and which silently offers both items on any row whose value is missing.</p>
 */

const SSH = { host: 'h', user: 'u', isSshEnabled: true } as EntityMetadata;

test('an ssh entry with no bridge offers OPEN and not close', () => {
  const value = entityContextValue(SSH, false, false);

  assert.match(value, /:ssh\b/);
  assert.match(value, /:nobridge\b/);
  assert.equal(/:bridged\b/.test(value), false, value);
});

test('an ssh entry WITH a bridge offers close and not open', () => {
  const value = entityContextValue(SSH, false, true);

  assert.match(value, /:bridged\b/);
  assert.equal(/:nobridge\b/.test(value), false, value);
});

test('the two tokens are mutually exclusive, so both items can never show at once', () => {
  // The failure this prevents is a row offering "Open Remote Bridge…" and "Close Remote Bridge"
  // together, which tells a person nothing about which state they are in.
  for (const bridged of [true, false]) {
    const value = entityContextValue(SSH, false, bridged);
    const both = /:bridged\b/.test(value) && /:nobridge\b/.test(value);
    assert.equal(both, false, value);
  }
});

test('a non-ssh entry carries no bridge token at all', () => {
  // A VPN or a password has nothing to bridge; a `:nobridge` on it would be true and useless,
  // and would make the "open" item's `when` clause match rows it must never appear on.
  const value = entityContextValue({ isVpn: true } as EntityMetadata, false, false);

  assert.equal(/bridge/.test(value), false, value);
});

test('an entry in the Trash says so first, so Restore can lead its menu (the owner, 2026-08-28)', () => {
  assert.ok(entityContextValue(SSH, false, false, true).startsWith('entity:trashed'));
  assert.ok(entityContextValue(SSH, false, false).startsWith('entity:ssh'), 'a live entry is unchanged');
});

test('an entry with a lifetime is :burnable — Burn Now… is offered there and nowhere else', () => {
  const ttl = { ...SSH, expiresAt: 1_800_000_000_000, burnPolicy: 'ttl' } as typeof SSH;
  assert.ok(entityContextValue(ttl, false, false).includes(':burnable'));
  assert.ok(!entityContextValue(SSH, false, false).includes(':burnable'));
});
