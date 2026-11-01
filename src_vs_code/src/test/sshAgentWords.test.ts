import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { ALLOW_LONGER, ALLOW_WINDOW } from '../agentConsent';
import { HELP_ARTICLES, HELP_LANGUAGES, HelpArticle, HelpBody, HelpLanguage, bodyFor } from '../helpContent';
import { AGENT_SERVED_NOTE, KEYS_SERVED_NOTICE, RELAY_ROW_DETAIL } from '../sshAgentTexts';
import { REPO, assertRepoRoot, read } from './repoFiles';

/**
 * What every USER-FACING text says the signing prompt offers, now that it offers four answers (#197 E3.4, defect D5).
 *
 * <p>E1.4 made the texts name the three answers of 1.14; 1.16.0 adds <i>Allow longer…</i>, and a text that still
 * says "once, or for 10 minutes" is a promise the prompt no longer describes. This suite reads STRINGS only — help
 * fields, README and markdown paragraphs, `package.json` fields and the exported constants — never source text, so
 * rewording a code comment can neither fail it nor satisfy it (coai plan-gate finding 3). <b>The labels stay English
 * in every language</b> (CLAUDE.md rule 7): the test asks for the English label inside a German, Russian, Spanish
 * and Ukrainian sentence.</p>
 *
 * <p>Two rules, and the cases a scan could miss. <b>R-a</b>: a help field that names <i>Allow for 10 minutes</i> also
 * names <i>Allow longer…</i>. <b>R-b</b>: an English unit that talks about the 10-minute window also names the longer
 * one. <b>A scan that matches nothing proves nothing</b>, so each rule has a companion that feeds it the old sentences
 * it was written for, and every scan first asserts it read something.</p>
 */

/** The articles that describe what the prompt offers. */
const PROMPT_ARTICLES = ['ssh-agent', 'wsl-relay', 'protection'] as const;

/** One user-facing string and where it lives, so a failure names the place. */
interface Unit {
  readonly where: string;
  readonly text: string;
}

function articleOf(id: string): HelpArticle {
  const article = HELP_ARTICLES.find((one) => one.id === id);
  assert.notEqual(article, undefined, `the help has no article "${id}"`);
  return article as HelpArticle;
}

/** Every field of one article in one language, as separate units — the reader gets each field on its own. */
function helpFields(id: string, language: HelpLanguage): Unit[] {
  const { body, fallback } = bodyFor(articleOf(id), language);
  assert.equal(fallback, false, `${id} (${language}) is not translated — the reader would get English`);
  return Object.entries(body as HelpBody).map(([field, text]) => ({ where: `${id} (${language}) ${field}`, text }));
}

function articleText(id: string, language: HelpLanguage): string {
  return helpFields(id, language)
    .map((unit) => unit.text)
    .join('\n');
}

/** R-a: the units that name the 10-minute answer and not the longer one. */
function windowWithoutLonger(units: readonly Unit[]): string[] {
  return units
    .filter((unit) => unit.text.includes(ALLOW_WINDOW) && !unit.text.includes(ALLOW_LONGER))
    .map((unit) => `${unit.where} names "${ALLOW_WINDOW}" and not "${ALLOW_LONGER}"`);
}

function everyPromptField(): Unit[] {
  return HELP_LANGUAGES.flatMap((language) => PROMPT_ARTICLES.flatMap((id) => helpFields(id, language)));
}

test('R-a: a help field that names "Allow for 10 minutes" also names "Allow longer…", in every language', () => {
  const units = everyPromptField();
  assert.equal(units.length, HELP_LANGUAGES.length * PROMPT_ARTICLES.length * 6, 'the scan read fewer fields than it should');
  assert.deepEqual(windowWithoutLonger(units), []);
});

test('R-a reads something — every language has a field that names the 10-minute answer for the scan to judge', () => {
  for (const language of HELP_LANGUAGES) {
    const named = helpFields('ssh-agent', language).filter((unit) => unit.text.includes(ALLOW_WINDOW));
    assert.notEqual(named.length, 0, `ssh-agent (${language}) names no "${ALLOW_WINDOW}" — R-a would pass on nothing`);
  }
  const old = [{ where: 'old wsl-relay (en) whatItIs', text: 'a signature asks on Windows first: **Allow once**, **Allow for 10 minutes** or **Deny**.' }];
  assert.equal(windowWithoutLonger(old).length, 1, 'R-a does not see the old wsl-relay sentence it was written for');
});

const WINDOW_ANSWERS = [ALLOW_WINDOW, ALLOW_LONGER] as const;

/** R-a+: what the `protection` article of one language fails to say about the two window answers. */
function protectionGaps(language: HelpLanguage): string[] {
  const text = articleText('protection', language);
  const missing = WINDOW_ANSWERS.filter((label) => !text.includes(label));
  if (missing.length === WINDOW_ANSWERS.length) {
    return [`protection (${language}) names neither "${ALLOW_WINDOW}" nor "${ALLOW_LONGER}"`];
  }
  return missing.map((label) => `protection (${language}) does not name "${label}"`);
}

test('R-a+: the protection article names both window answers, because a lock ends a window opened with either', () => {
  assert.deepEqual(
    HELP_LANGUAGES.flatMap((language) => protectionGaps(language)),
    [],
  );
});

/** A unit that talks about the 10-minute window — "10 minutes" or "10-minute". */
const TEN_MINUTES = /\b10[- ]minutes?\b/;
/** A unit that also talks about the longer one. */
const LONGER = /Allow longer…|12 hours/;

/** R-b: the units that name the 10-minute window and not the longer one. */
function tenWithoutLonger(units: readonly Unit[]): string[] {
  return units
    .filter((unit) => TEN_MINUTES.test(unit.text) && !LONGER.test(unit.text))
    .map((unit) => `${unit.where} names the 10-minute window and not the longer one`);
}

/** A markdown file as the units a reader takes in: a blank-line paragraph, or one table row or list item. */
function markdownUnits(where: string, text: string): Unit[] {
  const units: Array<{ line: number; text: string }> = [];
  let open = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') {
      open = false;
    } else if (open && !/^\s*(\||[-*] )/.test(line)) {
      units[units.length - 1].text += ` ${line.trim()}`;
    } else {
      units.push({ line: index + 1, text: line.trim() });
      open = true;
    }
  });
  return units.map((unit) => ({ where: `${where} paragraph at line ${unit.line}`, text: unit.text }));
}

const ROOT_README = path.join(REPO, 'README.md');
const EXTENSION_README = path.join(REPO, 'src_vs_code', 'README.md');
const WALKTHROUGH = path.join(REPO, 'src_vs_code', 'media', 'walkthrough', 'use.md');
const MANIFEST = path.join(REPO, 'src_vs_code', 'package.json');

function fileUnits(file: string): Unit[] {
  assertRepoRoot([file]);
  return markdownUnits(path.relative(REPO, file).split(path.sep).join('/'), read(file));
}

/** One `package.json` setting's description, as a unit named after the setting. */
function settingUnit(key: string): Unit {
  assertRepoRoot([MANIFEST]);
  const manifest = JSON.parse(read(MANIFEST)) as {
    contributes: { configuration: { properties: Record<string, { markdownDescription: string }> } };
  };
  const text = manifest.contributes.configuration.properties[`credSshManager.${key}`]?.markdownDescription ?? '';
  assert.notEqual(text, '', `package.json has no description for credSshManager.${key}`);
  return { where: `package.json credSshManager.${key}`, text };
}

/** The three sentences that used to live in code, as the strings the person reads. */
function constantUnits(): Unit[] {
  return [
    { where: 'KEYS_SERVED_NOTICE(2)', text: KEYS_SERVED_NOTICE(2) },
    { where: 'AGENT_SERVED_NOTE', text: AGENT_SERVED_NOTE },
    { where: 'RELAY_ROW_DETAIL', text: RELAY_ROW_DETAIL },
  ];
}

function englishUnits(): Unit[] {
  return [
    ...fileUnits(ROOT_README),
    ...fileUnits(EXTENSION_README),
    ...fileUnits(WALKTHROUGH),
    settingUnit('wslAgentRelay'),
    settingUnit('autoLockMinutes'),
    ...constantUnits(),
  ];
}

test('R-b: an English text that names the 10-minute window also names the longer one', () => {
  assert.deepEqual(tenWithoutLonger(englishUnits()), []);
});

test('R-b reads something — the sources it scans hold 10-minute sentences for it to judge', () => {
  const scanned = [EXTENSION_README, WALKTHROUGH].map((file) => fileUnits(file).filter((unit) => TEN_MINUTES.test(unit.text)));
  scanned.forEach((units) => assert.notEqual(units.length, 0, 'a markdown source holds no 10-minute sentence — R-b would pass on nothing'));
  assert.equal(constantUnits().length, 3);
  assert.ok(constantUnits().every((unit) => unit.text.length > 0), 'a constant is empty');
});

test("R-b's pattern matches the old sentences it was written for, and the new ones match both halves", () => {
  const old: Unit[] = [
    {
      where: 'old src_vs_code/README.md:41',
      text: 'You answer *Allow once*, *Allow for 10 minutes* or *Deny* — and locking the vault ends the window.',
    },
    {
      where: 'old package.json wslAgentRelay',
      text: 'A signature still asks on Windows first; while a 10-minute window is open, any process in that distribution signs with the key without asking.',
    },
  ];
  assert.equal(tenWithoutLonger(old).length, old.length, 'R-b does not see an old sentence — it could pass on the very text it guards');
  for (const fresh of [settingUnit('wslAgentRelay'), { where: 'protection (en)', text: articleText('protection', 'en') }]) {
    assert.match(fresh.text, TEN_MINUTES, `${fresh.where} no longer names the 10-minute window — R-b would pass on it vacuously`);
    assert.match(fresh.text, LONGER, `${fresh.where} names the 10-minute window and not the longer one`);
  }
});

test('the auto-lock texts say a lock ends the SSH windows and that the setting is machine-wide', () => {
  const autoLockParagraph = fileUnits(EXTENSION_README).filter(
    (unit) => unit.text.includes('credSshManager.autoLockMinutes') && unit.text.includes('default 60'),
  );
  assert.equal(autoLockParagraph.length, 1, 'the extension README has no single auto-lock bullet');
  const units = [settingUnit('autoLockMinutes'), autoLockParagraph[0], { where: 'protection (en)', text: articleText('protection', 'en') }];
  const missing = units.filter((unit) => !/machine-wide/i.test(unit.text) || !/SSH/.test(unit.text));
  assert.deepEqual(
    missing.map((unit) => unit.where),
    [],
    'these auto-lock texts do not say both "machine-wide" and that the lock ends SSH windows',
  );
});

/** Every `.ts` file under a folder, so the guard below sees code and tests alike. */
function typescriptFiles(folder: string): string[] {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? typescriptFiles(path.join(folder, entry.name)) : [path.join(folder, entry.name)]))
    .filter((file) => file.endsWith('.ts'));
}

test('"Allow longer" with three ASCII dots appears nowhere — the label ends in one U+2026 character', () => {
  const threeDots = ALLOW_LONGER.replace('…', '...');
  assert.notEqual(threeDots, ALLOW_LONGER, 'the label no longer ends in U+2026 — the guard below would look for the label itself');
  const files = new Set([
    ...['En', 'De', 'Es', 'Ru', 'Uk'].map((suffix) => path.join(REPO, 'src_vs_code', 'src', `help${suffix}.ts`)),
    ROOT_README,
    EXTENSION_README,
    WALKTHROUGH,
    MANIFEST,
    path.join(REPO, 'src_vs_code', 'scripts', 'ssh-agent-itest.cjs'),
    ...typescriptFiles(path.join(REPO, 'src_vs_code', 'src')),
  ]);
  assertRepoRoot([...files]);
  assert.ok(files.size > 100, 'the guard scanned too few files');
  const found = [...files].filter((file) => read(file).includes(threeDots)).map((file) => path.relative(REPO, file));
  assert.deepEqual(found, [], `these files spell the label with three dots, "${threeDots}"`);
});
