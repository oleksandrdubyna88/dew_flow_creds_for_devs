import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEP_COLOR_KEYS } from '../depColors';
import {
  FORM_SECTIONS,
  colorCollisionsForKind,
  sectionsForKind,
  sectionsOf,
} from '../formSections';
import { ENTITY_KINDS } from '../types';

/**
 * The colour scheme of the entity form, as a property rather than a promise.
 *
 * <p>Fifteen sections share eleven colours, which is only safe because the four kind-specific
 * ones can never be on screen together. That is exactly the kind of reasoning that stays true
 * until somebody widens a `kinds` list by one entry — so it is checked for every kind, and the
 * failure names the two sections and the colour they collided on.</p>
 */

test('no two sections that can share a screen share a colour — for every kind', () => {
  const collisions = ENTITY_KINDS.flatMap((kind) => colorCollisionsForKind(kind));
  assert.deepEqual(collisions, []);
});

test('an SSH connection is the worst case, and it needs every one of the twelve', () => {
  // Stated as its own test because it is the number that decided the palette size: if this
  // ever exceeds the palette, the check above starts failing and this says why.
  const colors = new Set(sectionsForKind('ssh').map((s) => s.color));
  assert.equal(sectionsForKind('ssh').length, 12);
  assert.equal(colors.size, 12);
});

test('every section has a colour the manifest actually contributes', () => {
  // A ThemeColor naming an id nobody contributed is not an error — it simply paints nothing,
  // so a typo here would be an invisible border rather than a failure.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { contributes: { colors: { id: string }[] } };
  const contributed = new Set(manifest.contributes.colors.map((c) => c.id));

  for (const section of FORM_SECTIONS) {
    assert.ok(
      (DEP_COLOR_KEYS as readonly string[]).includes(section.color),
      `${section.id} uses ${section.color}, which is not in the palette`,
    );
    assert.ok(
      contributed.has(`credSshManager.${section.color}`),
      `${section.id} uses ${section.color}, which package.json does not contribute`,
    );
  }
});

test('every section is in exactly one group, and both groups have contents', () => {
  const main = sectionsOf('main');
  const additional = sectionsOf('additional');

  assert.equal(main.length + additional.length, FORM_SECTIONS.length);
  assert.ok(main.length > 0 && additional.length > 0);
  // The five the owner named as belonging to the second group.
  assert.deepEqual(
    additional.map((s) => s.id).sort(),
    [
      'advancedConnectionSection',
      'attachmentsSection',
      'dependsOnSection',
      'lifetimeSection',
      'mcpSection',
      'totpSection',
    ],
  );
});

test('no id is listed twice, which a copied entry would do silently', () => {
  const ids = FORM_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a section with no kinds means every kind, not none', () => {
  // The empty array is the "always" marker; reading it as a filter would hide General everywhere.
  for (const kind of ENTITY_KINDS) {
    assert.ok(sectionsForKind(kind).some((s) => s.id === 'generalSection'));
    assert.ok(sectionsForKind(kind).some((s) => s.id === 'notesSection'));
  }
});

test('the kind-specific sections appear for their kind and no other', () => {
  assert.deepEqual(
    ENTITY_KINDS.filter((k) => sectionsForKind(k).some((s) => s.id === 'dbSection')),
    ['db'],
  );
  assert.deepEqual(
    ENTITY_KINDS.filter((k) => sectionsForKind(k).some((s) => s.id === 'keySection')).sort(),
    ['ssh', 'sshkey'],
  );
  // Secret and TOTP are defined by exclusion, which is the easiest pair to get backwards.
  assert.deepEqual(
    ENTITY_KINDS.filter((k) => sectionsForKind(k).some((s) => s.id === 'passwordSection')).sort(),
    ['credential', 'ssh', 'sshkey', 'vpn'],
  );
  assert.deepEqual(
    ENTITY_KINDS.filter((k) => sectionsForKind(k).some((s) => s.id === 'totpSection')).sort(),
    ['credential', 'db', 'ssh', 'vpn'],
  );
});
