import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  base64Bytes,
  carryThroughDetails,
  describeAttachment,
  humanBytes,
  imageDimensions,
  stampFor,
} from '../attachmentMeta';
import { EntityMetadata } from '../types';

/**
 * T27 — the attachment stamps, and the carry-through seam that building them surfaced a real
 * bug in: `configKeyHash` died on every ordinary edit, silently turning code access off.
 */

test('bytes read like a human wrote them', () => {
  assert.equal(humanBytes(512), '512 B');
  assert.equal(humanBytes(3300), '3.2 KB');
  assert.equal(humanBytes(2 * 1024 * 1024), '2.0 MB');
  assert.equal(humanBytes(-1), '');
});

test('the blob size comes off the base64 length, padding subtracted', () => {
  assert.equal(base64Bytes(Buffer.from('abc').toString('base64')), 3);
  assert.equal(base64Bytes(Buffer.from('abcd').toString('base64')), 4);
  assert.equal(base64Bytes(''), 0);
});

test('PNG, GIF and JPEG headers give width and height; junk gives undefined, never a throw', () => {
  // A real 1x1 PNG.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  assert.deepEqual(imageDimensions(png), { width: 1, height: 1 });

  // GIF87a, 2x3 logical screen.
  const gif = Buffer.from('GIF87a\x02\x00\x03\x00\x80\x00\x00', 'binary');
  assert.deepEqual(imageDimensions(gif), { width: 2, height: 3 });

  // A minimal JPEG: SOI + SOF0 frame claiming 4x5.
  const jpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x05, 0x00, 0x04, 0x01, 0x11, 0x00,
  ]);
  assert.deepEqual(imageDimensions(jpeg), { width: 4, height: 5 });

  assert.equal(imageDimensions(Buffer.from('not an image')), undefined);
  assert.equal(imageDimensions(png.subarray(0, 10)), undefined, 'a truncated header is undefined');
});

test('a changed slot is stamped, an untouched one keeps its stamps, a cleared one loses them', () => {
  const old: EntityMetadata = {
    id: 'e', name: 'n', attachmentSize: 100, attachmentChangedAt: 1, attachmentChangedBy: 'old@x',
  } as EntityMetadata;

  const untouched = carryThroughDetails(
    { details: { id: 'e', name: 'n' } as EntityMetadata },
    old, 'new@x', 999,
  );
  assert.equal(untouched.attachmentSize, 100);
  assert.equal(untouched.attachmentChangedBy, 'old@x');

  const changed = carryThroughDetails(
    { details: { id: 'e', name: 'n' } as EntityMetadata, newAttachment: Buffer.from('12345').toString('base64') },
    old, 'new@x', 999,
  );
  assert.equal(changed.attachmentSize, 5);
  assert.equal(changed.attachmentChangedAt, 999);
  assert.equal(changed.attachmentChangedBy, 'new@x');

  const cleared = carryThroughDetails(
    { details: { id: 'e', name: 'n' } as EntityMetadata, clearAttachment: true },
    old, 'new@x', 999,
  );
  assert.equal(cleared.attachmentSize, undefined, 'the stamps go with the file');
});

test('an image stamp carries dimensions; a document stamp does not pretend to', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ).toString('base64');
  const stamp = stampFor(png, false, 'a@b', 5, true);
  assert.equal(stamp?.width, 1);
  const doc = stampFor(png, false, 'a@b', 5, false);
  assert.equal(doc?.width, undefined);
});

test('EditingAConfigsName_KeepsItsCodeAccessKey — the bug this seam surfaced', () => {
  // The form rebuilds details from its inputs and knows nothing of configKeyHash; before the
  // seam, an ordinary rename wrote details wholesale and the hash died — every `creds config`
  // call refused from that moment, with nothing saying why.
  const old = { id: 'c', name: 'conf', isConfig: true, configKeyHash: 'HASH' } as EntityMetadata;
  const renamed = carryThroughDetails(
    { details: { id: 'c', name: 'renamed', isConfig: true } as EntityMetadata },
    old, 'a@b', 1,
  );
  assert.equal(renamed.configKeyHash, 'HASH');

  // A kind change retires the key deliberately — the same scrub sharing does.
  const converted = carryThroughDetails(
    { details: { id: 'c', name: 'now-a-note' } as EntityMetadata },
    old, 'a@b', 1,
  );
  assert.equal(converted.configKeyHash, undefined);
});

test('the one description both pages render, "not recorded" included', () => {
  const stamped = describeAttachment(
    { id: 'e', name: 'n', imageSize: 2048, imageWidth: 10, imageHeight: 20, imageChangedAt: 0, imageChangedBy: 'x@y' } as EntityMetadata,
    'image',
  );
  assert.match(stamped, /2\.0 KB · 10×20 · changed .* by x@y/);
  const legacy = describeAttachment({ id: 'e', name: 'n' } as EntityMetadata, 'attachment');
  assert.equal(legacy, 'size not recorded · last change not recorded');
});
