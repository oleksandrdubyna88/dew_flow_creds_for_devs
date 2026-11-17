import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';

/**
 * G2 (`PLAN_bridge_no_connection_sharing.md` §8, with change 1.1): the help of the three roads that now log in by themselves says what that
 * costs, in every language. The cost is a credential that needs a person: a key file with a passphrase that no SSH agent holds, a typed
 * second factor, a security-key PIN. It used to work through a connection the person had opened in a terminal; these runs and the bridge
 * join none, so it fails with `Permission denied`. `helpCatalog.test.ts` proves an article exists in five languages; this proves the
 * sentence is in each one, which a catalogue check cannot see. UI labels and ssh's own message stay English (`.agents/PROJECT.md` rule 7).
 *
 * <p>The option names are never spelled in help text (the scan of `noConnectionSharing.test.ts` reads `src/help*.ts`): the sentences
 * say "a connection that your SSH configuration shares".</p>
 */

function whatCanGoWrong(id: string, language: HelpLanguage): string {
  const article = helpArticle(id);
  assert.ok(article !== undefined, `no article ${id}`);
  const shown = bodyFor(article, language);
  assert.equal(shown.fallback, false, `${id}: ${language} falls back to English`);
  return shown.body.whatCanGoWrong ?? '';
}

/** The start of the sentence each language got in the Remote Bridge article. */
const BRIDGE_OPENING: Readonly<Record<HelpLanguage, string>> = {
  en: 'The bridge is an SSH connection of its own',
  ru: 'Мост — отдельное SSH-соединение',
  uk: "Міст — окреме SSH-з'єднання",
  de: 'Die Brücke ist eine eigene SSH-Verbindung',
  es: 'El puente es una conexión SSH propia',
};

test('G2: the Remote Bridge article says a bridge logs in by itself, in every language', () => {
  for (const language of HELP_LANGUAGES) {
    assert.ok(whatCanGoWrong('remote-bridge', language).includes(BRIDGE_OPENING[language]), `${language}: the bridge sentence is missing`);
  }
});

test('G2: the articles of Run with Secrets and of the agent surface say what a run over SSH cannot use, in every language', () => {
  for (const language of HELP_LANGUAGES) {
    for (const id of ['secret-references', 'agent-surface']) {
      assert.ok(whatCanGoWrong(id, language).includes('`Permission denied`'), `${language}: ${id} does not say what the failure looks like`);
    }
    assert.ok(whatCanGoWrong('agent-surface', language).includes('creds_exec'), `${language}: the agent surface does not name creds_exec`);
  }
});

test('G2: the English sentences name their conditions', () => {
  const secrets = whatCanGoWrong('secret-references', 'en');
  const agent = whatCanGoWrong('agent-surface', 'en');
  const bridge = whatCanGoWrong('remote-bridge', 'en');
  for (const [name, text] of [['secret-references', secrets], ['agent-surface', agent]] as const) {
    for (const needle of ['a key file with a passphrase', 'a typed second factor', 'a security-key PIN']) {
      assert.ok(text.includes(needle), `${name}: lacks "${needle}"`);
    }
    assert.ok(text.includes('also when your own terminal already has a connection to that host open'), `${name}: does not say a terminal of yours does not help`);
    // The host's SSH agent is dropped on Run with Secrets and on the agent's linked run (E3_INHERITED_DROP); only creds_exec keeps it.
    assert.ok(text.includes('drops your SSH agent'), `${name}: does not say these runs drop your SSH agent`);
    assert.ok(!/a key that your SSH agent holds works\./.test(text), `${name}: says an agent-held key works without saying where`);
  }
  assert.ok(bridge.includes('it joins no connection that your SSH configuration shares'), 'remote-bridge: lacks the condition');
  assert.ok(bridge.includes('a host that needs a typed code'), 'remote-bridge: lacks the cost');
});
