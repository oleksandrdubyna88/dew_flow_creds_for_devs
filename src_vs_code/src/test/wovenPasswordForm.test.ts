import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import { wovenFormScript } from '../wovenFormScript';
import { EntityFormOptions } from '../entityFormPanel';
import { EntityMetadata } from '../types';
import { SHUFFLE_CODES } from '../shuffle';
import { handleWovenPassword } from '../wovenPasswordHost';
import { weaveSecret } from '../wovenSecret';
import { automaticRefusal } from '../envApply';
import { EntityViewOptions, renderEntityViewHtml } from '../entityViewPage';

const viewOptions = (details: Partial<EntityMetadata>): EntityViewOptions =>
  ({
    details: { id: 'e1', name: 'x', kind: 'credential', isSshEnabled: false, ...details },
    hasPassword: true,
    hasPrivateKey: false,
    hasVpnConfig: false,
    hasDbConnection: false,
    dbPortIsDefault: false,
    dbHasPassword: false,
    hasAttachment: false,
    history: [],
    resolveSecret: async () => undefined,
    copyAllText: async () => '',
    saveVpnConfig: async () => {},
    saveAttachment: async () => {},
    setEnv: async () => true,
    checkEnv: () => {},
  }) as unknown as EntityViewOptions;

/**
 * The write side of a woven password: the controls that offer it, and the sentence General shows
 * once it is done and can no longer be undone.
 */

const options = (details?: Partial<EntityMetadata>): EntityFormOptions =>
  ({
    mode: 'create',
    entityId: 'e1',
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    jumpCandidates: [],
    dependencyFolders: [],
    dependencyColors: {},
    initial:
      details === undefined
        ? undefined
        : ({ id: 'e1', name: 'x', kind: 'credential', ...details } as unknown as EntityMetadata),
  }) as unknown as EntityFormOptions;

test('the Secret section offers weaving, with a method and a picture', () => {
  const html = renderHtml(options());

  assert.match(html, /id="weavePassword"/, 'the mark');
  assert.match(html, /id="weaveMethod"/, 'the method');
  assert.match(html, /id="weaveExampleHost"/, 'and what the method does, before it is irreversible');
  // Scoped to THIS select: the page carries the card's and the phrase's pickers as well.
  const picker = html.slice(html.indexOf('id="weaveMethod"'));
  const own = picker.slice(0, picker.indexOf('</select>'));
  assert.equal((own.match(/<option value="f\d+">/g) ?? []).length, SHUFFLE_CODES.length);
});

test('the form says what weaving does NOT buy, where the choice is made', () => {
  const html = renderHtml(options());

  assert.match(html, /never stored/, 'the method is kept nowhere');
  assert.match(html, /forgotten method is a lost/, 'and forgetting it loses the password');
  // The consequence the owner chose, said at the moment of choosing rather than discovered later.
  assert.match(html, /cannot be used automatically/);
});

test('General states a woven password as a fact, and offers no way to switch it off', () => {
  const woven = renderHtml(options({ passwordWoven: true }));
  const plain = renderHtml(options({}));

  assert.match(woven, /Woven — on/);
  assert.match(woven, /cannot be switched off/);
  assert.match(woven, /Replace the password/, 'and says what to do instead');
  assert.ok(!/Woven — on/.test(plain), 'an ordinary entry says nothing about it');
  // No control anywhere claims to undo it.
  assert.ok(!/id="unweave|id="clearWoven/.test(woven));
});

test('the picture is asked for per method, and a stale answer is dropped', () => {
  const script = wovenFormScript();

  assert.match(script, /type: 'weaveExample', field: 'password'/);
  assert.match(script, /answer\.method !== weaveMethodPick\.value/, 'a picture of a method nobody chose is worse than none');
  assert.match(script, /answer\.field !== 'password'/, 'and a card answer never lands here');
});

test('the controls stay hidden until the box is ticked', () => {
  const html = renderHtml(options());
  const script = wovenFormScript();

  assert.match(html, /id="weaveControls" style="display:none"/);
  assert.match(script, /weaveWrap\.style\.display = weaveBox\.checked/);
});

/**
 * The read side: the viewer's two-column row, and what a Show or a Copy on it is answered with.
 */
test('a woven password is READ through the two-column row, not shown as a dot', () => {
  const woven = renderEntityViewHtml(viewOptions({ passwordWoven: true }));
  const plain = renderEntityViewHtml(viewOptions({}));

  assert.match(woven, /data-woven-host=""/, 'the card script binds to this');
  assert.match(woven, /data-key="password"/);
  assert.match(woven, /id="payReading_password_a"/);
  // The script names the selector either way; what a plain entry must not have is an element.
  assert.ok(!/data-woven-host=""/.test(plain), 'an ordinary password keeps its one row');
  assert.match(plain, /data-field="password"/, 'and it is still copyable from there');
});

test('a Show is answered with the two readings, and NEITHER is marked', async () => {
  const posted: Record<string, unknown>[] = [];
  const stored = weaveSecret('hunter2!', SHUFFLE_CODES[3], () => 0.37);

  await handleWovenPassword('reassemble', `password|${SHUFFLE_CODES[3]}`, {
    entityId: () => 'e1',
    read: () => Promise.resolve(stored),
    post: (m) => posted.push(m as Record<string, unknown>),
    copy: () => Promise.resolve(),
  });

  assert.equal(posted.length, 1);
  const answer = posted[0];
  assert.equal(answer.ok, true);
  assert.equal(answer.words, false, 'a password is characters, not words');
  assert.equal(answer.entityId, 'e1', 'stamped, so an answer for another entry is droppable');
  // Nothing in the message says which row is the password.
  assert.ok(!/real|decoy/i.test(JSON.stringify(answer)));
});

test('a method this build has no name for is refused, and says nothing was changed', async () => {
  const posted: Record<string, unknown>[] = [];

  await handleWovenPassword('reassemble', 'password|f99', {
    entityId: () => 'e1',
    read: () => Promise.resolve('abcdef'),
    post: (m) => posted.push(m as Record<string, unknown>),
    copy: () => Promise.resolve(),
  });

  assert.equal(posted[0].ok, false);
  assert.match(String(posted[0].why), /Nothing has been changed/);
});

test('a message that is not the password is not this host business', async () => {
  const taken = await handleWovenPassword('reassemble', 'cvv|f1', {
    entityId: () => 'e1',
    read: () => Promise.resolve('abcd'),
    post: () => undefined,
    copy: () => Promise.resolve(),
  });

  assert.equal(taken, false, 'the payment host owns that one');
});

/**
 * The automatic paths refuse, and say why. The owner's decision: nothing here — this build
 * included — knows which of the two halves is the password, so an environment variable or a
 * terminal could only ever be handed a guess.
 */
test('a woven password is withheld from the automatic paths, with a sentence', () => {
  const woven = { id: 'e1', name: 'prod-db', kind: 'credential', passwordWoven: true } as unknown as EntityMetadata;
  const plain = { id: 'e1', name: 'prod-db', kind: 'credential' } as unknown as EntityMetadata;

  const refusal = automaticRefusal(woven, 'password');
  assert.match(refusal, /cannot be used automatically/);
  assert.match(refusal, /prod-db/, 'it names the entry');
  assert.match(refusal, /pick your method/, 'and says what to do instead');
  assert.equal(automaticRefusal(plain, 'password'), '', 'an ordinary password is handed over as before');
});

test('only the PASSWORD is withheld — the other bindable fields are not woven', () => {
  const woven = { id: 'e1', name: 'x', kind: 'credential', passwordWoven: true } as unknown as EntityMetadata;

  for (const field of ['privateKey', 'publicKey', 'dbConnection', 'dbPassword'] as const) {
    assert.equal(automaticRefusal(woven, field), '', `${field} has nothing to do with a woven password`);
  }
});
