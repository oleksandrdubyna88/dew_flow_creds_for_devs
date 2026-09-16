import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import { wovenFormScript } from '../wovenFormScript';
import { cardFormScript } from '../cardFormScript';
import { phraseFormScript } from '../phraseFormScript';
import { formPageScript } from '../entityFormScript';
import {
  SECOND_COLUMN_LABEL,
  WEAVE_EXAMPLE_STYLES,
  weaveExamplePainterScript,
} from '../weaveExampleScript';
import { formStyleSheet } from '../entityFormStyles';
import { entityViewStyles } from '../entityViewStyles';
import { MiniDocument, runFragment } from './miniDom';
import { EntityFormOptions } from '../entityFormPanel';
import { EntityMetadata } from '../types';
import { SHUFFLE_CODES } from '../shuffle';
import { handleWovenPassword } from '../wovenPasswordHost';
import { weaveSecret } from '../wovenSecret';
import { automaticRefusal } from '../envApply';
import { wovenSave } from '../wovenPasswordSave';
import { shareableDetails } from '../shareFormat';
import { EntityViewOptions, renderEntityViewHtml } from '../entityViewPage';
import { RowOrderStore } from '../rowFlip';

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

test('General states a woven password as a fact, and is exact about what cannot be undone', () => {
  const woven = renderHtml(options({ passwordWoven: true }));
  const plain = renderHtml(options({}));

  assert.match(woven, /Woven — on/);
  // Exact, because a reviewer was right that the earlier wording was not: what cannot be undone is
  // UNWEAVING the stored value. Replacing it is always possible, and is a different act.
  assert.match(woven, /stored value cannot be unwoven/);
  assert.match(woven, /REPLACE it/, 'and says what can be done instead');
  assert.ok(!/Woven — on/.test(plain), 'an ordinary entry says nothing about it');
  assert.ok(!/id="unweave|id="clearWoven/.test(woven), 'no control claims to undo it');
});

test('replacing a woven password keeps it woven by DEFAULT, and unticking is deliberate', () => {
  // The finding this exists for: a person opening a woven entry and pasting a new password left
  // the mark unset, and the save silently dropped the protection while General promised otherwise.
  const woven = renderHtml(options({ passwordWoven: true }));
  const plain = renderHtml(options({}));

  assert.match(woven, /id="weavePassword" type="checkbox" checked/, 'ticked for an entry that has it');
  assert.match(woven, /id="weaveControls" style="display:"/, 'and its method is on screen, not hidden');
  assert.match(plain, /id="weavePassword" type="checkbox">/, 'and unticked for one that does not');
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
    orders: new RowOrderStore(() => 0.1),
  });

  assert.equal(posted.length, 1);
  const answer = posted[0];
  assert.equal(answer.ok, true);
  assert.equal(answer.words, false, 'a password is characters, not words');
  assert.equal(answer.entityId, 'e1', 'stamped, so an answer for another entry is droppable');
  // Nothing in the message says which row is the password.
  assert.ok(!/real|decoy/i.test(JSON.stringify(answer)));
});

/**
 * The same defect on the password's own path, which never passes through the card's host.
 *
 * <p>`weaveSecret` weaves the password as the first column and `unweaveSecret` gives it back as
 * `first`, so row one was the password under every correct method. Both of these fail against that
 * build.</p>
 */
test('a woven password’s first row is not always the password', async () => {
  const posted: Record<string, unknown>[] = [];
  const stored = weaveSecret('hunter2!', SHUFFLE_CODES[3], () => 0.37);
  const asRead: Record<string, unknown>[] = [];

  await handleWovenPassword('reassemble', `password|${SHUFFLE_CODES[3]}`, {
    entityId: () => 'e1',
    read: () => Promise.resolve(stored),
    post: (m) => asRead.push(m as Record<string, unknown>),
    copy: () => Promise.resolve(),
    orders: new RowOrderStore(() => 0.1),
  });
  await handleWovenPassword('reassemble', `password|${SHUFFLE_CODES[3]}`, {
    entityId: () => 'e1',
    read: () => Promise.resolve(stored),
    post: (m) => posted.push(m as Record<string, unknown>),
    copy: () => Promise.resolve(),
    orders: new RowOrderStore(() => 0.9),
  });

  assert.deepEqual(asRead[0].first, [...'hunter2!'], 'one order puts the password in row one');
  assert.deepEqual(posted[0].second, [...'hunter2!'], 'and the other puts it in row two');
  assert.notDeepEqual(asRead[0].first, posted[0].first, 'which is the whole of the change');
});

test('a Copy of a woven password’s row follows the order the rows were shown in', async () => {
  const copied: string[] = [];
  const posted: Record<string, unknown>[] = [];
  const stored = weaveSecret('hunter2!', SHUFFLE_CODES[3], () => 0.37);
  // ONE store across the Show and the Copy, which is what the panel hands both calls.
  const orders = new RowOrderStore(() => 0.9);
  const deps = {
    entityId: () => 'e1',
    read: () => Promise.resolve(stored),
    post: (m: unknown) => posted.push(m as Record<string, unknown>),
    copy: (t: string) => { copied.push(t); return Promise.resolve(); },
    orders,
  };

  await handleWovenPassword('reassemble', `password|${SHUFFLE_CODES[3]}`, deps);
  await handleWovenPassword('copyReading', `password|a|${SHUFFLE_CODES[3]}`, deps);

  assert.equal(copied.length, 1);
  assert.equal(copied[0], (posted[0].first as string[]).join(''), 'the clipboard is the row on screen');
  assert.notEqual(copied[0], 'hunter2!', 'which under this order is not the password');
});

/**
 * The narrow window a code round found: the panel re-renders WHILE the keychain is answering.
 *
 * <p>`show()` clears the store, so an order read after the await would be a fresh draw — and the
 * Copy would hand over the row this page is not showing. The order is sampled before the read, next
 * to the entity id, which is sampled before the read for the very same reason.</p>
 */
test('a Copy that arrives as the panel re-renders still follows the order the rows were shown in', async () => {
  const copied: string[] = [];
  const stored = weaveSecret('hunter2!', SHUFFLE_CODES[3], () => 0.37);
  // SCRIPTED: swapped first, as-read after the clear. A store whose random always answers the same
  // would redraw to the same order and this test would pass against the bug it exists for.
  const draws = [0.9, 0.1];
  let at = 0;
  const orders = new RowOrderStore(() => draws[Math.min(at++, draws.length - 1)] ?? 0);
  let release = (): void => undefined;
  const held = new Promise<string>((resolve) => {
    release = (): void => resolve(stored);
  });
  const deps = (read: () => Thenable<string | undefined>) => ({
    entityId: () => 'e1',
    read,
    post: () => undefined,
    copy: (t: string) => { copied.push(t); return Promise.resolve(); },
    orders,
  });

  // The rows are SHOWN first — that is what puts an order in the store for the copy to follow.
  await handleWovenPassword('reassemble', `password|${SHUFFLE_CODES[3]}`, deps(() => Promise.resolve(stored)));
  const answered = handleWovenPassword('copyReading', `password|a|${SHUFFLE_CODES[3]}`, deps(() => held));
  // The panel loads another entry mid-read — exactly what the shared preview tab does on a click.
  orders.clear();
  release();
  await answered;

  assert.equal(copied.length, 1);
  // The order in force when the rows were drawn was `swapped`, so row a held the other reading.
  // Reading the order after the clear would have drawn `as-read` and copied the password instead —
  // the row the person did not point at.
  assert.notEqual(copied[0], 'hunter2!', 'the copy followed the order the rows were shown in');
  assert.equal(at, 1, 'and exactly one draw happened: the clear did not cause a second');
});

test('a method this build has no name for is refused, and says nothing was changed', async () => {
  const posted: Record<string, unknown>[] = [];

  await handleWovenPassword('reassemble', 'password|f99', {
    entityId: () => 'e1',
    read: () => Promise.resolve('abcdef'),
    post: (m) => posted.push(m as Record<string, unknown>),
    copy: () => Promise.resolve(),
    orders: new RowOrderStore(() => 0.1),
  });

  assert.equal(posted[0].ok, false);
  assert.match(String(posted[0].why), /Nothing has been changed/);
});

test('the answer is stamped with the entry that ASKED, not the one on screen when it returns', async () => {
  // A reviewer's finding, and it was right. The preview tab is shared: a Show on entry A, then a
  // click on entry B while the keychain is still answering, and the id was sampled AFTER the await
  // — so A's password arrived stamped as B's, which is the one stamp the page trusts. Sampling
  // first makes a late answer droppable instead of making it look current.
  const posted: Record<string, unknown>[] = [];
  let onScreen = 'a';
  let release = (): void => undefined;
  const held = new Promise<string>((resolve) => {
    release = (): void => resolve(weaveSecret('hunter2!', SHUFFLE_CODES[3], () => 0.37));
  });

  const answered = handleWovenPassword('reassemble', `password|${SHUFFLE_CODES[3]}`, {
    entityId: () => onScreen,
    read: () => held,
    post: (m) => posted.push(m as Record<string, unknown>),
    copy: () => Promise.resolve(),
    orders: new RowOrderStore(() => 0.1),
  });
  onScreen = 'b'; // the person clicked another entry while the read was in flight
  release();
  await answered;

  assert.equal(posted[0].entityId, 'a', 'A password stamped as B is a password shown on B');
});

test('a copy is stamped the same way, for the same reason', async () => {
  const copied: string[] = [];
  const posted: Record<string, unknown>[] = [];
  let onScreen = 'a';
  let release = (): void => undefined;
  const held = new Promise<string>((resolve) => {
    release = (): void => resolve(weaveSecret('hunter2!', SHUFFLE_CODES[3], () => 0.37));
  });

  const answered = handleWovenPassword('copyReading', `password|a|${SHUFFLE_CODES[3]}`, {
    entityId: () => onScreen,
    read: () => held,
    post: (m) => posted.push(m as Record<string, unknown>),
    copy: (t) => { copied.push(t); return Promise.resolve(); },
    orders: new RowOrderStore(() => 0.1),
  });
  onScreen = 'b';
  release();
  await answered;

  assert.equal(copied.length, 1);
  assert.equal(posted[0].entityId, 'a', 'the acknowledgement belongs to the entry that asked');
});

test('a message that is not the password is not this host business', async () => {
  const taken = await handleWovenPassword('reassemble', 'cvv|f1', {
    entityId: () => 'e1',
    read: () => Promise.resolve('abcd'),
    post: () => undefined,
    copy: () => Promise.resolve(),
    orders: new RowOrderStore(() => 0.1),
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

/**
 * §1.5 — a woven password must not make the whole entry immutable, which a reviewer raised and
 * which is where the card's own answer would have been wrong.
 */
test('a credential with a woven password still OPENS, with every other field editable', () => {
  // The payment guard refuses a woven RECORD, and a payment record is only its fields, so refusing
  // the form costs little there. A credential carries a login, a URL, notes, env bindings,
  // dependencies and agent doors — making all of that immutable would be worse than the defect the
  // guard prevents.
  const html = renderHtml(options({ passwordWoven: true }));

  assert.match(html, /id="name"/, 'the name is editable');
  assert.match(html, /id="password"/, 'and the box for a NEW password is there');
  // The real guarantee: the boxes are there. A blunt search for the word 'refuse' catches the
  // page's own prose about other things.
  assert.match(html, /id="login"/, 'the credential fields are editable');
  assert.ok(!html.includes('mixedEditRefusal'), 'and no guard stands in front of the form');
});

test('typing nothing leaves a woven password exactly as it was', () => {
  // The other half of the same guarantee: the entry is editable AND the secret is untouched by an
  // edit that did not mean to touch it.
  const saved = wovenSave('', false, '', true, () => 0.5);

  assert.equal(saved.value, '', 'nothing is written');
  assert.equal(saved.woven, true, 'and the entry goes on saying what it is');
});

/**
 * A reviewer's finding, and its true half: a share carries the woven STRING, so the recipient must
 * be told it is woven — otherwise they open an entry whose password is unreadable gibberish with
 * nothing on screen explaining why.
 *
 * <p>The half of that finding this does NOT accept is the claim that an exported woven value lets
 * an attacker separate the halves offline. Separating them is exactly what the twelve methods
 * prevent, and the honest measure of what that is worth is already written in the help: about one
 * bit against a checksummed phrase and four to five without. An export is encrypted besides.</p>
 */
test('a share tells the recipient the password is woven', () => {
  const details = { id: 'e1', name: 'x', kind: 'credential', passwordWoven: true, hasPassword: true } as unknown as EntityMetadata;

  const shared = shareableDetails(details, false);

  assert.equal(shared?.passwordWoven, true, 'or they get gibberish with no explanation');
});

/**
 * One painter, and the password picture inside the box that carries the colours (#51).
 *
 * <p>Every colour rule on this page is scoped under `.weaveEx` (`entityFormStyles.ts`). The card
 * painter created that block; the password painter appended three bare columns into a host with no
 * class, so the screenshot in the issue is three grey unboxed lines under the controls. Two copies
 * of one picture, one of them inside the box and one outside — which is the whole reason there is
 * now a shared painter and no copy at all.</p>
 *
 * <p>The fragment is inlined ONCE, ahead of the three sub-scripts. A sub-script that forgot it
 * would throw at the first method pick, so both halves are asserted: exactly one definition in the
 * composite, and every sub-script reaching for it.</p>
 */
test('the picture has ONE painter, defined once in the page script', () => {
  const composite = formPageScript('n1', undefined);

  assert.equal(
    (composite.match(/function paintExample\(/g) ?? []).length,
    1,
    'one definition — two would be the state this fixes, in a new shape',
  );
  assert.equal((composite.match(/function exampleBlock\(/g) ?? []).length, 1);
  assert.equal((composite.match(/function exampleColumn\(/g) ?? []).length, 1);
  assert.match(composite, /className = 'weaveEx'/, 'and the block the colours hang on is made here');
});

test('no sub-script defines a painter of its own, and each one calls the shared painter', () => {
  for (const [name, script] of [
    ['card', cardFormScript()],
    ['woven', wovenFormScript()],
    ['phrase', phraseFormScript()],
  ] as const) {
    assert.ok(!/function exampleColumn\(|function weaveColumn\(/.test(script), `${name} still defines a column painter`);
    assert.match(script, /paintExample\(/, `${name} never calls the shared painter`);
  }
});

test('the password picture is painted into a .weaveEx block, which is what colours it', () => {
  const script = wovenFormScript();

  // Whitespace-tolerant: the assertion is about which host and which field, not about where the
  // generated call happens to wrap.
  assert.match(script, /paintExample\(\s*'weaveExampleHost',\s*'password'/);
  assert.ok(!/host\.appendChild\(weaveColumn/.test(script), 'the classless three-column append is gone');
});

/**
 * The painter asserted by what it MAKES, not by what its source says.
 *
 * <p>The gate's own finding, and it is the sharpest one in the round: a shared `paintExample` can be
 * called with the right host and the right field and still emit a block without the `.weaveEx`
 * ancestor or without the token classes — and every string assertion above would pass while the
 * password example stayed grey. That is precisely how issue #51 survived a test suite. So this runs
 * the fragment against `miniDom` and reads the tree that comes out.</p>
 */
const painterOf = (document: MiniDocument) =>
  runFragment(weaveExamplePainterScript(), document, ['paintExample', 'exampleBlock']);

const answerOf = () => ({
  first: ['a', 'b'],
  second: ['c', 'd'],
  woven: [
    { text: 'a', side: 'first' },
    { text: 'c', side: 'second' },
    { text: 'b', side: 'first' },
    { text: 'd', side: 'second' },
  ],
});

test('painting the password example makes a .weaveEx block with coloured tokens in it', () => {
  const document = new MiniDocument();
  document.place('weaveExampleHost');

  painterOf(document).paintExample(
    'weaveExampleHost' as never,
    'password' as never,
    'Password — f1' as never,
    answerOf() as never,
    'Your password (made up here)' as never,
  );

  const block = document.querySelector('.weaveEx[data-field="password"]');
  assert.ok(block !== null, 'no .weaveEx block — this is issue #51 exactly');
  assert.equal(block.parent?.id, 'weaveExampleHost', 'and it is inside the password host');
  assert.ok(block.querySelector('.exTok.first') !== null, 'the green half');
  assert.ok(block.querySelector('.exTok.second') !== null, 'the orange half');
  assert.match(block.textContent, /Password — f1/, 'and it is titled');
  assert.match(block.textContent, /Your password \(made up here\)/, 'with the column label the caller chose');
});

test('the card example paints into its own host, under the same rules', () => {
  const document = new MiniDocument();
  document.place('mixExample');

  painterOf(document).paintExample(
    'mixExample' as never,
    'iban' as never,
    'IBAN — f1' as never,
    answerOf() as never,
  );

  const block = document.querySelector('.weaveEx[data-field="iban"]');
  assert.ok(block !== null, 'a bank field is painted by the same painter');
  assert.ok(block.querySelector('.exTok.first') !== null);
  assert.match(block.textContent, /Your value \(made up here\)/, 'and falls back to the shared column label');
});

test('repainting the same field reuses its block and replaces what was in it', () => {
  const document = new MiniDocument();
  document.place('mixExample');
  const painter = painterOf(document);

  painter.paintExample('mixExample' as never, 'cvv' as never, 'CVV — f1' as never, answerOf() as never);
  painter.paintExample('mixExample' as never, 'cvv' as never, 'CVV — f9' as never, answerOf() as never);

  const shown = document.querySelector('.weaveEx')?.textContent ?? '';
  assert.equal(document.querySelectorAll('.weaveEx').length, 1, 'one block per field, not one per answer');
  assert.match(shown, /CVV — f9/);
  assert.ok(!/CVV — f1/.test(shown), 'the old answer is gone');
});

test('a host that is not on this form is silence, not a thrown page script', () => {
  // Every form kind runs the one composite script, so a painter called for a host this page does not
  // have must do nothing at all. A throw here kills the whole script and with it the Save button.
  const document = new MiniDocument();

  assert.doesNotThrow(() => {
    painterOf(document).paintExample('mixExample' as never, 'cvv' as never, 't' as never, answerOf() as never);
  });
  assert.equal(document.querySelectorAll('.weaveEx').length, 0);
});

/**
 * The second column's caption belongs to the CALLER, because the viewer has to replace it.
 *
 * <p>The form's picture is drawn on two values the host made up, so "The decoy it is woven with" is
 * true there. The viewer draws the same picture over the two rows of a real reading, which it
 * refuses to tell apart — printing "decoy" over one of them would answer, in a caption, the one
 * question the whole row design exists not to answer.</p>
 */
test('the second column is captioned by the caller when it says so, and as the form’s decoy when it does not', () => {
  const document = new MiniDocument();
  document.place('weaveExampleHost');
  document.place('mixExample');

  painterOf(document).paintExample(
    'weaveExampleHost' as never,
    'password' as never,
    'Method 1' as never,
    answerOf() as never,
    'First row' as never,
    'Second row' as never,
  );
  painterOf(document).paintExample(
    'mixExample' as never,
    'cvv' as never,
    'Method 1' as never,
    answerOf() as never,
  );

  const chosen = document.querySelector('.weaveEx[data-field="password"]');
  const defaulted = document.querySelector('.weaveEx[data-field="cvv"]');
  assert.ok(chosen !== null && defaulted !== null, 'both blocks were painted');
  assert.match(chosen.textContent, /Second row/, 'the caller’s caption is used');
  assert.ok(
    !new RegExp(SECOND_COLUMN_LABEL).test(chosen.textContent),
    'and the word decoy never appears over a row the viewer will not tell apart',
  );
  assert.match(
    defaulted.textContent,
    new RegExp(SECOND_COLUMN_LABEL),
    'a caller that says nothing still gets the form’s sentence, unchanged',
  );
});

/**
 * An EMPTY caption is a caller saying "no heading", not a caller saying nothing.
 *
 * <p>Found by the code round. `||` cannot tell those apart, so a blank caption printed "The decoy it
 * is woven with" — the exact sentence this parameter exists to keep off the viewer's screen, arriving
 * by the one route nobody would test. Only an absent caption may fall back.</p>
 */
test('an empty caption leaves the column unheaded — it never falls back to the word decoy', () => {
  const document = new MiniDocument();
  document.place('weaveExampleHost');

  painterOf(document).paintExample(
    'weaveExampleHost' as never,
    'password' as never,
    'Method 1' as never,
    answerOf() as never,
    'First row' as never,
    '' as never,
  );

  const block = document.querySelector('.weaveEx[data-field="password"]');
  assert.ok(block !== null, 'the block was painted');
  assert.ok(
    !new RegExp(SECOND_COLUMN_LABEL).test(block.textContent),
    'a blank caption must not be answered with the decoy sentence',
  );
});

/**
 * One definition of the colours, reaching both sheets.
 *
 * <p>No behaviour changes here — the rules are the same bytes in the same places on screen. What
 * changes is that there is one copy of them. Issue #51 was two painters and one set of rules; two
 * sets of rules and one painter is the same defect wearing the other hat.</p>
 */
test('the picture’s colours are defined once and reach both stylesheets', () => {
  const form = formStyleSheet(1);
  // The VIEWER'S OWN sheet, not the card fragment it happens to be assembled from. Asserting
  // paymentCardStyles() here would keep passing on the day somebody made that inclusion
  // conditional, and the picture would lose every colour for a woven password — which is not a
  // payment record at all. (Code review, S1.)
  const viewer = entityViewStyles(1);

  assert.ok(form.includes(WEAVE_EXAMPLE_STYLES), 'the form draws the picture with the shared rules');
  assert.ok(viewer.includes(WEAVE_EXAMPLE_STYLES), 'and the viewer’s sheet carries them too');
  for (const [name, sheet] of [['form', form], ['viewer', viewer]] as const) {
    assert.equal(
      sheet.split('.weaveEx .exTok.first').length - 1,
      1,
      `the ${name} sheet carries the token colour exactly once — twice means a copy came back`,
    );
  }
});
