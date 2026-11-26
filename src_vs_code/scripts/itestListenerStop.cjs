// Leg 0 of section 10 (G1, E3.S2): the stop of the listener ALONE, proven before M3 uses it (the plan's *The stop of the listener alone*).
//
// K1 is started by the serving launcher. A master connection to it comes up through a handed client config (`ControlMaster auto`, a
// control path in the owned folder, `ControlPersist 60`, as section 9's `sharingConfig`). Then `stopListener` ends K1's listener by its own
// pid. The leg shows: the listener is gone and nothing answers a new connection (`Connection refused`); what the listener forked for the
// master's session is still alive; the master still answers `ssh -O check`; and it carries one more command, which prints the run's nonce
// and ends with 0, with no second login. Then the master is ended (`ssh -O exit`, then its pid), and `endServer` ends the session by the
// pids taken before the stop. It also records the programs of that session (`session-programs.json`) for the record of identities.
//
// The client is the real one, started by its path (never the shim: these starts belong to no road). Linux only, as section 10.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { endChild } = require('./itestSshd.cjs');
const { within, runClient } = require('./itestNoSharing.cjs');
const { startServingSshd, stopListener, endServer, startOf, alive, programOf, descendantsOfListener } = require('./itestServing.cjs');

const me = os.userInfo().username;
const ACCEPTED = /Accepted publickey for /g;
/** The pid of a master, as `ssh -O check` answers it: `Master running (pid=<n>)`. */
const MASTER = /Master running \(pid=(\d+)\)/;

/** The handed config of the leg's client: K1's known-hosts file alone, the run's login key, and a master on `control`. */
function masterConfig(rig, dir, port, control) {
  const known = path.join(dir, 'known_hosts');
  fs.writeFileSync(known, `[127.0.0.1]:${port} ${fs.readFileSync(`${rig.k1}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ')}\n`);
  const lines = [
    'Host *', `  UserKnownHostsFile ${known}`, '  GlobalKnownHostsFile /dev/null', '  StrictHostKeyChecking yes', '  BatchMode yes',
    '  IdentitiesOnly yes', `  IdentityFile ${rig.userKey}`, '  ControlMaster auto', `  ControlPath ${control}`, '  ControlPersist 60', '',
  ];
  const config = path.join(dir, 'client_config');
  fs.writeFileSync(config, lines.join('\n'));
  return config;
}

/** The programs of what the listener forked for the master's session, by `/proc/<pid>/exe`, written beside its config. */
function recordSession(dir, taken) {
  const programs = taken.list.map(programOf).filter((one) => one !== undefined);
  const distinct = [...new Map(programs.map((one) => [one.sha256, one])).values()];
  fs.writeFileSync(path.join(dir, 'session-programs.json'), `${JSON.stringify({ programs: distinct })}\n`);
}

/** The master's checks after the stop; answers the master's identity. */
async function masterOutlives(check, rig, server, client) {
  const stop = await stopListener(server);
  check('leg 0: the listener alone was stopped, by its own pid: it exited, and its pid is no longer the same process', stop.stopped, JSON.stringify(server.identity));
  check('leg 0: what the listener forked for the master\'s session was listed before the stop and is alive after it, by pid and start time', stop.taken.error === undefined && stop.taken.list.some(alive), stop.taken.error ?? JSON.stringify(stop.taken.list));
  const checked = await client(['-O', 'check', `${me}@127.0.0.1`]);
  check('leg 0: the master outlived its listener: ssh -O check ends with 0', checked.code === 0, checked.stderr);
  const fresh = await client(['-o', 'ControlPath=none', `${me}@127.0.0.1`, 'true']);
  check('leg 0: nothing listens any more: a connection without the master ends with 255 and "Connection refused"', fresh.code === 255 && /Connection refused/.test(fresh.stderr), JSON.stringify(fresh));
  const nonce = crypto.randomUUID();
  const more = await client([`${me}@127.0.0.1`, `echo ${nonce}`]);
  check('leg 0: the master carried one more command after its listener had gone: it printed the nonce and ended with 0', more.code === 0 && more.stdout === nonce, JSON.stringify(more));
  const logins = server.sshd.stderr.match(ACCEPTED)?.length ?? 0;
  check('leg 0: K1 logged ONE accepted login, the master\'s: the command after the stop did not log in again', logins === 1, server.sshd.stderr.trim().split('\n').slice(-20).join('\n'));
  return stop.taken;
}

/** Leg 0: the listener-only stop, with a master that outlives it and carries one more command. */
async function listenerStopLeg(check, rig, real) {
  const server = await startServingSshd(rig, 'k0', rig.k1, undefined);
  check('leg 0: K1 listens, started by the serving launcher', server.failure === undefined, server.failure);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return;
  }
  const dir = path.join(rig.dir, 'k0');
  const control = path.join(dir, 'cm');
  const config = masterConfig(rig, dir, server.port, control);
  const client = (argv) => runClient(rig, config, ['-p', String(server.port), ...argv], rig.env, real);
  let master;
  let taken = { list: [], error: undefined };
  try {
    const opened = await client(['-N', '-f', `${me}@127.0.0.1`]);
    const up = await within(10_000, async () => (await client(['-O', 'check', `${me}@127.0.0.1`])).code === 0);
    const said = await client(['-O', 'check', `${me}@127.0.0.1`]);
    const pid = Number(MASTER.exec(said.stderr)?.[1]);
    master = Number.isInteger(pid) ? { pid, start: startOf(pid) } : undefined;
    check('leg 0: a master connection to K1 is up: ssh -O check on its control path ends with 0 and names its pid', up && master?.start !== undefined, JSON.stringify({ opened, said }));
    taken = await descendantsOfListener(server);
    recordSession(dir, taken);
    if (up) {
      taken = await masterOutlives(check, rig, server, client);
    }
  } finally {
    await client(['-O', 'exit', `${me}@127.0.0.1`]);
    const { list, error } = await endServer(server, master === undefined ? [] : [master], taken);
    const gone = await within(5_000, () => !fs.existsSync(control));
    // The detail names what was seen at the assertion (E3.S10 code gate): the control socket's `gone` and whether the master still runs, beside the error and the live pids.
    const detail = JSON.stringify({ error: error ?? null, alive: list.filter(alive), masterAlive: master === undefined ? null : alive(master), gone });
    check('leg 0: the master, its session and K1 are gone, by pid and start time, and the control socket too', error === undefined && !list.some(alive) && (master === undefined || !alive(master)) && gone, detail);
  }
}

module.exports = { listenerStopLeg };
