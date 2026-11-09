import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
import { articleHtml } from '../helpPage';

/**
 * The folder run in the help, in every language it claims (S4 of `PLAN_terminal_folder_run.md`).
 *
 * <p>`bodyFor` marks a MISSING translation and never a stale one, so a language still silent about the folder run is a
 * complete, non-fallback body that every other test rewards. UI labels and commands stay English and byte-exact in all
 * five (`CLAUDE.md` rule 7): somebody reading German still has to find the button, and to paste the command.</p>
 */

const ID = 'basics';

function whole(language: HelpLanguage): string {
  const article = helpArticle(ID);
  assert.ok(article !== undefined, `no article ${ID}`);
  const shown = bodyFor(article, language);
  assert.equal(shown.fallback, false, `${language} falls back to English`);
  return Object.values(shown.body).join('\n\n');
}

const VERBATIM: readonly string[] = [
  'Run All in Folder',
  'Close Open Terminals and Run',
  'Type It Anyway',
  'Depends on',
  'Execute what is executable first',
  'Started by',
  'Runs on',
  '{name}',
  "{na''me}",
  'tmux new -A -s {name}',
  "tmux attach -t '={name}'",
  '-t foo',
  'foobar',
  'a.b:c',
  'a_b_c',
  'tmux 3.6',
  'ssh -t <host> tmux new -A -s {name}',
  'pwsh',
  'PowerShell 7',
  'Windows PowerShell 5.1',
  'Command Prompt',
  'OpenSSH for Windows 9.5',
  'CredsForDevs: before <folder>',
  '32',
  '4000',
];

/** Subfolders · a control character · the lines do not wait · our own line seen to finish · without integration every time · a dependency never exits · tmux only detaches · a local window on Windows. */
const OWN_WORDS: Readonly<Record<HelpLanguage, readonly RegExp[]>> = {
  en: [/Subfolders are not run/, /control character/, /do not wait for each other/, /typed a line there and saw that command finish/, /without shell integration it asks every time/, /never exits/, /only detaches/, /From a local window on Windows/],
  de: [/Unterordner laufen nicht mit/, /Steuerzeichen/, /warten nicht aufeinander/, /Zeile getippt und diesen Befehl hat enden sehen/, /ohne Shell-Integration jedes Mal/, /nie endet/, /trennt sich nur/, /Aus einem lokalen Fenster unter Windows/],
  es: [/subcarpetas no se ejecutan/, /carácter de control/, /no se esperan entre sí/, /escribió allí una línea y vio terminar ese comando/, /sin integración de shell, cada vez/, /nunca termina/, /solo se desconecta/, /Desde una ventana local en Windows/],
  ru: [/Подпапки не запускаются/, /управляющим символом/, /не ждут друг друга/, /ввело там строку и увидело завершение этой команды/, /без интеграции с оболочкой — каждый раз/, /никогда не завершается/, /только отсоединяется/, /Из локального окна на Windows/],
  uk: [/Підпапки не запускаються/, /керувальним символом/, /не чекають один на одного/, /ввело там рядок і побачило завершення цієї команди/, /без інтеграції з оболонкою — щоразу/, /ніколи не завершується/, /лише від'єднується/, /З локального вікна на Windows/],
};

test('every_language_holds_the_labels_and_the_commands_byte_for_byte', () => {
  assert.ok(HELP_LANGUAGES.length >= 5, 'the catalog lost a language');
  for (const language of HELP_LANGUAGES) {
    const text = whole(language);
    assert.deepEqual(VERBATIM.filter((label) => !text.includes(label)), [], language);
  }
});

test('every_language_says_it_in_its_own_words', () => {
  for (const language of HELP_LANGUAGES) {
    const text = whole(language);
    assert.deepEqual(OWN_WORDS[language].filter((words) => !words.test(text)).map(String), [], language);
  }
});

test('every_language_renders_the_two_headings_as_emphasis', () => {
  for (const language of HELP_LANGUAGES) {
    const html = articleHtml(ID, language);
    assert.ok(html.includes('<strong>Run All in Folder.</strong>'), language);
    assert.ok(html.includes('<strong>tmux.</strong>'), language);
  }
});

test('the_title_is_covered_by_the_article_and_no_excuse_is_left', () => {
  assert.ok(whole('en').toLowerCase().includes('run all in folder'), 'the words helpCoverage looks for');
  const coverage = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'test', 'helpCoverage.test.ts'), 'utf8');
  assert.equal(coverage.includes('credSshManager.runFolder'), false, 'so an entry here would excuse the title');
});
