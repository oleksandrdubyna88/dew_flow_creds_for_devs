import { HELP_ARTICLE_IDS } from './helpOrder';
import { EN_BODIES } from './helpEn';
import { RU_BODIES } from './helpRu';
import { UK_BODIES } from './helpUk';
import { DE_BODIES } from './helpDe';
import { ES_BODIES } from './helpEs';

/**
 * The help catalog (tails T21): every article, in the one fixed shape the owner asked for —
 * what it is → why → how to set it up → how to use it → what can go wrong.
 *
 * <p>The TYPE enforces the style: an article that skips *why* does not compile. The index order
 * is explicit and deliberately not alphabetical — <b>the less guessable a feature is from its
 * menu entry, the earlier it goes</b> (the owner's own examples led: what are *MCP logs*? what
 * does *Install…* install?). Media slots exist and are empty, so the later picture pass is a
 * content edit, not a schema change.</p>
 *
 * <p><b>Languages.</b> English is required on every article; the rest are optional and fall back
 * VISIBLY ("not translated yet — showing English") — a missing translation must never hide an
 * article. As of 2026-09-06 all five are COMPLETE, all 35 articles each, which makes the fallback a
 * rule with nothing currently exercising it: `helpCatalog.test.ts` therefore checks it against a
 * gap it CONSTRUCTS, and checks the completeness separately, because the two fail for opposite
 * reasons and a test that needs a gap to exist goes red the day the last article is translated.</p>
 *
 * <p><b>Split by language, 2026-09-06.</b> This file held the schema AND all the prose, and reached
 * 765 lines against an 800-line ceiling with two languages in it — for a catalog meant to carry
 * five. The bodies now live one file per language, keyed by article id; this file is the schema,
 * the assembly and the fallback rule. The move went through the COMPILED objects rather than by
 * hand, because relocating a thousand lines of prose by editing is a way to lose a paragraph
 * silently, and `helpCatalog.test.ts` holds what the arrangement made newly possible: an id that
 * stops matching between the order and a body map drops an article out of the help with nothing
 * to notice.</p>
 */

export const HELP_LANGUAGES = ['en', 'ru', 'uk', 'de', 'es'] as const;
export type HelpLanguage = (typeof HELP_LANGUAGES)[number];

export const HELP_LANGUAGE_LABELS: Readonly<Record<HelpLanguage, string>> = {
  en: 'English',
  ru: 'Русский',
  uk: 'Українська',
  de: 'Deutsch',
  es: 'Español',
};

/** One article's text in one language. Every field required — the style IS the schema. */
export interface HelpBody {
  readonly title: string;
  readonly whatItIs: string;
  readonly why: string;
  readonly setup: string;
  readonly usage: string;
  readonly whatCanGoWrong: string;
}

export interface HelpArticle {
  readonly id: string;
  /** English is the floor; the rest appear as they are translated. */
  readonly en: HelpBody;
  readonly ru?: HelpBody;
  readonly uk?: HelpBody;
  readonly de?: HelpBody;
  readonly es?: HelpBody;
  /** Reserved for the picture pass — file names under media/help/, none shipped yet. */
  readonly mediaSlots: readonly string[];
}

/** The article as shown: the asked language, or English with a visible note. */
export function bodyFor(
  article: HelpArticle,
  language: HelpLanguage,
): { body: HelpBody; fallback: boolean } {
  const body = article[language];
  return body === undefined ? { body: article.en, fallback: language !== 'en' } : { body, fallback: false };
}

/** Every language's bodies, so assembly is a loop rather than five hand-written lines. */
const BODIES: Readonly<Record<HelpLanguage, Readonly<Record<string, HelpBody>>>> = {
  en: EN_BODIES,
  ru: RU_BODIES,
  uk: UK_BODIES,
  de: DE_BODIES,
  es: ES_BODIES,
};

/**
 * The catalog, assembled in the documented order.
 *
 * <p>An id with no English body would be an article nobody can read, so it is dropped here rather
 * than shipped half-present — and the test asserts that never happens, because dropping one
 * silently is the failure this arrangement could introduce that the single file could not.</p>
 */
export const HELP_ARTICLES: readonly HelpArticle[] = HELP_ARTICLE_IDS.flatMap((id) => {
  const en = EN_BODIES[id];
  return en === undefined ? [] : [{ id, en, mediaSlots: [], ...translationsOf(id) }];
});

/** Whichever languages have this article, as the optional fields of `HelpArticle`. */
function translationsOf(id: string): Partial<Record<HelpLanguage, HelpBody>> {
  const found: Partial<Record<HelpLanguage, HelpBody>> = {};
  for (const language of HELP_LANGUAGES) {
    const body = BODIES[language][id];
    if (language !== 'en' && body !== undefined) {
      found[language] = body;
    }
  }
  return found;
}

/** One article by id, or nothing — the lookup the panel and the tests use. */
export function helpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.id === id);
}
