import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { FolderFormOptions, renderFolderHtml } from '../folderFormPage';
import { MCP_SWITCHES } from '../mcpSwitches';
import { accessMask, normalizeMcpAccess, readMcpAccess, resolveMcpAccess } from '../mcpAccess';
import type { TreeNode } from '../types';

/**
 * The folder form — the one place a permission is granted to entries nobody is looking at.
 *
 * <p>A folder's setting is INHERITED, including by entries created after it was made, so what
 * this form saves reaches further than what an entity form saves. Two things therefore have to
 * hold exactly, and both are pinned below.</p>
 *
 * <p><b>Absent is not empty.</b> A folder with no setting says "nothing here is reachable unless
 * an entry says so itself"; a folder set to nothing has decided that for its contents and
 * overrides nothing. Opening this form and pressing Save must not silently convert the first
 * into the second — that is a state change nobody asked for, and one that would be invisible
 * afterwards.</p>
 *
 * <p><b>A folder name is untrusted.</b> It arrives by sync and by import from whoever shared the
 * vault. This extension has already shipped one interpolation of a name into a page (fixed in
 * 0.62.1), so the escaping is asserted here rather than assumed.</p>
 */

function options(overrides: Partial<FolderFormOptions> = {}): FolderFormOptions {
  // No cast: a new required option must break this file rather than pass through it. The entity
  // form's fixtures carry an `as EntityFormOptions` and it hid two new required fields until
  // eleven tests threw at runtime.
  return { name: 'Databases', entryCount: 3, inTrash: false, ...overrides };
}

function checkedIds(html: string): string[] {
  return [...html.matchAll(/<input id="(mcp[A-Za-z]+)"[^>]*>/g)]
    .filter((m) => m[0].includes(' checked'))
    .map((m) => m[1]);
}

test('a folder with no setting opens with nothing ticked and says so', () => {
  const html = renderFolderHtml(options());
  assert.deepEqual(checkedIds(html), []);
  assert.match(html, /Not set\./);
});

test('an untouched form on an undecided folder saves nothing — absent stays absent', () => {
  // The page script is what decides this; the assertion is on the flag it is generated with,
  // because a false here is the difference between "follows nobody" and "opted out".
  const html = renderFolderHtml(options());
  assert.match(html, /if \(!mcpTouched && !false\)/);
  // And the read side agrees: no object means no setting. Both forms post the same message and
  // share this reader, so this is the folder form's read path too.
  assert.equal(readMcpAccess(undefined), undefined);
});

test('a folder that has decided keeps its decision through a Save that changes nothing', () => {
  const html = renderFolderHtml(options({ mcp: {} }));
  assert.match(html, /if \(!mcpTouched && !true\)/);
  assert.deepEqual(checkedIds(html), []);
  assert.match(html, /Applies to each of the 3 entries/);
});

test('the ladder is shown filled in, not as it was stored', () => {
  // Stored as one flag; the ladder underneath it is implied, and a form that showed only the
  // stored flag would invite ticking "view" on an entry that can already be deleted.
  const html = renderFolderHtml(options({ mcp: { edit: true } }));
  assert.deepEqual(checkedIds(html), ['mcpView', 'mcpUse', 'mcpEdit']);
  assert.deepEqual(accessMask(normalizeMcpAccess({ edit: true })), [true, true, true, false, false]);
});

test('the delete scope comes back as the word it was, and an unknown word grants nothing', () => {
  assert.equal(readMcpAccess({ delete: 'own' })?.delete, 'own');
  assert.equal(readMcpAccess({ delete: 'everything' })?.delete, undefined);
  // A message can also claim a value that is not a word at all.
  assert.equal(readMcpAccess({ view: 'yes', delete: 1 })?.view, false);
});

test('every switch is offered, each with the sentence that says what it costs', () => {
  const html = renderFolderHtml(options());
  for (const s of MCP_SWITCHES) {
    assert.ok(html.includes(`id="${s.id}"`), `${s.id} is missing from the folder form`);
    assert.ok(s.why.length > 0);
  }
});

test('a folder name from someone else cannot break out of the page', () => {
  const html = renderFolderHtml(options({ name: `</script><img src=x onerror=alert(1)>"` }));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('</script><img'));
  assert.match(html, /&lt;\/script&gt;/);
  // The value sits in a quoted attribute, so the quote it ends with must not close it.
  assert.ok(!html.includes('onerror=alert(1)>"'));
});

test('the Trash offers no switches, because they would decide nothing', () => {
  const html = renderFolderHtml(options({ name: 'Trash', inTrash: true, mcp: { delete: 'any' } }));
  for (const s of MCP_SWITCHES) {
    assert.ok(!html.includes(`id="${s.id}"`), `${s.id} must not be offered inside the Trash`);
  }
  assert.match(html, /Nothing in the Trash is reachable/);
  // And the page still answers the save handler, which asks every form the same question.
  assert.match(html, /function collectMcp\(\) \{ return undefined; \}/);
});

test('what the form claims about the Trash is what the resolver actually does', () => {
  // Two statements of one rule — the sentence a person reads, and the code an agent meets.
  // Pinning them together is the point: a reassuring sentence over a resolver that granted
  // access anyway would be the worst of the three possible outcomes.
  const folder: TreeNode = { id: 'f', name: 'Trash', type: 'folder', parentId: null, isTrash: true };
  const entry: TreeNode = {
    id: 'e',
    name: 'prod',
    type: 'entity',
    parentId: 'f',
    details: { id: 'e', name: 'prod', kind: 'credential', isSshEnabled: false, mcp: { delete: 'any' } },
  };
  const resolved = resolveMcpAccess(entry, folder, true);
  assert.equal(resolved.source, 'none');
  assert.deepEqual(accessMask(resolved.access), [false, false, false, false, false]);
});

test('one entry is counted in words, not as "1 entries"', () => {
  assert.match(renderFolderHtml(options({ mcp: {}, entryCount: 1 })), /each of the 1 entry in this folder/);
});

test('a folder under an open parent says what it inherits, and shows it ticked', () => {
  // It used to read "Not set. Nothing in this folder is reachable by an agent" while the folder
  // above had granted everything below it — false, on the one screen somebody checks before
  // trusting the switch.
  const html = renderFolderHtml(
    options({ inherited: { access: normalizeMcpAccess({ use: true }), from: 'project' } }),
  );

  assert.match(html, /Inherited from &quot;project&quot;/);
  assert.doesNotMatch(html, /Nothing in this folder is reachable/);
  // Ticked, not merely described: the boxes are the thing people read.
  assert.match(html, /id="mcpUse"[^>]*checked/);
});

test('with nothing above it, the folder still says plainly that nothing is reachable', () => {
  const html = renderFolderHtml(options());

  assert.match(html, /Nothing in this folder is reachable/);
  assert.doesNotMatch(html, /Inherited from/);
});

test('the blast radius sentence counts the folders inside, not just the entries here', () => {
  assert.match(
    renderFolderHtml(options({ mcp: {}, entryCount: 7 })),
    /each of the 7 entries in this folder and the folders inside it/,
  );
});
