'use strict';
// The refused leg of M4 (b)-(d) and of M9 (G1, E3.S5; `todo/PLAN_person_roads_pin_host_key_E3_S5_spec.md` §1, §3), on the rig of E3.S4: a saved host key that
// cannot be used, or a pin write that fails, on one road (*Install creds on host*, *Open Remote Bridge…*), cold or warm, in a world, a process and a counterpart
// of its own. The case is made by the entry's own data or by the storage folder, and by nothing else: (b) a saved text that does not parse; (c) a parsed key on
// a host that cannot form a known-hosts line; (d) the window's key folder `keys/<pid>/` readable and not writable, so `materializeKnownHosts` throws `EACCES` at
// its write. No product code is changed, and no function of it is patched.
//
// A leg's numbers are the four counts of decision 15 (the rig's `countsOf`: starts of the client, connection starts, the counterpart's log, the runs), the order of
// the question `ssh -V` and the sentence, and a liveness control that logs in to the same counterpart AFTER the counts: "0 connections" is not a counterpart that
// was down. A row file calls this one and the rig only (the guards of the rig's proof read both): it starts no counterpart, no world and no process itself.
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const refused = require('./lib/refusedRecord.cjs');
const { acceptedOf } = require('./itestRowM1.cjs');

const { sec, within, me } = rig;
/** After the click: a start that a defect would add (a bridge and its check, which waits 1.5 s) is in the record by then. */
const SETTLE_MS = 3_000;
const CLICKS = { install: 'installRemoteCli', bridge: 'openRemoteBridge' };
/** The install's question is dismissed in every refused leg: no leg goes on to the install. */
const dismissAll = () => undefined;

/** `<algorithm> <base64>` of a `.pub` file, as the product writes a saved key (its own parse and format). */
function keyText(product, pubFile) {
  return product.formatHostKey(product.parseHostKey(fs.readFileSync(pubFile, 'utf8')));
}

/** The first executable file `name` on the `PATH` of `env`, in the order of the `PATH` as the runner finds it; `undefined` when there is none (a file with no execute bit is passed over). */
function toolOnPath(env, name) {
  for (const folder of (env.PATH ?? '').split(path.delimiter).filter((one) => one !== '')) {
    const file = path.join(folder, name);
    try {
      if (fs.statSync(file).isFile()) {
        fs.accessSync(file, fs.constants.X_OK);
        return file;
      }
    } catch {
      // not there, or not executable: the next folder
    }
  }
  return undefined;
}

/** The write probe of R4.d0: a probe file written into `dir`; `{ refused, code }`. The file is removed if the write went through. */
function foldersWriteRefused(dir) {
  const probe = path.join(dir, 'write-probe');
  try {
    fs.writeFileSync(probe, 'probe');
    fs.rmSync(probe, { force: true });
    return { refused: false, code: null };
  } catch (error) {
    return { refused: error.code === 'EACCES', code: error.code ?? null };
  }
}

/** The case's change to the entry (§1.1): the next read of the storage answers a NEW snapshot. (d) changes the entry not at all. */
function changeEntry(w, spec) {
  if (spec.case === 'b' || spec.case === 'pin') {
    w.replaceHostKey(refused.UNUSABLE_TEXT);
  } else if (spec.case === 'c') {
    w.replaceHost(refused.UNSAFE_HOST);
  }
}

/**
 * (d): `keys/<pid>/` is made if it is not there, set to `0500`, and a write of a probe file must fail with `EACCES` (R4.d0: as root the write goes through, and the
 * leg fails as "could not fail"). `restore` puts `0700` back; it is registered with the leg's scope as well, so a signal restores it too.
 */
function makeUnwritable(check, label, leg, dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const restore = () => {
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // the folder is gone with its section
    }
  };
  leg.scope.after(restore);
  fs.chmodSync(dir, 0o500);
  const probe = foldersWriteRefused(dir);
  check(`${label}: (d) a write of a probe file into keys/<pid>/ at mode 0500 threw EACCES, so the fault is real (R4.d0)`, probe.refused, JSON.stringify(probe));
  return { restore, probe };
}

/** The click of the road, bounded, then the settling time. Answers `{ ended, error }`. */
async function driveRefused(leg, roads, road) {
  const click = await rig.press(leg, roads, CLICKS[road], 30_000);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  return click;
}

/** R.6: exactly ONE error message after the mark, the product's own expected message; no other thing said holds a sentence of §3.5. */
function messageChecks(check, label, leg, roads, spec) {
  const name = leg.product.world.ROW.node.name;
  const expected = refused.expectedMessage(leg.product, spec, name);
  const said = roads.w.said.slice(rig.markOf(roads).said);
  const errors = said.filter((one) => one.kind === 'error');
  const sentences = rec.sentencesOf(leg.product, name);
  const others = said.filter((one) => !errors.includes(one) && rec.saysASentence(one.text, sentences));
  const what = expected.code === undefined ? 'sentence A in the login\'s form, word for word' : `sentence B with ${expected.code}`;
  check(`${label}: exactly ONE error message after the mark: the road's prefix and ${what}; nothing else holds a sentence of §3.5 (R.6)`, errors.length === 1 && refused.messageMatches(errors[0].text, expected) && others.length === 0, JSON.stringify({ errors: errors.map((one) => one.text), others: others.map((one) => one.text) }));
  return errors[0];
}

/** R.7 (M4): after the last end `keys/<pid>/` holds no file; in (d) a pin file that a sample saw and that is still there is the one exception (C14), named. */
function leftChecks(check, info, label, leg, roads, spec) {
  const left = Object.keys(rig.readFolder(roads.sampler.dir));
  const seen = new Set(roads.sampler.samples().flatMap((sample) => Object.keys(sample.files)));
  const kept = spec.case === 'd' ? left.filter((name) => name.startsWith('known_hosts-') && seen.has(name)) : [];
  const owed = left.filter((name) => !kept.includes(name));
  if (spec.row === 'M4') {
    check(`${label}: after the last end keys/<pid>/ holds no file (the one exception, C14, is named below) (R.7)`, owed.length === 0, JSON.stringify(left));
  }
  if (spec.case === 'd') {
    info(`${label}: C14: pin files that the failed write left: ${kept.length === 0 ? 'none' : kept.join(', ')}`);
  }
  return kept;
}

/**
 * The liveness control (R.9): AFTER the counts, the real client by its path (never the shim: its start is no start of the leg) signs in to the same K1 with E1's
 * words and the user key, running `true`; it ends with 0 and K1 logs ONE more accepted login. So a "0 connections" cannot come from a counterpart that was down.
 */
async function liveness(check, label, leg, k1) {
  const before = rec.logCounts(k1.sshd.stderr, me).accepted.length;
  const pin = await rig.pinFileOf(leg, 'k1', k1.port, leg.k1);
  const result = await rig.controlClient(leg, { port: k1.port, pin });
  const after = (await acceptedOf(k1, before + 1)).accepted.length;
  check(`${label}: liveness: the control client signed in to the same K1 (exit 0) and K1 logged ONE more accepted login (R.9)`, result.code === 0 && after === before + 1, JSON.stringify({ code: result.code, before, after, stderr: result.stderr }));
  return { code: result.code, acceptedBefore: before, acceptedAfter: after };
}

/** What the bridge's command minted (C9), from the world's `shares`, and whether the first token came before the refusal message. */
function mintedRecord(info, label, roads, sentence) {
  const { shares } = roads.w;
  const first = shares.length > 0 && sentence !== undefined && shares[0].at < sentence.at;
  info(`${label}: C9: the bridge's command minted ${shares.length} token(s); the first before the refusal message: ${first ? 'yes' : 'no'}`);
  return { count: shares.length, firstBeforeSentence: first };
}

/** R.1 to R.5 (the judge of the lib) and the checks that need the world: the click ended, and no bridge is open. */
function countChecks(ctx, roads, spec, counts, sentence) {
  const { check, product } = ctx;
  const label = ctx.rig.label;
  const first = counts.question[0];
  const timing = { questionEnd: first === undefined ? null : first.startedAt + first.ms, sentenceAt: sentence?.at ?? null };
  refused.refusedChecks(counts, spec, timing).forEach((one) => check(`${label}: ${one.name}`, one.ok, one.detail));
  check(`${label}: no bridged row: the bridge manager holds no open bridge of the entry (R.4b)`, roads.w.bridges.isOpen(product.world.KEY) === false, JSON.stringify(roads.w.bridges.isOpen(product.world.KEY)));
  return timing;
}

/** The refused leg (§1.3): open, cold or warm, make the case, click, count, check, the liveness control, the end checks, the evidence. */
async function refusedLeg(ctx, spec) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { passwords: spec.credential === 'password' });
  if (k1 === undefined) {
    return;
  }
  const roads = rig.openRoads(leg, k1.port, { credential: spec.credential, answer: dismissAll });
  if (spec.state === 'warm') {
    await rig.warm(check, leg, roads, [k1]);
    changeEntry(roads.w, spec);
  } else {
    changeEntry(roads.w, spec);
    rig.mark(leg, roads, [k1]);
    check(`${label}: cold: 0 runs of ssh -V and 0 starts of the client before the click`, roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length }));
  }
  const unwritable = spec.case === 'd' ? makeUnwritable(check, label, leg, roads.sampler.dir) : undefined;
  let click;
  try {
    click = unwritable?.probe.refused === false ? undefined : await driveRefused(leg, roads, spec.road);
  } finally {
    unwritable?.restore(); // before the end checks: nothing is left at 0500
  }
  if (click === undefined) {
    return void (await rig.endCounterpart(check, leg, k1, 'K1'));
  }
  check(`${label}: the click ended within 30 s`, click.ended, JSON.stringify(click));
  const counts = rig.countsOf(leg, roads, [k1]);
  const atCounts = { ...k1, sshd: { stderr: k1.sshd.stderr } }; // the log as the counts read it: the control client's login is not one of the leg's connections
  const sentence = messageChecks(check, label, leg, roads, spec);
  const timing = countChecks(ctx, roads, spec, counts, sentence);
  if (spec.credential === 'password') {
    const { passwords } = counts.counterparts[0];
    check(`${label}: the counterpart's log shows no password attempt: no Failed password and no Accepted password after the mark (R.8)`, passwords.failed === 0 && passwords.accepted === 0, JSON.stringify(passwords));
  }
  const alive = await liveness(check, label, leg, k1);
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, leg.product));
  const kept = leftChecks(check, info, label, leg, roads, spec);
  const minted = spec.road === 'bridge' ? mintedRecord(info, label, roads, sentence) : null;
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [atCounts], { case: spec.case, road: spec.road, state: spec.state, writeProbe: unwritable?.probe ?? null, minted, leftByFailedWrite: kept, liveness: alive, questionMs: counts.question[0]?.ms ?? null, ...timing });
}

module.exports = { refusedLeg, driveRefused, foldersWriteRefused, liveness, keyText, toolOnPath, changeEntry, dismissAll };
