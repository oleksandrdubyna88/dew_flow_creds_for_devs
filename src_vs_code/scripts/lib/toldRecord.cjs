'use strict';
// The pure rules of M5 of G1 (E3.S8; `todo/PLAN_person_roads_pin_host_key_E3_S8_spec.md` section 3): the table of the eleven legs, the words that only one of the two sentences holds and the two
// prefixes of the bridge's message (literals of the plan's 3.5 and 3.12, never read from the product: a product whose C and D were swapped must be red beside its own text), the judge of what the
// person was told, the texts of the two forced scripts and of the jump host's config, the shown messages and the comparison of two legs, the control of (h), and the lines that name a file.
//
// Nothing is read when this module is loaded: no variable, no file, no process (as `rowRecord.cjs`). It imports no module of the product.
const { handedClientConfig } = require('./rowRecord.cjs');
const { VERIFY_FAILED, hasLine } = require('./otherKeyRecord.cjs');

const LEG_LIST = [
  { name: 'm5-a', letter: 'a', pinned: true, target: 'k2' },
  { name: 'm5-e', letter: 'e', pinned: true, target: 'k2', quiet: true },
  { name: 'm5-f', letter: 'f', pinned: true, target: 'hop' },
  { name: 'm5-g', letter: 'g', pinned: true, target: 'forced', script: 'fail' },
  { name: 'm5-h', letter: 'h', pinned: true, target: 'forced', script: 'zero' },
  { name: 'm5-b', letter: 'b', pinned: true, target: 'stopped' },
  { name: 'm5-b-unpinned', letter: 'b', pinned: false, target: 'stopped' },
  { name: 'm5-c', letter: 'c', pinned: true, target: 'refusedLogin' },
  { name: 'm5-c-unpinned', letter: 'c', pinned: false, target: 'refusedLogin' },
  { name: 'm5-d', letter: 'd', pinned: true, target: 'silent' },
  { name: 'm5-d-unpinned', letter: 'd', pinned: false, target: 'silent' },
];
/** The eleven legs, in the order that section 10 runs them (section 1.1). */
const M5_LEGS = Object.freeze(LEG_LIST.map((one) => Object.freeze({ ...one })));

/** The words that only sentence C holds, and the words that only sentence D holds (the plan's 3.5 and 3.12 as E2 built them). */
const C_WORDS = 'did not present its saved host key, so CredsForDevs did not connect';
const D_WORDS = 'and ssh did not name the saved host key of this entry as the reason';
/** The two openings of the bridge's message: sentence C (not open) and sentence D (could not be checked). */
const NOT_OPEN = (name) => `The bridge to "${name}" is not open: `;
const NOT_CHECKED = (name) => `The bridge to "${name}" could not be checked: `;

const countOf = (list, test) => list.filter(test).length;

/**
 * What the person was told after `from` (section 1.2): per sentence, how often it stands as the install's message (a message of any kind whose text IS the sentence), as the bridge's message (an `error` whose
 * text is the opening and the sentence) and as a log line (the sentence or the bridge's form), and how often any message or log line holds a pinned word or an opening. `words` is `{ c, d }`.
 */
function toldOf(said, from, words, name) {
  const items = said.slice(from);
  const messages = items.filter((one) => one.kind !== 'log');
  const logs = items.filter((one) => one.kind === 'log');
  const form = { c: NOT_OPEN(name) + words.c, d: NOT_CHECKED(name) + words.d };
  const per = (which) => ({
    install: countOf(messages, (one) => one.text === words[which]),
    bridge: countOf(items, (one) => one.kind === 'error' && one.text === form[which]),
    log: countOf(logs, (one) => one.text === words[which] || one.text === form[which]),
  });
  const holding = (part) => countOf(items, (one) => one.text.includes(part));
  return { c: per('c'), d: per('d'), holds: { cWords: holding(C_WORDS), dWords: holding(D_WORDS), notOpen: holding(NOT_OPEN(name)), notChecked: holding(NOT_CHECKED(name)) } };
}

/** The messages after `from`, with their kind and text, in order; the log lines are left out. */
const shownOf = (said, from) => said.slice(from).filter((one) => one.kind !== 'log').map((one) => ({ kind: one.kind, text: one.text }));

/** The log lines after `from`; each path of `sockets` is written `<socket>`. */
const logsOf = (said, from, sockets = []) => said.slice(from).filter((one) => one.kind === 'log').map((one) => sockets.reduce((text, socket) => text.replaceAll(socket, '<socket>'), one.text));

/** Whether two lists of shown messages are the same text: both are arrays, both are not empty, and each item's kind and text are equal in order. `diff` names the first difference (`null` when ok). */
function sameShown(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return { ok: false, diff: `${Array.isArray(a) ? 'the second' : 'the first'} list is not there` };
  }
  if (a.length === 0 || b.length === 0) {
    return { ok: false, diff: 'a list is empty: two empty lists could not differ' };
  }
  const at = a.findIndex((one, index) => one.kind !== b[index]?.kind || one.text !== b[index]?.text);
  if (at !== -1 || a.length !== b.length) {
    const first = at === -1 ? a.length : at;
    return { ok: false, diff: `at ${first}: ${JSON.stringify(a[first] ?? null)} against ${JSON.stringify(b[first] ?? null)}` };
  }
  return { ok: true, diff: null };
}

const LAST_LINES = { zero: 'exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"', fail: 'exit 255' };

/** The forced command of (g) and (h) (S3.P6): the verification line to stderr, then the original command (`zero`) or 255 (`fail`). The two differ in the last line only. */
function forcedScript(kind) {
  if (!Object.hasOwn(LAST_LINES, kind)) {
    throw new Error(`a forced script is zero or fail, not ${JSON.stringify(kind)}`);
  }
  const last = LAST_LINES[kind];
  return ['#!/bin/sh', '# The forced command of a leg of M5: it writes the verification line to its stderr, then the last line says how it ends.', `printf '%s\\n' '${VERIFY_FAILED}' >&2`, last, ''].join('\n');
}

/** A path that goes into a config the nested client reads unquoted (S3.P4's finding): white space would split it. */
function plain(file) {
  if (/\s/.test(file)) {
    throw new Error(`a path with white space cannot go into the jump config (the nested client takes -F unquoted): ${JSON.stringify(file)}`);
  }
  return file;
}

/** The jump config of (f) (S3.P4's text): `Host jump` with its nine lines, `Host 127.0.0.1` through it, then the rows' own `Host *` block, unchanged. */
function jumpConfig(dir, { jumpPort, user, identityFile, jumpKnownHosts }) {
  const lines = [
    'Host jump', '  HostName 127.0.0.1', `  Port ${jumpPort}`, `  User ${user}`, `  IdentityFile ${plain(identityFile)}`, '  IdentitiesOnly yes', '  BatchMode yes', '  StrictHostKeyChecking yes',
    `  UserKnownHostsFile ${plain(jumpKnownHosts)}`, '  GlobalKnownHostsFile /dev/null', '', 'Host 127.0.0.1', '  ProxyJump jump', '',
  ];
  return `${lines.join('\n')}\n${handedClientConfig(plain(dir))}`;
}

/** The lines of `stderr` (LF or CR LF) that hold `file` or its printed form (each backslash as two). */
function pinLines(stderr, file) {
  const printed = file.replaceAll('\\', '\\\\');
  const named = (line) => [file, printed].some((one) => new RegExp(`${one.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}(?![\\w.-])`).test(line));
  return String(stderr).split('\n').map((line) => line.replace(/\r$/, '')).filter(named);
}

/** The exit code of the first run of `kind` in a record's `runs`, or `undefined`. */
const codeOf = (record, kind) => record.runs?.find((one) => one.kind === kind)?.exitCode;
const shows = (told, which) => told?.[which]?.install > 0 || told?.[which]?.bridge > 0 || told?.[which]?.log > 0;

/**
 * The control of (h) (section 2.5): (g) of the same run ended its probe and its mode check with 255 and showed sentence D on the install and in the bridge's form; (h) ended them with 0 and showed neither
 * sentence; both wrote the same forced line (read, not null). A record that is `null` is a problem, never a pass.
 */
function controlOfH(g, h) {
  const problems = [];
  for (const [name, record] of [['(g)', g], ['(h)', h]]) {
    if (record === null || record === undefined) {
      problems.push(`${name} evidence is missing`);
    }
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  for (const kind of ['probe', 'mode']) {
    if (codeOf(g, kind) !== 255) {
      problems.push(`(g)'s ${kind} ended with ${codeOf(g, kind) ?? 'no code read'}, not 255`);
    }
    if (codeOf(h, kind) !== 0) {
      problems.push(`(h)'s ${kind} ended with ${codeOf(h, kind) ?? 'no code read'}, not 0`);
    }
  }
  if (typeof g.forced?.line !== 'string' || g.forced.line !== h.forced?.line) {
    problems.push(`the forced line of (g) and (h) is not one text that was read: ${JSON.stringify(g.forced?.line ?? null)} and ${JSON.stringify(h.forced?.line ?? null)}`);
  }
  // The text that the product really read, not the script on the disk (review of E3.S8): each probe and mode check holds the verification line as a whole line and no `Offending` line, and (g)'s and (h)'s are one text.
  for (const kind of ['probe', 'mode']) {
    const read = [['(g)', g], ['(h)', h]].map(([name, record]) => [name, record.runs?.find((one) => one.kind === kind)?.stderr]);
    for (const [name, stderr] of read) {
      if (typeof stderr !== 'string' || !hasLine(stderr) || /^Offending /m.test(stderr)) {
        problems.push(`${name}'s ${kind} stderr was not read, holds no whole verification line, or holds an Offending line: ${JSON.stringify(stderr ?? null)}`);
      }
    }
    const [one, other] = read.map(([, stderr]) => (typeof stderr === 'string' ? stderr.replaceAll('\r\n', '\n') : null));
    if (one === null || one !== other) {
      problems.push(`the ${kind} stderr of (g) and (h) is not one text that was read: ${JSON.stringify(one)} and ${JSON.stringify(other)}`);
    }
  }
  if (g.told?.d?.install !== 1 || g.toldParts?.install?.d?.install !== 1) {
    problems.push('(g) did not show sentence D once on the install (the whole screen and the install\'s road)');
  }
  if (g.told?.d?.bridge !== 1) {
    problems.push('(g) did not show sentence D once in the bridge\'s form');
  }
  for (const which of ['c', 'd']) {
    if (h.told === undefined || h.told === null || h.toldParts?.install === undefined || shows(h.told, which) || shows(h.toldParts.install, which)) {
      problems.push(`(h) showed sentence ${which.toUpperCase()}, or its told counts were not read`);
    }
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { M5_LEGS, C_WORDS, D_WORDS, NOT_OPEN, NOT_CHECKED, toldOf, shownOf, logsOf, sameShown, forcedScript, jumpConfig, pinLines, controlOfH };
