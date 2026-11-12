import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
import { entryTerminalTitle, sshTerminalTitle } from '../terminalTitles';

/**
 * The folder colour in the help, in every language it claims (S2 of `PLAN_folder_colors_E2.md`).
 *
 * <p>`bodyFor` marks a MISSING translation and never a stale one, and a language that is silent about the colour
 * is still a complete, non-fallback body. So each language is held to two things: the labels of the screen, which
 * stay English in all five (`.agents/PROJECT.md` rule 7), and one phrase of its OWN translation. A paragraph left
 * out, or pasted in English, fails the second even though the first would pass on the words that other paragraphs
 * of the article already use (`Creds:` is one of them).</p>
 */

const ID = 'basics';

/** The sentence that an open terminal keeps its colour, the claim a reader is most likely to get wrong. */
const LIMIT_EN = 'A terminal that is already open keeps the colour it was opened with; only terminals opened later wear a new one.';

/**
 * The two terminal titles the paragraph quotes, taken from the one builder (`terminalTitles.ts`) and not written out here:
 * `terminalTitleScan.test.ts` allows a Creds title literal only in the builder, the help and the pure title tests, and a
 * title built from the builder cannot drift from the real one.
 */
const ENTRY_TITLE = entryTerminalTitle({ entryName: '<entry>', folderName: '<folder>' });
const SSH_TITLE = sshTerminalTitle({ entryName: '<entry>', folderName: '<folder>' });

/** What the paragraph must carry in every language, byte for byte: the labels a reader looks for on screen. */
const LABELS: readonly string[] = ['**Colour**', `\`${ENTRY_TITLE}\``, `\`${SSH_TITLE}\``];

/** The *Edit* menu label in the paragraph, as one italic and not the bold `**Edit**`: a `*` may not touch it on either side. */
const EDIT_LABEL = /(?<!\*)\*Edit\*(?!\*)/;

/** Per language: the terminal icon · an open terminal keeps its colour. The English pair doubles as the source. */
const OWN_WORDS: Readonly<Record<HelpLanguage, readonly RegExp[]>> = {
  en: [/the icon of its/, /keeps the colour it was opened with/],
  de: [/das Symbol seiner Terminals/, /behält die Farbe, mit der es geöffnet wurde/],
  es: [/el icono de sus terminales/, /conserva el color con el que se abrió/],
  ru: [/значок её терминалов/, /сохраняет цвет, с которым был открыт/],
  uk: [/значок її терміналів/, /зберігає колір, з яким був відкритий/],
};

function paragraphs(language: HelpLanguage): string[] {
  const article = helpArticle(ID);
  assert.ok(article !== undefined, `no article ${ID}`);
  const shown = bodyFor(article, language);
  assert.equal(shown.fallback, false, `${language} falls back to English`);
  return Object.values(shown.body).join('\n\n').split('\n\n');
}

test('every_language_tells_the_folder_colour_with_its_labels_in_english', () => {
  assert.ok(HELP_LANGUAGES.length >= 5, 'the catalog lost a language');
  for (const language of HELP_LANGUAGES) {
    const [icon, keeps] = OWN_WORDS[language];
    const holder = paragraphs(language).find((paragraph) => keeps.test(paragraph));
    assert.ok(holder !== undefined, `${language}: no paragraph says in its own words that an open terminal keeps its colour (${keeps})`);
    assert.ok(icon.test(holder), `${language}: the colour paragraph does not name the terminal icon in its own words (${icon})`);
    assert.deepEqual(LABELS.filter((label) => !holder.includes(label)), [], `${language}: a label left the colour paragraph`);
    assert.ok(EDIT_LABEL.test(holder), `${language}: the colour paragraph does not name *Edit* as one italic (${EDIT_LABEL})`);
  }
});

test('the_english_help_says_an_open_terminal_keeps_its_colour', () => {
  assert.ok(paragraphs('en').some((paragraph) => paragraph.includes(LIMIT_EN)), `the English help lost: ${LIMIT_EN}`);
});
