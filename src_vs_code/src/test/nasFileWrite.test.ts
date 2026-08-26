import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';

/**
 * The one atomic writer every producer of a vault file at a folder location goes through
 * (audit A3).
 *
 * <p>`atomicFileWrite.ts` owns the temp-then-rename sequencing and is tested. What is only
 * true here is the wiring: that both writers of that file name — automatic sync and the manual
 * Backup to NAS — go through the SAME temp-then-rename, and that the temp name cannot collide
 * with a concurrent write or be picked up as a vault by the reader that scans the folder.</p>
 */

type Writer = typeof import('../nasFileWrite');

interface Op {
  op: 'write' | 'rename' | 'delete';
  target: string;
  to?: string;
  overwrite?: boolean;
  data?: string;
}

function world(failRename = false): { mod: Writer; ops: Op[] } {
  const ops: Op[] = [];
  const mod = loadWithVscode<Writer>('../nasFileWrite', {
    Uri: {
      joinPath: (base: { fsPath: string }, name: string): { fsPath: string } => ({
        fsPath: `${base.fsPath}/${name}`,
      }),
    },
    workspace: {
      fs: {
        writeFile: (target: { fsPath: string }, data: Uint8Array): Promise<void> => {
          ops.push({ op: 'write', target: target.fsPath, data: Buffer.from(data).toString('utf8') });
          return Promise.resolve();
        },
        rename: (
          from: { fsPath: string },
          to: { fsPath: string },
          options?: { overwrite?: boolean },
        ): Promise<void> => {
          ops.push({ op: 'rename', target: from.fsPath, to: to.fsPath, overwrite: options?.overwrite });
          return failRename ? Promise.reject(new Error('rename refused')) : Promise.resolve();
        },
        delete: (target: { fsPath: string }): Promise<void> => {
          ops.push({ op: 'delete', target: target.fsPath });
          return Promise.resolve();
        },
      },
      getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }),
    },
  });
  return { mod, ops };
}

const DIR = { fsPath: '/mnt/nas' } as never;

test('the content is written to a TEMP file and only then renamed into place', async () => {
  // A reader scanning the folder mid-write must never find a half-written vault. That is the
  // whole reason this is not one writeFile call.
  const w = world();

  await w.mod.writeVaultFileAtomically(DIR, 'vault_me@corp.com.enc', 'CIPHERTEXT');

  assert.equal(w.ops[0].op, 'write');
  assert.notEqual(w.ops[0].target, '/mnt/nas/vault_me@corp.com.enc', 'never written in place');
  assert.equal(w.ops[0].data, 'CIPHERTEXT');
  const rename = w.ops.find((o) => o.op === 'rename');
  assert.equal(rename?.target, w.ops[0].target);
  assert.equal(rename?.to, '/mnt/nas/vault_me@corp.com.enc');
});

test('the temp name is HIDDEN and carries the vault name, so a stray one is identifiable', () => {
  const w = world();
  void w.mod.writeVaultFileAtomically(DIR, 'vault_me@corp.com.enc', 'x');

  const temp = w.ops[0].target.split('/').pop() ?? '';
  assert.ok(temp.startsWith('.'), `a dotfile, so a folder scan skips it: ${temp}`);
  assert.match(temp, /vault_me@corp\.com\.enc/, 'and it says which vault it belongs to');
  assert.match(temp, /\.tmp-[0-9a-f]{8}$/, 'with random bytes, not a pid or a counter');
});

test('two concurrent writes of the SAME vault do not share a temp name', async () => {
  // Two windows syncing one account at once is ordinary. A shared temp name would have them
  // overwriting each other's half-written file and renaming the result into place.
  const w = world();

  await Promise.all([
    w.mod.writeVaultFileAtomically(DIR, 'vault_me.enc', 'one'),
    w.mod.writeVaultFileAtomically(DIR, 'vault_me.enc', 'two'),
  ]);

  const temps = w.ops.filter((o) => o.op === 'write').map((o) => o.target);
  assert.equal(temps.length, 2);
  assert.notEqual(temps[0], temps[1]);
});

test('a rename that fails does not leave the temp file behind', async () => {
  // Otherwise every failed sync adds a hidden file to the folder, forever.
  const w = world(true);

  await assert.rejects(() => w.mod.writeVaultFileAtomically(DIR, 'vault_me.enc', 'x'));

  const cleanup = w.ops.find((o) => o.op === 'delete');
  assert.ok(cleanup !== undefined, 'the temp file is removed');
  assert.equal(cleanup.target, w.ops[0].target);
});
