'use strict';
// PK1 for `psql` on `windows-latest` (the E1.7 spec §S7.4, PK1-w0 to PK1-w4; rigs G and F; rule R3 for the profile files). A runner outside a domain has no Kerberos ticket, so the
// positive control here is SSPI: the runner's own logon, which a real server with an `sspi` line names, and a fake that asks for SSPI and reads the user and the computer name
// from the client's NTLM answer (N15).
//
// Every leg is a record. A leg whose control is not shown is `UNMEASURED` and its pair stays refused: by the spec's forecast no Windows pair is served when E1.7 merges.
const fs = require('node:fs');
const path = require('node:path');
const { check, record, unmeasured, stop, runClient, oneLine, throwawayWord, bridgedEnv } = require('./dbProbe.cjs');
const { withFakePg } = require('./pkPgFake.cjs');
const { launchFor, CANDIDATE } = require('./pkPsqlLegs.cjs');
const rig = require('./psqlRig.cjs');

const SSPI_LINE = 'host all all 127.0.0.1/32 sspi include_realm=0';

/** What the real server named (method `sspi`) and what the fake saw, for one launch. */
async function observeSspi(ctx, options) {
  const { pg } = ctx;
  await pg.setHba([SSPI_LINE]);
  const mark = pg.mark();
  const real = launchFor(ctx, pg.port, options);
  const realRun = await runClient(ctx.scope, ctx.exe, real.args, real.env);
  const named = (await pg.identitiesSince(mark)).filter((line) => line.method === 'sspi').at(0);
  const fake = await withFakePg({ mode: 'sspi', gssenc: 'N' }, async (port) => {
    const launched = launchFor(ctx, port, options);
    return runClient(ctx.scope, ctx.exe, launched.args, launched.env);
  });
  const state = fake.state;
  const names = state.ntlm === undefined ? 'no NTLM answer read' : `the NTLM answer names user ${JSON.stringify(state.ntlm.user)} of ${JSON.stringify(state.ntlm.domain)} on ${JSON.stringify(state.ntlm.workstation)}`;
  return {
    ended: realRun.ended && fake.result.ended, tokenBytes: state.answers[0] ?? 0, named: named?.identity, ntlm: state.ntlm, said: oneLine(realRun.stderr, 120),
    offered: (state.answers[0] ?? 0) > 0 || named !== undefined,
    words: `request 9 ${state.requested === 'sspi' ? 'SEEN' : 'not seen'} by the fake; a token ${(state.answers[0] ?? 0) > 0 ? `FOLLOWED (${state.answers[0]} bytes)` : 'did not follow'}; ${names}; the real server ${named === undefined ? 'named no identity' : `NAMED ${JSON.stringify(named.identity)} by sspi`}; psql said ${JSON.stringify(oneLine(realRun.stderr, 120))}`,
  };
}

/** PK1-w0 and PK1-w1: SSPI, offered as launched and under `require_auth`, for entry A and entry B. */
async function legSspi(ctx) {
  const control = await observeSspi(ctx, { control: true, entry: 'B' });
  check('(PK1-w0) the client ended in time, against the real server and the fake', control.ended, control.words);
  const shown = control.named !== undefined && control.tokenBytes > 0;
  if (shown) {
    record('PK1-w0', 'shown', `positive control, the string as built with no control of the profile, entry B: ${control.words}`);
  } else {
    unmeasured('PK1-w0', `the runner's own logon was not shown on offer: ${control.words}`);
  }
  const cases = [
    ['PK1-w1-as-launched', 'as launched by the builder', {}],
    ['PK1-w1-require_auth', 'with require_auth written last', { control: true, add: [CANDIDATE.auth] }],
  ];
  for (const [leg, what, options] of cases) {
    for (const entry of ['A', 'B']) {
      const seen = await observeSspi(ctx, { ...options, entry });
      const text = `${what}, entry ${entry}: ${seen.offered ? 'IDENTITY OFFERED' : 'identity not offered'}; ${seen.words}`;
      if (shown) {
        record(`${leg}-${entry}`, 'shown', text);
        if (seen.offered && options.add !== undefined) {
          stop(`${leg}-${entry}`, 'SSPI is offered with require_auth written last: that control does not stop the road (parent §7, row PK1)');
        }
      } else {
        unmeasured(`${leg}-${entry}`, `no positive control for SSPI; without one: ${text}`);
      }
    }
  }
}

/** PK1-w2: what PA1-c says of this build: can it do GSS encryption at all? */
async function legGssEncryption(ctx) {
  const fake = await withFakePg({ mode: 'gss', gssenc: 'N' }, async (port) => runClient(ctx.scope, ctx.exe, ['-w', '-X', '-c', 'select 1', '--', `host=127.0.0.1 port=${port} user=probe dbname=postgres gssencmode=require connect_timeout=5`], bridgedEnv(ctx.product, ctx.home)));
  const said = oneLine(fake.result.stderr, 200);
  if (/GSSAPI|gssencmode/i.test(said) && /not compiled|invalid|unsupported|not supported/i.test(said)) {
    record('PK1-w2', 'shown', `the build says it cannot do GSSAPI encryption: ${JSON.stringify(said)}`);
  } else {
    unmeasured('PK1-w2', `the build can do GSSAPI (psql said ${JSON.stringify(said)}), and no Kerberos ticket can be on offer on a runner outside a domain, so no control can be shown`);
  }
}

/**
 * PK1-w4: a server's GSSAPI request (7) on Windows, for entry A and entry B: as launched, and with `require_auth` written last (the control the spec names for the authentication road; the second run
 * left it out, so the Windows row said only that the request was refused). Recorded, and never a control (N14): a runner outside a domain has no ticket, so no token can be on offer either way.
 */
async function legRequest7(ctx) {
  unmeasured('PK1-w4', 'the positive control needs a Kerberos ticket, and a runner outside a domain has none; what the client does with no ticket follows and does not count');
  const cases = [['as launched', '', {}], ['with require_auth written last', '-require_auth', { control: true, add: [CANDIDATE.auth] }]];
  for (const [what, suffix, options] of cases) {
    for (const entry of ['A', 'B']) {
      const fake = await withFakePg({ mode: 'gss', gssenc: 'N' }, async (port) => {
        const launched = launchFor(ctx, port, { ...options, entry });
        return runClient(ctx.scope, ctx.exe, launched.args, launched.env);
      });
      const state = fake.state;
      record(`PK1-w4${suffix}-${entry}`, 'not shown', `${what}, entry ${entry}, a server asking for GSSAPI (7): request ${state.requested === 'gss' ? 'SEEN' : 'not seen'}; a token ${(state.answers[0] ?? 0) > 0 ? `FOLLOWED (${state.answers[0]} bytes)` : 'did not follow'}; psql said ${JSON.stringify(oneLine(fake.result.stderr, 160))}. No control: this does not count.`);
    }
  }
}

/** Puts `files` in the runner's `%APPDATA%\postgresql` (R3), keeping what was there for the scope to put back. */
function placeProfileFiles(scope, dir, files) {
  const folder = path.join(process.env.APPDATA ?? '', 'postgresql');
  const kept = path.join(dir, 'appdata-postgresql-kept');
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(kept, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(folder, name);
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, path.join(kept, name));
    }
    fs.writeFileSync(target, content);
    scope.after(() => {
      const copy = path.join(kept, name);
      if (fs.existsSync(copy)) {
        fs.copyFileSync(copy, target);
      } else {
        fs.rmSync(target, { force: true });
      }
    });
  }
}

/** PK1-w3: the profile files of the runner's own `%APPDATA%\postgresql`: a password file, a certificate and key, and `psqlrc.conf`. The control cuts the keywords and `-X`. */
async function legProfileFiles(ctx, systemRig) {
  if (!systemRig) {
    unmeasured('PK1-w3', 'the marker files are written in the runner\'s own %APPDATA%\\postgresql: a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)');
    return;
  }
  const material = path.join(ctx.dir, 'w3 material');
  fs.mkdirSync(material, { recursive: true });
  const server = rig.throwawayCertificate(material, 'server', 'localhost');
  const person = rig.throwawayCertificate(material, 'person', rig.PD3_MARKER_CN);
  placeProfileFiles(ctx.scope, ctx.dir, {
    'pgpass.conf': `*:*:*:pdprobe:${rig.PD2_PASSWORD_MARKER}\n`,
    'postgresql.crt': fs.readFileSync(person.cert, 'utf8'),
    'postgresql.key': fs.readFileSync(person.key, 'utf8'),
    'psqlrc.conf': '\\echo pk1-psqlrc-marker\n',
  });
  const tlsMaterial = { key: fs.readFileSync(server.key), cert: fs.readFileSync(server.cert) };
  const keywords = [/ passfile='[^']*'/g, / sslcert='[^']*'/g, / sslkey='[^']*'/g];
  const variables = ['PGPASSFILE', 'PGSSLCERT', 'PGSSLKEY'];
  for (const [label, control] of [['control (the three keywords, their variables and -X cut)', true], ['launch as built', false]]) {
    // Entry B (no password): a launch that carries the entry's own password never asks the password file, so the second run's control could not send its marker (the entry's word went instead).
    const options = (extra) => ({ user: 'pdprobe', host: '127.0.0.1', entry: 'B', ...extra, ...(control ? { cut: keywords, dropArgs: ['-X'] } : {}) });
    const build = (extra) => (port) => {
      const made = launchFor({ ...ctx, user: 'pdprobe' }, port, options(extra));
      for (const name of control ? variables : []) {
        delete made.env[name];
      }
      return made;
    };
    const fileRun = await rig.psqlRun(ctx.scope, ctx.exe, { prepare: () => undefined, build: build({}) });
    const certificate = await rig.psqlRun(ctx.scope, ctx.exe, { prepare: () => undefined, tlsMaterial, build: build({ query: '?sslmode=require' }) });
    await ctx.pg.setHba([SSPI_LINE]);
    const echo = launchFor(ctx, ctx.pg.port, { entry: 'B', control, ...(control ? { dropArgs: ['-X'] } : {}) });
    const echoed = await runClient(ctx.scope, ctx.exe, echo.args, echo.env);
    const sentMarker = rig.holdsMarker(fileRun.state.sent);
    const sentCert = certificate.state.peer?.commonName === rig.PD3_MARKER_CN;
    const readRc = echoed.stdout.includes('pk1-psqlrc-marker');
    const text = `${label}: pgpass.conf marker ${sentMarker ? 'SENT' : `not sent (the fake got: ${rig.labelled(fileRun.state.sent)})`}; client certificate marker ${sentCert ? 'OFFERED' : 'not offered'}; psqlrc.conf ${readRc ? 'READ' : `not read (exit ${echoed.code}; stdout ${JSON.stringify(oneLine(echoed.stdout, 100))}; stderr ${JSON.stringify(oneLine(echoed.stderr, 140))})`}`;
    if (control) {
      const shown = sentMarker && sentCert && readRc;
      if (shown) {
        record('PK1-w3-control', 'shown', text);
      } else {
        unmeasured('PK1-w3-control', `the control sent not every marker (${text}); psql said ${JSON.stringify(oneLine(`${fileRun.stderr} ${certificate.stderr} ${echoed.stderr}`, 200))}`);
      }
    } else {
      record('PK1-w3', 'shown', text);
      if (sentMarker || sentCert || readRc) {
        stop('PK1-w3', 'a file of the runner\'s %APPDATA%\\postgresql reached the receiver with the launch as built (parent §4.11: the person\'s files are closed by Y6, which has no Windows control yet)');
      }
    }
  }
}

/** PK1 for `psql` on `windows-latest`. */
async function psqlWindows(ctx) {
  const next = { ...ctx, entryWord: throwawayWord(), user: ctx.pg?.owner ?? 'runner' };
  if (ctx.pg?.ok === true) {
    await legSspi(next);
    await legGssEncryption(next);
    await legRequest7(next);
    await legProfileFiles(next, ctx.systemRig);
  } else {
    for (const leg of ['PK1-w0', 'PK1-w1', 'PK1-w2', 'PK1-w3', 'PK1-w4']) {
      unmeasured(leg, `no real server to ask for SSPI: ${ctx.pg?.why ?? 'not built'}`);
    }
  }
}

module.exports = { psqlWindows };
