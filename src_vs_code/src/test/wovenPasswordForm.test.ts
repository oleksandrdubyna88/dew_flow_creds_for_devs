import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import { wovenFormScript } from '../wovenFormScript';
import { EntityFormOptions } from '../entityFormPanel';
import { EntityMetadata } from '../types';
import { SHUFFLE_CODES } from '../shuffle';

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
