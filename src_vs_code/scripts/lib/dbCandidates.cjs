'use strict';
// The candidate table of the database harnesses (E1.7 spec §S7.7 "Before a row is turned: the candidate table", §S7.12 V7): the verdict a launch is built under is the REAL check's own,
// never an object a harness wrote by hand.
//
// A bridged launch is built only under a verdict of the database client check (`bridgedDbClientCheck`, `src/bridgedDbClient.ts`), and while the production table serves no row for a client
// that check starts nothing. So a harness hands the check THE PRODUCTION TABLE WITH ONE CANDIDATE ROW PUT IN: the row the turning commit will write, for the client, vendor, version and build tag
// the leg is about. The check, the builder and the environment are the real ones; this file adds only the row, the folder the walk finds the client in, and the lines that say so.
//
//   CANDIDATE <client> <vendor> <version> <tag> <platform> [driver <version>]    the table the leg was handed names this build (it is not yet served)
//   PRODUCTION <client> <vendor> <version> <tag> <platform> [driver <version>]   the production table already serves this build: nothing is handed in
//
// The build of a candidate is read from the client's own version answer (stdout, exit 0) by the rig's readers of PA1-a (`dbProbeRig.cjs`), so the row names exactly the line the client prints
// and the check must read the same line with its own reader. A client the check then refuses is a RIG/RECORD FINDING, printed as such with what the version spawn answered: it is never a crash
// and never a pass, and the caller counts its legs `UNMEASURED`.
//
// Nothing here prints a credential or an environment.
const fs = require('node:fs');
const path = require('node:path');
const { runSync, versionOfClient } = require('./dbProbeRig.cjs');

const OUT = path.join(__dirname, '..', '..', 'out');
const IS_WINDOWS = process.platform === 'win32';

/** Each family of the rigs: the client the table names, the program word the check looks for on the bridged PATH, the vendor, and what makes the client answer its version (the product's own). */
const FAMILIES = {
  psql: { client: 'psql', word: 'psql', vendor: 'postgresql', args: ['--version'] },
  oracle: { client: 'mysql', word: 'mysql', vendor: 'oracle', args: ['--version'] },
  mariadb: { client: 'mysql', word: 'mysql', vendor: 'mariadb', args: ['--version'] },
  'go-sqlcmd': { client: 'sqlcmd', word: 'sqlcmd', vendor: 'go-sqlcmd', args: ['-?'] },
  'odbc-sqlcmd': { client: 'sqlcmd', word: 'sqlcmd', vendor: 'odbc-sqlcmd', args: ['-?'] },
};

/** The product modules the check is made of, from `out/`. */
const modules = () => ({
  clientModule: require(path.join(OUT, 'bridgedDbClient.js')),
  profile: require(path.join(OUT, 'bridgedDbProfile.js')),
  env: require(path.join(OUT, 'bridgedSshEnv.js')),
});

/** The first line of `text`, clipped, for a finding. */
const firstWords = (text, limit = 160) => (text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '').trim().slice(0, limit);

/** What a verdict is, in words: the vendor, the version, the build tag and the file that answered. */
const words = (verdict) => `${verdict.vendor} ${verdict.version} ${JSON.stringify(verdict.tag)} by the file ${verdict.file.path}`;

/**
 * The folder whose `<word>` (`<word>.exe` on Windows) is the client's file: the client's own folder when its file is named for the word, else a folder of the rig with a link of that name
 * (MariaDB's client is `mariadb` and the check asks for `mysql`; a wrapper script has its own name). The check starts that path, never the real path, as production does.
 */
function folderFor(exe, family, dir) {
  const { word } = FAMILIES[family];
  // Windows names a file in any letter case; elsewhere `MYSQL` is another file than `mysql`, and the walk would find the other one.
  const named = path.basename(exe).replace(/\.exe$/i, '');
  if ((IS_WINDOWS ? named.toLowerCase() : named) === word) {
    return path.dirname(exe);
  }
  const folder = path.join(dir, `client-${family}`);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, IS_WINDOWS ? `${word}.exe` : word);
  fs.rmSync(file, { force: true });
  try {
    fs.symlinkSync(exe, file);
  } catch {
    fs.copyFileSync(exe, file);
  }
  return folder;
}

/** The source of the check's bridged environment: `PATH` with the client's folder first, and `HOME` (off Windows), or the real environment on Windows whose allow-list picks the seven names. */
function sourceOf(folder, home) {
  const path_ = `${folder}${path.delimiter}${process.env.PATH ?? ''}`;
  if (!IS_WINDOWS) {
    return { PATH: path_, HOME: home };
  }
  const kept = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH'));
  return { ...kept, PATH: path_ };
}

/**
 * The driver an ODBC `sqlcmd` build lists (E1.7 spec §S7.16 L11): the product's own lookup of the driver file the ODBC configuration names for this client, so that the candidate row names the driver the
 * check will bind. Nothing for any other client, and nothing when the lookup fails: the build then lists no driver and the real check refuses the client with its own cause.
 */
function driverBuild(parts, family, clientVersion) {
  if (family !== 'odbc-sqlcmd') {
    return {};
  }
  const found = parts.clientModule.odbcDriverOf(process.platform, parts.clientModule.nodeDbFiles, clientVersion);
  return found.ok ? { driver: found.driver.version } : {};
}

/** The table the check reads: the production table with the candidate row put in, or the production table itself when it already serves the build. */
function tableWith(rows, platform, family, build) {
  const { client, vendor } = FAMILIES[family];
  const row = rows.find((one) => one.client === client && one.platform === platform);
  const recorded = (row?.clients ?? []).find((served) => served.vendor === vendor);
  if (row?.served === true && (recorded?.builds ?? []).some((one) => one.version === build.version && one.tag === build.tag && one.driver === build.driver)) {
    return { rows, mode: 'PRODUCTION' };
  }
  const others = row?.served === true ? (row.clients ?? []).filter((served) => served.vendor !== vendor) : [];
  const candidate = {
    client,
    platform,
    served: true,
    clients: [...others, { vendor, builds: [...(recorded?.builds ?? []), { version: build.version, tag: build.tag, ...(build.driver === undefined ? {} : { driver: build.driver }), record: 'candidate: this run' }] }],
  };
  return { rows: row === undefined ? [...rows, candidate] : rows.map((one) => (one === row ? candidate : one)), mode: 'CANDIDATE' };
}

/** The checks already made, by client file: the real check keeps a good verdict per file, and a second leg on the same file asks the same check. */
const made = new Map();

/** The finding of a client the table or the rig could not serve: printed once, and answered as a value. */
function finding(name, why) {
  console.log(`FINDING (rig/record) ${name}: ${why}`);
  return { ok: false, why };
}

/**
 * The verdict of the real check for `client` (`{ family, exe, name }`), asked under the candidate table. `rig` holds `dir` (an owned folder: the check's keys folder and a link are made under it)
 * and `home`. Answers `{ ok: true, verdict, mode, line }`, or `{ ok: false, why }` after a printed finding. The version answer of the client is the ONE spawn the product makes
 * (`<file> --version`, or `-?` for `sqlcmd`), under the bridged environment.
 */
async function verdictFor(client, rig) {
  const family = FAMILIES[client.family];
  const name = client.name ?? client.family;
  if (family === undefined) {
    return finding(name, `no family of the rigs is named ${client.family}`);
  }
  const key = `${process.platform}|${client.family}|${client.exe}`;
  if (!made.has(key)) {
    const parts = modules();
    const folder = folderFor(client.exe, client.family, rig.dir);
    const source = sourceOf(folder, rig.home);
    const asked = runSync(client.exe, family.args, parts.env.bridgedSshEnv(source, process.platform));
    const read = asked.code === 0 ? versionOfClient(client.family, asked.stdout) : undefined;
    if (read === undefined) {
      made.set(key, finding(name, `the rig read no build from the client's own answer to ${family.args.join(' ')} (exit ${asked.code}; stdout ${JSON.stringify(firstWords(asked.stdout))}; stderr ${JSON.stringify(firstWords(asked.stderr))}): the check reads only stdout of an exit 0, so it cannot serve this client`));
    } else {
      const build = { version: read.number, tag: read.after, ...driverBuild(parts, client.family, read.number) };
      const table = tableWith(parts.profile.BRIDGED_DB_PROFILES, process.platform, client.family, build);
      console.log(`${table.mode} ${family.client} ${family.vendor} ${build.version} ${JSON.stringify(build.tag)} ${process.platform}${build.driver === undefined ? '' : ` driver ${build.driver}`}  (${name}: ${client.exe})`);
      const check = parts.clientModule.bridgedDbClientCheck({
        storageDir: rig.dir,
        rows: table.rows,
        platform: process.platform,
        source,
        note: (message) => console.log(`rig note (the client check, ${name}): ${message}`),
      });
      made.set(key, { check, mode: table.mode, family: family.client, name, exe: client.exe, asked });
    }
  }
  const kept = made.get(key);
  if (kept.ok === false) {
    return kept;
  }
  const verdict = await kept.check({ client: kept.family });
  if (!verdict.ok) {
    return finding(kept.name, `the real database client check refused ${kept.exe} under the ${kept.mode} table: ${verdict.sentence} (the version spawn of the rig answered exit ${kept.asked.code}; stdout ${JSON.stringify(firstWords(kept.asked.stdout))})`);
  }
  return { ok: true, verdict, mode: kept.mode, line: `the ${kept.mode} table, ${words(verdict)}` };
}

/** The line that says which verdict a leg launched under (vendor, version, build tag, file). */
function say(leg, under) {
  console.log(`record (verdict) ${leg}: the launch is built under the real check's verdict: ${under.line}`);
}

module.exports = { verdictFor, say, FAMILIES, tableWith };
