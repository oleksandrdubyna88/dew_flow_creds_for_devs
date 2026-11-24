'use strict';
// The pure rules of M2, M3 and M8 of G1 (E3.S6; `todo/PLAN_person_roads_pin_host_key_E3_S6_spec.md` §5.1): the table of the seven legs, the words of the controls and of the
// witnesses (literal, never read from the product's `hostKeyWords`: a hand check of it must not change a control), a known-hosts line made from a `.pub`, the sessions of
// an sshd log, the judge of the four refused runs, and the recording command of M8 with the reading of its records.
//
// Nothing is read when this module is loaded: no variable, no file, no process (as `rowRecord.cjs`). It imports no module of the product.
const LEG_LIST = [
  { name: 'm2-mismatch-user', row: 'M2', scenario: 'mismatch', source: 'user', pinnedTo: 'K1', roads: 'three', stop: null },
  { name: 'm2-mismatch-global', row: 'M2', scenario: 'mismatch', source: 'global', pinnedTo: 'K1', roads: 'three', stop: null },
  { name: 'm2-switch-user', row: 'M2', scenario: 'switch', source: 'user', pinnedTo: 'K1', roads: 'install', stop: 'whole' },
  { name: 'm2-switch-global', row: 'M2', scenario: 'switch', source: 'global', pinnedTo: 'K1', roads: 'install', stop: 'whole' },
  { name: 'm3-mismatch', row: 'M3', scenario: 'mismatch', source: 'master', pinnedTo: 'K2', roads: 'three', stop: null },
  { name: 'm3-switch', row: 'M3', scenario: 'switch', source: 'master', pinnedTo: 'K1', roads: 'install', stop: 'listener' },
  { name: 'm8', row: 'M8', scenario: 'mismatch', source: 'command', pinnedTo: 'K1', roads: 'three', stop: null },
];
/** The seven legs, in the order that section 10 runs them (§1.1). */
const OTHER_KEY_LEGS = Object.freeze(LEG_LIST.map((one) => Object.freeze({ ...one })));

/** The line that the real client prints when a host key is refused; the verification line of the rows. */
const VERIFY_FAILED = 'Host key verification failed.';

/** G2's two options, as literal words (as `NEW_PAIRS` pins E2's values): never read from the product. */
const G2_WORDS = Object.freeze(['ControlPath=none', 'ControlMaster=no']);

/** A path that a command-line option can name bare: white space or a quote would split or quote it. */
function bare(file) {
  if (/[\s'"]/.test(file)) {
    throw new Error(`a path with white space or a quote cannot be named bare in an option: ${JSON.stringify(file)}`);
  }
  return file;
}

/** `[127.0.0.1]:<port> <type> <base64>\n` from the first two fields of a `.pub` text. Not the product's `knownHostsLine`: a defect of it must not make a source that the client then refuses. */
function knownHostsLineOf(port, pubText) {
  const fields = String(pubText).trim().split(/\s+/);
  if (fields.length < 2) {
    throw new Error(`a .pub text needs at least two fields (type and key); this one has ${fields.length}`);
  }
  return `[127.0.0.1]:${port} ${fields[0]} ${fields[1]}\n`;
}

/** E1's words as `f3e9887d` writes them: the three pairs, one file as both known-hosts files (§3.9 row 2). */
const e1WordsFor = (file) => ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${bare(file)}`, '-o', `GlobalKnownHostsFile=${file}`];
/** The two pairs of before E1 (§3.9 row 1): no `GlobalKnownHostsFile`. */
const beforeE1WordsFor = (file) => ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${bare(file)}`];
/** M2 (a)'s witness: no known-hosts word at all, so the client reads the file that its config names. */
const STRICT_ONLY = Object.freeze(['-o', 'StrictHostKeyChecking=yes']);

/** The option texts of an argv: every `-o <text>` and `-o<text>`, in order. */
function optionTexts(argv) {
  return argv.flatMap((word, at) => {
    if (argv[at - 1] === '-o') {
      return [word];
    }
    return word.startsWith('-o') && word.length > 2 ? [word.slice(2)] : [];
  });
}

/**
 * The recorded words of a road's run with the value of each `UserKnownHostsFile=` and `GlobalKnownHostsFile=` that is there replaced by `file`; every other word as it was. Throws only
 * when NONE is there (words that name no known-hosts file are no pin words of a road). That the six options of E1 and E2 are all there is the caller's own check: a road that lost one
 * (a hand check of the product) must show as a named check of its own, not as an exception that ends the leg.
 */
function withFile(words, file) {
  const done = { user: 0, global: 0 };
  const replace = (text) => {
    const found = /^(UserKnownHostsFile|GlobalKnownHostsFile)=/i.exec(text);
    if (found === null) {
      return text;
    }
    done[found[1].toLowerCase().startsWith('user') ? 'user' : 'global'] += 1;
    return `${found[1]}=${bare(file)}`;
  };
  const moved = words.map((word, at) => (words[at - 1] === '-o' ? replace(word) : word.startsWith('-o') && word.length > 2 ? `-o${replace(word.slice(2))}` : word));
  if (done.user + done.global === 0) {
    throw new Error(`the words name no UserKnownHostsFile and no GlobalKnownHostsFile: ${JSON.stringify(words)}`);
  }
  return moved;
}

/** Every `-o` word of `argv` that names `ControlPath` or `ControlMaster`, as the option text. */
const sharingWordsOf = (argv) => optionTexts(argv).filter((text) => /^(ControlPath|ControlMaster)=/i.test(text));

/** The `Starting session: <kind> … for <user> from 127.0.0.1 port <n> id <m>` lines of a log, as `[{ kind, port, id }]` (a session through a master adds no `Accepted` line, so these are counted apart). */
function sessionsOf(log, user) {
  const escaped = user.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const line = new RegExp(String.raw`Starting session: ([\w-]+)[^\n]* for ${escaped} from 127\.0\.0\.1 port (\d+) id (\d+)`);
  return log.split(/\r?\n/).flatMap((text) => {
    const found = line.exec(text);
    return found === null ? [] : [{ kind: found[1], port: Number(found[2]), id: Number(found[3]) }];
  });
}

/** Whether `text` holds the verification line as a whole line (LF or CR LF). */
const hasLine = (text) => typeof text === 'string' && new RegExp(String.raw`^${VERIFY_FAILED.replace('.', String.raw`\.`)}\r?$`, 'm').test(text);

const FOUR_KINDS = 'bridge,mode,probe,sweep';
/**
 * The judge of M2.1, M3.1 and M8.1 (§5.1): `counts` is the rig's `countsOf`. ok only when the starts after the mark hold exactly four connection starts, one each of `probe`,
 * `bridge`, `sweep` and `mode` (so no `install`), each runner run of the three kinds ended with 255 and the verification line, and the bridge ended with 255 and `bridgeStderr`
 * (its OWN stderr; `null` when it was not read) holds the line too. A value not read is a failure, never a pass.
 */
function refusedRoads(counts, bridgeStderr) {
  const problems = [];
  const kinds = counts.starts.list.filter((one) => one.connection).map((one) => one.kind).sort().join(',');
  if (kinds !== FOUR_KINDS) {
    problems.push(`the connection starts are [${kinds}], not [${FOUR_KINDS}]`);
  }
  for (const kind of ['probe', 'sweep', 'mode']) {
    const runs = counts.runs.filter((one) => one.kind === kind);
    if (runs.length !== 1) {
      problems.push(`${runs.length} runs of ${kind}`);
    }
    runs.filter((one) => one.exitCode !== 255 || !hasLine(one.stderr)).forEach((one) => problems.push(`the ${kind} run ended with ${one.exitCode} and ${hasLine(one.stderr) ? 'the line' : 'no whole line'}`));
  }
  if (counts.bridges.length !== 1) {
    problems.push(`${counts.bridges.length} bridges`);
  } else if (counts.bridges[0].exitCode !== 255) {
    problems.push(`the bridge ended with ${counts.bridges[0].exitCode}`);
  }
  if (bridgeStderr === null || bridgeStderr === undefined) {
    problems.push('the bridge\'s stderr was not read');
  } else if (!hasLine(bridgeStderr)) {
    problems.push('the bridge\'s stderr holds no whole verification line');
  }
  return { ok: problems.length === 0, detail: problems.length === 0 ? undefined : problems.join('; ') };
}

/** The shell's single quote of a path (a `'` inside ends the quote, is escaped, and opens it again). */
const quoted = (text) => `'${text.replaceAll("'", String.raw`'\''`)}'`;

/**
 * The recording command of M8 (§4.1): each start leaves one record `<records>/<pid>.start` (pid, parent pid, start time, argc, each word NUL-ended), then the command prints the
 * line file. The pid of a start is `$$`; `set -C` keeps a record that exists from being overwritten.
 */
function khcScript(records, lineFile) {
  return [
    '#!/bin/sh',
    '# The KnownHostsCommand of row M8: it records this start, then prints the line of K2. Written once, by the leg.',
    'set -C',
    `{ printf '%s\\0' "$$" "$PPID" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\\0' "$@"; } > ${quoted(records)}/"$$".start || exit 97`,
    `cat ${quoted(lineFile)}`,
    '',
  ].join('\n');
}

/** The starts of the recording command, read from the texts of its records: `[{ pid, ppid, start, argc, argv }]`; the argv is cut at its argc (a start with no word leaves one empty field). */
function khcStarts(texts) {
  return texts.map((text) => {
    const [pid, ppid, start, size, ...rest] = text.split('\0');
    const argc = Number(size);
    return { pid: Number(pid), ppid: Number(ppid), start, argc, argv: rest.slice(0, argc) };
  });
}

module.exports = { OTHER_KEY_LEGS, VERIFY_FAILED, G2_WORDS, knownHostsLineOf, e1WordsFor, beforeE1WordsFor, STRICT_ONLY, withFile, sharingWordsOf, sessionsOf, hasLine, refusedRoads, khcScript, khcStarts };
