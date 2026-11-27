'use strict';
// Probe P7 of E3.S3 (`research/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): a program that never answers `-V`, ended by the runner's limit, for M11 (d).
//
// What it shows: a program that records its start, answers nothing and does not end by itself is asked `-V` by the product's own asker
// (`pinClientAsker` of `out/pinClient.js`), the runner's limit ends it, and the probe can time it and see it gone by its pid and start time
// (never by name). It is the PROGRAM that the shim finds as "the real client" (F15 of the brief): `<dir>/never` goes first on `process.env.PATH`
// before `rigOf` and `installShim` run. The times are recorded against the margin of M11 (d) and decide nothing.
const fs = require('node:fs');
const path = require('node:path');
const { rigOf, installShim, recordedStarts } = require('./itestPinnedRoads.cjs');
const { alive } = require('./itestServing.cjs');
const { within } = require('./itestNoSharing.cjs');

/** `text` in single quotes for `sh` (a `'` inside ends the quote, is escaped, and opens it again). */
const quoted = (text) => `'${text.replaceAll("'", String.raw`'\''`)}'`;

/** `<never>/ssh`: records its start as the shim does (pid, start time, count, each word NUL-ended), then becomes `sleep infinity` by `exec`. */
function writeProgram(never, records) {
  const lines = [
    '#!/bin/sh',
    '# The program of probe P7: it records this start, answers nothing and does not end by itself.',
    'set -C',
    `{ printf '%s\\0' "$$" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\\0' "$@"; } > ${quoted(records)}/"$$".argv || exit 97`,
    'exec sleep infinity',
    '',
  ];
  const file = path.join(never, 'ssh');
  fs.writeFileSync(file, lines.join('\n'), { mode: 0o700 });
  return file;
}

/** The program's own record of its start, when it is there: `{ pid, start, argv }`. */
function startOfProgram(records) {
  return recordedStarts({ records })[0];
}

async function probeNeverAnswers(ctx) {
  const never = path.join(ctx.dir, 'never');
  const records = path.join(never, 'records');
  fs.mkdirSync(records, { recursive: true });
  const program = writeProgram(never, records);
  // F15: the program is first on this process's PATH BEFORE the rig and the shim are made, so the shim resolves it as the real client. Put back at the end.
  const ownPath = process.env.PATH;
  process.env.PATH = `${never}${path.delimiter}${ownPath ?? ''}`;
  ctx.section.after(() => {
    process.env.PATH = ownPath;
  });
  const rig = rigOf(ctx.section, ctx.dir, ctx.out);
  const real = installShim(rig);
  ctx.check('the shim resolved the program of the probe as the real client', real === fs.realpathSync(program), JSON.stringify({ real, program }));
  if (real === undefined) {
    return;
  }
  // Cold: a new asker, so nothing is kept. `watch` follows the program from its own record: its start time is read from there.
  const asker = rig.product.pinClientAsker();
  const t0 = Date.now();
  let gone;
  const watch = (async () => {
    const seen = await within(30_000, () => {
      const one = startOfProgram(records);
      if (one === undefined || !one.whole) {
        return false;
      }
      if (!alive(one)) {
        gone = Date.now();
        return true;
      }
      return false;
    });
    return seen ? gone : undefined;
  })();
  const answer = await asker({ program: 'ssh', env: rig.env });
  const t1 = Date.now();
  const t2 = await watch;
  const starts = recordedStarts(rig);
  const own = recordedStarts({ records });
  ctx.check('P7.1 the shim recorded exactly ONE start, whose argv is -V, and the program recorded one start with the same pid', starts.length === 1 && starts[0].whole && starts[0].argv.join(' ') === '-V' && own.length === 1 && own[0].pid === starts[0].pid, JSON.stringify({ shim: starts, program: own }));
  ctx.check('P7.2 the asker answered { kind: unreadable, exitCode: null }', answer.kind === 'unreadable' && answer.exitCode === null, JSON.stringify(answer));
  ctx.check('P7.3 the program is gone by its recorded pid and start time within 30 s (never by name)', own.length === 1 && t2 !== undefined && !alive(own[0]), JSON.stringify({ program: own, t2 }));
  const seconds = (ms) => (ms === undefined ? null : ((ms - t0) / 1000).toFixed(2));
  const inMargin = (ms) => ms !== undefined && ms - t0 >= 10_000 && ms - t0 <= 15_000;
  ctx.info(`P7.4 t1 - t0 = ${seconds(t1)} s (the asker answered), t2 - t0 = ${seconds(t2)} s (the program gone); margin of M11 (d): 10 s to 15 s; t1 in it: ${inMargin(t1)}, t2 in it: ${inMargin(t2)}`);
  const probe = { name: ctx.name, executables: [ctx.executableOf('the program of probe P7: records its start, then sleep infinity', program)], configs: [] };
  await ctx.recordWithoutListener(rig, real, probe);
}

module.exports = { probeNeverAnswers };
