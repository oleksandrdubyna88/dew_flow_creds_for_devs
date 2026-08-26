import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigStub, configStub, loadWithVscode } from './vscodeStub';
import { StoredAccount } from '../types';

/**
 * Which backend an account's vault is written through (audit A3).
 *
 * <p>Three transports now share one setting — a folder path, a Cred Vault Server URL, and a
 * git remote — so this class decides, from a string a person typed, where every secret goes.
 * Guessing wrong does not throw: it points an account at the wrong backend and syncs it
 * nowhere, quietly. It had no test.</p>
 *
 * <p>The routing rule is deliberately asymmetric and that is what is pinned here: git is asked
 * FIRST but only about shapes that can be nothing else, so `https://host/path` stays a server
 * URL rather than being guessed into a git remote.</p>
 */

type Factory = typeof import('../transportFactory');

const ACCOUNT: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'google' };

function vscodeStub(config: ConfigStub): Record<string, unknown> {
  return {
    workspace: {
      getConfiguration: config.workspace.getConfiguration,
      // The factory subscribes so it can drop its cache when a location changes.
      onDidChangeConfiguration: (listener: (e: unknown) => void): unknown => {
        listeners.push(listener);
        return { dispose: (): void => undefined };
      },
    },
    ConfigurationTarget: { Global: 1 },
    Uri: { file: (p: string): { fsPath: string } => ({ fsPath: p }) },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined) },
  };
}

let listeners: ((e: unknown) => void)[] = [];

function build(settings: Record<string, unknown>, storageDir?: string): {
  factory: InstanceType<Factory['TransportFactory']>;
  fireConfigChange: () => void;
} {
  listeners = [];
  const config = configStub(settings);
  const mod = loadWithVscode<Factory>('../transportFactory', vscodeStub(config));
  const storage = { getAccounts: () => [ACCOUNT], getPrivateKey: () => Promise.resolve(undefined) };
  const factory = new mod.TransportFactory(storage as never, {} as never, storageDir);
  return {
    factory,
    fireConfigChange: () => {
      for (const l of listeners) {
        l({ affectsConfiguration: () => true });
      }
    },
  };
}

/** The transport's class name — what it IS, without reaching into its internals. */
const kindOf = (t: unknown): string => (t as object).constructor.name;

test('a plain folder path gets the folder transport', () => {
  const { factory } = build({ nasBackupPath: '/mnt/nas/vault' }, '/storage');

  assert.equal(kindOf(factory.forAccount(ACCOUNT)), 'FolderTransport');
});

test('a Windows folder path is a folder, not a URL', () => {
  const { factory } = build({ nasBackupPath: 'Z:\\Backups\\vault' }, '/storage');

  assert.equal(kindOf(factory.forAccount(ACCOUNT)), 'FolderTransport');
});

test('an https URL is the SERVER, never guessed into a git remote', () => {
  // The asymmetry that matters: plenty of git remotes are https, so a greedy git rule would
  // take every server URL with it and sync the account nowhere without saying so.
  const { factory } = build({ nasBackupPath: 'https://vault.corp.com' }, '/storage');

  assert.equal(kindOf(factory.forAccount(ACCOUNT)), 'ServerTransport');
});

test('only shapes that can be nothing else are read as git', () => {
  for (const location of [
    'git@github.com:me/vault.git',
    'ssh://git@github.com/me/vault',
    'https://github.com/me/vault.git',
    'git+https://github.com/me/vault',
  ]) {
    const { factory } = build({ nasBackupPath: location }, '/storage');
    assert.equal(kindOf(factory.forAccount(ACCOUNT)), 'GitTransport', location);
  }
});

test('an account with no location configured has no transport, rather than a default one', () => {
  // Defaulting here would invent a sync destination nobody chose.
  const { factory } = build({}, '/storage');

  assert.equal(factory.forAccount(ACCOUNT), undefined);
});

test('a per-account location beats the global one, so two accounts can use two backends', () => {
  const other: StoredAccount = { accountId: 'a2', email: 'work@corp.com', provider: 'microsoft' };
  const { factory } = build(
    {
      nasBackupPath: '/mnt/home-nas',
      accountNasPaths: { 'work@corp.com': 'https://vault.corp.com' },
    },
    '/storage',
  );

  assert.equal(kindOf(factory.forAccount(ACCOUNT)), 'FolderTransport');
  assert.equal(kindOf(factory.forAccount(other)), 'ServerTransport');
});

test('one location yields ONE instance, so a sync cycle reuses a single client', () => {
  const { factory } = build({ nasBackupPath: 'https://vault.corp.com' }, '/storage');

  assert.equal(factory.forLocation('https://vault.corp.com'), factory.forLocation('https://vault.corp.com'));
});

test('changing the settings drops the cache, so an edited location takes effect', () => {
  // Without this the old transport keeps answering for the rest of the window — the vault
  // goes on being written to the folder the person just stopped using.
  const { factory, fireConfigChange } = build({ nasBackupPath: '/mnt/nas' }, '/storage');
  const before = factory.forLocation('/mnt/nas');

  fireConfigChange();

  assert.notEqual(factory.forLocation('/mnt/nas'), before);
});

test('a git location without a storage folder REFUSES, instead of making a directory named after a URL', () => {
  // The build has nowhere to clone; treating the remote as a folder path would create a
  // directory called "git@github.com:me/vault.git" and sync into it forever.
  const { factory } = build({ nasBackupPath: 'git@github.com:me/vault.git' }, undefined);

  assert.throws(
    () => factory.forAccount(ACCOUNT),
    /git sync is not available in this build/,
  );
});
