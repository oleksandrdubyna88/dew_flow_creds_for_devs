import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import {
  AGENT_KINDS,
  AGENT_KIND_FIELDS,
  agentKindHelp,
  agentKinds,
  allowedFieldsSentence,
  folderFieldsFor,
} from '../agentKindFields';
import { ENTITY_KINDS, EntityKind, EntityMetadata } from '../types';

/**
 * The per-kind table is DERIVED from the form's save, and this is where that is true.
 *
 * <p>The rule the table states: a kind's fields are the ones `toValues` keeps for that kind,
 * intersected with what an agent may set. Stated in prose it is a wish; two kind lists in the
 * relay's descriptions had already drifted from `ENTITY_KINDS` when this was written. So every
 * candidate field is posted through the REAL `toValues`, and the table for each kind must equal
 * exactly what came out the other side — a listed field the form scrubs and a kept field the table
 * omits are the same red test.</p>
 *
 * <p>The second guarantee is the one the owner asked for by name (O4): no answer built from this
 * table names an agent-access switch or a window-owned field. Pinned with a deny-list rather than
 * left to the table's shape, because the table's shape is exactly what a later field would change.</p>
 */

type Panel = typeof import('../entityFormPanel');

function form(): Panel {
  return loadWithVscode<Panel>('../entityFormPanel', {
    window: { createWebviewPanel: () => ({}), showErrorMessage: () => Promise.resolve(undefined) },
    workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    Uri: { file: (p: string) => ({ fsPath: p }), joinPath: () => ({ fsPath: '' }) },
    ViewColumn: { One: 1 },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
      dispose(): void {}
    },
  });
}

/** The smallest posted form that names a kind — every other field left at its empty default. */
const posted = (kind: EntityKind, extra: Record<string, unknown>): Record<string, unknown> => ({
  name: 'an entry',
  entityType: kind,
  lifetime: 'keep',
  ...extra,
});

/**
 * Every record field the FORM can write that an agent could conceivably set — posted the way the
 * webview posts it, with a value the form's own readers accept, and named by the record key the
 * save writes. This is the inventory; the table is what it must agree with.
 */
const UNIVERSE: readonly { key: keyof EntityMetadata; post: Record<string, unknown> }[] = [
  { key: 'host', post: { host: 'app-03.internal' } },
  { key: 'user', post: { user: 'deploy' } },
  { key: 'port', post: { port: '22' } },
  { key: 'sshKeyPath', post: { sshKeyPath: '~/.ssh/id_ed25519' } },
  { key: 'publicKey', post: { publicKey: 'ssh-ed25519 AAAA deploy' } },
  { key: 'tags', post: { tags: 'production eu-west' } },
  { key: 'vpnType', post: { vpnType: 'wireguard' } },
  { key: 'vpnConfigFileName', post: { vpnConfigFileName: 'wg0.conf' } },
  { key: 'dbType', post: { dbType: 'postgres' } },
  { key: 'command', post: { command: 'aws sso login' } },
  { key: 'commandArgs', post: { commandArgs: [{ value: '--sso-session' }] } },
  { key: 'commandNote', post: { commandNote: 'signs in for the day' } },
  { key: 'terminalOs', post: { terminalOs: 'linux' } },
  { key: 'scriptLanguage', post: { scriptLanguage: 'python' } },
  { key: 'script', post: { scriptBody: 'echo hi' } },
  { key: 'scriptVars', post: { scriptVars: [{ name: 'PLAN', value: 'token-plan' }] } },
  { key: 'configFormat', post: { configFormat: 'yaml' } },
  { key: 'configFileName', post: { configFileName: '.env' } },
];

/** The record keys a kind's table lists — `args` is stored as `commandArgs`, and so on. */
function listedRecordKeys(kind: EntityKind): string[] {
  return AGENT_KIND_FIELDS[kind]
    .filter((field) => field.store === undefined)
    .map((field) => field.key ?? field.name)
    .sort();
}

test('for every kind, the table lists exactly the record fields the real form save keeps', () => {
  // Both directions at once. A field listed that the form scrubs would let an agent set something
  // the next Save deletes; a field the form keeps that the table omits is a thing an agent can never
  // say — and the plan's own guess at this table had both kinds of mistake in it.
  const panel = form();

  for (const kind of ENTITY_KINDS) {
    const kept = UNIVERSE.filter(
      ({ key, post }) => panel.toValues(posted(kind, post), { entityId: 'e1' } as never).details[key] !== undefined,
    )
      .map(({ key }) => key)
      .sort();

    assert.deepEqual(listedRecordKeys(kind), kept, `${kind}: the table and the form disagree`);
  }
});

test('login and URL are kept for a credential alone, and notes for every kind', () => {
  // The two stores that are not the record. `newFields` is written for a credential and DELETED
  // for every other kind — the same scrubbing a config body gets — while notes survive any kind.
  // Payment is left out: the form keeps its notes too, but its list is empty by the owner's
  // decision (D-A), not by the form's rule.
  const panel = form();

  for (const kind of ENTITY_KINDS.filter((k) => AGENT_KINDS[k].notCreatable === undefined)) {
    const values = panel.toValues(
      posted(kind, { login: 'me', url: 'https://x.example', notes: 'a note' }),
      { entityId: 'e1' } as never,
    );
    const listsLogin = AGENT_KIND_FIELDS[kind].some((field) => field.store === 'fields');
    const listsNotes = AGENT_KIND_FIELDS[kind].some((field) => field.store === 'notes');

    assert.equal(values.newFields?.login !== undefined, listsLogin, `${kind}: login and URL`);
    assert.equal(values.newNotes === 'a note', listsNotes, `${kind}: notes`);
  }
});

test('every kind has an entry, and payment is the one an agent cannot create', () => {
  // The compile-time half is `Record<EntityKind, …>`; this is the runtime half, for a build that
  // casts. And D-A: a card number is not something an agent stores, decided by the owner.
  assert.deepEqual(Object.keys(AGENT_KINDS).sort(), [...ENTITY_KINDS].sort());
  for (const kind of ENTITY_KINDS) {
    const entry = AGENT_KINDS[kind];
    if (kind === 'payment') {
      assert.notEqual(entry.notCreatable, undefined, 'payment says why it cannot be created');
      assert.equal(entry.secret, undefined);
      assert.deepEqual(entry.fields, []);
    } else {
      assert.equal(entry.notCreatable, undefined, `${kind} is creatable`);
      assert.notEqual(entry.secret, undefined, `${kind} names the slot its secret goes to`);
    }
  }
  assert.deepEqual(
    agentKinds().map((k) => [k.kind, k.creatable]),
    ENTITY_KINDS.map((kind) => [kind, kind !== 'payment']),
  );
});

/**
 * O4. Not "forbidden" — ABSENT. An agent is told what it may set and nothing else, so the switches
 * are not a thing it learns the names of here. Every identifier below is one the record or the
 * folder carries and an agent must never be told about; the generic verbs are checked as field
 * NAMES only, since prose about creating an entry legitimately says "create".
 */
const WINDOW_OWNED = [
  'mcp',
  'mcpCreatedByAgent',
  'pinProtected',
  'pinEpoch',
  'pinAskOnImport',
  'notForExport',
  'expiresAt',
  'burnPolicy',
  'dependsOn',
  'depColor',
  'runDependencies',
  'jumpHostEntityId',
  'portForwards',
  'agentForward',
  'hostKey',
  'sshKeyEntityId',
  'vpnLauncherEntityId',
  'attachmentFileName',
  'imageFileName',
  'createdAt',
  'updatedAt',
  'envBindings',
  'passwordWoven',
  'passwordSecondOwn',
  'hasTotp',
  'totpShowNext',
  'hasMixedField',
  'configKeyHash',
  'sshAgent',
  'paymentForm',
  'folderCreate',
  'folderEdit',
  'folderDelete',
];

const GENERIC_VERBS = ['ask', 'view', 'use', 'edit', 'create', 'delete', 'consent'];

test('no agent-access switch or window-owned field is named by any answer', () => {
  const answers = [agentKinds(), ...ENTITY_KINDS.map((kind) => agentKindHelp(kind)), ...ENTITY_KINDS.map(folderFieldsFor)];
  const text = JSON.stringify(answers);
  const names = ENTITY_KINDS.flatMap((kind) => [
    ...agentKindHelp(kind).fields.map((field) => field.name),
    ...folderFieldsFor(kind).map((field) => field.name),
    ...Object.keys((agentKindHelp(kind).example?.fields as Record<string, unknown> | undefined) ?? {}),
  ]);

  for (const owned of [...WINDOW_OWNED, ...GENERIC_VERBS]) {
    assert.equal(names.includes(owned), false, `"${owned}" is offered as a field`);
  }
  for (const owned of WINDOW_OWNED.filter((word) => word.length > 3)) {
    assert.equal(text.includes(owned), false, `"${owned}" appears somewhere in an answer`);
  }
  assert.doesNotMatch(text, /\bmcp\b/, 'the switches are not mentioned even in passing');
  assert.ok(names.includes('command'), 'the fixture actually collected field names');
});

test('the help for a creatable kind carries every field, the secret as its own line, and a whole example', () => {
  for (const kind of ENTITY_KINDS.filter((k) => k !== 'payment')) {
    const help = agentKindHelp(kind);
    const own = AGENT_KIND_FIELDS[kind].map((field) => field.name);
    const example = help.example as { kind: string; fields: object };

    assert.equal(help.creatable, true);
    assert.deepEqual(help.fields.filter((f) => !f.secret).map((f) => f.name), own, kind);
    assert.deepEqual(help.fields.filter((f) => f.secret).map((f) => f.name), ['secret'], `${kind}: the secret is one line`);
    assert.deepEqual(Object.keys(example.fields).sort(), [...own].sort(), `${kind}: the example is complete`);
    assert.equal(example.kind, kind);
  }
  const payment = agentKindHelp('payment');
  assert.equal(payment.creatable, false);
  assert.match(String(payment.refusal), /cannot be created by an agent/);
  assert.equal(payment.example, undefined);
});

test('a typed folder is told the fields and the secret, with the secret kept out of `fields`', () => {
  const fields = folderFieldsFor('terminal');

  assert.deepEqual(
    fields.map((f) => [f.name, f.required]),
    [['command', true], ['args', false], ['commandNote', false], ['terminalOs', false], ['notes', false], ['secret', false]],
  );
  assert.match(fields[fields.length - 1].summary, /never inside fields/);
  assert.deepEqual(folderFieldsFor('payment'), []);
});

test('the refusal sentence names every field of the kind and marks the required ones', () => {
  assert.equal(
    allowedFieldsSentence('terminal'),
    'A terminal entry takes: command (required), args, commandNote, terminalOs, notes — see creds_kind_help.',
  );
  assert.equal(allowedFieldsSentence('payment'), 'A payment entry takes no fields.');
});
