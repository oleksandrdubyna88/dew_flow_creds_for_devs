import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { SIGNING_BUTTONS } from '../agentConsent';
import { HELP_ARTICLES, HELP_LANGUAGES, HelpBody, HelpLanguage, bodyFor } from '../helpContent';
import { REPO, assertRepoRoot, read } from './repoFiles';

/**
 * What every text says the SSH signing prompt does (#197 E1.4, defect D5).
 *
 * <p>The help said <i>"a dialog per signature is the feature"</i>, the menu said <i>"(confirm every use)"</i>
 * and the README said <i>"every single use asks"</i> — all of it false since the ten-minute window shipped,
 * and all of it nowhere near a test, because a sentence is not something a compiler or a behaviour test
 * reads. The prompt now offers three answers and the help must name each of them, in every language, or a
 * person reads a promise the product does not keep.</p>
 *
 * <p>Three kinds of check, because each fails for a different reason. <b>Positive</b>: the help names every
 * button the dialog offers — the list comes from the code (`SIGNING_BUTTONS`), never from a copy, so the day
 * a button is added this goes red by itself. <b>Pattern</b>: the English texts that ship say no variant of
 * "every use asks". <b>Quoted</b>: each sentence this story replaced is absent, per language, from the file
 * that held it — a translation is the place an old promise survives longest, because nobody who reads English
 * opens it.</p>
 *
 * <p>A scan that matches nothing is the failure this file is built against, so the pattern has its own test,
 * fed each old English sentence verbatim, and every scan first asserts that it read something.</p>
 *
 * <p>Deliberately NOT scanned: `agentDoors.ts` line 87, the CLI door, which really does ask every time — it
 * mints a fresh grant per call — and whose sentence `agentDoors.test.ts` pins.</p>
 */

const SSH_AGENT = 'ssh-agent';
const WSL_RELAY = 'wsl-relay';

/** One article, in one language, as the reader gets it: every field, in one string. */
function articleText(id: string, language: HelpLanguage): string {
  const article = HELP_ARTICLES.find((one) => one.id === id);
  assert.notEqual(article, undefined, `the help has no article "${id}"`);
  const { body, fallback } = bodyFor(article as (typeof HELP_ARTICLES)[number], language);
  assert.equal(fallback, false, `${id} (${language}) is not translated — the reader would get English`);
  return Object.values(body as HelpBody).join('\n');
}

test('the help names every answer the signing prompt offers, in every language', () => {
  const missing: string[] = [];
  for (const language of HELP_LANGUAGES) {
    const text = articleText(SSH_AGENT, language);
    for (const button of SIGNING_BUTTONS) {
      if (!text.includes(button)) {
        missing.push(`${SSH_AGENT} (${language}) does not name "${button}"`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

/**
 * Every variant of "each signature asks" the old texts used. Case-insensitive; whitespace is collapsed
 * before matching because the READMEs are hard-wrapped.
 */
const EVERY_USE_ASKS: readonly RegExp[] = [
  /asks every time/i,
  /every single use/i,
  /confirm(?:ing)? every use/i,
  /(?:dialog|prompt) per signature/i,
  /every use (?:of the key )?asks/i,
  /every signature (?:still )?(?:asks|raises|is confirmed)/i,
];

/** The old English sentences, verbatim, from where each one lived. The pattern must match every one. */
const OLD_ENGLISH: readonly string[] = [
  'The SSH agent that asks every time', // helpEn.ts:184
  'and every single use opens a dialog naming the key and what it is signing', // helpEn.ts:185
  'Add to SSH Agent (confirm every use)', // package.json:756, helpEn.ts:187 and :300, README.md:1208
  'A dialog per signature is the feature', // helpEn.ts:189
  'with a confirmation dialog per signature', // helpEn.ts:209, README.md:73
  'Every signature asks you first, naming the key and what it signs.', // helpEn.ts:212
  'so `ssh` and `git` there use vault keys with a dialog per signature', // README.md:1114
  'serve from an agent with a prompt per signature', // README.md:123
  '**Every single use asks.**', // README.md:285
  '**SSH agent, confirming every use**', // README.md:41
  'every use asks first, and no `0600` file', // media/walkthrough/use.md:4
  'Every signature still asks on Windows.', // package.json:110
];

test('the scan matches every old English sentence — a scan that matches nothing proves nothing', () => {
  const unmatched = OLD_ENGLISH.filter((sentence) => !EVERY_USE_ASKS.some((pattern) => pattern.test(sentence)));
  assert.deepEqual(unmatched, [], 'these old sentences would pass the scan below unseen');
});

/** The English texts that ship: the two articles that describe the prompt, the manifest, the READMEs, the walkthrough. */
function shippedEnglishTexts(): Array<{ where: string; text: string }> {
  const files = [
    path.join(REPO, 'src_vs_code', 'package.json'),
    path.join(REPO, 'README.md'),
    path.join(REPO, 'src_vs_code', 'README.md'),
    path.join(REPO, 'src_vs_code', 'media', 'walkthrough', 'use.md'),
  ];
  assertRepoRoot(files);
  return [
    { where: `help article ${SSH_AGENT} (en)`, text: articleText(SSH_AGENT, 'en') },
    { where: `help article ${WSL_RELAY} (en)`, text: articleText(WSL_RELAY, 'en') },
    ...files.map((file) => ({ where: path.relative(REPO, file).split(path.sep).join('/'), text: read(file) })),
  ];
}

test('no shipped text says every signature asks', () => {
  const found: string[] = [];
  for (const { where, text } of shippedEnglishTexts()) {
    assert.notEqual(text.trim(), '', `${where}: read nothing — the scan below would pass on empty text`);
    const flat = text.replace(/\s+/g, ' ');
    for (const pattern of EVERY_USE_ASKS) {
      const hit = pattern.exec(flat);
      if (hit !== null) {
        found.push(`${where} still says "${hit[0]}"`);
      }
    }
  }
  assert.deepEqual(found, []);
});

/**
 * The sentences this story replaced, quoted per language. A translation keeps an old promise longest, so
 * each of the five help files is checked against ITS OWN wording — a pattern written in English cannot see
 * "jedes Mal".
 */
const REPLACED_IN_HELP: Readonly<Record<HelpLanguage, readonly string[]>> = {
  en: [
    'The SSH agent that asks every time',
    'every single use opens a dialog naming the key and what it is signing',
    'Add to SSH Agent (confirm every use)',
    'A dialog per signature is the feature',
    'with a confirmation dialog per signature',
    'Every signature asks you first, naming the key and what it signs.',
  ],
  de: [
    'Der SSH-Agent, der jedes Mal fragt',
    'jede einzelne Verwendung öffnet einen Dialog, der den Schlüssel nennt und das, was er signiert',
    'Add to SSH Agent (confirm every use)',
    'Ein Dialog pro Signatur IST die Funktion',
    'mit einem Bestätigungsdialog pro Signatur',
    'Jede Signatur fragt Sie zuerst und nennt den Schlüssel und das, was er signiert.',
  ],
  es: [
    'El agente SSH que pregunta cada vez',
    'cada uso, uno por uno, abre un diálogo que nombra la clave y lo que está firmando',
    'Add to SSH Agent (confirm every use)',
    'Un diálogo por firma ES la función',
    'con un diálogo de confirmación por firma',
    'Cada firma le pregunta antes, nombrando la clave y lo que firma.',
  ],
  ru: [
    'SSH-агент, который каждый раз спрашивает',
    'каждое использование открывает диалог с именем ключа и тем, что подписывается',
    'Add to SSH Agent (confirm every use)',
    'Диалог на каждую подпись — это и есть фича',
    'с диалогом подтверждения на каждую подпись',
    'Каждая подпись сперва спрашивает вас, называя ключ и что подписывается.',
  ],
  uk: [
    'SSH-агент, який питає щоразу',
    'кожне окреме використання відкриває діалог, який називає ключ і те, що він підписує',
    'Add to SSH Agent (confirm every use)',
    'Діалог на кожен підпис — це і є можливість',
    'з діалогом підтвердження на кожен підпис',
    'Кожен підпис спершу питає вас, називаючи ключ і те, що він підписує.',
  ],
};

const HELP_FILES: Readonly<Record<HelpLanguage, string>> = {
  en: 'helpEn.ts',
  de: 'helpDe.ts',
  es: 'helpEs.ts',
  ru: 'helpRu.ts',
  uk: 'helpUk.ts',
};

/** The old wording of the strings and comments outside the help, from where each one lived. */
const REPLACED_IN_CODE: ReadonlyArray<{ file: string; old: string }> = [
  { file: 'extension.ts', old: 'Every use asks first; see "CredsForDevs: SSH Agent" for the record.' }, // :584
  { file: 'extension.ts', old: 'keys served from memory, every use confirmed' }, // :566
  // The block moved to sshAgentWiring.ts (E2.1): the same old strings must not come back in its new home.
  { file: 'sshAgentWiring.ts', old: 'Every use asks first; see "CredsForDevs: SSH Agent" for the record.' },
  { file: 'sshAgentWiring.ts', old: 'keys served from memory, every use confirmed' },
  { file: 'agentDoors.ts', old: 'ssh and git inside WSL can use this key, with a dialog per signature.' }, // :103
  { file: 'commands/agentCommands.ts', old: 'every use of the key asks first.' }, // :679
  { file: 'sshProgram.ts', old: 'serving keys from memory with a dialog per signature' }, // :10
  { file: 'sshAgentServer.ts', old: 'asking a human before every signature' }, // :20
  { file: 'sshAgentManager.ts', old: 'The dialog in front of every signature.' }, // :319
];

test('no replaced sentence survives, in any language of the help', () => {
  const survivors: string[] = [];
  for (const language of HELP_LANGUAGES) {
    const file = path.join(REPO, 'src_vs_code', 'src', HELP_FILES[language]);
    assertRepoRoot([file]);
    const source = read(file);
    assert.match(source, /ssh-agent/, `${HELP_FILES[language]}: read nothing of the help — wrong file?`);
    for (const old of REPLACED_IN_HELP[language]) {
      if (source.includes(old)) {
        survivors.push(`${HELP_FILES[language]} still says "${old}"`);
      }
    }
  }
  assert.deepEqual(survivors, []);
});

test('no replaced sentence survives in the code that shows or documents the prompt', () => {
  const survivors: string[] = [];
  for (const { file, old } of REPLACED_IN_CODE) {
    const target = path.join(REPO, 'src_vs_code', 'src', file);
    assertRepoRoot([target]);
    const source = read(target).replace(/\s*\r?\n\s*(?:\/\/|\*)?\s*/g, ' ');
    assert.notEqual(source.trim(), '', `${file}: read nothing`);
    if (source.includes(old)) {
      survivors.push(`${file} still says "${old}"`);
    }
  }
  assert.deepEqual(survivors, []);
});

/**
 * A command title must not promise what a window can switch off (#197 E1.4 review, M1). "Add to SSH Agent
 * (asks before signing)" was read as "every signature asks" — false while a 10-minute window is open. The
 * title is the plain command name; what the prompt offers is said in the help, once.
 */
const TITLE_PROMISES_ASKING = /Add to SSH Agent \([^)]*(?:asks|confirm)[^)]*\)/i;

test('the guard on command titles matches the two promises the title once made', () => {
  assert.match('Add to SSH Agent (asks before signing)', TITLE_PROMISES_ASKING);
  assert.match('Add to SSH Agent (confirm every use)', TITLE_PROMISES_ASKING);
  assert.doesNotMatch('Add to SSH Agent', TITLE_PROMISES_ASKING);
});

test('no command title, README or help language puts "asks before signing" after Add to SSH Agent', () => {
  const found: string[] = [];
  const manifest = path.join(REPO, 'src_vs_code', 'package.json');
  const files = [
    manifest,
    path.join(REPO, 'README.md'),
    path.join(REPO, 'src_vs_code', 'README.md'),
    ...HELP_LANGUAGES.map((language) => path.join(REPO, 'src_vs_code', 'src', HELP_FILES[language])),
  ];
  assertRepoRoot(files);
  for (const file of files) {
    const text = read(file);
    assert.notEqual(text.trim(), '', `${file}: read nothing — the scan below would pass on empty text`);
    const hit = TITLE_PROMISES_ASKING.exec(text);
    if (hit !== null) {
      found.push(`${path.relative(REPO, file).split(path.sep).join('/')} still says "${hit[0]}"`);
    }
  }
  assert.deepEqual(found, []);
  const commands = (JSON.parse(read(manifest)) as { contributes: { commands: Array<{ title: string }> } }).contributes
    .commands;
  assert.ok(commands.some((command) => command.title === 'Add to SSH Agent'), 'the command is not in the manifest');
});
