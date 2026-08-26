import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { configStub, loadWithVscode } from './vscodeStub';
import { StoredAccount, TreeNode } from '../types';

/**
 * Gathering what the health report weighs (audit A3).
 *
 * <p>`hygiene.ts` does the judging and is pure, so it is tested there. This half READS — and
 * one of the things it can read is the network. The README promises no network by default, so
 * the breach check is gated twice: a setting the operator turns on, and a modal that states
 * exactly what leaves the machine. Both gates are pinned below, including the case that
 * matters most — the setting on, the modal declined — because a check that ran anyway would
 * break the product's central promise while looking like it had asked.</p>
 *
 * <p>The rest is about not failing the whole scan for one unreadable thing: a missing
 * `~/.ssh`, a file too large to be a key, a `.env` that cannot be opened. Each of those is an
 * ordinary state on somebody's machine, and a report that refuses to render is worth less
 * than one missing a line.</p>
 */

type Scan = typeof import('../hygieneScan');

interface World {
  mod: Scan;
  home: string;
  dialogs: string[];
  answers: (string | undefined)[];
  envFiles: { path: string; content: string }[];
}

function world(options: {
  settings?: Record<string, unknown>;
  answers?: (string | undefined)[];
  envFiles?: { path: string; content: string }[];
}): World {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-hyg-'));
  const w: World = {
    mod: undefined as never,
    home,
    dialogs: [],
    answers: [...(options.answers ?? [])],
    envFiles: options.envFiles ?? [],
  };
  const config = configStub(options.settings ?? {});
  w.mod = loadWithVscode<Scan>(
    '../hygieneScan',
    {
      workspace: {
        getConfiguration: config.workspace.getConfiguration,
        findFiles: (): Promise<{ fsPath: string }[]> =>
          Promise.resolve(w.envFiles.map((f) => ({ fsPath: f.path }))),
        asRelativePath: (uri: { fsPath: string }): string => uri.fsPath,
        fs: {
          readFile: (uri: { fsPath: string }): Promise<Uint8Array> => {
            const found = w.envFiles.find((f) => f.path === uri.fsPath);
            return found === undefined
              ? Promise.reject(new Error('unreadable'))
              : Promise.resolve(Buffer.from(found.content, 'utf8'));
          },
        },
      },
      window: {
        showWarningMessage: (m: string): Promise<string | undefined> => {
          w.dialogs.push(m);
          return Promise.resolve(w.answers.shift());
        },
      },
    },
    { 'node:os': { ...os, homedir: (): string => home } },
  );
  return w;
}

function sshDir(w: World): string {
  const dir = path.join(w.home, '.ssh');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const cleanup = (w: World): void => fs.rmSync(w.home, { recursive: true, force: true });

const UNENCRYPTED = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA==\n-----END OPENSSH PRIVATE KEY-----\n';

test('a home directory with no ~/.ssh at all is an ordinary state, not a failure', () => {
  const w = world({});
  try {
    assert.deepEqual(w.mod.readSshDirectory(w.home), []);
  } finally {
    cleanup(w);
  }
});

test('private-key candidates are read; public keys and housekeeping files are not', () => {
  // Reading known_hosts or authorized_keys would pull a list of every host the person
  // connects to into a report about passwords.
  const w = world({});
  try {
    const dir = sshDir(w);
    fs.writeFileSync(path.join(dir, 'id_ed25519'), UNENCRYPTED);
    fs.writeFileSync(path.join(dir, 'id_ed25519.pub'), 'ssh-ed25519 AAAA');
    fs.writeFileSync(path.join(dir, 'known_hosts'), 'github.com ssh-rsa AAAA');
    fs.writeFileSync(path.join(dir, 'config'), 'Host *');
    fs.writeFileSync(path.join(dir, 'authorized_keys'), 'ssh-rsa AAAA');

    const read = w.mod.readSshDirectory(w.home).map((k) => path.basename(k.path));

    assert.deepEqual(read, ['id_ed25519']);
  } finally {
    cleanup(w);
  }
});

test('a file too large to be a private key is not pulled into memory', () => {
  // A private key is a few kilobytes. Anything bigger is somebody's data, and reading it
  // would be an arbitrary file read for no reason.
  const w = world({});
  try {
    const dir = sshDir(w);
    fs.writeFileSync(path.join(dir, 'huge'), Buffer.alloc(70 * 1024, 0x41));

    assert.deepEqual(w.mod.readSshDirectory(w.home), []);
  } finally {
    cleanup(w);
  }
});

test('a dotfile in ~/.ssh is skipped', () => {
  const w = world({});
  try {
    fs.writeFileSync(path.join(sshDir(w), '.DS_Store'), 'junk');

    assert.deepEqual(w.mod.readSshDirectory(w.home), []);
  } finally {
    cleanup(w);
  }
});

test('an unreadable .env file is skipped rather than failing the whole scan', async () => {
  const w = world({ envFiles: [] });
  try {
    // findFiles reports a file that readFile then refuses — a race, or a permission.
    w.envFiles = [];
    const found = await w.mod.readWorkspaceEnvFiles();

    assert.deepEqual(found, []);
  } finally {
    cleanup(w);
  }
});

test('workspace .env files are read with the relative path the report will show', async () => {
  const w = world({ envFiles: [{ path: 'api/.env', content: 'AWS_SECRET_ACCESS_KEY=abc' }] });
  try {
    const found = await w.mod.readWorkspaceEnvFiles();

    assert.deepEqual(found, [{ path: 'api/.env', content: 'AWS_SECRET_ACCESS_KEY=abc' }]);
  } finally {
    cleanup(w);
  }
});

function storageOf(entities: { id: string; name: string; password?: string; connection?: string }[]): unknown {
  return {
    getAccounts: (): StoredAccount[] => [
      { accountId: 'a1', email: 'me@corp.com', provider: 'google' } as StoredAccount,
    ],
    getNodes: (): TreeNode[] =>
      entities.map((e) => ({ id: e.id, name: e.name, type: 'entity' }) as TreeNode),
    getPassword: (_a: string, id: string): Promise<string | undefined> =>
      Promise.resolve(entities.find((e) => e.id === id)?.password),
    getDbConnection: (_a: string, id: string): Promise<string | undefined> =>
      Promise.resolve(entities.find((e) => e.id === id)?.connection),
  };
}

test('every stored password is collected with the entity it belongs to', async () => {
  const w = world({});
  try {
    const collected = await w.mod.collectPasswords(
      storageOf([{ id: 'e1', name: 'prod', password: 'hunter2' }]) as never,
    );

    assert.deepEqual(collected, [
      { entityName: 'prod', accountEmail: 'me@corp.com', field: 'password', value: 'hunter2' },
    ]);
  } finally {
    cleanup(w);
  }
});

test('a password inside a database connection string is weighed too', async () => {
  // It is a password like any other, and it is the one people forget is stored at all.
  const w = world({});
  try {
    const collected = await w.mod.collectPasswords(
      storageOf([{ id: 'e1', name: 'db', connection: 'postgresql://me:hunter2@h:5432/app' }]) as never,
    );

    assert.deepEqual(collected.map((c) => [c.field, c.value]), [['database password', 'hunter2']]);
  } finally {
    cleanup(w);
  }
});

test('an entity with no secret contributes nothing to weigh', async () => {
  const w = world({});
  try {
    const collected = await w.mod.collectPasswords(storageOf([{ id: 'e1', name: 'empty' }]) as never);

    assert.deepEqual(collected, []);
  } finally {
    cleanup(w);
  }
});

test('folders are not mistaken for entities', async () => {
  const w = world({});
  try {
    const storage = {
      getAccounts: (): StoredAccount[] => [{ accountId: 'a1', email: 'me@corp.com' } as StoredAccount],
      getNodes: (): TreeNode[] => [{ id: 'f1', name: 'Team', type: 'folder' } as TreeNode],
      getPassword: (): Promise<undefined> => Promise.reject(new Error('never asked')),
      getDbConnection: (): Promise<undefined> => Promise.reject(new Error('never asked')),
    };

    assert.deepEqual(await w.mod.collectPasswords(storage as never), []);
  } finally {
    cleanup(w);
  }
});

test('the breach check is OFF unless the setting says otherwise — and asks nothing', async () => {
  // The README's "no network by default" is a promise about the product. A dialog appearing
  // here would already be a change of behaviour for someone who never opted in.
  const w = world({ settings: {}, answers: ['Check them'] });
  try {
    assert.equal(await w.mod.confirmBreachCheck(3), false);
    assert.deepEqual(w.dialogs, [], 'not even a question');
  } finally {
    cleanup(w);
  }
});

test('with the setting ON it still asks, and DECLINING means no network', async () => {
  // The case that matters most: enabled once, months ago, and this run said no.
  const w = world({ settings: { breachCheck: true }, answers: [undefined] });
  try {
    assert.equal(await w.mod.confirmBreachCheck(3), false);
    assert.equal(w.dialogs.length, 1);
  } finally {
    cleanup(w);
  }
});

test('the modal states what actually leaves the machine, not just that something does', async () => {
  // "Send data to a third party?" is not a question anybody can answer. Five hex characters
  // out of a million-bucket space is.
  const w = world({ settings: { breachCheck: true }, answers: ['Check them'] });
  try {
    assert.equal(await w.mod.confirmBreachCheck(3), true);

    assert.match(w.dialogs[0], /FIRST FIVE characters/);
    assert.match(w.dialogs[0], /never leave this machine/);
    assert.match(w.dialogs[0], /only part of CredsForDevs that uses the network/);
    assert.match(w.dialogs[0], /3 password/, 'and how many are involved');
  } finally {
    cleanup(w);
  }
});

test('a scan with no passwords never asks about breaches', async () => {
  // Nothing to check is not a decision to put in front of anybody.
  const w = world({ settings: { breachCheck: true }, answers: ['Check them'] });
  try {
    const result = await w.mod.runHygieneScan(storageOf([]) as never);

    assert.deepEqual(w.dialogs, []);
    assert.ok(result.markdown.length > 0, 'and the report still renders');
  } finally {
    cleanup(w);
  }
});

test('a full scan renders a report and finds the unencrypted key on disk', async () => {
  const w = world({ settings: {} });
  try {
    fs.writeFileSync(path.join(sshDir(w), 'id_ed25519'), UNENCRYPTED);

    const result = await w.mod.runHygieneScan(
      storageOf([{ id: 'e1', name: 'prod', password: 'password' }]) as never,
    );

    assert.ok(result.findings.length > 0, 'a weak password and a bare key are both findings');
    assert.ok(result.markdown.includes('#'), 'the report is markdown');
  } finally {
    cleanup(w);
  }
});

test('a breach check that was never confirmed leaves the report saying so', async () => {
  // The report has to distinguish "checked, nothing found" from "not checked" — otherwise a
  // clean-looking report means two different things.
  const w = world({ settings: {} });
  try {
    const withPasswords = await w.mod.runHygieneScan(
      storageOf([{ id: 'e1', name: 'prod', password: 'Tr0ub4dor&3xyz' }]) as never,
    );

    assert.ok(withPasswords.markdown.length > 0);
    assert.deepEqual(w.dialogs, []);
  } finally {
    cleanup(w);
  }
});
