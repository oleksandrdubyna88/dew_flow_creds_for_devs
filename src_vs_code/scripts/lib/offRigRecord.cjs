'use strict';
// The pure rules of the rows that run off the rig (G1, E3.S9; `research/PLAN_person_roads_pin_host_key_E3_S9_spec.md` §1, §3, §4; decisions 19 to 22 of
// `research/PLAN_person_roads_pin_host_key.md`): the tables of the legs of M10, M11 and M13, the boundary 8.7 between the two parsers of the client and the
// expectation of each (constants by the VERSION of a client, never chosen from what a client did: decision 19), the questions and words of a call per
// parser, the two programs of M11 (c) and (d), sentence F's pinned words, the times of (d), the reader of `ssh -G`, K7's control, the UNC words and the
// version line of an `sshd` log. `test/itestRowsOff.test.ts` (TX1 to TX13) holds them without loading the harness.
//
// Nothing is read when this module is loaded: no variable, no file, no process. It imports no module of the product: what needs the product's functions
// takes them as arguments.
const pr = require('./pathRecord.cjs');

const deepFreeze = (value) => {
  Object.values(value).forEach((one) => (typeof one === 'object' && one !== null ? deepFreeze(one) : undefined));
  return Object.freeze(value);
};

/** The first OpenSSH that reads a path in a config line with the new tokeniser (8.7). One boundary here; `TOKENISER_SINCE` of `test/pinnedArgv.ts` holds it equal (TX11). */
const PARSER_SINCE = Object.freeze([8, 7]);

/** The parser of a client by its version `[major, minor]`: `older` before 8.7, `newer` from 8.7 on, `null` when no version was read. */
function parserOf(version) {
  if (!Array.isArray(version) || version.length < 2 || !version.every(Number.isInteger)) {
    return null;
  }
  return version[0] * 1000 + version[1] >= PARSER_SINCE[0] * 1000 + PARSER_SINCE[1] ? 'newer' : 'older';
}

const M10_LEGS = Object.freeze(['m10']);

const leg = (name, part, parser) => Object.freeze({ name, part, parser });
/** The 29 legs of M11 in the order they run (§3). The (b) runs are those of M1, M2 (b) the mismatch and M7's shapes (never its two collision legs). */
const M11_LEGS = Object.freeze([
  leg('m11-a-unknown', 'a', 'older'), leg('m11-a-ignored', 'a', 'older'),
  leg('m11-m1', 'b', 'older'), leg('m11-m2-mismatch-global', 'b', 'older'),
  ...pr.M7_LEGS.filter((one) => !one.run.startsWith('collision')).map((one) => leg(`m11-${one.name}`, 'b', 'older')),
  leg('m11-c-twin-k1', 'twin', 'older'), leg('m11-c-twin-k2', 'twin', 'older'),
  leg('m11-eq-older-k1', 'eq', 'older'), leg('m11-eq-older-k2', 'eq', 'older'), leg('m11-eq-newer-k1', 'eq', 'newer'), leg('m11-eq-newer-k2', 'eq', 'newer'),
  leg('m11-c-install', 'c', null), leg('m11-c-bridge', 'c', null), leg('m11-d-install', 'd', null), leg('m11-d-bridge', 'd', null),
]);

/** The three cases of M13: the made-up Windows user folder is `pin` and `probe` joined by `joiner` (a space; an apostrophe; a space and an apostrophe). */
const M13_CASES = Object.freeze([
  Object.freeze({ letter: 'a', joiner: ' ', user: ['pin', 'probe'].join(' ') }),
  Object.freeze({ letter: 'b', joiner: "'", user: ['pin', 'probe'].join("'") }),
  Object.freeze({ letter: 'c', joiner: " o'", user: ['pin', 'probe'].join(" o'") }),
]);

/** What M1's record checks expect per parser (D7): the starts of a leg (the questions and the five connections, or the question and the five), and the questions. */
const EXPECT = deepFreeze({ older: { parser: 'older', starts: 8, questions: 3 }, newer: { parser: 'newer', starts: 6, questions: 1 } });

/** How a client of each parser reads a BARE word (§1.3): a pair of apostrophes (kept, or taken out) and one equals sign (split into two names, or whole). */
const BARE = deepFreeze({ older: { pair: 'itself', equals: 'split' }, newer: { pair: 'stripped', equals: 'itself' } });

/** Whether the bare word of `kind` (`pair` or `equals`) makes a collision on a client of `parser`: a file that the bare word names other than the intended one. */
const collisionOf = (parser, kind) => (parser === 'newer' && kind === 'pair') || (parser === 'older' && kind === 'equals');

/** A bare path with ONE equals sign and no white space, split at it: `[the first name, the second]`. Throws otherwise. */
function splitAtEquals(file) {
  const parts = String(file).split('=');
  if (parts.length !== 2 || /\s/.test(file)) {
    throw new Error(`the path must hold exactly one equals sign and no white space: ${JSON.stringify(file)}`);
  }
  return parts;
}
/** The twin of the equals-sign legs: the first name of the split of the bare path. */
const twinOfEquals = (file) => splitAtEquals(file)[0];

/** The `-o` option texts of an argv before `--` as `[name, value]` (the name lower-cased), `-o <text>` and `-o<text>`. */
function optionPairs(argv) {
  const end = argv.indexOf('--');
  const words = end === -1 ? argv : argv.slice(0, end);
  return words.flatMap((word, at) => (words[at - 1] === '-o' ? [word] : word.startsWith('-o') && word.length > 2 ? [word.slice(2)] : []))
    .map((text) => [text.slice(0, text.indexOf('=') === -1 ? text.length : text.indexOf('=')).toLowerCase(), text.indexOf('=') === -1 ? '' : text.slice(text.indexOf('=') + 1)]);
}

/** One question `ssh -V` for each pinned call, ended before its call's first run (an older client: its answer is not kept), or one in all (a newer one). `calls`: `{ from }`; `questions`: `{ startedAt, ms }`. */
function questionsOk(parser, calls, questions) {
  const ordered = [...calls].sort((a, b) => a.from - b.from);
  const asked = [...questions].sort((a, b) => a.startedAt - b.startedAt);
  const endOf = (question) => question.startedAt + question.ms;
  if (ordered.length === 0 || !ordered.every((call) => Number.isFinite(call.from)) || !asked.every((one) => Number.isFinite(one.startedAt) && Number.isFinite(one.ms))) {
    return false;
  }
  if (parser === 'newer') {
    return asked.length === 1 && endOf(asked[0]) <= ordered[0].from;
  }
  if (parser !== 'older' || asked.length !== ordered.length) {
    return false;
  }
  return ordered.every((call, at) => {
    const before = asked.filter((question) => question.startedAt >= (at === 0 ? Number.NEGATIVE_INFINITY : ordered[at - 1].from) && question.startedAt < call.from);
    return before.length === 1 && endOf(before[0]) <= call.from;
  });
}

/** The words of a pinned connection per parser: StrictHostKeyChecking=yes, ONE path as both known-hosts files, VerifyHostKeyDNS=no, LogLevel=ERROR, each once; KnownHostsCommand=none once (newer) or not at all (older). */
function wordsOk(parser, argv) {
  const pairs = optionPairs(argv);
  const values = (name) => pairs.filter(([key]) => key === name).map(([, value]) => value);
  const unquoted = (text) => text.replace(/^"(.*)"$/, '$1');
  const [user, global] = [values('userknownhostsfile'), values('globalknownhostsfile')];
  const command = values('knownhostscommand');
  const same = values('stricthostkeychecking').join() === 'yes' && user.length === 1 && global.length === 1 && unquoted(user[0]) === unquoted(global[0]);
  const rest = values('verifyhostkeydns').join() === 'no' && values('loglevel').join() === 'ERROR';
  return (parser === 'older' || parser === 'newer') && same && rest && (parser === 'older' ? command.length === 0 : command.join() === 'none');
}

/** The literal that program (c) prints for `-V`: a version that is not at the start of its stderr (Q7), so the product reads `unreadable` with the exit code 0. */
const NOT_A_VERSION = 'not a version: OpenSSH_10.2p1';

const quoted = (text) => `'${String(text).replaceAll("'", String.raw`'\''`)}'`;
/** A program of M11 (c) or (d): it records its start as the shim does, answers `-V` (the shim hands it `-F <config> -V`) with `onVersion`, and `exec`s `passthrough` for any other argv. */
function program(records, passthrough, onVersion) {
  return [
    '#!/bin/sh',
    '# A program of row M11 (c) or (d): it records this start as the shim does, answers -V as the row says, and passes any other start on to the real client. Written by the leg.',
    'set -C',
    `{ printf '%s\\0' "$$" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\\0' "$@"; } > ${quoted(records)}/"$$".argv || exit 97`,
    'if [ "$#" -eq 3 ] && [ "$1" = -F ] && [ "$3" = -V ]; then',
    ...onVersion.map((line) => `  ${line}`),
    'fi',
    `exec ${quoted(passthrough)} "$@"`,
    '',
  ].join('\n');
}
/** (c): `-V` is answered at once with no version at the start of its stderr, and the exit code 0. */
const answersAtOnce = (records, passthrough) => program(records, passthrough, [`echo ${quoted(NOT_A_VERSION)} >&2`, 'exit 0']);
/** (d): `-V` is never answered: S3.P7's branch, byte for byte. */
const neverAnswers = (records, passthrough) => program(records, passthrough, ['exec sleep infinity']);

/** The pinned words of sentence F (`pinClientSentence`) and its two forms of "how". */
const F_WORDS = 'could not read the version of the ssh program on this computer';
const F_HOW = Object.freeze({ none: 'it did not start, or did not end in time', code: (code) => `exit code ${code}` });

/** How many error messages of `said` (from index `from`) are exactly `prefix` + `sentence`: not a log line, not a warning, not another prefix. */
const toldF = (said, from, prefix, sentence) => said.slice(from).filter((one) => one.kind === 'error' && one.text === `${prefix}${sentence}`).length;

/** The times of (d), in ms of one clock, from the command's start `t0`: sentence F and the program's end each between 10 s and 15 s, the program gone no later than 5 s after F. A time not read fails. */
function timesOk({ t0, tF, tGone }) {
  const read = [t0, tF, tGone].every((one) => typeof one === 'number' && Number.isFinite(one));
  const between = (time) => time - t0 >= 10_000 && time - t0 <= 15_000;
  const window = read && between(tF) && between(tGone);
  const gone = read && tGone - tF <= 5_000;
  return { window, gone, ok: window && gone };
}

/** The lists that `ssh -G` printed for the two known-hosts options, each as its names (split at white space; CR LF read as LF). */
function resolvedOf(stdout) {
  const lines = String(stdout).split(/\r?\n/);
  const names = (key) => {
    const line = lines.find((one) => one.startsWith(`${key} `));
    return line === undefined ? [] : line.slice(key.length + 1).split(' ').filter((name) => name !== '');
  };
  return { user: names('userknownhostsfile'), global: names('globalknownhostsfile') };
}

/** Whether both lists are the one `file`, whole (a name that holds a space is joined back by the space that `-G` put between names). */
const oneIntended = (resolved, file) => [resolved.user, resolved.global].every((list) => list.length > 0 && list.join(' ') === file);

/** K7's control (E1.S1): the user folder with ` ~` after its first space. Throws when it has no space. */
function k7Twin(user) {
  if (!user.includes(' ')) {
    throw new Error(`a user folder with a space is needed for K7's control: ${JSON.stringify(user)}`);
  }
  return user.replace(' ', ' ~');
}

/** The UNC folder that the rule refuses (`doubleBackslash`) and where a client that reads two backslashes as one resolves it (K8 c). */
const UNC_WORDS = Object.freeze({ storage: String.raw`\\server.example\share\creds`, resolved: String.raw`\server.example\share\creds` });

/** Whether an `sshd` log names `version` (`OpenSSH_8.4p1`) as the remote software version of at least one connection (a `debug1` line). */
const versionSeen = (log, version) => new RegExp(`remote software version ${pr.literal(version)}(?![\\w.+-])`).test(log);

module.exports = {
  PARSER_SINCE, parserOf, M10_LEGS, M11_LEGS, M13_CASES, EXPECT, BARE, collisionOf, splitAtEquals, twinOfEquals, questionsOk, wordsOk, NOT_A_VERSION, answersAtOnce, neverAnswers,
  F_WORDS, F_HOW, toldF, timesOk, resolvedOf, oneIntended, k7Twin, UNC_WORDS, versionSeen,
};
