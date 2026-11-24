'use strict';
// The pure rules of M7, M12 and M14 of G1 (E3.S7; `todo/PLAN_person_roads_pin_host_key_E3_S7_spec.md` §5.1): the tables of the legs of M7 and M12 (literals of the spec, never read from the product),
// the coverage judge, the word that a pin file's path needs, how `ssh` prints a path in its `Offending` line, the bare word's twin, E1's words with a path as it is, the scan for `/dev/null`
// as a known-hosts file, the judge of "no path in a text" and the listing of a folder.
//
// Nothing is read when this module is loaded: no variable, no file, no process. It imports no module of the product; it needs `node:path` and `node:crypto`, and `node:fs` only inside `listingOf`.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const freezeAll = (list) => Object.freeze(list.map((one) => Object.freeze(one)));

// `\` is ONE backslash, `\t` ONE tab: the folder of each shape holds the characters that the row names (§1.1).
const SHAPES = [
  { shape: 'a', folder: 'with space', word: 'quoted', runs: ['m1', 'mismatch', 'switch'] },
  { shape: 'b', folder: "it's", word: 'quoted', runs: ['m1', 'mismatch', 'switch'] },
  { shape: 'c', folder: "x'y'z", word: 'quoted', runs: ['m1', 'mismatch', 'switch', 'collision-k1', 'collision-k2'] },
  { shape: 'd', folder: "it's here", word: 'quoted', runs: ['m1', 'mismatch', 'switch'] },
  { shape: 'e', folder: 'end\\', word: 'bare', runs: ['m1', 'mismatch', 'switch'] },
];
const m7Name = (shape, run) => (run.startsWith('collision') ? `m7-${shape}-${run}` : `m7-${shape}-${run === 'm1' ? 'm1' : `m2-${run}`}`);

/** The 17 legs of M7, in the order they run (§1.1): `name`, `shape`, the storage folder's name, `word` (how both known-hosts options must name the pin file) and `run`. */
const M7_LEGS = freezeAll(SHAPES.flatMap((one) => one.runs.map((run) => ({ name: m7Name(one.shape, run), shape: one.shape, folder: one.folder, word: one.word, run }))));

// The six kinds that a storage folder can give (a)-(f); each is a leg on each of the two roads that can be driven.
const ROAD_CASES = [
  { letter: 'a', folder: 'q"uote', kind: 'quote' },
  { letter: 'b', folder: '\\\\unc', kind: 'doubleBackslash' },
  { letter: 'c', folder: 'pct%h', kind: 'percent' },
  { letter: 'd', folder: 'var${HOME}', kind: 'variable' },
  { letter: 'e', folder: "it\\'s", kind: 'backslashApostrophe' },
  { letter: 'f', folder: 'tab\tname', kind: 'control' },
];
/** The two kinds that no folder can give: the pathname that the rule is asked with, from the leg's folder and a uuid (§1.1 (g), (h)). */
const RULE_CASES = freezeAll([
  { letter: 'g', kind: 'lastBackslash', pathname: (leg, uuid) => `${leg}/rule/known_hosts-e1-${uuid}\\` },
  { letter: 'h', kind: 'tilde', pathname: (_leg, uuid) => `~/known_hosts-e1-${uuid}` },
]);

/** The 13 legs of M12 (§1.1): `m12-rule` first (the rule and the client alone: `cases`, `kinds`), then each road leg with its `letter`, `folder`, `kind` and `road`. */
const M12_LEGS = Object.freeze([
  Object.freeze({ name: 'm12-rule', letter: null, kind: null, kinds: Object.freeze(RULE_CASES.map((one) => one.kind)), road: null, cases: RULE_CASES }),
  ...ROAD_CASES.flatMap((one) => ['install', 'bridge'].map((road) => Object.freeze({ name: `m12-${one.letter}-${road}`, letter: one.letter, folder: one.folder, kind: one.kind, road }))),
]);

/** The words of sentence E for the six kinds of the road legs, as the plan's §3.11 lists them: pinned here, never read from the product. */
const KIND_WORDS = Object.freeze({
  quote: 'a double quote',
  doubleBackslash: 'two backslashes in a row (a network path)',
  percent: 'a percent sign',
  variable: 'the characters ${',
  backslashApostrophe: 'a backslash before an apostrophe',
  control: 'a control character',
});

/**
 * Whether the product's kinds and the legs' kinds are the same set: `missing` are the product's kinds that no leg has, `extra` the legs' kinds that the product lacks. ok only when both
 * are empty and the product's list is not empty (a list that is empty could not fail).
 */
function coverage(productKinds, legs) {
  const have = new Set(legs.flatMap((one) => [...(one.kind === null || one.kind === undefined ? [] : [one.kind]), ...(one.kinds ?? [])]));
  const missing = productKinds.filter((kind) => !have.has(kind));
  const extra = [...have].filter((kind) => !productKinds.includes(kind));
  return { ok: productKinds.length > 0 && missing.length === 0 && extra.length === 0, missing, extra };
}

/** The word that both known-hosts options must hold for `file`: in double quotes, or bare. */
const expectedWord = (file, word) => (word === 'quoted' ? `"${file}"` : file);

/** How `ssh` prints a path in its messages: each backslash as two (measured 2026-11-18, OpenSSH 10.2p1). A byte outside printable ASCII is printed as octal, so no folder of this story holds one. */
function printedBySsh(file) {
  if (/[^\x20-\x7e]/.test(file)) {
    throw new Error(`a byte outside printable ASCII is printed by ssh in octal; no folder of E3.S7 holds one: ${JSON.stringify(file)}`);
  }
  return file.replaceAll('\\', '\\\\');
}

/** `text` as a regular expression that matches it literally. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Whether a WHOLE line of `stderr` (LF, CR LF allowed) is `Offending <type> key in <the name as ssh prints it>:<n>`. The harness's own reading: it does not read the product. */
function offendingNames(stderr, file) {
  const line = new RegExp(String.raw`^Offending \S+ key in ${literal(printedBySsh(file))}:\d+$`);
  return String(stderr).split('\n').some((one) => line.test(one.replace(/\r$/, '')));
}

/** The path that a BARE word resolves to when the path holds apostrophes: ssh drops them (a pair of them, bare, names another path in both lists). */
const resolvedBare = (file) => file.replaceAll("'", '');

/** E1's three pairs with the path as it is in both known-hosts options (J18: `otherKeyRecord`'s words refuse white space and a quote; the collision's path holds apostrophes). */
function e1WordsRaw(file) {
  if (/[\s"]/.test(file)) {
    throw new Error(`a path with white space or a double quote cannot be named as it is: ${JSON.stringify(file)}`);
  }
  return ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, '-o', `GlobalKnownHostsFile=${file}`];
}

/** The `-o` option texts of an argv before `--`: `-o <text>` and `-o<text>`. */
function optionTexts(argv) {
  const end = argv.indexOf('--');
  const words = end === -1 ? argv : argv.slice(0, end);
  return words.flatMap((word, at) => (words[at - 1] === '-o' ? [word] : word.startsWith('-o') && word.length > 2 ? [word.slice(2)] : []));
}

/** The words of an option's value as ssh reads them: split at white space, a double-quoted word kept together (quotes kept). */
const wordsOf = (value) => value.match(/(?:"[^"]*"|[^\s"])+/g) ?? [];

/**
 * The known-hosts options of an argv (before `--`) that name `/dev/null` as one of their files: `[{ option, value }]`, one per such word. ssh reads the name, then `=` or white space (also around the
 * `=`), then a list of files split at white space, a double-quoted word kept together (measured 2026-11-24, OpenSSH 10.2p1), the name in any case; the forms `-o Name=v`, `-oName=v` and a word that holds
 * `Name v` are all read.
 */
function devNullIn(argv) {
  return optionTexts(argv).flatMap((text) => {
    const found = /^(UserKnownHostsFile|GlobalKnownHostsFile)(?:\s*=\s*|\s+)(.*)$/i.exec(text);
    return found === null ? [] : wordsOf(found[2]).filter((word) => word.replaceAll('"', '') === '/dev/null').map((word) => ({ option: found[1], value: word }));
  });
}

/** Whether `text` holds none of `parts` and no `/`: `{ ok, found }`, `found` being what it holds. */
function noPathIn(text, parts) {
  const found = [...parts.filter((part) => part !== '' && text.includes(part)), ...(text.includes('/') ? ['/'] : [])];
  return { ok: found.length === 0, found };
}

/** Every entry under `dir`, recursive, by relative path: `{ rel, type, sha256 }` (files with their SHA-256, the others by type with `null`); `[]` for a folder that is not there. */
function listingOf(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    const rel = path.relative(dir, full);
    if (entry.isDirectory()) {
      return [{ rel, type: 'dir', sha256: null }, ...walk(full)];
    }
    return [{ rel, type: entry.isFile() ? 'file' : 'other', sha256: entry.isFile() ? crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') : null }];
  });
  return walk(dir).sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

module.exports = { M7_LEGS, M12_LEGS, KIND_WORDS, coverage, expectedWord, printedBySsh, offendingNames, resolvedBare, e1WordsRaw, devNullIn, noPathIn, listingOf, literal };
