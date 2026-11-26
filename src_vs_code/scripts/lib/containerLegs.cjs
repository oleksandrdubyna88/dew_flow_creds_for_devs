'use strict';
// The legs of the `container` platform (change 11.1, the 72-hour slice, S3 part 2; consult ae318292): the ODBC `sqlcmd` of the shipped image, every run through the product's own container road
// (`spawnInContainer` of `out/containerDbQuery.js`: the env file, `run --rm --pull never --cap-drop ALL --user 65534:65534`). The expectations are `containerSqlcmdRules` of `dbAssertRules.cjs`.
//
//   CI-0 / CI-1   the runner holds an identity (a ticket of the throwaway realm in its default cache, and its own environment): the same script that finds it on the runner (the control) finds
//                 none of it in the query's container (uid, capabilities, environment names, ticket caches, mounts of a home)
//   PS1-8         a user written as a Windows account signs in as a plain SQL login for the name as written, with no integrated attempt in the server's log
//   PS1-4         a system data source in the image names another server: `-D` reaches it (the control), the launch as built does not
//   CI-argv       no argument of the container tool (with the client's own arguments inside it) holds the password of its env file
//   CI-envfile    the env file was there, owner-only, while the tool ran, and no env file is left after any run
//
// Nothing here prints a value of an environment: names, counts and the server's own words only.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { record, unmeasured, stop, oneLine } = require('./dbProbe.cjs');
const { launchFor, observe, wordsOf } = require('./psLegs.cjs');

/**
 * What the isolation script prints: names and counts, never a value. `tickets` counts the Kerberos caches in the usual places and the one `KRB5CCNAME` names; `mounts` are the mount points under
 * a home or a shared folder of a host.
 */
const ISOLATION_SCRIPT = [
  'echo "uid $(id -u) gid $(id -g)"',
  'echo "caps $(sed -n \'s/^CapEff:[[:space:]]*//p\' /proc/self/status)"',
  'echo "names $(env | sed -n \'s/^\\([A-Za-z_][A-Za-z0-9_]*\\)=.*/\\1/p\' | sort -u | tr \'\\n\' \' \')"',
  'echo "tickets $( { ls -1 /tmp /var/tmp /run/user/* 2>/dev/null; [ -n "${KRB5CCNAME:-}" ] && echo "$KRB5CCNAME"; } | grep -c krb5cc)"',
  'echo "mounts $(awk \'{print $2}\' /proc/self/mounts | grep -E \'^/(home|root|mnt|media|srv|run/user|workspace|github)\' | tr \'\\n\' \' \')"',
].join('; ');

/** The names any process of the image has of its own (the tool and the shell set them): not the runner's. */
const OWN_NAMES = new Set(['PATH', 'HOME', 'HOSTNAME', 'PWD', 'OLDPWD', 'SHLVL', '_']);

/** The isolation script's answer as facts. */
function factsOf(stdout) {
  const field = (name) => new RegExp(`^${name} ?(.*)$`, 'm').exec(stdout)?.[1]?.trim() ?? '';
  return {
    uid: field('uid'),
    caps: field('caps'),
    names: field('names').split(/\s+/).filter((name) => name !== ''),
    tickets: Number(field('tickets') || 'NaN'),
    mounts: field('mounts').split(/\s+/).filter((mount) => mount !== ''),
  };
}

/** The names of the runner's own environment the container must not see: every name it has but the ones a process of the image has of its own. */
const runnerNames = () => Object.keys(process.env).filter((name) => !OWN_NAMES.has(name));

/** CI-0 and CI-1: the script on the runner (the control) and in the query's container, with the launch's own env file. Answers whether the control was shown. */
async function legIsolation(ctx, client) {
  const name = client.name;
  const onRunner = spawnSync('/bin/sh', ['-c', ISOLATION_SCRIPT], { encoding: 'utf8', timeout: 30_000 }); // NOSONAR: the rig's own shell, on the runner, with the runner's environment
  const runner = factsOf(onRunner.stdout ?? '');
  const ticketHeld = ctx.realm?.ok === true && ctx.realm.renew() && ctx.realm.ticketInReach();
  const shown = ticketHeld && runner.tickets > 0 && runnerNames().length > 0;
  const controlText = `the script on this runner: uid ${runner.uid}; ${runner.tickets} ticket cache(s) found; ${runner.names.length} environment name(s); a ticket of the throwaway realm ${ticketHeld ? 'IS' : 'is NOT'} in the default cache`;
  if (shown) {
    record(`CI-0-control-${name}`, 'shown', `positive control: ${controlText}`);
  } else {
    unmeasured(`CI-0-control-${name}`, `the runner holds no identity the script finds, so isolation cannot be shown: ${controlText}${ctx.realm?.ok === true ? '' : ` (${ctx.realm?.why ?? 'no realm'})`}`);
  }
  const launched = launchFor(ctx, {});
  const run = await ctx.run(ctx.scope, '/bin/sh', ['-c', ISOLATION_SCRIPT], launched.env, { ms: 60_000 });
  const inside = factsOf(run.stdout);
  const seen = runnerNames().filter((one) => inside.names.includes(one));
  const isolated = run.code === 0 && inside.uid === '65534 gid 65534' && /^0+$/.test(inside.caps) && inside.tickets === 0 && inside.mounts.length === 0 && seen.length === 0;
  const text = `the same script in the query's container (exit ${run.code}): uid ${inside.uid}; capabilities ${inside.caps}; names ${JSON.stringify(inside.names)}; ${Number.isNaN(inside.tickets) ? 'no' : inside.tickets} ticket cache(s); home mounts ${JSON.stringify(inside.mounts)}; names of the runner seen there ${JSON.stringify(seen)}`;
  if (!shown) {
    unmeasured(`CI-1-${name}`, `no positive control; without one: ${text}`);
  } else if (isolated) {
    record(`CI-1-${name}`, 'shown', `ISOLATED: ${text}`);
  } else {
    record(`CI-1-${name}`, 'shown', `NOT ISOLATED: ${text}`);
    stop(`CI-1-${name}`, "the query's container saw an identity, a capability, a name or a mount of the runner (consult ae318292: the container is the boundary)");
  }
  return shown;
}

/** The server's log of a sign-in it looked up as a SQL login of that exact name. */
const NO_SUCH_LOGIN = /could not find a login/i;
const WINDOWS_TRY = /untrusted domain|sspi|ntlm|windows/i;

/** PS1-8: `RIGDOM\probe` with a password, as the builder launches it, in the container: a SQL login for the name as written, and no integrated attempt. */
async function legAccount(ctx, client) {
  const leg = `PS1-8-${client.name}`;
  const seen = await observe(ctx, client, { user: 'RIGDOM\\probe', ms: 30_000 });
  const text = `user RIGDOM\\probe with a password, as the builder launches it, in the container: ${wordsOf(seen)}`;
  if (seen.rigDefect !== undefined) {
    unmeasured(leg, `a RIG DEFECT, not an answer of the client (${JSON.stringify(seen.rigDefect)}): ${text}`);
  } else if (seen.integrated || seen.lines.some((line) => WINDOWS_TRY.test(line))) {
    record(leg, 'shown', `an integrated or Windows sign-in was made: ${text}`);
    stop(leg, 'a user written as a Windows account made an integrated attempt from the container (consult ae318292)');
  } else if (seen.lines.some((line) => NO_SUCH_LOGIN.test(line))) {
    record(leg, 'shown', `a SQL login for the name as written; no integrated attempt: ${text}`);
  } else {
    unmeasured(leg, `the server's log does not say how the name was looked up: ${text}`);
  }
}

/** PS1-4: the image's system data source names `other` (a listener); `-D` reaches it, and the launch as built must not. */
async function legDataSource(ctx, client, other) {
  const control = await ctx.run(ctx.scope, client.exe, ['-D', '-S', 'ps1dsn', '-Q', 'select 1', '-b', '-l', '5'], launchFor(ctx, {}).env, { ms: 30_000 });
  const controlShown = other.state.connections > 0;
  if (controlShown) {
    record(`PS1-4-control-${client.name}`, 'shown', `positive control, -D with the image's system data source: the client went to the file's server (${other.state.connections} connection(s) there)`);
  } else {
    unmeasured(`PS1-4-control-${client.name}`, `the data source was not read even with -D (the client said ${JSON.stringify(oneLine(control.stderr + control.stdout, 160))})`);
  }
  const before = other.state.connections;
  const seen = await observe(ctx, client, {});
  const reached = other.state.connections - before;
  const text = `the launch as built with the system data source in the image: the file's server saw ${reached} connection(s); ${wordsOf(seen)}`;
  if (!controlShown) {
    unmeasured(`PS1-4-${client.name}`, `no control that the file is read; without one: ${text}`);
    return;
  }
  record(`PS1-4-${client.name}`, 'shown', text);
  if (reached > 0) {
    stop(`PS1-4-${client.name}`, "the image's data source file was read although -S named the server");
  }
}

/**
 * A recorder of the container tool's runs, put in as the road's `run`: every argument list, the env file's mode while the tool ran, and the env files left after it. `runBounded` is the product's runner.
 */
function recorder(runBounded, envDir) {
  const runs = [];
  const run = async (program, argv, options) => {
    const at = argv.indexOf('--env-file');
    const file = at === -1 ? undefined : argv[at + 1];
    const mode = file !== undefined && fs.existsSync(file) ? (fs.statSync(file).mode & 0o777).toString(8) : undefined;
    const values = file === undefined || mode === undefined ? [] : fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.startsWith('SQLCMDPASSWORD=')).map((line) => line.slice('SQLCMDPASSWORD='.length));
    try {
      return await runBounded(program, argv, false, options);
    } finally {
      runs.push({ argv, query: file !== undefined, mode, values });
    }
  };
  const leftAfter = () => (fs.existsSync(envDir) ? fs.readdirSync(envDir).length : 0);
  return { run, runs, leftAfter };
}

/** CI-argv and CI-envfile, from what the recorder saw. `left` is the count of env files after each run. */
function legRoad(name, runs, left) {
  const queries = runs.filter((one) => one.query);
  const leaks = queries.filter((one) => one.values.some((value) => value !== '' && one.argv.some((arg) => arg.includes(value))));
  const unread = queries.filter((one) => one.values.length === 0);
  const argvText = `${queries.length} run(s) with an env file; ${unread.length} whose password could not be read from the file while the tool ran`;
  if (queries.length === 0 || unread.length > 0) {
    unmeasured(`CI-argv-${name}`, `no password was read from an env file to look for: ${argvText}`);
  } else if (leaks.length === 0) {
    record(`CI-argv-${name}`, 'shown', `CLEAN: no argument of the tool or of the client held the password of its env file (${argvText})`);
  } else {
    record(`CI-argv-${name}`, 'shown', `LEAKS: ${leaks.length} run(s) held the password in an argument (${argvText})`);
    stop(`CI-argv-${name}`, 'a password stood on a command line of the container road');
  }
  const modes = [...new Set(queries.map((one) => one.mode ?? 'missing'))];
  const leftOver = left.filter((count) => count > 0).length;
  const fileText = `while the tool ran, the env file's mode was ${JSON.stringify(modes)}; ${leftOver} of ${left.length} run(s) left an env file`;
  if (queries.length === 0) {
    unmeasured(`CI-envfile-${name}`, `no run had an env file: ${fileText}`);
  } else if (leftOver === 0 && modes.length === 1 && modes[0] === '600') {
    record(`CI-envfile-${name}`, 'shown', `REMOVED: ${fileText}`);
  } else {
    record(`CI-envfile-${name}`, 'shown', `NOT REMOVED or not owner-only: ${fileText}`);
    stop(`CI-envfile-${name}`, 'an env file was not owner-only while the tool ran, or was left after a run');
  }
}

/** The run a leg asks for, through the product's `spawnInContainer`: the same answer `runClient` gives. `left` collects the env files left after each run. */
function containerRun(spawnInContainer, deps, useCtx, left, leftAfter) {
  return async (scope, exe, args, env) => {
    const result = await spawnInContainer(deps, useCtx, { exe, args, env });
    left.push(leftAfter());
    if (result.status !== 200) {
      return { ended: true, code: null, stdout: '', stderr: `the container road refused the run: ${JSON.stringify(result.body).slice(0, 200)}` };
    }
    return { ended: result.body.timedOut !== true, code: result.body.exitCode, stdout: result.body.stdout, stderr: result.body.stderr };
  };
}

module.exports = { ISOLATION_SCRIPT, factsOf, legIsolation, legAccount, legDataSource, recorder, legRoad, containerRun };
