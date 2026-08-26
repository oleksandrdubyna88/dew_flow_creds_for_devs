import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { configStub, loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

/**
 * Handing a database connection to whichever DB extension the person actually has (audit A3).
 *
 * <p>There is no VS Code API for giving another extension a connection, so this is a tiered
 * guess: an operator override, then the first installed candidate, then a recommendation to
 * install. What makes it worth testing is that every branch ends in a MESSAGE, and the
 * messages are the feature — the connection string reaches the other extension by way of the
 * clipboard and a human paste, so a branch that copies silently, or claims to have opened
 * something it did not, leaves a password on the clipboard with nobody told why.</p>
 *
 * <p>The one hard rule underneath: this never writes into another extension's private
 * storage. Everything here goes through that extension's own published command.</p>
 */

type Launcher = typeof import('../dbLauncher');

interface Extension {
  id: string;
  packageJSON: unknown;
  activate(): Promise<void>;
}

interface World {
  mod: Launcher;
  clipboard: string[];
  commands: string[];
  infos: string[];
  warnings: string[];
  /** Answers to showInformationMessage-with-buttons, in order. */
  answers: string[];
}

function extension(id: string, commands: string[] = [], activateFails = false): Extension {
  return {
    id,
    packageJSON: { contributes: { commands: commands.map((command) => ({ command })) } },
    activate: (): Promise<void> =>
      activateFails ? Promise.reject(new Error('activation failed')) : Promise.resolve(),
  };
}

function world(options: {
  installed?: Extension[];
  overrides?: Record<string, string>;
  answers?: string[];
  commandFails?: boolean;
}): World {
  const w: World = {
    mod: undefined as never,
    clipboard: [],
    commands: [],
    infos: [],
    warnings: [],
    answers: [...(options.answers ?? [])],
  };
  const installed = options.installed ?? [];
  const config = configStub({ dbExtensions: options.overrides ?? {} });
  w.mod = loadWithVscode<Launcher>('../dbLauncher', {
    workspace: { getConfiguration: config.workspace.getConfiguration },
    extensions: {
      getExtension: (id: string): Extension | undefined => installed.find((e) => e.id === id),
    },
    commands: {
      executeCommand: (command: string): Promise<void> => {
        w.commands.push(command);
        return options.commandFails === true && command !== 'workbench.extensions.installExtension'
          ? Promise.reject(new Error('no such command'))
          : Promise.resolve();
      },
    },
    env: {
      clipboard: {
        readText: (): Promise<string> => Promise.resolve(w.clipboard[w.clipboard.length - 1] ?? ''),
        writeText: (value: string): Promise<void> => {
          w.clipboard.push(value);
          return Promise.resolve();
        },
      },
    },
    window: {
      showInformationMessage: (m: string): Promise<string | undefined> => {
        w.infos.push(m);
        return Promise.resolve(w.answers.shift());
      },
      showWarningMessage: (m: string): Promise<undefined> => {
        w.warnings.push(m);
        return Promise.resolve(undefined);
      },
    },
  });
  return w;
}

const db = (dbType: string): EntityMetadata => ({ id: 'e1', name: 'prod', kind: 'db', dbType }) as EntityMetadata;

const CONN = 'postgresql://me:hunter2@db.corp.com:5432/app';

test('with nothing installed it names the recommended extension and offers to install it', async () => {
  const w = world({ installed: [] });

  await w.mod.openInDbExtension(db('postgres'), CONN);

  assert.match(w.infos[0], /ms-ossdata\.vscode-pgsql/, 'the id, so it can be searched for');
  assert.deepEqual(w.clipboard, [], 'and the password is NOT put on the clipboard for nothing');
});

test('accepting the offer installs it and says to press Connect again', async () => {
  // It cannot connect in the same gesture: the extension is not loaded yet.
  const w = world({ installed: [], answers: ['Install'] });

  await w.mod.openInDbExtension(db('postgres'), CONN);

  assert.deepEqual(w.commands, ['workbench.extensions.installExtension']);
  assert.match(w.infos[1], /press Connect again/);
});

test('declining the offer does nothing at all', async () => {
  const w = world({ installed: [], answers: [] });

  await w.mod.openInDbExtension(db('postgres'), CONN);

  assert.deepEqual(w.commands, []);
  assert.deepEqual(w.clipboard, []);
});

test('an installed extension gets the connection string via the clipboard and its own command', async () => {
  const w = world({ installed: [extension('mongodb.mongodb-vscode')] });

  await w.mod.openInDbExtension(db('mongodb'), CONN);

  assert.deepEqual(w.clipboard, [CONN]);
  assert.deepEqual(w.commands, ['mdb.connectWithURI'], 'the known command for that extension');
});

test('the operator override is preferred over every built-in candidate', async () => {
  // Somebody using a DB extension nobody listed must not be sent to install a different one.
  const w = world({
    installed: [extension('acme.db-tool', ['acme.connection.add']), extension('ms-ossdata.vscode-pgsql')],
    overrides: { postgres: 'acme.db-tool' },
  });

  await w.mod.openInDbExtension(db('postgres'), CONN);

  assert.deepEqual(w.commands, ['acme.connection.add'], 'their tool, not the recommendation');
});

test('a blank override falls back rather than resolving to an empty extension id', async () => {
  const w = world({
    installed: [extension('cweijan.vscode-mysql-client2')],
    overrides: { mysql: '   ' },
  });

  await w.mod.openInDbExtension(db('mysql'), CONN);

  assert.deepEqual(w.commands, ['mysql.connection.add']);
});

test('an unknown extension has its add-connection command DISCOVERED from its own manifest', async () => {
  // The point of the tier: a DB extension released after this file was written still works.
  const w = world({
    installed: [extension('acme.db-tool', ['acme.refresh', 'acme.connection.add', 'acme.delete'])],
    overrides: { postgres: 'acme.db-tool' },
  });

  await w.mod.openInDbExtension(db('postgres'), CONN);

  assert.deepEqual(w.commands, ['acme.connection.add']);
});

test('a URI-taking command is preferred over a form-opening one', async () => {
  const w = world({
    installed: [extension('acme.db-tool', ['acme.addConnection', 'acme.connectWithUri'])],
    overrides: { postgres: 'acme.db-tool' },
  });

  await w.mod.openInDbExtension(db('postgres'), CONN);

  assert.deepEqual(w.commands, ['acme.connectWithUri'], 'one paste beats a whole form');
});

test('an extension with no usable command says the PASSWORD is on the clipboard', async () => {
  // This is the branch where the user is left holding a live credential. Saying so is the
  // difference between a hint and a leak nobody was told about.
  const w = world({
    installed: [extension('acme.db-tool', ['acme.refresh'])],
    overrides: { postgres: 'acme.db-tool' },
  });

  await w.mod.openInDbExtension(db('postgres'), CONN);

  assert.deepEqual(w.commands, []);
  assert.match(w.infos[0], /INCLUDING THE PASSWORD/);
});

test('a command that fails is reported, and the clipboard is mentioned as the way through', async () => {
  const w = world({ installed: [extension('mongodb.mongodb-vscode')], commandFails: true });

  await w.mod.openInDbExtension(db('mongodb'), CONN);

  assert.match(w.warnings[0], /Could not invoke/);
  assert.match(w.warnings[0], /clipboard/, 'the person can still finish by hand');
});

test('an extension that fails to activate is still asked — VS Code gives the better error', async () => {
  const w = world({ installed: [extension('mongodb.mongodb-vscode', [], true)] });

  await w.mod.openInDbExtension(db('mongodb'), CONN);

  assert.deepEqual(w.commands, ['mdb.connectWithURI']);
});

test('an entity with NO connection string opens the extension and says so', async () => {
  // Copying an empty string would silently wipe whatever the person had on the clipboard.
  const w = world({ installed: [extension('mongodb.mongodb-vscode')] });

  await w.mod.openInDbExtension(db('mongodb'), undefined);

  assert.deepEqual(w.clipboard, [], 'nothing was copied');
  assert.match(w.infos[0], /no stored connection string/);
});

test('an entity with no dbType is treated as postgres rather than failing', async () => {
  const w = world({ installed: [extension('ms-ossdata.vscode-pgsql', ['pgsql.addObjectExplorer'])] });

  await w.mod.openInDbExtension({ id: 'e1', name: 'prod', kind: 'db' } as EntityMetadata, CONN);

  assert.deepEqual(w.commands, ['pgsql.addObjectExplorer']);
});

test('the paste hint names the toggle that fills every field at once', async () => {
  // Database Client has no prefill API at all; without this line the person fills six fields
  // by hand from a string they cannot see.
  const w = world({ installed: [extension('cweijan.vscode-mysql-client2')] });

  await w.mod.openInDbExtension(db('mysql'), CONN);

  assert.match(w.infos[0], /Use Connection String/);
});
