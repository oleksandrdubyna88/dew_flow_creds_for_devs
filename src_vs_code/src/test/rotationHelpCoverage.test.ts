import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpArticle, bodyFor, helpArticle } from '../helpContent';

/**
 * Every language explains a rotation that lands while its entry is being protected
 * (`research/PLAN_rotation_quarantine.md` §7): the tree's own words, which every translation keeps in
 * English because the row does, in the PIN article — and the agent surface says where such a value is.
 * `bodyFor` marks a MISSING translation, never a STALE one; this is the check for the stale one.
 */

/** The row's own words. */
const ROW = 'rotated password waiting';
/** The agent's word, as the answer says it. */
const WORD = 'quarantined';
/** The command's name — kept in English by every translation, as every command name is (the security review, finding 7b). */
const BURN = 'Burn Now…';

function article(id: string): HelpArticle {
  const found = helpArticle(id);
  assert.ok(found !== undefined, `there is no help article called ${id}`);
  return found;
}

for (const language of HELP_LANGUAGES) {
  test(`the ${language} help explains a rotated value waiting for the entry's PIN, and the agent surface names its word`, () => {
    const pin = bodyFor(article('entity-pin'), language);
    const agents = bodyFor(article('agent-surface'), language);

    assert.equal(pin.fallback, false, 'a real translation, not English standing in for one');
    assert.ok(pin.body.usage.includes(ROW), `the ${language} PIN article does not explain a waiting rotation — a stale translation reads as a complete one`);
    assert.ok(pin.body.usage.includes(BURN), `the ${language} PIN article does not name Burn Now among the permanent deletions that lose a waiting value`);
    assert.ok(agents.body.usage.includes(WORD), `the ${language} agent article does not say where a rotation refused by a PIN is`);
  });
}

test('the English PIN article says an agent cannot rotate a one-use entry at all, and what to do instead', () => {
  const { body } = bodyFor(article('entity-pin'), 'en');

  assert.match(body.usage, /An agent cannot rotate a one-use entry at all/);
  assert.match(body.usage, /taken off first/);
});

/**
 * The waiting value beside an entry WITHOUT a PIN (`research/PLAN_waiting_rotation_visible.md`): the sentence that says
 * its next use — a click or an agent's — stores it first, else the sweep within a minute, and that each time the
 * person is told. Translated, so each language is pinned by its own opening and its own "you are told"; a language
 * with no entry here fails rather than passing unchecked, so a sixth translation cannot slip past.
 */
const WAITING_WITHOUT_A_PIN: Readonly<Record<string, readonly [string, string]>> = {
  en: ['An entry without a PIN can have one waiting too', 'each time, you are told'],
  de: ['Auch ein Eintrag ohne PIN kann einen wartenden Wert haben', 'jedes Mal wird es Ihnen gesagt'],
  es: ['También una entrada sin PIN puede tener uno esperando', 'cada vez se le avisa'],
  ru: ['Ожидающее значение бывает и у записи без PIN-кода', 'каждый раз вам об этом сообщат'],
  uk: ['Значення, що чекає, буває й у запису без PIN-коду', 'щоразу вам про це повідомлять'],
};

for (const language of HELP_LANGUAGES) {
  test(`the ${language} help says a value waiting beside an entry WITHOUT a PIN goes in at its next use, and that the person is told`, () => {
    const pinned = WAITING_WITHOUT_A_PIN[language];
    assert.ok(pinned !== undefined, `the ${language} help has no pinned waiting-without-a-PIN sentence — add its fragments here`);
    const { body } = bodyFor(article('entity-pin'), language);

    for (const fragment of pinned) {
      assert.ok(body.usage.includes(fragment), `the ${language} PIN article does not say a waiting value beside an entry without a PIN is used and told — missing: "${fragment}"`);
    }
  });
}
