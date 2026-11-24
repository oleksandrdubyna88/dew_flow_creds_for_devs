'use strict';
// The pure rules of the record of the real-road rows (G1, E3.S4; decision 15 of `todo/PLAN_person_roads_pin_host_key.md`, the stories
// document's *E3.S4*, `todo/PLAN_person_roads_pin_host_key_E3_S4_spec.md` §2): how a start of the client, a connection start, an
// authentication attempt and an accepted login are counted, the sentences of §3.5, the handed client config's text, the lines that turn
// password logins on, E1's words, and how the output line of a leg process is read. Four counts that stay apart: no check puts one for
// another. The rig (`scripts/itestRowRig.cjs`) and section 10 import these; `test/itestRowRig.test.ts` (RR1 to RR5) holds them without
// loading the harness.
//
// Nothing is read when this module is loaded: no variable, no file, no process (as `lib/sshdRun.cjs`). It imports no module of the product:
// what needs the product's functions (the sentences, E1's words) takes them as arguments.
const path = require('node:path');

/** A line of an sshd log that only a client past the key check can cause. */
const AUTH_ATTEMPT = /Accepted |Failed |Postponed |Invalid user|authenticating user/;

/** `text` as a regular expression that matches it literally. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Which start a recorded one is: by `-V` alone for the question, by `-N` for the bridge, by its remote command for the three runs. */
function kindOf(argv, commands) {
  if (argv.length === 1 && argv[0] === '-V') {
    return 'question';
  }
  if (argv.includes('-N')) {
    return 'bridge';
  }
  return Object.keys(commands).find((kind) => commands[kind] === argv.at(-1)) ?? 'other';
}

/** The QUESTION: the client asked for its version, `-V` alone. */
const isQuestion = (argv) => argv.length === 1 && argv[0] === '-V';

/** A CONNECTION START: an argv that holds `--` and a word after it, the destination (`sshExecCommand.ts` writes it, and the bridge's builder the same). */
function isConnectionStart(argv) {
  const at = argv.indexOf('--');
  return at !== -1 && argv.length > at + 1;
}

const ROADS = { probe: 'install', install: 'install', bridge: 'bridge', sweep: 'check', mode: 'check' };
/** The road of a kind of start: the probe and the install run are the install, the bridge is the bridge, the sweep and the mode check are the check. */
const roadOf = (kind) => ROADS[kind];

/** The client's port of an sshd log line: the first `127.0.0.1 port <n>` in it. */
const portOf = (line) => /127\.0\.0\.1 port (\d+)/.exec(line)?.[1];

/** The kind of a `Starting session: <kind> … for <user> from 127.0.0.1 port <n>` line, with its port, or `undefined`. */
function sessionOf(line, user) {
  const found = new RegExp(String.raw`Starting session: ([\w-]+)[^\n]* for ${literal(user)} from 127\.0\.0\.1 port (\d+)`).exec(line);
  return found === null ? undefined : { kind: found[1], port: Number(found[2]) };
}

/** Each accepted login of `lines`, with the SESSION of the first later `Starting session` line of the same port that no earlier login took, else `none`. */
function acceptedOf(lines, user) {
  const accept = new RegExp(String.raw`Accepted (\S+) for ${literal(user)} from 127\.0\.0\.1 port (\d+)`);
  const taken = new Set();
  return lines.flatMap((line, index) => {
    const found = accept.exec(line);
    if (found === null) {
      return [];
    }
    const port = Number(found[2]);
    const later = lines.findIndex((other, at) => at > index && !taken.has(at) && sessionOf(other, user)?.port === port);
    taken.add(later);
    return [{ method: found[1], port, session: later === -1 ? 'none' : sessionOf(lines[later], user).kind }];
  });
}

/**
 * The counts of one counterpart's log (decision 15), for the lines of `user`: `connections` (the `Connection from` lines), `authAttempts` (the
 * distinct client ports that the lines matching `AUTH_ATTEMPT` name, and at least 1 when any line matches: `Accepted key … found at` names no
 * port; 0 only when no line matches), `accepted` (each `Accepted <method> for <user> from 127.0.0.1 port <n>` with its session kind or
 * `none`: a `-N` login starts no session), `passwords` (`Failed password` and `Accepted password` lines) and the matching `lines`, verbatim.
 */
function logCounts(log, user) {
  const lines = log.split(/\r?\n/).filter((line) => line !== '');
  const attempts = lines.filter((line) => AUTH_ATTEMPT.test(line));
  const attemptPorts = [...new Set(attempts.map(portOf).filter((port) => port !== undefined).map(Number))];
  const connection = /(?:^|\s)Connection from 127\.0\.0\.1 port \d+ on /;
  const failed = new RegExp(String.raw`Failed password for (?:invalid user )?${literal(user)} from `);
  const accepted = new RegExp(String.raw`Accepted password for ${literal(user)} from `);
  return {
    connections: lines.filter((line) => connection.test(line)).length,
    authAttempts: attempts.length === 0 ? 0 : Math.max(1, attemptPorts.length),
    attemptPorts,
    accepted: acceptedOf(lines, user),
    passwords: { failed: lines.filter((line) => failed.test(line)).length, accepted: lines.filter((line) => accepted.test(line)).length },
    lines: lines.filter((line) => AUTH_ATTEMPT.test(line) || connection.test(line) || sessionOf(line, user) !== undefined),
  };
}

/** Marks that no sentence holds: what is cut at them is the opening of a sentence that carries a cause or a code. */
const CAUSE_MARK = '@@cause@@';
const CODE_MARK = 987654321;

/** `text` up to `mark`; a sentence that does not hold the mark is a refusal (the product changed the sentence), never a silent whole text. */
function openingOf(text, mark) {
  const at = text.indexOf(String(mark));
  if (at === -1) {
    throw new Error(`the sentence does not hold the mark ${mark}: ${text}`);
  }
  return text.slice(0, at);
}

/**
 * The texts of §3.5 for the entry `name`, read from the product's own functions (`parts`: the six of them and `PIN_PATH_KINDS`): both forms of
 * A, the opening of B (up to its cause), C, D, E for EVERY kind of `PIN_PATH_KINDS`, F for no code and the opening of F with a code.
 */
function sentencesOf(parts, name) {
  return [
    parts.unusablePinSentence(name, 'askpass'),
    parts.unusablePinSentence(name, 'key'),
    openingOf(parts.pinWriteFailedSentence(name, new Error(CAUSE_MARK)), CAUSE_MARK),
    parts.refusedHostKeySentence(name),
    parts.unnamedHostKeySentence(name),
    ...Object.keys(parts.PIN_PATH_KINDS).map((kind) => parts.pinPathSentence(name, kind)),
    parts.pinClientSentence(name, null),
    openingOf(parts.pinClientSentence(name, CODE_MARK), CODE_MARK),
  ];
}

/** Whether `text` holds one of `sentences`. */
const saysASentence = (text, sentences) => sentences.some((sentence) => text.includes(sentence));

/**
 * The client config the shim hands the real `ssh` in a row leg (`-F`, so the person's `~/.ssh/config` is not read): section 10's two lines (no
 * known-hosts file, so a call without the pin words is a first contact that writes nothing), and two more. `HOME` does not move the client's `~`
 * (it takes it from the password database; F23 of the spec), so without the `IdentityFile` line a password call looks for the person's own
 * `~/.ssh/id_*` (F7); the file named here is never made.
 */
const handedClientConfig = (dir) => `${[
  'Host *',
  '  UserKnownHostsFile /dev/null',
  '  GlobalKnownHostsFile /dev/null',
  `  IdentityFile ${path.join(dir, 'no-default-identity')}`,
  '  IdentityAgent none',
].join('\n')}\n`;

/** The lines that turn password logins on in a counterpart: a `Match` block takes in every line after it, so nothing may follow them (F4, F5). */
const PASSWORD_LINES = ['Match all', 'PasswordAuthentication yes'];

/**
 * E1's words of a pinned call (the three pairs of §3.9): `withoutSources` of the test helpers takes E2's three options out. Throws, naming the
 * options at fault, unless the rest names exactly the three options of `hostKeyOptions`, each once. Answers the six words.
 */
function e1Words(words, withoutSources, hostKeyOptions) {
  const six = withoutSources(words);
  const named = six.filter((word) => word !== '-o');
  const count = (name) => named.filter((word) => word.toLowerCase().startsWith(`${name.toLowerCase()}=`)).length;
  const bad = hostKeyOptions.filter((name) => count(name) !== 1);
  if (bad.length > 0 || named.length !== hostKeyOptions.length) {
    throw new Error(`these are not E1's three pairs (${hostKeyOptions.join(', ')}, each once; at fault: ${bad.join(', ') || 'a word that names none of them'}): ${JSON.stringify(six)}`);
  }
  return six;
}

/** One output line of a leg process, read: `ok  <name>` and `FAIL <name> — <detail>` are checks, every other line is printed as it is. */
function legLine(line) {
  const passed = /^ok +(\S.*)$/.exec(line);
  if (passed !== null) {
    return { kind: 'check', ok: true, name: passed[1], detail: undefined };
  }
  const failed = /^FAIL +(.+?)(?: — (.*))?$/.exec(line);
  return failed === null ? { kind: 'print', text: line } : { kind: 'check', ok: false, name: failed[1], detail: failed[2] };
}

module.exports = { AUTH_ATTEMPT, CAUSE_MARK, openingOf, literal, kindOf, isQuestion, isConnectionStart, roadOf, logCounts, sentencesOf, saysASentence, handedClientConfig, PASSWORD_LINES, e1Words, legLine };
