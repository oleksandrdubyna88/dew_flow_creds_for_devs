'use strict';
// PK1 for `psql` (the E1.7 spec §S7.4): does the client offer an identity that is not the entry's? Two roads on Linux against a real server (rig G) and a fake (rig F), each beside
// its positive control, under the bridged environment (rule R2); the client certificate on a third; and the Windows legs.
//
// A leg is a RECORD. It prints what the client did on each road: whether the receiver's request was SEEN, whether a TOKEN FOLLOWED (its length, never its bytes), and what the
// real server's log NAMED (the identity and the method). Each road has its control first: the string the builder writes with every candidate keyword taken out, against a ticket in
// the default cache (rig K). A road whose control is not shown is `UNMEASURED`, and its other legs are printed as what was seen WITHOUT a control, which proves nothing (PK1-p6).
//
// Entry A stores a user and a password and is launched through `buildDbQueryLaunch` with `bridged` as it stands; entry B stores no password and is the same launch with the
// variable of the password taken away and `-w` added, by hand, since the builder refuses it (Q16). The entry's user is the ticket's own name: that is the case where a ticket
// alone would log the agent in.
const fs = require('node:fs');
const path = require('node:path');
const { check, record, unmeasured, stop, bridgedEnv, runClient, oneLine, throwawayWord } = require('./dbProbe.cjs');
const { withFakePg } = require('./pkPgFake.cjs');
const rig = require('./psqlRig.cjs');

const CANDIDATE = {
  gss: "gssencmode='disable'",
  cert: "sslcertmode='disable'",
  auth: "require_auth='password,md5,scram-sha-256'",
};
const OPPOSITE = { PGGSSENCMODE: 'prefer', PGREQUIREAUTH: 'gss', PGSSLCERTMODE: 'allow' };
const CANDIDATE_KEYWORD = /\s+(?:gssencmode|sslcertmode|require_auth)='[^']*'/g; // NOSONAR: the rig's own connection string
const GSS_LINE = 'gss include_realm=0 krb_realm=BRIDGE.TEST';

/** The builder's launch for `host:port`, then what a leg does to it by hand: take the candidate keywords out (`control`), add some last, change the environment, be entry B. */
function launchFor(ctx, port, { entry = 'A', control = false, add = [], envSet = {}, user = ctx.user, host = 'localhost', query = '', cut = [], dropArgs = [] }) {
  const { product } = ctx;
  const uri = `postgresql://${user}:${ctx.entryWord}@${host}:${port}/postgres${query}`;
  const built = product.buildDbQueryLaunch('postgres', uri, 'select 1', { bridged: true, absentFile: product.materializedKeyPath(ctx.dir, 'no-client-file') });
  if (built === undefined) {
    throw new Error('buildDbQueryLaunch refused the entry of a PK1 leg that must launch (it stores a user and a password and names only the profile)');
  }
  let connection = built.args.at(-1);
  if (control) {
    connection = connection.replace(CANDIDATE_KEYWORD, '');
  }
  for (const text of cut) {
    connection = connection.replace(text, '');
  }
  const args = [...built.args.slice(0, -1).filter((arg) => !dropArgs.includes(arg)), [connection, ...add].join(' ')];
  const env = bridgedEnv(product, ctx.home, built.env);
  if (entry === 'B') {
    args.unshift('-w');
    delete env.PGPASSWORD;
  }
  return { args, env: { ...env, ...envSet } };
}

/** What the real server and the fake saw of one launch on one road. `road`: `enc` (the GSS encryption request) or `auth` (the answer to request 7). */
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
  const state = fake.state;
  const requestSeen = road === 'enc' ? state.gssencRequests > 0 : state.requested === 'gss' && state.startups > 0;
  const tokenBytes = road === 'enc' ? state.gssencTokenBytes : (state.answers[0] ?? 0);
  return {
    requestSeen, tokenBytes, named: names.at(0)?.identity, ended: realRun.ended && fake.result.ended,
    offered: tokenBytes > 0 || names.length > 0, said: oneLine(realRun.stderr, 120), identity: realm.identity,
  };
}

/** The words of one observation for a record line. */
const wordsOf = (seen) => `request ${seen.requestSeen ? 'SEEN' : 'not seen'} by the fake; a token ${seen.tokenBytes > 0 ? `FOLLOWED (${seen.tokenBytes} bytes)` : 'did not follow'}; the real server ${seen.named === undefined ? 'named no identity' : `NAMED ${seen.named}`}; psql said ${JSON.stringify(seen.said)}`;

/** The legs of one road: its control, then each variant for entry A and entry B. */
async function road(ctx, name, controlLeg, variants) {
  const control = await observe(ctx, name, variants[0].options);
  check(`(${controlLeg}) the client ended in time, against the real server and the fake`, control.ended, JSON.stringify(control));
  const shown = control.tokenBytes > 0 && control.named === control.identity;
  if (shown) {
    record(controlLeg, 'shown', `positive control, ${variants[0].what}, entry A: ${wordsOf(control)}`);
  } else {
    unmeasured(controlLeg, `the control did not show the identity on offer: ${wordsOf(control)}`);
  }
  for (const entry of ['A', 'B']) {
    for (const variant of variants.slice(entry === 'A' ? 1 : 0)) {
      const seen = await observe(ctx, name, { ...variant.options, entry });
      const text = `${variant.what}, entry ${entry}: ${seen.offered ? 'IDENTITY OFFERED' : 'identity not offered'}; ${wordsOf(seen)}`;
      if (shown) {
        record(`${variant.leg}-${entry}`, 'shown', text);
        if (variant.controls && seen.offered) {
          stop(`${variant.leg}-${entry}`, `the identity is offered with ${variant.controls}, written last: that control does not stop the ${name === 'enc' ? 'GSS encryption' : 'GSSAPI authentication'} road (parent §7, row PK1: offered under every candidate keeps the pair refused)`);
        }
      } else {
        unmeasured(`${variant.leg}-${entry}`, `no positive control for the ${name} road, so this is what was seen without one: ${text}`);
      }
    }
  }
  return shown;
}

/** PK1-p0 to p4 and p6 on Linux: the GSS encryption road, the GSSAPI authentication road, the ticket taken away. */
async function legRoads(ctx) {
  const { realm } = ctx;
  const disable = [CANDIDATE.gss];
  const encVariants = [
    { leg: 'PK1-p0', what: 'the string as built, no control of the profile', options: { control: true } },
    { leg: 'PK1-p2', what: 'as launched by the builder', options: {} },
    { leg: 'PK1-p3-gssencmode', what: "gssencmode='disable' alone", controls: 'gssencmode', options: { control: true, add: disable } },
    { leg: 'PK1-p3-require_auth', what: 'require_auth alone (it acts on the server\'s authentication request, so the encryption request is expected to stand)', options: { control: true, add: [CANDIDATE.auth] } },
    { leg: 'PK1-p3-both', what: 'both candidates', controls: 'both keywords', options: { control: true, add: [CANDIDATE.gss, CANDIDATE.auth] } },
    { leg: 'PK1-p4', what: 'both candidates against PGGSSENCMODE=prefer and PGREQUIREAUTH=gss in the environment', controls: 'both keywords against the opposite environment', options: { control: true, add: [CANDIDATE.gss, CANDIDATE.auth], envSet: OPPOSITE } },
  ];
  const authVariants = [
    { leg: 'PK1-p1', what: "gssencmode='disable' written by hand, no other control", options: { control: true, add: disable } },
    { leg: 'PK1-p2-auth', what: "as launched, with gssencmode='disable' by hand to isolate the road", options: { add: disable } },
    { leg: 'PK1-p3-auth-require_auth', what: "require_auth, with gssencmode='disable' by hand", controls: 'require_auth', options: { control: true, add: [...disable, CANDIDATE.auth] } },
    { leg: 'PK1-p4-auth', what: 'require_auth against PGREQUIREAUTH=gss in the environment', controls: 'require_auth against the opposite environment', options: { control: true, add: [...disable, CANDIDATE.auth], envSet: OPPOSITE } },
  ];
  const encShown = await road(ctx, 'enc', 'PK1-p0', encVariants);
  const authShown = await road(ctx, 'auth', 'PK1-p1', authVariants);
  // p6: the ticket destroyed. Nothing is offered; recorded to show what a run with no positive control sees, and why it does not count.
  if (encShown || authShown) {
    check('(PK1-p6) the rig destroyed the ticket', realm.destroy() && !realm.ticketInReach(), 'kdestroy under the bridged environment left a ticket');
    for (const [name, leg] of [['enc', 'PK1-p6-enc'], ['auth', 'PK1-p6-auth']]) {
      const seen = await observe(ctx, name, name === 'enc' ? {} : { add: disable });
      record(leg, 'not shown', `ticket destroyed, as launched: ${seen.offered ? 'IDENTITY OFFERED (unexpected: the ticket is gone)' : 'nothing offered'}; ${wordsOf(seen)}. A run with no positive control sees this, and it does not count.`);
    }
    check('(PK1-p6) the rig made the ticket again', realm.renew() && realm.ticketInReach(), 'kinit after p6 left no ticket');
  }
}

/**
 * PK1-p5: the client certificate. A fake that completes TLS and REQUESTS a certificate (PD3's server), a marker certificate in the rig home. The control takes every keyword that closes the
 * road out of the string and the two variables out of the environment; the candidate is `sslcertmode='disable'`, with and without the `sslcert` and `sslkey` keywords.
 */
async function legCertificate(ctx) {
  const home = path.join(ctx.dir, 'p5 home');
  const material = path.join(ctx.dir, 'p5 material');
  fs.mkdirSync(path.join(home, '.postgresql'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(material, { recursive: true });
  const server = rig.throwawayCertificate(material, 'server', 'localhost');
  const person = rig.throwawayCertificate(material, 'person', rig.PD3_MARKER_CN);
  fs.copyFileSync(person.cert, path.join(home, '.postgresql', 'postgresql.crt'));
  fs.copyFileSync(person.key, path.join(home, '.postgresql', 'postgresql.key'));
  fs.chmodSync(path.join(home, '.postgresql', 'postgresql.key'), 0o600);
  const tlsMaterial = { key: fs.readFileSync(server.key), cert: fs.readFileSync(server.cert) };
  const keywords = / sslcert='[^']*'| sslkey='[^']*'/g;
  const cases = [
    ['control: the keywords sslcert and sslkey and the variables PGSSLCERT and PGSSLKEY taken out', { control: true, cut: [keywords], drop: ['PGSSLCERT', 'PGSSLKEY'] }, true],
    ['as launched by the builder', {}, false],
    ["sslcertmode='disable' with the keywords sslcert and sslkey in the string", { add: [CANDIDATE.cert] }, false],
    ["sslcertmode='disable' alone: sslcert and sslkey and the two variables taken out", { control: true, cut: [keywords], drop: ['PGSSLCERT', 'PGSSLKEY'], add: [CANDIDATE.cert] }, false],
  ];
  let shown = false;
  for (const [index, [what, options, isControl]] of cases.entries()) {
    const run = await rig.psqlRun(ctx.scope, ctx.exe, {
      prepare: () => undefined,
      tlsMaterial,
      build: (port) => {
        const made = launchFor({ ...ctx, home, user: 'pdprobe' }, port, { ...options, host: '127.0.0.1', query: '?sslmode=require' });
        for (const name of options.drop ?? []) {
          delete made.env[name];
        }
        return made;
      },
    });
    const peer = run.state.peer ?? { offered: false };
    const offered = peer.commonName === rig.PD3_MARKER_CN;
    check(`(PK1-p5) case ${index}: the client reached the fake, completed TLS and ended in time`, run.ended && run.state.secured >= 1 || !isControl, JSON.stringify({ ended: run.ended, secured: run.state.secured, code: run.code, said: run.stderr }));
    if (isControl) {
      shown = offered;
      if (shown) {
        record('PK1-p5-control', 'shown', `${what}: the marker certificate (CN=${rig.PD3_MARKER_CN}) was OFFERED to the receiver that asked for one`);
      } else {
        unmeasured('PK1-p5-control', `the marker certificate was not offered with every control taken out (TLS ${run.state.secured >= 1 ? 'completed' : 'did not complete'}; psql said ${JSON.stringify(run.stderr)})`);
      }
    } else if (shown) {
      record(`PK1-p5-${index}`, 'shown', `${what}: ${offered ? 'CERTIFICATE OFFERED' : 'no marker certificate offered'}; a certificate of any kind ${peer.offered ? 'was offered' : 'was not offered'}; psql said ${JSON.stringify(run.stderr)}`);
      if (offered && index >= 2) {
        stop(`PK1-p5-${index}`, `the marker certificate is offered with sslcertmode='disable' written last (parent §7, row PK1: that control does not stop the road)`);
      }
    } else {
      unmeasured(`PK1-p5-${index}`, `no positive control for the certificate road; without one the client ${offered ? 'offered' : 'did not offer'} the marker`);
    }
  }
}

/** PK1 for `psql` on Linux (rigs K, G and F). */
async function psqlLinux(ctx) {
  const entryWord = throwawayWord();
  const next = { ...ctx, entryWord, user: ctx.realm?.user ?? 'probe' };
  if (ctx.realm?.ok === true && ctx.pg?.ok === true) {
    await legRoads({ ...next, realm: ctx.realm, pg: ctx.pg });
  } else {
    const why = ctx.realm?.ok === true ? ctx.pg?.why : ctx.realm?.why;
    for (const leg of ['PK1-p0', 'PK1-p1', 'PK1-p2', 'PK1-p3', 'PK1-p4', 'PK1-p6']) {
      unmeasured(leg, `no realm or no real server for the control: ${why ?? 'not built'}`);
    }
  }
  await legCertificate(next);
}

module.exports = { psqlLinux, launchFor, CANDIDATE, GSS_LINE, wordsOf };
