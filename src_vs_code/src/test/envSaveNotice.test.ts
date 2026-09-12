import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityFormOptions, EntityFormValues } from '../entityFormPanel';
import { lockSecret, readSecret } from '../secretEnvelope';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Issue #48 — the save applies env bindings BEFORE the seal, from the values it holds, and says
 * what it wrote and what it could not. Driven through the REAL create and edit handlers.
 *
 * <p>Two defects, and the create path made them reachable in one sitting. `addEntity` sealed the new
 * entry under its PIN and THEN read the values back to apply the bindings — already locked — so an
 * entry created with a PIN and a binding wrote nothing; and both save paths discarded what
 * `applyEnvBindings` returned, so nothing was said either way. The viewer's `ENV` button handled
 * the same case correctly, which is why the report read as a platform bug rather than a save bug.</p>
 *
 * <p>The storage here is a real in-memory store, not a recorder: the ordering claim — the binding is
 * written from the plaintext and the stored value is locked AFTERWARDS — can only be asserted by
 * reading the value back and finding an envelope, and the PIN seal is the real `protectEntity` over
 * real `lockSecret`. A stub that answered `getPassword` with a constant would prove nothing about
 * order.</p>
 */

type Handler = (...args: unknown[]) => unknown;

interface FakeEnv {
  readonly replaced: Record<string, string>;
  readonly deleted: string[];
  description?: string;
  replace(name: string, value: string): void;
  delete(name: string): void;
}

function fakeEnv(): FakeEnv {
  const self: FakeEnv = {
    replaced: {},
    deleted: [],
    replace(name, value) {
      self.replaced[name] = value;
    },
    delete(name) {
      self.deleted.push(name);
    },
  };
  return self;
}

/** The `vscode` a save path touches: prompts answered from a queue, notifications recorded. */
function stubbedVscode(inputs: (string | undefined)[], said: { infos: string[]; warnings: string[] }): Record<string, unknown> {
  return {
    window: {
      showInputBox: (): Promise<string | undefined> => Promise.resolve(inputs.shift()),
      showQuickPick: (): Promise<undefined> => Promise.resolve(undefined),
      showInformationMessage: (message: string): Promise<undefined> => {
        said.infos.push(message);
        return Promise.resolve(undefined);
      },
      showWarningMessage: (message: string): Promise<undefined> => {
        said.warnings.push(message);
        return Promise.resolve(undefined);
      },
      showErrorMessage: (): undefined => undefined,
      createOutputChannel: () => ({ appendLine: (): void => undefined, show: (): void => undefined, dispose: (): void => undefined }),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: { writeFile: (): Promise<undefined> => Promise.resolve(undefined) },
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({}) },
    ViewColumn: { Active: 1 },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    TreeItem: class {},
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    commands: { registerCommand: () => ({ dispose: (): void => undefined }) },
    env: { clipboard: { writeText: (): Promise<undefined> => Promise.resolve(undefined) } },
  };
}

/**
 * A vault in memory: nodes in a list, secrets in a map keyed by slot and entity. Every setter the
 * two save paths and `protectEntity` call is here, and each behaves as the real one does at the
 * one point that matters — `setPassword` keeps what is stored when handed nothing, so the "empty
 * means keep" rule the edit form relies on is honoured.
 */
function memoryVault(nodes: TreeNode[], secrets: Map<string, string>): unknown {
  const key = (slot: string, id: string): string => `${slot}:${id}`;
  const get = (slot: string) => (_a: string, id: string): Promise<string | undefined> =>
    Promise.resolve(secrets.get(key(slot, id)));
  const set = (slot: string) => (_a: string, id: string, value: string | undefined): Promise<void> => {
    if (value === undefined) {
      secrets.delete(key(slot, id));
    } else {
      secrets.set(key(slot, id), value);
    }
    return Promise.resolve();
  };
  const keepOnEmpty = (slot: string) => (_a: string, id: string, value: string | undefined): Promise<void> =>
    value === undefined || value.length === 0 ? Promise.resolve() : set(slot)(_a, id, value);
  const del = (slot: string) => (_a: string, id: string): Promise<void> => {
    secrets.delete(key(slot, id));
    return Promise.resolve();
  };
  const done = (): Promise<void> => Promise.resolve();
  const findNode = (_a: string, id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
  const patchNode = (id: string, patch: Partial<TreeNode>): void => {
    const at = nodes.findIndex((n) => n.id === id);
    nodes[at] = { ...nodes[at], ...patch };
  };
  return {
    getNodes: () => nodes,
    getNode: findNode,
    getAccount: (accountId: string) => ({ accountId, email: 'me@example.com', provider: 'google' }),
    addNode: (_a: string, node: TreeNode) => {
      nodes.push(node);
      return done();
    },
    updateNodeFields: (_a: string, id: string, patch: Partial<TreeNode>) => {
      patchNode(id, patch);
      return done();
    },
    updateDetailsFields: (_a: string, id: string, fields: Partial<EntityMetadata>) => {
      const was = findNode(_a, id)?.details as EntityMetadata;
      patchNode(id, { details: { ...was, ...fields } });
      return done();
    },
    // The real order of `createEntityWithSecrets`, minus its failure handling.
    runCreate: async (create: { deferCleanup(): Promise<void>; writeSecrets(): Promise<void>; writeNode(): Promise<void>; finishCleanup(): Promise<void> }) => {
      await create.deferCleanup();
      await create.writeSecrets();
      await create.writeNode();
      await create.finishCleanup();
    },
    nodePresence: () => 'present',
    deferSecretCleanup: done,
    endSecretCleanup: done,
    forgetEntitySecrets: done,
    recordRevision: done,
    getPassword: get('password'),
    setPassword: keepOnEmpty('password'),
    deletePassword: del('password'),
    getPrivateKey: get('privateKey'),
    setPrivateKey: set('privateKey'),
    deletePrivateKey: del('privateKey'),
    getVpnConfig: get('vpnConfig'),
    setVpnConfig: set('vpnConfig'),
    deleteVpnConfig: del('vpnConfig'),
    getDbConnection: get('dbConnection'),
    setDbConnection: set('dbConnection'),
    deleteDbConnection: del('dbConnection'),
    getNotes: get('notes'),
    setNotes: set('notes'),
    getTotp: get('totp'),
    setTotp: set('totp'),
    deleteTotp: del('totp'),
    getConfigBody: get('configBody'),
    setConfigBody: set('configBody'),
    getFieldsRaw: get('fieldsRaw'),
    setFieldsRaw: set('fieldsRaw'),
    getFields: (): Promise<undefined> => Promise.resolve(undefined),
    setFields: done,
    getPaymentRaw: get('paymentRaw'),
    setPaymentRaw: set('paymentRaw'),
    setPayment: done,
    getAttachment: get('attachment'),
    setAttachment: set('attachment'),
    getImage: get('image'),
    setImage: set('image'),
  };
}

/** What the form hands back: a name, the bindings, and — when the person typed one — a password. */
function formResult(details: EntityMetadata, newPassword?: string): EntityFormValues {
  return {
    details,
    newPassword,
    clearPassword: false,
    clearPrivateKey: false,
    clearVpnConfig: false,
    clearDbConnection: false,
    clearAttachment: false,
    clearImage: false,
    clearTotp: false,
    clearHostKey: false,
    dependsOnColors: [],
  } as EntityFormValues;
}

interface Said {
  infos: string[];
  warnings: string[];
}

/**
 * The `envCollectionRef` instance the module under test is bound to.
 *
 * <p>`loadWithVscode` evicts the compiled graph and reloads it under the stub, so after it returns
 * the cache holds ONE `envCollectionRef` — the one the commands module imported. A plain `require`
 * here answers that cached instance; it is taken by module, not by path guess, and the parameter
 * exists only to say that the load must have happened first.</p>
 */
function envCollectionRefOf(_loaded: unknown): typeof import('../envCollectionRef') {
  return require('../envCollectionRef') as typeof import('../envCollectionRef');
}

interface CreateWorld {
  addEntity(): Promise<void>;
  env: FakeEnv;
  said: Said;
  secrets: Map<string, string>;
  createdId(): string;
}

const FOLDER = (asksForPin: boolean): TreeNode =>
  ({ id: 'f1', name: 'Production', type: 'folder', parentId: null, folderAsksForPin: asksForPin ? true : undefined }) as TreeNode;

/**
 * The real `credSshManager.addEntity` handler over the memory vault. `details` is what the form
 * returns, stamped with the id the handler minted; `pinInputs` answers the two "first PIN here"
 * boxes when the folder asks for one.
 */
function createWorld(
  details: (id: string) => EntityMetadata,
  newPassword: string | undefined,
  pinInputs: string[],
): CreateWorld {
  const said: Said = { infos: [], warnings: [] };
  const env = fakeEnv();
  const secrets = new Map<string, string>();
  const nodes: TreeNode[] = [FOLDER(pinInputs.length > 0)];
  const handlers = new Map<string, Handler>();
  const mod = loadWithVscode<typeof import('../commands/treeMutationCommands')>(
    '../commands/treeMutationCommands',
    stubbedVscode([...pinInputs], said),
    {
      '../entityFormPanel': {
        showEntityForm: (options: EntityFormOptions): Promise<EntityFormValues> =>
          Promise.resolve(formResult(details(options.entityId), newPassword)),
      },
    },
  );
  // The REAL `envCollectionRef`, loaded in the same graph: `setEnvCollection` is what `activate`
  // calls, and the notices then travel the real road — `showEnvNotice` into the stubbed `window`
  // — rather than into a mock that records them, which would prove nothing about the wiring.
  envCollectionRefOf(mod).setEnvCollection(env as never);
  mod.registerTreeMutationCommands({
    announceArrival: () => Promise.resolve(),
    log: { write: (): void => undefined },
    doorsFor: () => ({}),
    mutated: () => undefined,
    policyOf: () => undefined,
    register: (command: string, handler: Handler) => handlers.set(command, handler),
    storage: memoryVault(nodes, secrets),
    transports: {},
    vaultKeys: { noteUserActivity: () => undefined },
  } as never);
  return {
    env,
    said,
    secrets,
    addEntity: async () => {
      const handler = handlers.get('credSshManager.addEntity');
      assert.ok(handler !== undefined, 'addEntity is not registered — nothing would run');
      await handler({ kind: 'node', accountId: 'a1', node: nodes[0] });
    },
    createdId: () => {
      const entity = nodes.find((n) => n.type === 'entity');
      assert.ok(entity !== undefined, 'no entity was created');
      return entity.id;
    },
  };
}

const plainDetails = (bindings: EntityMetadata['envBindings'], over: Partial<EntityMetadata> = {}) =>
  (id: string): EntityMetadata =>
    ({ id, name: 'prod-db', isSshEnabled: false, envBindings: bindings, ...over }) as EntityMetadata;

// ---------------------------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------------------------

test('CREATE with a PIN and a binding: the variable is written from the plaintext, and the stored value is sealed AFTERWARDS', async () => {
  // THE ORDERING BUG. The seal ran first and the binding then read a locked value back — so an entry
  // created with a PIN and a binding wrote nothing, and said nothing about it.
  const w = createWorld(plainDetails({ password: 'PROD_PW' }), 'PLAIN-PW', ['1234', '1234']);

  await w.addEntity();

  assert.deepEqual(w.env.replaced, { PROD_PW: 'PLAIN-PW' }, 'the binding was applied AFTER the seal, from a locked value');
  const stored = readSecret(w.secrets.get(`password:${w.createdId()}`));
  assert.equal(stored.kind, 'locked', 'and the entry IS sealed under its PIN — the order changed, not the protection');
  assert.equal(w.said.infos.length, 1, `one notice, got: ${JSON.stringify(w.said.infos)}`);
  assert.match(w.said.infos[0], /\$PROD_PW is set for NEW integrated terminals in this window/);
  assert.deepEqual(w.said.warnings, [], 'nothing was withheld');
});

test('CREATE with a woven password bound: nothing is written and the person is TOLD why', async () => {
  const w = createWorld(plainDetails({ password: 'PROD_PW' }, { passwordWoven: true }), 'PLAIN-PW', []);

  await w.addEntity();

  assert.deepEqual(w.env.replaced, {}, 'a woven password is never handed to anything automatic');
  assert.deepEqual(w.said.infos, [], 'nothing was set, so nothing claims to be');
  assert.equal(w.said.warnings.length, 1, `one warning, got: ${JSON.stringify(w.said.warnings)}`);
  assert.match(w.said.warnings[0], /\$PROD_PW was not written: .*woven with a decoy/);
});

test('CREATE with one writable and one withheld binding says both', async () => {
  const w = createWorld(
    plainDetails({ password: 'PROD_PW', publicKey: 'PUB' }, { passwordWoven: true, publicKey: 'ssh-ed25519 AAAA' }),
    'PLAIN-PW',
    [],
  );

  await w.addEntity();

  assert.deepEqual(w.env.replaced, { PUB: 'ssh-ed25519 AAAA' });
  assert.match(w.said.infos[0] ?? '', /\$PUB is set/);
  assert.match(w.said.warnings[0] ?? '', /\$PROD_PW was not written/);
});

// ---------------------------------------------------------------------------------------------
// EDIT
// ---------------------------------------------------------------------------------------------

interface EditWorld {
  editNode(): Promise<void>;
  env: FakeEnv;
  said: Said;
}

/** The real `editNode` over the memory vault, with the stored password given and the form's answer fixed. */
function editWorld(stored: Record<string, string>, details: EntityMetadata, newPassword?: string): EditWorld {
  const said: Said = { infos: [], warnings: [] };
  const env = fakeEnv();
  const secrets = new Map<string, string>(Object.entries(stored).map(([slot, value]) => [`${slot}:e1`, value]));
  const node = { id: 'e1', name: 'prod-db', type: 'entity', parentId: null, details: { ...details, envBindings: details.envBindings } } as TreeNode;
  const nodes: TreeNode[] = [node];
  const mod = loadWithVscode<typeof import('../entityEditCommands')>('../entityEditCommands', stubbedVscode([], said), {
    './entityFormPanel': {
      showEntityForm: (): Promise<EntityFormValues> => Promise.resolve(formResult(details, newPassword)),
    },
  });
  envCollectionRefOf(mod).setEnvCollection(env as never);
  return {
    env,
    said,
    editNode: () => mod.editNode('a1', node, memoryVault(nodes, secrets) as never, () => undefined),
  };
}

const DETAILS: EntityMetadata = { id: 'e1', name: 'prod-db', isSshEnabled: false, envBindings: { password: 'PROD_PW' } } as EntityMetadata;

test('EDIT that types a new password: the variable is written from what was just saved, and the save SAYS so', async () => {
  // D1 — the form's checkbox wrote on save and said nothing; the person looked at the terminal
  // that was already open and saw nothing there.
  const w = editWorld({ password: 'OLD-PW' }, DETAILS, 'NEW-PW');

  await w.editNode();

  assert.deepEqual(w.env.replaced, { PROD_PW: 'NEW-PW' });
  assert.equal(w.said.infos.length, 1, `one notice, got: ${JSON.stringify(w.said.infos)}`);
  assert.match(w.said.infos[0], /\$PROD_PW is set for NEW integrated terminals in this window/);
  assert.deepEqual(w.said.warnings, []);
});

test('EDIT that leaves a PIN-locked password alone: nothing is written and the reason is SAID', async () => {
  // D2 — the form carried no password ("empty means keep"), storage holds a locked envelope, and
  // the binding used to be skipped without a word.
  const locked = await lockSecret('hunter2', 'a1', '1234');
  const w = editWorld({ password: locked }, DETAILS, undefined);

  await w.editNode();

  assert.deepEqual(w.env.replaced, {});
  assert.deepEqual(w.said.infos, []);
  assert.equal(w.said.warnings.length, 1, `one warning, got: ${JSON.stringify(w.said.warnings)}`);
  assert.match(w.said.warnings[0], /\$PROD_PW was not written: .*protected with its own PIN/);
});

test('EDIT with one writable and one withheld binding says both', async () => {
  const locked = await lockSecret('hunter2', 'a1', '1234');
  const details = { ...DETAILS, envBindings: { password: 'PROD_PW', publicKey: 'PUB' }, publicKey: 'ssh-ed25519 BBBB' } as EntityMetadata;
  const w = editWorld({ password: locked }, details, undefined);

  await w.editNode();

  assert.deepEqual(w.env.replaced, { PUB: 'ssh-ed25519 BBBB' });
  assert.match(w.said.infos[0] ?? '', /\$PUB is set/);
  assert.match(w.said.warnings[0] ?? '', /\$PROD_PW was not written/);
});
