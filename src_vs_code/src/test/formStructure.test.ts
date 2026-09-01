import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import type { EntityFormOptions } from '../entityFormPanel';

/**
 * The form's fieldsets close where they open. The config section did not (0.77–0.81): its
 * missing `</fieldset>` put the Notes section INSIDE it, and the page hides the config section
 * for every kind but config — so Notes vanished from seven kinds of entry and nobody saw it
 * until the owner did (2026-08-28). A structural test, so the next unclosed tag fails here.
 */

// This tuple is declared rather than taken from `ENTITY_KINDS`, so a new kind is NOT covered here
// for free — it has to be added by hand, which is exactly what was done for `payment`. Left as a
// tuple on purpose: the `form()` helper below builds a kind-shaped options object, and deriving the
// list would make a missing kind silently untested instead of visibly absent.
const KINDS = ['ssh', 'sshkey', 'db', 'vpn', 'credential', 'terminal', 'script', 'config', 'payment'] as const;

function form(kind: string, mode: 'create' | 'edit' = 'create'): EntityFormOptions {
  return {
    mode,
    entityId: 'e1',
    initial: { id: 'e1', name: 'x', isSshEnabled: kind === 'ssh', kind } as never,
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
  } as EntityFormOptions;
}

function depthAt(html: string, index: number): number {
  const before = html.slice(0, index);
  return (before.match(/<fieldset/g) ?? []).length - (before.match(/<\/fieldset>/g) ?? []).length;
}

for (const kind of KINDS) {
  test(`${kind}: every fieldset is closed, and the Notes section is nobody's child`, () => {
    for (const mode of ['create', 'edit'] as const) {
      const html = renderHtml(form(kind, mode));
      const opens = (html.match(/<fieldset/g) ?? []).length;
      const closes = (html.match(/<\/fieldset>/g) ?? []).length;
      assert.equal(opens, closes, `${kind}/${mode}: ${opens} <fieldset> against ${closes} </fieldset>`);
      const notes = html.indexOf('<fieldset id="notesSection"');
      assert.ok(notes !== -1, 'Notes is on every kind');
      assert.equal(depthAt(html, notes), 0, `${kind}/${mode}: the Notes section is nested inside another section`);
    }
  });
}

test('a credential has an Account section with login and URL; the visibility script shows it for credentials only', () => {
  const html = renderHtml(form('credential'));
  assert.ok(html.includes('<fieldset id="accountSection"'), 'the section exists');
  assert.ok(html.includes('id="login"') && html.includes('id="url"'));
  assert.ok(html.includes("show('accountSection', kind === 'credential');"), 'shown for the credential kind and no other');
});
