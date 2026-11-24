'use strict';
// The direct legs of (u), `psql` (E1.7 spec §S7.12), each asserting through the REAL builder and the REAL client check (`dbCandidates.cjs`): the launch is the builder's own string for an entry that stores a
// user and a password (entry A) or none (entry B: the same launch with the variable of the password taken away and `-w`, since the builder refuses it, Q16), and it is changed only by what a leg's CONTROL
// cuts out of it. What a leg proves is the product's: a mutation that drops a control from the builder (T57-T60) makes the leg of that road print `IDENTITY OFFERED`, because nothing here writes a
// control by hand.
//
// Every leg prints `record (<leg>): ... LEAKS` for a control that shows the bad thing happening, `... HELD` for a production launch that stopped it, and `... IDENTITY OFFERED` when it did not.
// `UNMEASURED <leg>` says the control could not be produced (R4). The words are the ones `dbAssertRules.cjs` reads.
//
//   U-enc-*     the GSS encryption road: control = the built string with the three keywords cut; production = the string as built, entries A and B; U-enc-env = the same against an environment that says the opposite
//   U-auth-*    the GSSAPI authentication road, the same three
//   U-cert-*    the client certificate road, against PD3's server and a marker certificate in the rig home: control = sslcert, sslkey, sslcertmode and the two variables cut; built; and `sslcertmode` ALONE
//               (the builder's string with sslcert and sslkey and the two variables cut, sslcertmode as the builder wrote it: the leg that fails when `sslcertmode` is dropped, T60)
//   U-verify-full  sslmode=verify-full with a marker CA in the client's default place: the client connects, offers no certificate and sends nothing but the start-up message and the entry's own password
//   U-rc        `~/.postgresqlrc`: where `psql` is a launcher that reads it, a marker file names another host, port and database; the builder's string names all three and is not steered; the control, with the
//               three keywords cut, is
const fs = require('node:fs');
const path = require('node:path');
const { check, record, unmeasured, bridgedEnv, runClient, oneLine } = require('./dbProbe.cjs');
const { withFakePg } = require('./pkPgFake.cjs');
const { launchFor, GSS_LINE } = require('./pkPsqlLegs.cjs');
const { holdingListener, resolveProgram, describeFile } = require('./dbProbeRig.cjs');
const rig = require('./psqlRig.cjs');
const candidates = require('./dbCandidates.cjs');

const OPPOSITE = { PGGSSENCMODE: 'prefer', PGREQUIREAUTH: 'gss', PGSSLCERTMODE: 'allow' };
const PROFILE_KEYWORDS = / sslcert='[^']*'| sslkey='[^']*'/g;
const LEAKED = (text) => `LEAKS: ${text}`;

/** What the real server and the fake saw of one launch on one GSS road (`enc`: the encryption request; `auth`: the answer to request 7). */
async function observe(ctx, road, options) {
  const { pg, realm } = ctx;
  await pg.setHba(road === 'enc'
    ? [`hostgssenc all all 127.0.0.1/32 ${GSS_LINE}`, 'hostnogssenc all all 127.0.0.1/32 reject']
    : [`hostnogssenc all all 127.0.0.1/32 ${GSS_LINE}`, 'hostgssenc all all 127.0.0.1/32 reject']);
  const mark = pg.mark();
  const real = launchFor(ctx, pg.port, options);
  const realRun = await runClient(ctx.scope, ctx.exe, real.args, real.env);
  const names = (await pg.identitiesSince(mark)).filter((line) => line.method === 'gss');
  const fake = await withFakePg({ mode: 'gss', gssenc: road === 'enc' ? 'G' : 'N' }, async (port) => {
    const launched = launchFor(ctx, port, options);
    return runClient(ctx.scope, ctx.exe, launched.args, launched.env);
  });
  const tokenBytes = road === 'enc' ? fake.state.gssencTokenBytes : (fake.state.answers[0] ?? 0);
  const named = names.at(0)?.identity;
  return { tokenBytes, named, identity: realm.identity, ended: realRun.ended && fake.result.ended, offered: tokenBytes > 0 || names.length > 0 };
}

const wordsOf = (seen) => `a token ${seen.tokenBytes > 0 ? `followed (${seen.tokenBytes} bytes)` : 'did not follow'}; the real server ${seen.named === undefined ? 'named no identity' : `named ${seen.named}`}`;

/** One GSS road: its control, then the launch as built for entries A and B, then against the environment that says the opposite. */
async function road(ctx, name, controlOptions) {
  const control = await observe(ctx, name, controlOptions);
  check(`(U-${name}) the control ended in time against the real server and the fake`, control.ended, JSON.stringify(control));
  if (!(control.tokenBytes > 0 && control.named === control.identity)) {
    unmeasured(`U-${name}-control`, `the control did not show the identity on offer: ${wordsOf(control)}`);
    return;
  }
  record(`U-${name}-control`, 'shown', LEAKED(`the built string with the three keywords cut: ${wordsOf(control)}`));
  for (const [leg, extra] of [[`U-${name}-built`, {}], [`U-${name}-env`, { envSet: OPPOSITE }]]) {
    for (const entry of ['A', 'B']) {
      const seen = await observe(ctx, name, { ...extra, entry, ...(name === 'auth' ? {} : {}) });
      check(`(${leg}) entry ${entry} ended in time`, seen.ended, JSON.stringify(seen));
      record(leg, 'shown', `entry ${entry}${extra.envSet === undefined ? ', as launched' : ', against PGGSSENCMODE=prefer PGREQUIREAUTH=gss PGSSLCERTMODE=allow'}: ${seen.offered ? 'IDENTITY OFFERED' : 'HELD'}; ${wordsOf(seen)}`);
    }
  }
}

/** The legs of the two GSS roads against a real server and the fakes (rig K, G, F): CI only. */
async function legRoads(ctx) {
  await road(ctx, 'enc', { control: true });
  await road(ctx, 'auth', { control: true, add: ["gssencmode='disable'"] });
}

/** A rig home with the person's certificate where libpq looks: the marker is offered by a client that is allowed to offer it. */
function homeWithMarker(dir, name) {
  const home = path.join(dir, name);
  const material = path.join(dir, `${name} material`);
  fs.mkdirSync(path.join(home, '.postgresql'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(material, { recursive: true });
  const person = rig.throwawayCertificate(material, 'person', rig.PD3_MARKER_CN);
  fs.copyFileSync(person.cert, path.join(home, '.postgresql', 'postgresql.crt'));
  fs.copyFileSync(person.key, path.join(home, '.postgresql', 'postgresql.key'));
  fs.chmodSync(path.join(home, '.postgresql', 'postgresql.key'), 0o600);
  return { home, material };
}

/** One launch against PD3's server (it completes TLS and REQUESTS a client certificate): was the person's marker certificate offered? */
async function certificateRun(ctx, home, tls, options) {
  const run = await rig.psqlRun(ctx.scope, ctx.exe, {
    prepare: () => undefined,
    tlsMaterial: tls,
    build: (port) => {
      const made = launchFor({ ...ctx, home, user: 'pdprobe' }, port, { host: '127.0.0.1', query: '?sslmode=require', ...options });
      for (const name of options.drop ?? []) {
        delete made.env[name];
      }
      return made;
    },
  });
  return { ...run, offered: run.state.peer?.commonName === rig.PD3_MARKER_CN, reached: run.state.secured >= 1 };
}

/** The certificate road: control, as built, and `sslcertmode` alone with every other defence cut (T60). Needs no server: PD3's fake. */
async function legCertificate(ctx) {
  const { home, material } = homeWithMarker(ctx.dir, 'u-cert home');
  const server = rig.throwawayCertificate(material, 'server', 'localhost');
  const tls = { key: fs.readFileSync(server.key), cert: fs.readFileSync(server.cert) };
  const drop = ['PGSSLCERT', 'PGSSLKEY'];
  const control = await certificateRun(ctx, home, tls, { control: true, cut: [PROFILE_KEYWORDS], drop });
  check('(U-cert) the control reached the fake and completed TLS', control.ended && control.reached, JSON.stringify({ ended: control.ended, secured: control.state.secured, said: control.stderr }));
  if (!control.offered) {
    unmeasured('U-cert-control', `the marker certificate was not offered with sslcert, sslkey, sslcertmode and both variables cut (TLS ${control.reached ? 'completed' : 'did not complete'}; psql said ${JSON.stringify(oneLine(control.stderr, 120))})`);
    return;
  }
  record('U-cert-control', 'shown', LEAKED(`the marker certificate (CN=${rig.PD3_MARKER_CN}) was offered to the receiver that asked for one, with every control cut`));
  const built = await certificateRun(ctx, home, tls, {});
  record('U-cert-built', 'shown', `as launched by the builder: ${built.offered ? 'IDENTITY OFFERED (the marker certificate)' : 'HELD'}; TLS ${built.reached ? 'completed' : 'did NOT complete'}`);
  const modeOnly = await certificateRun(ctx, home, tls, { cut: [PROFILE_KEYWORDS], drop });
  record('U-cert-mode-only', 'shown', `the builder's string with sslcert and sslkey and both variables cut, sslcertmode as the builder wrote it: ${modeOnly.offered ? 'IDENTITY OFFERED (the marker certificate)' : 'HELD'}; TLS ${modeOnly.reached ? 'completed' : 'did NOT complete'}`);
}

/** `sslmode=verify-full` with a marker CA in the client's default place: connected, no certificate, nothing but the start-up message and the entry's own password. */
async function legVerifyFull(ctx) {
  const { home, material } = homeWithMarker(ctx.dir, 'u-verify home');
  const ca = rig.throwawayCa(path.join(material, 'ca'));
  fs.copyFileSync(ca.cert, path.join(home, '.postgresql', 'root.crt'));
  const tls = { key: fs.readFileSync(ca.server.key), cert: fs.readFileSync(ca.server.cert), conversation: true };
  const run = await rig.psqlRun(ctx.scope, ctx.exe, {
    prepare: () => undefined,
    tlsMaterial: tls,
    build: (port) => launchFor({ ...ctx, home, user: 'pdprobe', entryWord: rig.PQ2_STORED_PASSWORD }, port, { host: '127.0.0.1', query: '?sslmode=verify-full' }),
  });
  const { state } = run;
  const connected = state.secured >= 1 && state.startups >= 1;
  const only = state.kinds.every((kind) => kind === 'startup' || kind === 'p') && (state.sent === undefined || state.sent === rig.LABEL_STORED);
  const held = connected && state.peer?.offered !== true && only;
  check('(U-verify-full) the client reached the fake and asked for TLS', run.ended && state.sslRequests >= 1, JSON.stringify({ ended: run.ended, sslRequests: state.sslRequests, said: run.stderr }));
  record('U-verify-full', 'shown', `sslmode=verify-full with the marker CA in .postgresql/root.crt: the connection ${connected ? 'was made' : 'was NOT made'}; a client certificate ${state.peer?.offered === true ? 'WAS OFFERED' : 'was not offered'}; the server read ${JSON.stringify(state.kinds)} after the handshake; ${held ? 'HELD' : 'IDENTITY OFFERED or not wholly the login'}`);
}

/** `~/.postgresqlrc`: a launcher that reads it must not be steered by it: the builder's string names the host, the port and the database every time. */
async function legRc(ctx) {
  const word = resolveProgram('psql');
  const file = word === undefined ? undefined : describeFile(word);
  if (file === undefined || !file.script) {
    record('U-rc', 'not applicable', `NOT A LAUNCHER: psql on the bridged PATH is ${file === undefined ? 'not found' : 'a program, not a script'}: no file under the home folder can steer it`);
    return;
  }
  const majors = fs.existsSync('/usr/lib/postgresql') ? fs.readdirSync('/usr/lib/postgresql').filter((name) => /^\d+$/.test(name)) : [];
  const under = await candidates.verdictFor({ family: 'psql', exe: word, name: 'psql-launcher' }, ctx);
  if (!under.ok || majors.length === 0) {
    unmeasured('U-rc', under.ok ? 'no PostgreSQL major is installed for the launcher to choose' : 'the real check refused the launcher under the candidate table (the finding is printed above)');
    return;
  }
  const entry = await holdingListener('127.0.0.1');
  const marker = await holdingListener('0.0.0.0');
  const home = path.join(ctx.dir, 'u-rc home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, '.postgresqlrc'), `${majors.at(-1)} 127.0.0.2:${marker.port} rcmarker\n`);
  try {
    const launch = (cut) => {
      const built = ctx.product.buildDbQueryLaunch('postgres', `postgresql://pdprobe:${ctx.entryWord}@127.0.0.1:${entry.port}/pdprobe`, 'select 1', { bridged: true, absentFile: ctx.product.materializedKeyPath(ctx.dir, 'no-client-file'), verdict: under.verdict });
      return { exe: built.exe, args: built.args.map((arg, at) => (at === built.args.length - 1 ? arg.replaceAll(cut, '') : arg)), env: bridgedEnv(ctx.product, home, built.env) };
    };
    const control = launch(/ host='[^']*'| port='[^']*'| dbname='[^']*'/g);
    await runClient(ctx.scope, control.exe, control.args, control.env, { ms: 8000 });
    if (marker.state.connections === 0) {
      unmeasured('U-rc', 'the control (host, port and dbname cut from the string) was not steered to the marker: the launcher did not read ~/.postgresqlrc here');
      return;
    }
    const before = { entry: entry.state.connections, marker: marker.state.connections };
    const production = launch('');
    await runClient(ctx.scope, production.exe, production.args, production.env, { ms: 8000 });
    const steered = marker.state.connections > before.marker;
    const reachedEntry = entry.state.connections > before.entry;
    const words = `a marker ~/.postgresqlrc names another host, port and database: the control (host, port, dbname cut) reached the marker; the builder's string reached the entry's listener ${reachedEntry ? 'yes' : 'NO'} and the marker ${steered ? 'YES' : 'no'}`;
    if (!steered && !reachedEntry) {
      // HELD is said only of a launch that went where the entry says: one that reached neither listener shows nothing of the file.
      unmeasured('U-rc', `${words}: the launch as built reached no listener, so whether the file is held off is not shown`);
      return;
    }
    record('U-rc', 'shown', `${words}${steered ? ': IDENTITY OFFERED (steered)' : ': HELD'}`);
  } finally {
    await entry.close();
    await marker.close();
  }
}

/** Every direct leg of (u) that can run here: the roads where a realm and a real server were built, the others anywhere (they need only the fakes). */
async function psqlDirectLegs(ctx, realm, pg) {
  const under = await candidates.verdictFor({ family: 'psql', exe: ctx.exe, name: 'psql' }, ctx);
  if (!under.ok) {
    for (const leg of ['U-enc-control', 'U-auth-control', 'U-cert-control', 'U-verify-full', 'U-rc']) {
      unmeasured(leg, 'the real database client check refused this psql under the candidate table (the finding is printed above), so the builder launches nothing');
    }
    return;
  }
  candidates.say('U psql', under);
  const next = { ...ctx, verdict: under.verdict, user: realm?.user ?? 'probe', realm, pg };
  if (realm?.ok === true && pg?.ok === true) {
    await legRoads(next);
  } else {
    for (const leg of ['U-enc-control', 'U-auth-control']) {
      unmeasured(leg, `no realm or no real server for the control: ${realm?.ok === true ? pg?.why : realm?.why ?? 'not built'}`);
    }
  }
  await legCertificate(next);
  await legVerifyFull(next);
  await legRc(next);
}

module.exports = { psqlDirectLegs };
