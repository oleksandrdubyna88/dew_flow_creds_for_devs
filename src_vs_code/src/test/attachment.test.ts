import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_ATTACHMENT_BYTES,
  fileAccept,
  imageAccept,
  imageMime,
  isAllowedFileName,
  isAllowedImageName,
} from '../attachment';

/**
 * One encrypted file and one encrypted image per entity. The rules live here, free of
 * `vscode`, because "which names are allowed" is exactly the thing that must not be
 * discovered by uploading.
 */

test('documents are allowed — pdf, office, text, archives', () => {
  for (const name of [
    'contract.pdf', 'notes.docx', 'старый.doc', 'sheet.xlsx', 'deck.pptx',
    'readme.txt', 'data.csv', 'config.json', 'backup.zip', 'report.odt',
  ]) {
    assert.equal(isAllowedFileName(name), true, name);
  }
});

test('executables are refused, whatever the case of the extension', () => {
  // A credential manager must not become a launcher for smuggled binaries.
  for (const name of [
    'tool.exe', 'TOOL.EXE', 'setup.msi', 'run.bat', 'run.cmd', 'script.ps1',
    'lib.dll', 'evil.scr', 'x.com', 'script.vbs', 'app.jar', 'noextension',
  ]) {
    assert.equal(isAllowedFileName(name), false, name);
  }
});

test('a double extension does not sneak an executable through', () => {
  assert.equal(isAllowedFileName('invoice.pdf.exe'), false);
  // ...while a harmless double extension stays fine.
  assert.equal(isAllowedFileName('archive.tar.gz'), true);
});

test('images: the popular formats, nothing else', () => {
  for (const name of ['a.png', 'b.jpg', 'c.jpeg', 'd.gif', 'e.webp', 'f.bmp', 'g.svg']) {
    assert.equal(isAllowedImageName(name), true, name);
  }
  assert.equal(isAllowedImageName('a.exe'), false);
  assert.equal(isAllowedImageName('a.pdf'), false);
});

test('every image extension has a mime, or the preview cannot render it', () => {
  assert.equal(imageMime('photo.PNG'), 'image/png');
  assert.equal(imageMime('scan.jpg'), 'image/jpeg');
  assert.equal(imageMime('icon.svg'), 'image/svg+xml');
  assert.equal(imageMime('unknown.xyz'), undefined);
});

test('the accept lists are derived from the same rules the reader enforces', () => {
  // Two lists that drift is a picker that offers what the save refuses.
  for (const ext of fileAccept.split(',')) {
    assert.equal(isAllowedFileName('x' + ext), true, ext);
  }
  for (const ext of imageAccept.split(',')) {
    assert.equal(isAllowedImageName('x' + ext), true, ext);
  }
});

test('the size cap is real and stated in bytes', () => {
  assert.equal(MAX_ATTACHMENT_BYTES, 4 * 1024 * 1024);
});
