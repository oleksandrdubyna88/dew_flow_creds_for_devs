import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { writeArchiveTo } from '../archiveDownload';

/**
 * The archive download's one property: what appears at the chosen path is the WHOLE archive or
 * nothing.
 *
 * <p>The failure this guards is the quiet one. A truncated archive at the chosen path looks exactly
 * like a good one — same name, plausible size — and the moment anybody finds out is a restore, which
 * is the moment there is nothing to fall back on. Worse, the chosen path is usually where the
 * previous archive already is.</p>
 */

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cvbk-download-'));
}

function streamOf(...chunks: readonly (Uint8Array | Error)[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      const next = chunks[index];
      index += 1;
      if (next instanceof Error) {
        controller.error(next);
        return;
      }
      controller.enqueue(next);
    },
  });
}

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

test('a complete download appears at the chosen path, whole', async () => {
  const dir = tempDir();
  const destination = path.join(dir, 'cred-vault-20260907-030405Z.cvbk');

  const written = await writeArchiveTo(streamOf(bytes('abc'), bytes('defg')), destination);

  assert.equal(written, 7);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'abcdefg');
  assert.deepEqual(fs.readdirSync(dir), ['cred-vault-20260907-030405Z.cvbk'], 'and nothing beside it');
});

test('a download that fails HALFWAY leaves nothing at the chosen path', async () => {
  // Not a partial file, and not a partial file under another name either: a `.part` left behind is
  // something somebody finds a year later and has to work out.
  const dir = tempDir();
  const destination = path.join(dir, 'cred-vault-20260907-030405Z.cvbk');

  await assert.rejects(
    () => writeArchiveTo(streamOf(bytes('abc'), new Error('the connection dropped')), destination),
    /connection dropped/,
  );

  assert.equal(fs.existsSync(destination), false, 'nothing may look like a good archive');
  assert.deepEqual(fs.readdirSync(dir), [], 'and no temporary file survives either');
});

test('a failed download does NOT destroy the archive already at that path', async () => {
  // The worst version of this failure: the person is saving over last week's archive, the download
  // dies, and now neither copy exists.
  const dir = tempDir();
  const destination = path.join(dir, 'cred-vault-20260907-030405Z.cvbk');
  fs.writeFileSync(destination, 'last week, and it opens');

  await assert.rejects(
    () => writeArchiveTo(streamOf(bytes('abc'), new Error('the connection dropped')), destination),
    /connection dropped/,
  );

  assert.equal(fs.readFileSync(destination, 'utf8'), 'last week, and it opens');
});

test('progress is reported as it goes, so a 400 MB download is not a frozen window', async () => {
  const dir = tempDir();
  const seen: number[] = [];

  await writeArchiveTo(
    streamOf(bytes('abc'), bytes('de'), bytes('f')),
    path.join(dir, 'a.cvbk'),
    (written) => seen.push(written),
  );

  assert.deepEqual(seen, [3, 5, 6], 'cumulative, per chunk, never one report at the end');
});
