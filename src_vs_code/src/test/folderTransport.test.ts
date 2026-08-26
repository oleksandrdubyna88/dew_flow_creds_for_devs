import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ShareItem, StoredAccount } from '../types';

/**
 * Delivering a share into somebody else's vault file (audit A3).
 *
 * <p>This is the only place in the product where one person WRITES into a file another person's
 * sync owns and rewrites on its own schedule. The owner's next cycle rebuilds that envelope
 * from their local state, so a share appended a moment earlier can simply vanish — and the
 * sender would have been told it was delivered. The retry-and-verify loop exists for exactly
 * that, and it is what is pinned here.</p>
 */

type Folder = typeof import('../folderTransport');

const ME: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'google' };
const PEER: StoredAccount = { accountId: 'a2', email: 'peer@corp.com', provider: 'google' };

function item(id: string): ShareItem {
  return {
    id,
    fromEmail: 'me@corp.com',
    entityName: 'prod',
    entityKind: 'ssh',
    createdAt: 1,
    salt: 's',
    iv: 'i',
    tag: 't',
    data: 'd',
  } as ShareItem;
}

function envelope(shares: unknown[] = []): string {
  return JSON.stringify({
    format: 'cred-ssh-manager-backup',
    version: 4,
    kdf: 'hkdf',
    account: PEER,
    salt: 's',
    iv: 'i',
    tag: 't',
    data: 'd',
    shares,
  });
}

interface World {
  mod: Folder;
  files: Map<string, string>;
  reads: number;
  /** Called after each write; lets a test simulate the owner's sync rewriting the file. */
  onWrite?: (files: Map<string, string>) => void;
}

function world(files: Record<string, string> = {}): World {
  const w: World = { mod: undefined as never, files: new Map(Object.entries(files)), reads: 0 };
  const nameOf = (uri: { fsPath: string }): string => uri.fsPath.split('/').pop() ?? '';
  w.mod = loadWithVscode<Folder>('../folderTransport', {
    Uri: {
      file: (p: string): { fsPath: string } => ({ fsPath: p }),
      joinPath: (base: { fsPath: string }, name: string): { fsPath: string } => ({
        fsPath: `${base.fsPath}/${name}`,
      }),
    },
    workspace: {
      getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }),
      fs: {
        readFile: (uri: { fsPath: string }): Promise<Uint8Array> => {
          w.reads += 1;
          const content = w.files.get(nameOf(uri));
          return content === undefined
            ? Promise.reject(new Error('ENOENT'))
            : Promise.resolve(Buffer.from(content, 'utf8'));
        },
        writeFile: (uri: { fsPath: string }, data: Uint8Array): Promise<void> => {
          w.files.set(nameOf(uri), Buffer.from(data).toString('utf8'));
          return Promise.resolve();
        },
        rename: (from: { fsPath: string }, to: { fsPath: string }): Promise<void> => {
          const content = w.files.get(nameOf(from));
          w.files.delete(nameOf(from));
          if (content !== undefined) {
            w.files.set(nameOf(to), content);
          }
          w.onWrite?.(w.files);
          return Promise.resolve();
        },
        delete: (uri: { fsPath: string }): Promise<void> => {
          w.files.delete(nameOf(uri));
          return Promise.resolve();
        },
        readDirectory: (): Promise<[string, number][]> =>
          Promise.resolve([...w.files.keys()].map((n) => [n, 1])),
      },
    },
    FileType: { File: 1, Directory: 2 },
  });
  return w;
}

const transport = (w: World, accounts: StoredAccount[] = [ME, PEER]): InstanceType<Folder['FolderTransport']> =>
  new w.mod.FolderTransport('/mnt/nas', () => accounts);

/** The file name the transport plans for an account — read back from what it writes. */
function peerFileName(w: World): string {
  return [...w.files.keys()].find((n) => n.includes('peer')) ?? '';
}

test('a vault that does not exist yet reads as undefined, not as an error', async () => {
  // First sync at a fresh location is the ordinary case, not a fault.
  const w = world();

  assert.equal(await transport(w).readVault(ME), undefined);
});

test('a written vault reads back byte for byte', async () => {
  const w = world();
  const t = transport(w);

  await t.writeVault(ME, envelope());

  assert.equal(await t.readVault(ME), envelope());
});

test('appending a share leaves the owner’s payload untouched', async () => {
  const w = world();
  const t = transport(w);
  await t.writeVault(PEER, envelope());
  const name = peerFileName(w);

  await t.appendShares(ME, { account: PEER, fileName: name } as never, [item('s1')]);

  const after = JSON.parse(w.files.get(name) ?? '{}') as Record<string, unknown>;
  assert.equal(after.data, 'd', 'the encrypted payload is carried verbatim');
  assert.equal((after.shares as unknown[]).length, 1);
});

test('appending is idempotent — an item already there is not added twice', async () => {
  // Two attempts at the same delivery must not leave the recipient with duplicates.
  const w = world();
  const t = transport(w);
  await t.writeVault(PEER, envelope([item('s1')]));
  const name = peerFileName(w);

  await t.appendShares(ME, { account: PEER, fileName: name } as never, [item('s1')]);

  assert.equal((JSON.parse(w.files.get(name) ?? '{}').shares as unknown[]).length, 1);
});

test('a share the owner’s sync overwrote is RE-DELIVERED, not silently lost', async () => {
  // The owner's cycle rebuilds the envelope from their local state. Without the verify-and-
  // retry, the sender would have been told the colleague has the credential when they do not.
  const w = world();
  const t = transport(w);
  await t.writeVault(PEER, envelope());
  const name = peerFileName(w);

  let clobbered = false;
  w.onWrite = (files) => {
    if (!clobbered) {
      clobbered = true;
      files.set(name, envelope()); // the owner's sync, wiping the shares array
    }
  };

  await t.appendShares(ME, { account: PEER, fileName: name } as never, [item('s1')]);

  const shares = JSON.parse(w.files.get(name) ?? '{}').shares as { id: string }[];
  assert.deepEqual(shares.map((s) => s.id), ['s1'], 'the retry put it back');
});

test('a file that keeps changing gives up loudly, naming the recipient', async () => {
  // Retrying forever would hang the UI; succeeding silently would be a lie. It says try again.
  const w = world();
  const t = transport(w);
  await t.writeVault(PEER, envelope());
  const name = peerFileName(w);
  w.onWrite = (files) => files.set(name, envelope()); // clobbered every single time

  await assert.rejects(
    () => t.appendShares(ME, { account: PEER, fileName: name } as never, [item('s1')]),
    /peer@corp\.com/,
  );
});

test('a recipient with no known vault file is refused rather than written somewhere', async () => {
  const w = world();

  await assert.rejects(
    () => transport(w).appendShares(ME, { account: PEER, fileName: undefined } as never, [item('s1')]),
    /No vault file known/,
  );
});

test('listing shares of a vault that does not exist is empty, not an error', async () => {
  const w = world();

  assert.deepEqual(await transport(w).listShares(ME), []);
});
