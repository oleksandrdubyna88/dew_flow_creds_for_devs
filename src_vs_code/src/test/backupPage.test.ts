import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupPageScript } from '../backupPage';
import { MiniDocument, MiniElement, runFragment } from './miniDom';

/**
 * The backup page's own script, RUN rather than read: what the destination form posts, and that the
 * region row follows the kind. A string assertion on the generated source would pass with the
 * handler bound to the wrong element, which is the class of defect the mini DOM exists to catch.
 */

/**
 * The posted messages brought into THIS realm.
 *
 * <p>A fragment runs in a `node:vm` context, so an object it posts has that realm's
 * `Object.prototype`, and `deepStrictEqual` compares prototypes — the same trap `marshalled` in
 * `miniDom.ts` closes for arrays. A JSON round trip is the honest copy: it keeps exactly what a
 * webview's `postMessage` would have carried, which is structured data and nothing else.</p>
 */
function plain(posted: readonly unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(posted)) as unknown[];
}

/** A document holding the destination form the page draws, with the values a person typed. */
function formDocument(kind: string): MiniDocument {
  const document = new MiniDocument();
  document.place('tkind', 'select').value = kind;
  document.place('tendpoint', 'input').value = 'https://s3.example.com';
  document.place('tregion', 'input').value = 'eu-west-1';
  document.place('tbucket', 'input').value = 'vaults';
  document.place('tprefix', 'input').value = 'weekly';
  document.place('tid', 'input').value = 'AKIDTYPED';
  document.place('tsecret', 'input').value = 'typed-secret-value';
  document.place('regionRow', 'span');
  document.place('tbucketLabel', 'label');
  document.place('tidLabel', 'label');
  document.place('tsecretLabel', 'label');
  document.place('saveTarget', 'button');
  document.place('cancelTarget', 'button');
  return document;
}

test('Add destination posts exactly what the form holds, the credential halves named for the kind', () => {
  const posted: unknown[] = [];
  const document = formDocument('s3');
  runFragment(backupPageScript(), document, ['readTargetForm'], posted);

  document.getElementById('saveTarget')?.fire('click');

  assert.deepEqual(plain(posted), [{
    type: 'saveTarget',
    kind: 's3',
    endpoint: 'https://s3.example.com',
    region: 'eu-west-1',
    bucket: 'vaults',
    prefix: 'weekly',
    accessKeyId: 'AKIDTYPED',
    secretAccessKey: 'typed-secret-value',
  }]);
});

test('for Azure the same two inputs post as the account name and key, and the region row hides', () => {
  const posted: unknown[] = [];
  const document = formDocument('azure-blob');
  const lifted = runFragment(backupPageScript(), document, ['readTargetForm'], posted);

  const read = lifted.readTargetForm() as Record<string, string>;
  assert.equal(read.accountName, 'AKIDTYPED');
  assert.equal(read.accountKey, 'typed-secret-value');
  assert.equal('accessKeyId' in read, false, 'not both spellings');
  assert.equal(document.getElementById('regionRow')?.hidden, true, 'hidden on load for a non-S3 kind');
  assert.equal(document.getElementById('tbucketLabel')?.textContent, 'Container');
  assert.equal(document.getElementById('tsecretLabel')?.textContent, 'Account key');
});

/** One element the form is known to draw — asserted present, so a test reads it without a chain. */
function element(document: MiniDocument, id: string): MiniElement {
  const found = document.getElementById(id);
  assert.ok(found !== null, `the form draws #${id}`);
  return found;
}

test('switching the kind re-labels the form and shows or hides the region row', () => {
  const document = formDocument('s3');
  runFragment(backupPageScript(), document, ['syncKind']);
  assert.equal(element(document, 'regionRow').hidden, false);

  const kind = element(document, 'tkind');
  kind.value = 'azure-blob';
  kind.fire('change');

  assert.equal(element(document, 'regionRow').hidden, true);
  assert.equal(element(document, 'tidLabel').textContent, 'Account name');
  assert.equal(element(document, 'tbucketLabel').textContent, 'Container');
});

test('Edit and Remove post the row they sit on, and Cancel posts its own name', () => {
  const posted: unknown[] = [];
  const document = new MiniDocument();
  const edit = document.place('', 'button');
  edit.dataset.edit = '1';
  const remove = document.place('', 'button');
  remove.dataset.remove = '0';
  document.place('cancelTarget', 'button');
  runFragment(backupPageScript(), document, ['syncKind'], posted);

  edit.fire('click');
  remove.fire('click');
  document.getElementById('cancelTarget')?.fire('click');

  assert.deepEqual(plain(posted), [
    { type: 'editTarget', index: 1 },
    { type: 'removeTarget', index: 0 },
    { type: 'cancelTarget' },
  ]);
});

test('the script never touches vscode.setState — a form value that outlived the message would be a credential in the DOM', () => {
  assert.doesNotMatch(backupPageScript(), /setState|getState|localStorage/);
});
