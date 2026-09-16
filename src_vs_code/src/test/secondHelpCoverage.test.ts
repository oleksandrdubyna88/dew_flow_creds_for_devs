import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpArticle, bodyFor, helpArticle } from '../helpContent';

/**
 * S8 — every language was actually TOUCHED, which the ordinary coverage test cannot see.
 *
 * <p>The blind spot this exists for: `bodyFor` marks a MISSING translation and never a STALE one, so
 * a language that still explains the old behaviour is a complete, non-fallback body and the coverage
 * test rewards it. A person reading the Russian help would be told the other half is always a decoy,
 * which stopped being true in this pull request.</p>
 *
 * <p>This is not a full answer — a content-version check across languages is, and it is help
 * infrastructure rather than this feature. What it does catch is the failure that actually happens:
 * four languages changed in a commit and the fifth forgotten.</p>
 */

/** The control's own words, which every translation keeps in English because the form does. */
const MARKER = 'My own second value';

/** The article, or a failure that names it — `helpArticle` answers undefined for an unknown id. */
function article(id: string): HelpArticle {
  const found = helpArticle(id);
  assert.ok(found !== undefined, `there is no help article called ${id}`);
  return found;
}

for (const language of HELP_LANGUAGES) {
  test(`the ${language} help explains the person's own second half, for a password`, () => {
    const answer = bodyFor(article('woven-password'), language);

    assert.equal(answer.fallback, false, 'a real translation, not English standing in for one');
    assert.ok(
      answer.body.usage.includes(MARKER),
      `the ${language} article does not mention the control — a stale translation reads as a complete one`,
    );
  });

  test(`the ${language} help explains it for a card's fields too`, () => {
    const answer = bodyFor(article('payment-instruments'), language);

    assert.equal(answer.fallback, false);
    assert.ok(answer.body.usage.includes(MARKER), `the ${language} payment article does not mention it`);
  });
}

test('and the English article says the sharpest rule out loud', () => {
  // The one sentence a person must not have to infer: their own second value is not written down
  // beside the pair. If the help said it were stored, somebody would reasonably expect to find it.
  const { body } = bodyFor(article('woven-password'), 'en');

  assert.match(body.usage, /written down nowhere beside the pair/);
  assert.match(body.usage, /same length/, 'and why a mismatched pair is refused');
});
