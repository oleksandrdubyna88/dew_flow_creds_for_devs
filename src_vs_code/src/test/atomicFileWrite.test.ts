import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AtomicWriteOps, writeFileAtomically } from '../atomicFileWrite';

/**
 * The failure this guards: "Backup to NAS" overwrote the same file automatic sync reads,
 * with a plain write and no temp-then-rename — so a dropped NAS connection mid-write left a
 * truncated file at the exact path other machines treat as the authoritative vault.
 */

function recordingOps(renameThrows?: Error) {
  const calls: unknown[][] = [];
  const ops: AtomicWriteOps<string> = {
    writeFile: async (t, d) => {
      calls.push(['write', t, Buffer.from(d).toString('utf8')]);
    },
    rename: async (f, t, o) => {
      calls.push(['rename', f, t, o.overwrite]);
      if (renameThrows !== undefined) {
        throw renameThrows;
      }
    },
    remove: async (t) => {
      calls.push(['remove', t]);
    },
  };
  return { calls, ops };
}

test('it writes the temp sibling first, then renames it over the final path', async () => {
  const { calls, ops } = recordingOps();

  await writeFileAtomically(ops, '/nas/.vault.tmp-ab12', '/nas/vault.enc', 'CIPHERTEXT');

  assert.deepEqual(calls, [
    ['write', '/nas/.vault.tmp-ab12', 'CIPHERTEXT'],
    ['rename', '/nas/.vault.tmp-ab12', '/nas/vault.enc', true],
  ]);
});

test('a failed rename removes the temp and never writes the final path', async () => {
  const { calls, ops } = recordingOps(new Error('EHOSTDOWN: the NAS share dropped'));

  await assert.rejects(
    writeFileAtomically(ops, '/nas/.v.tmp', '/nas/v.enc', 'X'),
    /share dropped/,
  );

  assert.deepEqual(calls, [
    ['write', '/nas/.v.tmp', 'X'],
    ['rename', '/nas/.v.tmp', '/nas/v.enc', true],
    ['remove', '/nas/.v.tmp'],
  ]);
  // The one property that matters: nothing was ever written to the final name.
  const wroteFinal = calls.some((c) => c[0] === 'write' && c[1] === '/nas/v.enc');
  assert.equal(wroteFinal, false);
});
