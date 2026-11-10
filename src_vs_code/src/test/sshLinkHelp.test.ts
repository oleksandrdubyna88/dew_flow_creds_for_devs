import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, bodyFor, helpArticle } from '../helpContent';

/** E1.S1: the Terminal field "Runs over SSH" is in the help in every language, with its English labels (`CLAUDE.md` rule 7). */

test('every_language_names_the_ssh_link_with_its_english_labels', () => {
  const article = helpArticle('basics');
  assert.ok(article !== undefined, 'no article basics');
  for (const language of HELP_LANGUAGES) {
    const shown = bodyFor(article, language);
    assert.equal(shown.fallback, false, `${language} falls back to English`);
    const text = Object.values(shown.body).join('\n\n');
    assert.ok(text.includes('Runs over SSH'), `${language}: the field label`);
    assert.ok(text.includes('— Do not use —'), `${language}: the first option`);
  }
});
