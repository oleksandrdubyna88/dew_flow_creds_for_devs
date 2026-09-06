import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_ARTICLES, HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
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
  assert.equal(HELP_ARTICLES.length, 35, 'the count at the split — a drop here is an article lost');
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
