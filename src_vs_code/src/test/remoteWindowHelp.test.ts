import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_ARTICLES, HELP_LANGUAGES, HelpArticle, HelpLanguage, bodyFor } from '../helpContent';
import { BUTTON_LABELS, RELAY_ONLY_LABEL } from '../remoteWindowMessage';

/**
 * The article for the remote-window connect, in every language it claims.
 *
 * <p>`helpCatalog.test.ts` already proves the article EXISTS in all five and does not fall back to
 * English. This proves each translation carries the facts the article is FOR, because a translation
 * can be present, non-falling-back, and still say nothing — the failure `bodyFor` cannot see: it
 * marks a MISSING translation and never a hollow or stale one.</p>
 */

const ID = 'connect-in-a-remote-window';
// Iterated from the production tuple: a retyped list stops covering the sixth language silently,
// which is the same rule the reason and credential tables follow.
const LANGUAGES = HELP_LANGUAGES;

function articleOrThrow(): HelpArticle {
  const found = HELP_ARTICLES.find((a) => a.id === ID);
  assert.ok(found !== undefined, `no article with id ${ID}`);
  return found;
}

/** Every translation, proven to BE a translation rather than English wearing a label. */
function translations(): { language: HelpLanguage; body: Record<string, string> }[] {
  const article = articleOrThrow();
  return LANGUAGES.map((language) => {
    const { body, fallback } = bodyFor(article, language);
    assert.equal(fallback, false, `${language} falls back to English`);
    return { language, body: body as unknown as Record<string, string> };
  });
}

test('the article exists, and sits beside the relay it depends on', () => {
  const ids = HELP_ARTICLES.map((a) => a.id);
  assert.equal(ids[ids.indexOf('wsl-relay') + 1], ID, 'it belongs next to the relay article');
});

test('all five languages are really there — and there are five of them', () => {
  // The loop below is worthless if it iterates nothing, which is exactly what an earlier version
  // of this test did: it read a field that does not exist and passed over an empty object.
  const found = translations();
  assert.equal(found.length, HELP_LANGUAGES.length);
  assert.ok(found.length >= 5, 'the catalog lost a language');
});

test('every language names the relay as the route, and is long enough to be the article', () => {
  for (const { language, body } of translations()) {
    const whole = Object.values(body).join(' ');

    assert.match(whole, /relay|релей|Relay|relé/i, `${language} never mentions the relay`);
    assert.match(whole, /ssh/i, `${language} never mentions ssh`);
    assert.ok(whole.length > 800, `${language} is too short to be this article: ${whole.length}`);
  }
});

test('every language explains WHY, naming the error people arrive with AND why translating fails', () => {
  // "Identity file … not accessible" is the sentence somebody searches for; the article exists to
  // say what it means — two computers — and to close the fix everyone tries first.
  for (const { language, body } of translations()) {
    assert.match(body.why, /Identity file/, `${language} does not quote the error people arrive with`);
    assert.match(body.why, /0777/, `${language} omits why translating the path does not help`);
  }
});

test('every language names the command that fixes it, spelled as the command is', () => {
  // Retyping a label into prose is how documentation starts lying; these are the exported strings.
  assert.equal(BUTTON_LABELS.setUpRelay, 'Set Up the Relay and Connect');
  assert.equal(RELAY_ONLY_LABEL, 'Set Up the WSL Agent Relay');

  for (const { language, body } of translations()) {
    assert.match(body.setup, /Set Up the WSL Agent Relay/, `${language} does not name the command`);
  }
});

test('every language names the OTHER route, the one that answers when the agent cannot', () => {
  // Added after a review found the article still describing the relay as the only way through: the
  // Windows-client route shipped in the same change and the five translations were not updated with
  // it. The path is the assertion because it is the thing a reader can check against their own
  // terminal — a paraphrase of "the Windows client" would pass while saying nothing usable.
  for (const { language, body } of translations()) {
    const whole = Object.values(body).join(' ');

    assert.match(
      whole,
      /\/mnt\/c\/Windows\/System32\/OpenSSH\/ssh\.exe/,
      `${language} never names the client WSL actually launches`,
    );
    assert.match(whole, /interop/i, `${language} does not say how it is reached`);
  }
});
