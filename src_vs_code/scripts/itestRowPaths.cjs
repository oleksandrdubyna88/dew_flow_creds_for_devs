'use strict';
// What the rows M7, M12 and M14 of G1 share (E3.S7; `todo/PLAN_person_roads_pin_host_key_E3_S7_spec.md` §1.2 to §1.4, §5.2). The case of each leg is made by the STORAGE FOLDER of the leg's window and by
// nothing else: a folder inside the leg's own folder whose name holds the characters that the row names, handed to the world as its `storageDir`, so the product makes the pin file's complete pathname itself.
// No product function is patched and no path is handed to a builder. Every expected word, kind, prefix and path is pinned in the spec or computed from what the leg made (the lesson of S5.R.6b): where a
// check also reads a product function, a pinned part stands beside it. Like every row file this one starts no counterpart, no world and no process itself (the guards of the rig's proof read it).
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const pr = require('./lib/pathRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');

const { sec } = rig;
/** A character that the case is made of: the leg's own folder must hold none, so the storage folder's name is the only cause of a kind or a quote (§1.2). */
const MADE_OF = /[\s'"\\%$~\u0000-\u001f\u007f]/;
const SENTENCE_C_WORDS = 'did not present its saved host key, so CredsForDevs did not connect';
const SENTENCE_D_WORDS = 'did not name the saved host key';
const BRIDGE_PREFIX = 'The bridge to "box" is not open: ';

/** The storage folder of the leg, `<leg>/st/<name>` (mode 0700), set as the leg's storage BEFORE its world opens (§1.2). Throws when the leg's own folder holds a character that the case is made of. */
function storageAt(ctx, name) {
  const leg = ctx.rig;
  if (MADE_OF.test(leg.dir)) {
    throw new Error(`the leg's own folder holds a character that the case is made of: ${JSON.stringify(leg.dir)}`);
  }
  const dir = path.join(leg.dir, 'st', name);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  leg.storage = dir;
  return dir;
}

/** The product's rule asked with the COMPLETE pathname that it makes for this leg (`knownHostsPath`, a fresh uuid), and with the leg's own folder alone (§1.2). `null` is "no refusal". */
function ruleOf(ctx) {
  const leg = ctx.rig;
  const pathname = ctx.product.knownHostsPath(leg.storage, 'e1', crypto.randomUUID());
  return { pathname: path.relative(leg.dir, pathname), answer: ctx.product.pinPathRefusal(pathname) ?? null, legFolderAnswer: ctx.product.pinPathRefusal(path.join(leg.dir, 'x')) ?? null };
}

/** M7.w (§1.3): every connection start after the mark names ONE pin file in both known-hosts options, as the table's word: `"<path>"` or `<path>`, read with `valuesOf`, never through `pinOf`'s stripping. */
function wordCheck(ctx, label, roads, spec) {
  const leg = ctx.rig;
  const keys = path.join(leg.storage, 'keys', String(process.pid));
  const named = /^known_hosts-e1-[0-9a-f-]{36}$/;
  const read = shared.connectionStarts(leg, roads).map((start) => {
    const [user, global] = ['UserKnownHostsFile', 'GlobalKnownHostsFile'].map((option) => ctx.product.argv.valuesOf(start.argv, option));
    const name = path.basename((user[0] ?? '').replace(/^"|"$/g, ''));
    const file = path.join(keys, name);
    const backslashes = file.split('\\').length - 1;
    const right = user.length === 1 && global.length === 1 && named.test(name) && user[0] === pr.expectedWord(file, spec.word) && global[0] === user[0];
    return { right: right && (spec.shape !== 'e' || (backslashes === 1 && !file.endsWith('\\'))), user, global };
  });
  const how = spec.word === 'quoted' ? 'a path in double quotes' : 'a bare path';
  ctx.check(`${label}: every connection start names the pin file in both known-hosts options as ${how}: <storage>/keys/<pid>/known_hosts-e1-<uuid>${spec.shape === 'e' ? ', with one backslash inside and none at its end' : ''} (M7.w)`, read.length > 0 && read.every((one) => one.right), JSON.stringify(read.filter((one) => !one.right)));
}

/** The error messages after the mark, in the order shown. */
const errorsOf = (roads) => roads.w.said.slice(rig.markOf(roads).said).filter((one) => one.kind === 'error').map((one) => one.text);

/** The file that a run's recorded argv names as the known-hosts file, as the table's word writes it: the quotes of a quoted word taken off. */
function fileOfRun(ctx, run, spec) {
  const value = ctx.product.argv.valuesOf(run?.argv ?? [], 'UserKnownHostsFile')[0];
  return value === undefined ? undefined : spec.word === 'quoted' ? value.replace(/^"(.*)"$/, '$1') : value;
}

/** M7.c1 to M7.c3 (§2.2): sentence C on both roads, and the `Offending` line with the pin file of its own call, read with the harness's own printing (not the product's). */
function sentenceCChecks(ctx, label, roads, spec) {
  const { check, product } = ctx;
  const [errors, sentenceC, sentenceD] = [errorsOf(roads), product.refusedHostKeySentence('box'), product.unnamedHostKeySentence('box')];
  const alone = errors.filter((text) => text === sentenceC);
  const noD = !errors.some((text) => text.includes(sentenceD) || text.includes(SENTENCE_D_WORDS));
  check(`${label}: the install showed sentence C: exactly one error message after the mark is the product's sentence C, with its pinned words; no error holds sentence D (M7.c1)`, alone.length === 1 && alone[0].includes(SENTENCE_C_WORDS) && noD, JSON.stringify(errors));
  const bridge = errors.filter((text) => text === `${BRIDGE_PREFIX}${sentenceC}`);
  check(`${label}: the bridge's socket check showed sentence C: exactly one error message is "${BRIDGE_PREFIX}" and sentence C (M7.c2)`, bridge.length === 1 && bridge[0].includes(SENTENCE_C_WORDS), JSON.stringify(errors));
  ctx.info(`${label}: the bridge's log lines of the check: ${JSON.stringify(roads.w.logs.filter((text) => text.includes(BRIDGE_PREFIX)))}`);
  const runs = [['probe', sec.runOf(roads, product.probeCommand())], ['mode check', sec.runOf(roads, product.modeCheckCommand({ path: roads.bridges[0]?.remote ?? '' }))]];
  const named = runs.map(([what, run]) => {
    const file = fileOfRun(ctx, run, spec);
    return { what, file, ok: file !== undefined && pr.offendingNames(run?.outcome?.stderr ?? '', file) };
  });
  check(`${label}: the stderr of the probe and of the mode check each holds the Offending line of ssh with the pin file of its own call, as ssh prints it (M7.c3)`, named.every((one) => one.ok), JSON.stringify(named));
}

/** The twin writer of the collision (§1.4, A3): `onPin(pinFile)` writes the bare word's path (the apostrophes taken out) with K2's line for `port`, folders 0700, file 0600, and records when. Answers `{ onPin, twins }`. */
function twinWriter(ctx, port, keyFile) {
  const twins = [];
  const line = ok.knownHostsLineOf(port, fs.readFileSync(`${keyFile}.pub`, 'utf8'));
  const onPin = (pin) => {
    const twin = pr.resolvedBare(pin);
    fs.mkdirSync(path.dirname(twin), { recursive: true, mode: 0o700 });
    fs.writeFileSync(twin, line, { mode: 0o600 });
    twins.push({ pin, twin, at: performance.now() });
  };
  return { onPin, twins };
}

/**
 * The control and the witness of the collision (M7.y3, M7.x2): `<leg>/st/<folder>/control/known_hosts-control` with K1's line and its twin (the apostrophes taken out) with K2's line, both written here (not by the product),
 * then the real client by its path with E1's words with the path BARE and as it is. Answers `{ file, twin, words, run }`.
 */
async function controlBare(ctx, server, folder) {
  const leg = ctx.rig;
  const file = path.join(leg.dir, 'st', folder, 'control', 'known_hosts-control');
  const twin = pr.resolvedBare(file);
  for (const [target, key] of [[file, leg.k1], [twin, leg.k2]]) {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, ok.knownHostsLineOf(server.port, fs.readFileSync(`${key}.pub`, 'utf8')), { mode: 0o600 });
  }
  const words = pr.e1WordsRaw(file);
  return { file, twin, words, run: await shared.login(ctx, server, words) };
}

/** Whether a bare control's argv is exactly the words, and its two known-hosts values hold two apostrophes and no double quote. */
function bareWordsOk(controlled) {
  const values = controlled.run.argv.filter((word) => /^(User|Global)KnownHostsFile=/.test(word));
  return JSON.stringify(shared.wordsOf(controlled.run.argv)) === JSON.stringify(controlled.words) && values.length === 2 && values.every((word) => word.split("'").length === 3 && !word.includes('"'));
}

/** M12.3 and M14.d4: no file was written into the storage folder (no sample of `keys/<pid>/` held a file; the folder's files after are those before, and there were none). Folders are recorded as info. */
function storageUnchanged(ctx, label, roads, before, id) {
  const after = pr.listingOf(ctx.rig.storage);
  const files = (list) => list.filter((one) => one.type !== 'dir');
  const held = roads.sampler.samples().filter((sample) => Object.keys(sample.files).length > 0);
  ctx.check(`${label}: no file was written into the storage folder: no sample of keys/<pid>/ held a file, and the folder holds the same files after as before (none) (${id})`, held.length === 0 && files(before).length === 0 && JSON.stringify(files(before)) === JSON.stringify(files(after)), JSON.stringify({ samples: roads.sampler.samples().length, held: held.length, before, after }));
  ctx.info(`${label}: folders of the storage folder after the call: ${JSON.stringify(after.filter((one) => one.type === 'dir').map((one) => one.rel))}`);
  return after;
}

/** M12.5: exactly ONE error message after the mark: the road's prefix (a literal) and sentence E of the leg's kind, with the kind's words pinned from the plan, and no path in it. */
function sentenceE(ctx, label, roads, spec, prefix) {
  const leg = ctx.rig;
  const errors = errorsOf(roads);
  const text = errors[0] ?? '';
  const words = pr.KIND_WORDS[spec.kind];
  const noPath = pr.noPathIn(text, [leg.storage, path.basename(leg.storage), leg.dir]);
  const right = errors.length === 1 && text === `${prefix}${ctx.product.pinPathSentence('box', spec.kind)}` && text.startsWith(prefix) && words !== undefined && text.includes(words) && noPath.ok;
  ctx.check(`${label}: exactly ONE error message after the mark: "${prefix}" and sentence E with ${words}; it holds no path (M12.5)`, right, JSON.stringify({ errors, noPath }));
}

/** M7.y2 (as M2.3): K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts. */
function k2Counts(ctx, label, counts, id) {
  const log = counts.counterparts[0];
  const wanted = counts.starts.connectionStarts;
  ctx.check(`${label}: K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts (${id})`, wanted > 0 && log.connections >= wanted && log.accepted.length === 0 && log.authAttempts === 0 && !log.lines.some((line) => rec.AUTH_ATTEMPT.test(line)), JSON.stringify({ connectionStarts: wanted, connections: log.connections, accepted: log.accepted, attempts: log.authAttempts }));
}

/** The leg's evidence when no road was driven (`drove: false`, and the rule's leg): ONE `evidence <json>` line and `evidence.json`. */
function evidenceNone(leg, fields) {
  const record = homeAsTilde({ record: 1, row: leg.row, leg: leg.name, pid: process.pid, ...fields });
  fs.writeFileSync(path.join(leg.dir, 'evidence.json'), `${JSON.stringify(record)}\n`);
  console.log(`evidence ${JSON.stringify(record)}`);
  return record;
}

/** A value with the person's home folder written as `~` (M12 (h): `ssh -G` prints the expanded path). */
function homeAsTilde(value) {
  const home = JSON.stringify(os.userInfo().homedir).slice(1, -1); // the person's home as the password database names it (ssh reads that one), not `HOME`, which is the leg's
  return JSON.parse(JSON.stringify(value).replaceAll(home, '~'));
}

module.exports = { storageAt, ruleOf, wordCheck, sentenceCChecks, twinWriter, controlBare, bareWordsOk, storageUnchanged, sentenceE, k2Counts, evidenceNone, homeAsTilde, errorsOf, SENTENCE_C_WORDS };
