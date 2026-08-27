import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONFIG_FORMATS,
  CONFIG_FORMAT_LABELS,
  hasValidConfigFields,
  isConfigFormat,
} from '../configFormat';
import { ENTITY_KINDS, ENTITY_KIND_LABELS, EntityMetadata, isEntityMetadata } from '../types';
import { canBurnOnAgentUse, keepsPassword, kindOf, resolveKind, stampKind } from '../entityKind';
import { entityContextValue } from '../treeRowText';

/**
 * The `config` kind: a configuration file kept in the vault instead of passed between developers
 * by hand.
 *
 * <p>Its own kind rather than a switch on `script`, and the reason is a verb: `creds script
 * &lt;token&gt;` means "run the saved script", which on an `appsettings.json` is nonsense. A kind
 * gets its own icon, its own validation, its own lifetime rules — and, because `kindIcon` ends in
 * `assertNever`, a compile error in every switch that has not been taught about it.</p>
 *
 * <p>What is NOT here, deliberately: the config BODY. It is a secret and lives in SecretStorage
 * beside the notes, so nothing in `EntityMetadata` can carry it and no test can find it there.</p>
 */

function details(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'appsettings.Development.json', isSshEnabled: false, ...over };
}

test('a config states its kind, and an older build derives the same one from the flag', () => {
  // The compatibility shim `stampKind` exists for: a vault syncs to machines on older builds,
  // which know nothing about `kind` and read the flags. Both must say the same thing.
  const stamped = stampKind(details({ kind: 'config' }));

  assert.equal(resolveKind(stamped), 'config');
  assert.equal(stamped.isConfig, true, 'the legacy flag is written alongside the discriminant');
  assert.equal(kindOf(stamped), 'config', 'and the flag alone resolves to the same kind');
});

test('the flag wins over nothing else — a config carries no other kind flag', () => {
  // `kindOf` is a priority ladder, and a kind that forgot to claim a place in it falls through to
  // `credential` and loses its identity in the tree. That is exactly how `terminal` shipped
  // unreachable in 0.26.0, which is why this is asserted rather than assumed.
  const stamped = stampKind(details({ kind: 'config' }));

  for (const flag of ['isScript', 'isTerminal', 'isDb', 'isVpn', 'isSshKey'] as const) {
    assert.equal(stamped[flag], undefined, `a config must not also be ${flag}`);
  }
  assert.equal(stamped.isSshEnabled, false);
});

test('a config cannot burn on first agent use', () => {
  // The whole point is that an application reads it at EVERY start. A one-use burn would destroy
  // it the first time it worked, and the second `dotnet run` is where you would find that out.
  assert.equal(canBurnOnAgentUse('config'), false);
  assert.equal(stampKind(details({ kind: 'config', burnPolicy: 'oneUse' })).burnPolicy, undefined);
});

test('a time-based lifetime is still allowed, because that one is about the clock', () => {
  const stamped = stampKind(details({ kind: 'config', burnPolicy: 'ttl', expiresAt: 123 }));

  assert.equal(stamped.burnPolicy, 'ttl');
  assert.equal(stamped.expiresAt, 123);
});

test('the kind is named and iconed in the one table that names every kind', () => {
  assert.equal(ENTITY_KIND_LABELS.config.label, 'Config file');
  assert.notEqual(ENTITY_KIND_LABELS.config.icon, ENTITY_KIND_LABELS.script.icon,
    'a config must not wear the script icon — the tree is where the two are told apart');
});

test('every format is named and carries an extension', () => {
  // The table drives the Format selector and what materialising writes. A format in the list with
  // no label renders as an empty option; one with no extension writes a file with none.
  for (const format of CONFIG_FORMATS) {
    const named = CONFIG_FORMAT_LABELS[format];
    assert.ok(named.label.length > 0, `${format} has no label`);
    assert.ok(named.ext.startsWith('.'), `${format} has no usable extension: ${named.ext}`);
  }
});

test('a format the product cannot validate is refused', () => {
  // The list is deliberately short: `src_vs_code` ships no runtime dependencies, so every checker
  // is hand-written, and offering a format nobody can check makes "valid" a word meaning nothing.
  assert.equal(isConfigFormat('json'), true);
  assert.equal(isConfigFormat('hocon'), false);
  assert.equal(isConfigFormat(''), false);
  assert.equal(isConfigFormat(undefined), false);
  assert.equal(isConfigFormat(7), false);
});

test('a stored record with a bogus format does not pass the metadata guard', () => {
  // Records arrive from a restored backup and from whatever can write the sync location, so an
  // unknown format is untrusted input rather than a typo of ours.
  assert.equal(isEntityMetadata(details({ kind: 'config', configFormat: 'json' })), true);
  assert.equal(
    isEntityMetadata({ ...details({ kind: 'config' }), configFormat: 'hocon' }),
    false,
    'an unrecognised format must not enter the vault',
  );
});

test('the config fields are optional, all three, and absent is valid', () => {
  // Every entity in every existing vault has none of them. The guard runs on all of those.
  assert.equal(hasValidConfigFields({}), true);
  assert.equal(hasValidConfigFields({ isConfig: true, configFormat: 'env', configFileName: '.env' }), true);
  assert.equal(hasValidConfigFields({ isConfig: 'yes' }), false);
  assert.equal(hasValidConfigFields({ configFileName: 12 }), false);
});

test('the body is not a metadata field — there is nowhere in the record for it to sit', () => {
  // The guarantee this kind rests on. A config holds connection strings with passwords in them,
  // unlike a script body, which is what a person typed at a shell. Notes were moved out of
  // plaintext metadata into SecretStorage in 0.20 for this exact reason; a config that went into
  // metadata would be the one secret in the product sitting in the clear.
  const stamped = stampKind(details({ kind: 'config', configFormat: 'json', configFileName: 'a.json' }));

  assert.equal(JSON.stringify(stamped).includes('ConnectionStrings'), false);
  assert.equal('config' in stamped, false, 'no `config` property may exist on the record');
  assert.equal('configBody' in stamped, false, 'nor under any other spelling');
});

test('a config holds no password, so switching an entity to one scrubs a stored password', () => {
  // Found by the owner asking how they had just shared a config. They had not — that entry was a
  // script — but the question exposed a real hole one step away.
  //
  // `setPassword(undefined)` means "keep whatever is stored", so an entity converted from a
  // credential into a config KEEPS its password: invisible, since the form hides the slot, and
  // uneditable. And `isShareable` returns true for anything with a stored password — so that
  // config becomes shareable, and a share carries `password` while the config BODY stays behind.
  // The silent half-delivery, reached by a route nobody would look down.
  //
  // The same rule TOTP already follows: a second factor belongs to a login, so switching to a kind
  // that cannot hold one scrubs the seed.
  assert.equal(keepsPassword('config'), false);
  for (const kind of ENTITY_KINDS.filter((one) => one !== 'config')) {
    assert.equal(keepsPassword(kind), true, kind);
  }
});

test('a config IS shareable, and says so by its kind rather than by having a password', () => {
  // It was not, and the reason was accidental: `isShareable` asked for a host, a database, a VPN, a
  // command, a script, or a stored password, and a config has none of those. So the menu item
  // simply never appeared, which is not a decision anybody took.
  //
  // Named by KIND now. Leaving it to follow from `hasPassword` was the dangerous version: an entry
  // converted from a credential kept an invisible password, became shareable through it, and would
  // have delivered that password with the document left behind.
  const config = details({ kind: 'config', isConfig: true });

  assert.ok(entityContextValue(config, false).includes(':shareable'));
  assert.ok(entityContextValue(config, true).includes(':shareable'));
});
