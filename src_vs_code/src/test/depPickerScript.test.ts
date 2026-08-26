import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { dependencyPickerScript } from '../depPickerScript';
import { DependencyFolderCandidate, DependencyRow } from '../depGraph';

/**
 * The Depends-on picker's browser program.
 *
 * <p>`depGraph.ts` decides what the picker is offered and is tested there. What is only true
 * here is the generated PROGRAM: that it parses at all, and that the four values interpolated
 * into it cannot end the script element they sit inside.</p>
 *
 * <p>That second one is not hypothetical. This fragment is placed inside the entity form's one
 * `<script nonce=…>` element, and it carries FOLDER AND ENTITY NAMES — which arrive from a
 * synced vault, a shared entry or a restored backup, not from the person reading the page.
 * `JSON.stringify` escapes quotes and backslashes and leaves `&lt;` untouched, and an HTML
 * parser ends a script element at `&lt;/script&gt;` wherever that sequence appears, inside a
 * string literal included. `jsonForScript` (in `webviewHtml.ts`) is the repository's answer to
 * exactly this, and `entityFormScript.ts` — the file this fragment is interpolated into —
 * already imports it.</p>
 */

const folder = (name: string, entityName = 'prod'): DependencyFolderCandidate =>
  ({ id: 'f1', name, entities: [{ id: 'e1', name: entityName }] }) as unknown as DependencyFolderCandidate;

const row = (): DependencyRow => ({ folderId: 'f1', targetId: 'e1', color: 'depColor1', missing: false });

/** The fragment runs inside the page's script, so parsing it is the minimum bar. */
function parses(fragment: string): boolean {
  try {
    new Function('document', 'vscode', fragment);
    return true;
  } catch {
    return false;
  }
}

const EMPTY = { rows: [], folders: [], colors: {} };

test('an empty picker still produces a program that parses', () => {
  // The create path opens with no candidates at all; a fragment that fails to parse there
  // takes the whole form's script down with it.
  const fragment = dependencyPickerScript(EMPTY);

  assert.ok(parses(fragment), fragment.slice(0, 300));
  assert.match(fragment, /var DEP_FOLDERS = \[\]/);
});

test('the folders, colours and rows it was given all reach the page', () => {
  const fragment = dependencyPickerScript({
    rows: [row()],
    folders: [folder('Team')],
    colors: { e1: 'depColor3' },
  });

  assert.match(fragment, /"name":"Team"/);
  assert.match(fragment, /"depColor3"/);
  assert.match(fragment, /"targetId":"e1"/);
});

test('the palette carries a themed variable AND a fallback, so an unstyled theme still paints', () => {
  const fragment = dependencyPickerScript(EMPTY);

  assert.match(fragment, /var\(--vscode-credSshManager-depColor1, #[0-9a-fA-F]{3,8}\)/);
});

test('a FOLDER NAME containing </script> cannot end the script element', () => {
  // The names come from a synced vault — a colleague's shared entry, a restored backup — so
  // "our own user typed it" was never the argument.
  const fragment = dependencyPickerScript({
    rows: [],
    folders: [folder('</script><img src=x onerror=alert(1)>')],
    colors: {},
  });

  assert.ok(!fragment.includes('</script>'), `the fragment closes its own script:\n${fragment.slice(0, 400)}`);
});

test('an ENTITY NAME containing </script> cannot end it either', () => {
  const fragment = dependencyPickerScript({
    rows: [],
    folders: [folder('Team', '</script><img src=x>')],
    colors: {},
  });

  assert.ok(!fragment.includes('</script>'), fragment.slice(0, 400));
});

test('a colour key from a stored row cannot end it', () => {
  // `colors` is keyed by entity id and valued from stored rows; both round-trip through the
  // vault, so neither is ours to trust.
  const fragment = dependencyPickerScript({
    rows: [],
    folders: [],
    colors: { 'e1</script><img src=x>': 'depColor1' },
  });

  assert.ok(!fragment.includes('</script>'), fragment.slice(0, 400));
});

test('`<!--` in a name cannot open an HTML comment inside the script either', () => {
  // The other sequence an HTML parser reacts to inside a script element.
  const fragment = dependencyPickerScript({ rows: [], folders: [folder('<!-- Team')], colors: {} });

  assert.ok(!fragment.includes('<!--'), fragment.slice(0, 400));
});

test('escaping changes nothing about the VALUE the page reads back', () => {
  // An escape that altered the data would silently rename somebody's folder on screen.
  const name = 'R&D </script> <team>';
  const fragment = dependencyPickerScript({ rows: [], folders: [folder(name)], colors: {} });

  const found = /var DEP_FOLDERS = (\[.*?\]);/s.exec(fragment);
  assert.ok(found !== null, fragment.slice(0, 300));
  const parsed = JSON.parse(found[1]) as { name: string }[];
  assert.equal(parsed[0].name, name, 'the folder is still called what it is called');
});

test('the program still parses with hostile values in every field', () => {
  const fragment = dependencyPickerScript({
    rows: [row()],
    folders: [folder('</script>', '"; alert(1); var x="')],
    colors: { 'e1': '</script>' },
  });

  assert.ok(parses(fragment), fragment.slice(0, 400));
});
