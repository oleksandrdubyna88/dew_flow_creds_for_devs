import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_ARTICLES, HELP_LANGUAGES, HelpArticle, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
import { HELP_ARTICLE_IDS } from '../helpOrder';
import { EN_BODIES } from '../helpEn';
import { RU_BODIES } from '../helpRu';
import { UK_BODIES } from '../helpUk';
import { DE_BODIES } from '../helpDe';
import { ES_BODIES } from '../helpEs';

/**
 * The catalog after the split, and the failure the split made possible.
 *
 * <p>The bodies used to sit inside `helpContent.ts` with the article that owned them, so an article
 * could not lose its text by accident — there was nowhere for the text to go. Now the id list, the
 * order and five body maps are separate files, and an id that stops matching between them drops an
 * article out of the help with nothing to notice. That is what these hold.</p>
 *
 * <p>The move itself was done through the compiled objects rather than by editing prose by hand,
 * for the same reason: 765 lines of paragraphs relocated by a human is a paragraph lost.</p>
 */

const MAPS: Readonly<Record<HelpLanguage, Readonly<Record<string, unknown>>>> = {
  en: EN_BODIES,
  ru: RU_BODIES,
  uk: UK_BODIES,
  de: DE_BODIES,
  es: ES_BODIES,
};

test('every id in the order has an English body, and every English body is in the order', () => {
  const ordered = new Set(HELP_ARTICLE_IDS);
  const written = new Set(Object.keys(EN_BODIES));

  const orphanIds = [...ordered].filter((id) => !written.has(id));
  const orphanBodies = [...written].filter((id) => !ordered.has(id));

  assert.deepEqual(orphanIds, [], 'an id with no English body is an article nobody can read');
  assert.deepEqual(orphanBodies, [], 'a body with no id is an article nobody can reach');
});

test('the catalog kept every article the split found, in the order it documents', () => {
  // 35 at the split, and one per article added since — epic 4's event log is the thirty-sixth and
  // epic 5's server backup the thirty-seventh.
  assert.equal(HELP_ARTICLES.length, 37, 'a drop here is an article lost');
  assert.deepEqual(
    HELP_ARTICLES.map((a) => a.id),
    [...HELP_ARTICLE_IDS],
    'the index order is deliberate and not alphabetical; it comes from helpOrder.ts',
  );
  assert.equal(new Set(HELP_ARTICLE_IDS).size, HELP_ARTICLE_IDS.length, 'ids are unique');
});

test('a translated article reaches the reader, and an untranslated one falls back VISIBLY', () => {
  const article = helpArticle('getting-started');
  assert.notEqual(article, undefined, 'the first article of the catalog is reachable by id');

  const russian = bodyFor(article!, 'ru');
  assert.equal(russian.fallback, false, 'Russian is complete and must not be reported as a fallback');
  assert.notEqual(russian.body.title, article!.en.title, 'and it is the Russian text, not the English');

  for (const language of HELP_LANGUAGES) {
    const shown = bodyFor(article!, language);
    assert.equal(
      shown.fallback,
      MAPS[language][article!.id] === undefined,
      `${language}: a fallback must be reported exactly when there is no body for it`,
    );
  }
});

/**
 * Every language map is keyed by an id the catalog knows.
 *
 * <p>A typo in a key is the quiet failure of this arrangement: the article keeps working, in
 * English, for ever, and nothing says why. Cheap to refuse, and it only gets cheaper as the three
 * empty maps fill.</p>
 */
test('no language map carries a body for an article that does not exist', () => {
  const known = new Set(HELP_ARTICLE_IDS);
  for (const language of HELP_LANGUAGES) {
    const strays = Object.keys(MAPS[language]).filter((id) => !known.has(id));
    assert.deepEqual(strays, [], `${language} has bodies for ids the catalog does not have`);
  }
});

const FIELDS = ['title', 'whatItIs', 'why', 'setup', 'usage', 'whatCanGoWrong'] as const;

/** One body, whole — the shape IS the style, and half an article is worse than none. */
function assertWhole(where: string, body: unknown): void {
  for (const field of FIELDS) {
    const text = (body as Record<string, unknown>)[field];
    assert.equal(
      typeof text === 'string' && text.length > 0,
      true,
      `${where}: ${field} is missing — an article that skips a section is not this catalog's shape`,
    );
  }
}

test('every body that exists fills all six fields', () => {
  for (const language of HELP_LANGUAGES) {
    for (const [id, body] of Object.entries(MAPS[language])) {
      assertWhole(`${language}/${id}`, body);
    }
  }
});

/**
 * The fallback, checked on a gap that cannot be translated away.
 *
 * <p>This was written while uk, de and es were partial, and it FOUND the gap in the catalog to
 * check against — which meant it went red the day the last article was translated, on the guard
 * that a gap must exist. That is the same rot as the `mcp-logs` test it sat beside: a test that
 * fails when the work it is about succeeds. What must hold is a property of `bodyFor`, not a fact
 * about how far the translations have got, so the gap is now CONSTRUCTED.</p>
 */
test('a language with no body for an article falls back to the English TEXT, not to nothing', () => {
  const article = helpArticle(HELP_ARTICLE_IDS[0])!;
  const withoutGerman: HelpArticle = { id: article.id, en: article.en, mediaSlots: [] };

  const shown = bodyFor(withoutGerman, 'de');

  assert.equal(shown.fallback, true, 'and it says so, visibly');
  assert.equal(shown.body, withoutGerman.en, 'the English body itself, not a copy and not an empty one');
  assert.ok(shown.body.title.length > 0, 'with text in it');
  assert.ok(shown.body.whatCanGoWrong.length > 0, 'all six fields, not just the first');
});

/**
 * Where the translations have actually got to — a fact about the catalog, written as a number.
 *
 * <p>Not a duplicate of the fallback test above: that one is about the RULE, this one is about the
 * DATA, and they fail for opposite reasons. A language that loses an article — a key renamed on one
 * side of the split, a batch regenerated from a stale file — goes on working, in English, for ever,
 * and nothing says why. This is what says why.</p>
 */
test('every declared language carries every article', () => {
  for (const language of HELP_LANGUAGES) {
    const missing = HELP_ARTICLE_IDS.filter((id) => MAPS[language][id] === undefined);
    assert.deepEqual(missing, [], `${language} is missing ${missing.length} of ${HELP_ARTICLE_IDS.length}`);
  }
});

/**
 * Issue #55 — the entry PIN's rule is stated in every language, and it is the SAME rule.
 *
 * <p>A stale translation is invisible to the checks above: `bodyFor` marks a MISSING body, never one
 * that still describes the previous rule, and the coverage test reads only the English. So the one
 * sentence that changed is asserted per language, in that language's own words. The map is keyed by
 * `HelpLanguage`, so adding a language without deciding how it says "four characters" does not
 * compile — the check cannot be forgotten, only answered.</p>
 */
const FOUR_CHARACTER_FLOOR: Readonly<Record<HelpLanguage, RegExp>> = {
  en: /at least four characters/i,
  ru: /не меньше четырёх символов/i,
  uk: /щонайменше чотири символи/i,
  de: /mindestens vier Zeichen/i,
  es: /al menos cuatro caracteres/i,
};

test('every language states the entry PIN’s four-character floor, in its own words', () => {
  const article = helpArticle('entity-pin');
  assert.ok(article !== undefined, 'the entity-pin article exists');
  for (const language of HELP_LANGUAGES) {
    const { body, fallback } = bodyFor(article, language);
    assert.equal(fallback, false, `${language}: entity-pin is not translated`);
    assert.match(
      body.setup,
      FOUR_CHARACTER_FLOOR[language],
      `${language}: the setup text does not state the four-character floor`,
    );
  }
});
