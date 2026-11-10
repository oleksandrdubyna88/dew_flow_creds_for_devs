// E2.4.S4 — the acme harness (`deploy/acme-test/run.sh` and its compose file) under the leftovers contract
// (common/test-leftovers.md, detail §5 and §7). Five rules, each read from the real text AND run:
//
//   1. E2.4-h: the compose project is the owned folder's name, lower-cased, from nothing else (`PROJECT` is assigned once, from
//      `${STATE##*/}`); a fixed project would let a second run tear down the first one's stack, and no guard can see it;
//   2. E2.4-f: the state is in NAMED volumes, and the owner label is on every service, the network and every volume (an unlabelled
//      volume is kept by the janitor as `unmarked`); no bind mount of a state folder;
//   3. the clean-up guards what is not made yet: a failure before `PROJECT` is set runs no `docker compose … down` against an empty name;
//   4. the certificate is asked for through a container, never from the host: certbot's live folder is `drwx------ root`, so the host
//      check of the job's user said "no certificate was issued" while certbot had got it (hosted runs 42713538247 and 42714461289);
//   5. the script sets its clean-up with `owned_trap cleanup` and has NO signal trap of its own (the S1 spec's Q8): an interrupt
//      anywhere ends it with 128 + n, the project is taken down and the owned folder removed.
//
// Nothing here runs Docker (this machine has none). `run.sh` is copied into a temp tree with a stub `docker`, `curl`, `openssl` and
// `sleep` first on `PATH` and a stub janitor at the path it calls, and RUN; each rule then has a planted fault (a mutated copy of the
// real text) that the same check must refuse. A check that cannot go red is not one. The hosted proof (sc. 5, 6, 7 on a real daemon) is
// a throwaway dispatch named in the build record.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { REPO } from './repoFiles';

const scope = cleanupScope();
after(() => scope.close());

const RUN = 'deploy/acme-test/run.sh';
const COMPOSE = 'deploy/acme-test/docker-compose.acme-test.yml';
const read = (file: string): string => fs.readFileSync(path.join(REPO, file), 'utf8');
const REAL_RUN = read(RUN);
const REAL_COMPOSE = read(COMPOSE);
const OWNED_SH = read('.github/scripts/lib/owned.sh');

/** The one place a planted fault is made: it fails when the text to replace is not there exactly once, so a drifted script cannot hide behind it. */
function mutate(text: string, from: string | RegExp, to: string): string {
  const hits = typeof from === 'string' ? text.split(from).length - 1 : [...text.matchAll(new RegExp(from.source, from.flags.includes('g') ? from.flags : `${from.flags}g`))].length;
  assert.equal(hits, 1, `the planted fault needs exactly one place to change, found ${hits}: ${String(from)}`);
  return typeof from === 'string' ? text.replace(from, () => to) : text.replace(from, to);
}

type Check = (text: string) => string | undefined;
const problemsOf = (checks: Check[], text: string): string[] => checks.map((check) => check(text)).filter((problem): problem is string => problem !== undefined);
const unless = (holds: boolean, problem: string): string | undefined => (holds ? undefined : problem);
/** The live lines of a script or compose file: comments dropped, indentation trimmed. */
const liveLines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));

// --- the text rules ------------------------------------------------------------------------------------------------------------------

// Written in pieces with no escape: this string is handed to `mutate`, which also takes a RegExp, and CodeQL reads a `\$` in it as a
// useless regular-expression escape (js/useless-regexp-character-escape).
const PROJECT_LINE = ['PROJECT="$(printf ', "'%s'", ' "${STATE##*/}" | tr ', "'[:upper:]' '[:lower:]'", ')"'].join('');
const COMPOSE_LINE = ['COMPOSE=(docker', 'compose', '-p', '"$PROJECT"', '-f', 'docker-compose.acme-test.yml)'].join(' ');
const PROJECT_VARIABLE = ['COMPOSE', 'PROJECT', 'NAME'].join('_');
const assignmentsOf = (text: string): string[] => liveLines(text).filter((line) => /^(?:export |declare |readonly )?PROJECT=/.test(line) && line !== 'PROJECT=""');

/** Row E2.4-h: `PROJECT` is assigned once, from the owned folder's name, and every compose call names it by the variable. */
const PROJECT_CHECKS: Check[] = [
  (text) => unless(assignmentsOf(text).length === 1, `PROJECT is assigned ${assignmentsOf(text).length} times (besides the empty start), expected once: ${assignmentsOf(text).join(' | ')}`),
  (text) => unless(assignmentsOf(text).every((line) => line === PROJECT_LINE), `PROJECT is not assigned as ${PROJECT_LINE}: ${assignmentsOf(text).join(' | ')}`),
  (text) => unless(!/\bprintf -v PROJECT\b|\bread\b[^\n]*\bPROJECT\b/.test(text) && !text.includes(PROJECT_VARIABLE), 'PROJECT or COMPOSE_PROJECT_NAME is set another way'),
  (text) => {
    const bad = liveLines(text).find((line) => /\bcompose\b.*\s-p\s+(?!"\$PROJECT")/.test(line));
    return unless(bad === undefined, `a compose call names a project that is not "$PROJECT": ${bad}`);
  },
  (text) => unless(/^PROJECT=""$/m.test(text), 'PROJECT is not set empty before the clean-up is armed'),
  (text) => unless(liveLines(text).includes(COMPOSE_LINE), `COMPOSE is not ${COMPOSE_LINE}`),
];

/** The live lines of the function `cleanup`, from its header to the first closing brace at column 0. */
function cleanupBody(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf('cleanup() {');
  if (start < 0) return [];
  const end = lines.slice(start + 1).findIndex((line) => line === '}');
  return lines.slice(start + 1, end < 0 ? lines.length : start + 1 + end).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
}

/** `owned_cleanup` stands between the STATE `if` and the `fi` that closes it, not merely somewhere in the function. */
function ownedCleanupIsGuarded(body: string[]): boolean {
  const open = body.indexOf('if [ -n "${STATE:-}" ]; then');
  const close = body.indexOf('fi', open + 1);
  const call = body.indexOf('owned_cleanup');
  return open >= 0 && close > open && call > open && call < close;
}

/** Rule 5 and the folder rules of the script's text: the helper's trap, no trap of its own, no state folder, no sudo. */
const SCRIPT_CHECKS: Check[] = [
  (text) => unless(liveLines(text).filter((line) => line === 'owned_trap cleanup').length === 1, 'the script does not call `owned_trap cleanup` exactly once'),
  (text) => {
    const bad = liveLines(text).find((line) => /^trap\b/.test(line));
    return unless(bad === undefined, `a trap of its own (the helper installs EXIT, INT, TERM and HUP): ${bad}`);
  },
  (text) => unless(liveLines(text).some((line) => /^source \.\.\/\.\.\/\.github\/scripts\/lib\/owned\.sh$/.test(line)), 'the script does not source owned.sh'),
  (text) => unless(!/\bsudo\b/.test(text), 'the script uses sudo'),
  (text) => {
    const bad = liveLines(text).find((line) => /\bstate\b/.test(line) && !/\$STATE|\$\{STATE|STATE=|owned_dir STATE/.test(line));
    return unless(bad === undefined, `the script still names a state folder of the checkout: ${bad}`);
  },
  (text) => unless(!/\brm -rf\b/.test(liveLines(text).join('\n')), 'the script removes a folder itself (owned_cleanup does); a comment may name the command'),
  (text) => unless(ownedCleanupIsGuarded(cleanupBody(text)), 'the clean-up does not call owned_cleanup INSIDE the STATE guard (brief § 3.3 item 1)'),
];

/** The lines of the top-level block that starts at `header` (indent 0), up to the next top-level key. */
function topBlock(text: string, header: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(header);
  if (start < 0) return [];
  const end = lines.slice(start + 1).findIndex((line) => /^\S/.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : start + 1 + end).filter((line) => !/^\s*#/.test(line));
}

/** The keys at two-space indent of a top-level block, each with the lines of its own body (deeper than two spaces). */
function entriesOf(block: string[]): Map<string, string[]> {
  const entries = new Map<string, string[]>();
  let current: string[] = [];
  for (const line of block) {
    const key = /^ {2}([A-Za-z0-9_.-]+):/.exec(line)?.[1];
    if (key !== undefined) entries.set(key, (current = []));
    else current.push(line);
  }
  return entries;
}

const MERGE = /^ +<<: \*owned$/m;
const missing = (entries: Map<string, string[]>, keys: string[]): string[] => keys.filter((key) => !MERGE.test((entries.get(key) ?? []).join('\n')));
const SERVICES = ['pebble', 'vault', 'nginx', 'certbot'];
const VOLUMES = ['certs-conf', 'certs-www', 'data', 'logs'];

/** Row E2.4-f: no fixed project name; the owner label on every service, the network and every named volume; the state in named volumes only. */
const COMPOSE_CHECKS: Check[] = [
  (text) => unless(!/^name:/m.test(text), 'the compose file fixes a project name (`name:`): the project is the owned folder'),
  (text) => unless(topBlock(text, 'x-owned: &owned').join('\n').includes('testsToDelete.owner: "${TESTS_TO_DELETE_OWNER:?}"'), 'x-owned does not carry testsToDelete.owner from ${TESTS_TO_DELETE_OWNER:?}'),
  (text) => {
    const none = missing(entriesOf(topBlock(text, 'services:')), SERVICES);
    return unless(none.length === 0, `services without the owner label (<<: *owned): ${none.join(', ')}`);
  },
  (text) => {
    const none = missing(entriesOf(topBlock(text, 'networks:')), ['edge']);
    return unless(none.length === 0, `networks without the owner label: ${none.join(', ')}`);
  },
  (text) => {
    const volumes = entriesOf(topBlock(text, 'volumes:'));
    const none = missing(volumes, VOLUMES);
    return unless(none.length === 0 && [...volumes.keys()].length === VOLUMES.length, `named volumes without the owner label, or not exactly ${VOLUMES.join(', ')}: ${none.join(', ')} (declared: ${[...volumes.keys()].join(', ')})`);
  },
  (text) => {
    const bad = liveLines(text).find((line) => /^- \.\/state\b/.test(line));
    return unless(bad === undefined, `a bind mount of a state folder: ${bad}`);
  },
  (text) => {
    const mounts = liveLines(text).filter((line) => /^- (?:certs-conf|certs-www|data|logs):/.test(line));
    return unless(mounts.length === 6, `${mounts.length} service mounts of the four named volumes, expected 6 (data, logs, certs-conf twice, certs-www twice)`);
  },
];

const projectProblems = (text: string): string[] => problemsOf(PROJECT_CHECKS, text);
const scriptProblems = (text: string): string[] => problemsOf(SCRIPT_CHECKS, text);
const composeProblems = (text: string): string[] => problemsOf(COMPOSE_CHECKS, text);

// --- what runs: run.sh in a temp tree, with stubs --------------------------------------------------------------------------------

// STUB_FAIL: a compose verb that fails; STUB_SIGNAL_ON and STUB_SIGNAL: a compose verb during which the stub signals its parent (the
// script); STUB_CERT: 1 when the certificate is visible INSIDE a container (the host never sees it); STUB_SEEN: the temp root's listing
// at `create`, so the test can read the folder's name before the script removes it.
const DOCKER = `#!/bin/bash
echo "$*" >> "$STUB_CALLS"
case "$1" in
  compose)
    verb=""
    for each in "$@"; do case "$each" in create|up|down|logs) verb="$each"; break ;; esac; done
    [ "$verb" = create ] && ls "$TMPDIR" >> "$STUB_DIR/seen"
    if [ "$verb" = "\${STUB_FAIL:-}" ]; then echo "stub docker: $verb fails" >&2; exit 1; fi
    if [ "$verb" = "\${STUB_SIGNAL_ON:-}" ]; then kill -"$STUB_SIGNAL" "$PPID"; fi
    exit 0 ;;
  run)
    case "$*" in
      *" test -f "*)
        # the certificate probe: it prints cert:yes or cert:no from inside the container and exits 0 either way. Switches:
        # STUB_CERT_ERR (+ _CODE): a docker failure, words on stderr, no marker; STUB_PROBE_RAW: print STUB_PROBE_OUT as it is (even empty);
        # STUB_PROBE_SLEEP: a stall (exec, so the stalled process IS the one that is killed); STUB_PROBE_SIGNAL: signal the script, then stall.
        echo "$$" > "$STUB_DIR/probe.pid"
        if [ -n "\${STUB_PROBE_SIGNAL:-}" ]; then
          target="$PPID"
          case "$(ps -o comm= -p "$PPID" 2>/dev/null)" in timeout*) target="$(ps -o ppid= -p "$PPID" | tr -d ' ')" ;; esac
          kill -"$STUB_PROBE_SIGNAL" "$target"
          exec /bin/sleep 30
        fi
        if [ -n "\${STUB_PROBE_IGNORE_TERM:-}" ]; then trap '' TERM; while :; do /bin/sleep 1; done; fi
        if [ -n "\${STUB_PROBE_SLEEP:-}" ]; then exec /bin/sleep "$STUB_PROBE_SLEEP"; fi
        if [ -n "\${STUB_PROBE_DELAY:-}" ]; then /bin/sleep "$STUB_PROBE_DELAY"; fi
        if [ -n "\${STUB_CERT_ERR:-}" ]; then echo "$STUB_CERT_ERR" >&2; exit "\${STUB_CERT_ERR_CODE:-125}"; fi
        if [ -n "\${STUB_PROBE_RAW:-}" ]; then printf '%s' "\${STUB_PROBE_OUT:-}"; exit 0; fi
        if [ "\${STUB_CERT:-1}" = 1 ]; then echo cert:yes; else echo cert:no; fi
        exit 0 ;;
      *) exit 0 ;;
    esac ;;
esac
echo "stub docker: unexpected call: $*" >&2
exit 99
`;
const CURL = `#!/bin/bash
echo "$*" >> "$STUB_DIR/curl.calls"
url="\${!#}"
key="$STUB_DIR/curl.$(printf '%s' "$url" | tr -c 'a-zA-Z0-9' _)"
n=$(cat "$key" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$key"
case "$url" in
  *:18081/api/vault) if [ "$n" -le 1 ]; then code=503; else code=301; fi ;;
  *acme-challenge*) code=404 ;;
  *:18444/api/health) [ "$n" -le 1 ] && exit 7; code=200 ;;
  *:18444/api/vault) code=401 ;;
  *) code=000 ;;
esac
case "$*" in *http_code*) printf '%s' "$code" ;; esac
exit 0
`;
const OPENSSL = `#!/bin/bash
case "$1" in x509) echo "issuer=CN = Pebble Intermediate CA" ;; esac
exit 0
`;
const SLEEP = '#!/bin/bash\nexec /bin/sleep 0.01\n';
const JANITOR = `# a stand-in for the shared janitor: it logs its call and ends as told
echo "janitor $* MIN_AGE=\${JANITOR_MIN_AGE_MINUTES:-}" >> "$STUB_CALLS"
if [ -n "\${STUB_JANITOR_SIGNAL:-}" ]; then kill -"$STUB_JANITOR_SIGNAL" "$PPID"; fi
exit "\${STUB_JANITOR_RC:-0}"
`;

interface Run {
  readonly status: number | null;
  readonly output: string;
  /** Every stub call, in order. */
  readonly calls: string[];
  /** What the temp root holds after the run. */
  readonly left: string[];
  /** The project the compose calls should name: the lower-cased name of the folder the script made (read at `create`). */
  readonly folderProject: string | undefined;
  /** Every curl call's arguments, in order. */
  readonly curlCalls: string[];
  /** The pid of the stub that last answered the certificate probe, when it wrote one. */
  readonly probePid: number | undefined;
}

/** Is the process still there? (a signal of 0 only asks) */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const lowerCased = (text: string | undefined): string | undefined => text?.toLowerCase();
const splitLines = (text: string): string[] => text.split('\n').filter((line) => line !== '');

/** A tree of its own: `text` as run.sh, the real compose file and owned.sh, the stub janitor, the stubs on `bin`, an empty temp root and a stub folder. */
function makeTree(text: string): { dir: string; script: string; tmp: string; stub: string; calls: string } {
  const dir = ownedDir(scope, 'acme-run');
  const put = (name: string, body: string, mode: number): string => {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, { mode });
    return file;
  };
  const script = put(RUN, text, 0o755);
  put(COMPOSE, REAL_COMPOSE, 0o644);
  put('.github/scripts/lib/owned.sh', OWNED_SH, 0o644);
  put('.claude/rules/shared/tools/janitor.sh', JANITOR, 0o644);
  for (const [name, body] of Object.entries({ docker: DOCKER, curl: CURL, openssl: OPENSSL, sleep: SLEEP })) put(`bin/${name}`, body, 0o755);
  fs.mkdirSync(path.join(dir, 'tmp'));
  return { dir, script, tmp: path.join(dir, 'tmp'), stub: path.dirname(put('stub/seen', '', 0o644)), calls: put('calls', '', 0o644) };
}

/** Runs `text` as run.sh in a tree of its own. `env` sets the stubs' switches; `noRoot`: the temp root the helper is told to use does not exist, so the owned folder cannot be made. */
function execute(text: string, env: Record<string, string>, noRoot: boolean): Run {
  const tree = makeTree(text);
  const root = noRoot ? path.join(tree.dir, 'absent', 'nowhere') : tree.tmp;
  const childEnv = { PATH: `${path.join(tree.dir, 'bin')}:${String(process.env.PATH)}`, HOME: tree.dir, TMPDIR: root, STUB_CALLS: tree.calls, STUB_DIR: tree.stub, ACME_CERT_DEADLINE: '2', ...env };
  const result = spawnSync('bash', [tree.script], { cwd: tree.dir, env: childEnv, encoding: 'utf8', timeout: 60000 });
  const folder = splitLines(fs.readFileSync(path.join(tree.stub, 'seen'), 'utf8')).find((entry) => !entry.endsWith('.owner'));
  return { status: result.status, output: `${result.stdout}${result.stderr}`, calls: splitLines(fs.readFileSync(tree.calls, 'utf8')), probePid: fs.existsSync(path.join(tree.stub, 'probe.pid')) ? Number(fs.readFileSync(path.join(tree.stub, 'probe.pid'), 'utf8')) : undefined, curlCalls: splitLines(fs.existsSync(path.join(tree.stub, 'curl.calls')) ? fs.readFileSync(path.join(tree.stub, 'curl.calls'), 'utf8') : ''), left: fs.readdirSync(tree.tmp), folderProject: lowerCased(folder) };
}

const runAcme = (text: string, env: Record<string, string> = {}): Run => execute(text, env, false);
/** The temp root the helper is told to use does not exist: the owned folder cannot be made, so PROJECT is never set. */
const runWithoutRoot = (text: string): Run => execute(text, {}, true);

const composeCalls = (run: Run, verb: string): string[] => run.calls.filter((call) => new RegExp(`^compose .* ${verb}\\b`).test(call));
const projectsOf = (run: Run): string[] => run.calls.filter((call) => call.startsWith('compose ')).map((call) => /^compose -p (\S*) /.exec(call)?.[1] ?? '<none>');

// --- E2.4-h: the project is the owned folder's name -----------------------------------------------------------------------------------

test('E2.4-h: PROJECT is assigned once, from the owned folder\'s name lower-cased, and from nothing else', () => {
  assert.deepEqual(projectProblems(REAL_RUN), []);
});

test('E2.4-h: the rule refuses `PROJECT=acme`, a second assignment, a fixed `-p`, and COMPOSE_PROJECT_NAME', () => {
  const fixed = mutate(REAL_RUN, PROJECT_LINE, 'PROJECT=acme');
  assert.match(projectProblems(fixed).join('\n'), /PROJECT is not assigned as/);
  const twice = mutate(REAL_RUN, PROJECT_LINE, `${PROJECT_LINE}\nPROJECT=acme`);
  assert.match(projectProblems(twice).join('\n'), /assigned 2 times/);
  const dash = mutate(REAL_RUN, COMPOSE_LINE, COMPOSE_LINE.replace('"$PROJECT"', 'acme'));
  assert.match(projectProblems(dash).join('\n'), /names a project that is not "\$PROJECT"/);
  const variable = mutate(REAL_RUN, PROJECT_LINE, `${PROJECT_LINE}\nexport ${PROJECT_VARIABLE}=acme`);
  assert.match(projectProblems(variable).join('\n'), /set another way/);
});

test('E2.4-h: run under stubs, every compose call names the owner-form project of the folder the script made', () => {
  const run = runAcme(REAL_RUN);
  assert.equal(run.status, 0, run.output);
  assert.match(run.folderProject ?? '', /^[a-z]+-u\d+-creds-acme-[0-9a-f]{8}$/, `no owned acme folder was seen at create:\n${run.output}`);
  const projects = projectsOf(run);
  assert.ok(projects.length >= 4, `too few compose calls to prove it: ${projects.length}`);
  assert.deepEqual([...new Set(projects)], [run.folderProject]);
  // The run says which project and folder it made, so a person (or a hosted check) can look for exactly those afterwards.
  assert.match(run.output, new RegExp(`^compose project: ${run.folderProject}$`, 'm'));
  assert.match(run.output, /^owned folder: \S+-creds-acme-[0-9a-f]{8}$/m);
});

const DAEMON_DOWN = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?';
const probeTries = (run: Run): number => run.calls.filter((call) => / test -f /.test(call)).length;

test('a docker failure during the certificate wait ends the wait at the FIRST one: its code and words are named; exit 125 and exit 1 with no marker are both docker failures', () => {
  for (const code of ['125', '1']) {
    const broken = runAcme(REAL_RUN, { STUB_CERT_ERR: DAEMON_DOWN, STUB_CERT_ERR_CODE: code });
    assert.equal(broken.status, 1, broken.output);
    assert.match(broken.output, new RegExp(`FAIL\\S*\\s+the certificate check failed in docker, not for want of a file \\(docker exited with code ${code}: Cannot connect to the Docker daemon`), broken.output);
    assert.doesNotMatch(broken.output, /no certificate was issued after/);
    assert.equal(probeTries(broken), 1, `exit ${code}: docker failed at once, yet the wait made ${probeTries(broken)} tries`);
    assert.deepEqual(broken.left, [], 'a failing run leaves nothing');
  }
});

test('only the marker `cert:yes` means found and only `cert:no` means not yet: empty or other output is a docker failure, also with exit code 0', () => {
  for (const out of ['', 'ok', 'cert:yes please', 'cert:maybe']) {
    const run = runAcme(REAL_RUN, { STUB_PROBE_RAW: '1', STUB_PROBE_OUT: out });
    assert.equal(run.status, 1, `[${out}] ${run.output}`);
    assert.match(run.output, /the certificate check failed in docker, not for want of a file \(the probe printed '/, `[${out}] ${run.output}`);
    assert.equal(probeTries(run), 1);
  }
  const absent = runAcme(REAL_RUN, { STUB_CERT: '0' });
  assert.match(absent.output, /no certificate was issued within 2 s \(the last try found no file\)/);
  assert.doesNotMatch(absent.output, /failed in docker/);
});

test('a stalled probe is bounded: it counts as a docker failure "timed out after N s", well before the full wait, and leaves nothing (timeout, and the portable watchdog)', () => {
  for (const env of [{}, { ACME_PROBE_WATCHDOG: '1' }] as Array<Record<string, string>>) {
    const began = Date.now();
    const run = runAcme(REAL_RUN, { ACME_PROBE_TIMEOUT: '2', STUB_PROBE_SLEEP: '30', ...env });
    const seconds = (Date.now() - began) / 1000;
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /the certificate check failed in docker, not for want of a file \(the probe timed out after 2 s/, run.output);
    assert.ok(seconds < 20, `${JSON.stringify(env)}: the stalled probe held the run for ${seconds} s`);
    assert.equal(probeTries(run), 1);
    assert.deepEqual(run.left, []);
    assert.ok(run.probePid !== undefined && !alive(run.probePid), `${JSON.stringify(env)}: the stalled probe (pid ${run.probePid}) is still running`);
  }
});

test('an interrupt during a probe ends the run with 128 + n, kills the probe and its watchdog, and leaves nothing', () => {
  for (const [signal, code] of [['INT', 130], ['TERM', 143]] as const) {
    for (const env of [{}, { ACME_PROBE_WATCHDOG: '1' }] as Array<Record<string, string>>) {
      const run = runAcme(REAL_RUN, { STUB_PROBE_SIGNAL: signal, ACME_PROBE_TIMEOUT: '60', ...env });
      assert.equal(run.status, code, `${signal} ${JSON.stringify(env)}: ${run.output}`);
      assert.deepEqual(run.left, []);
      assert.ok(run.probePid !== undefined && !alive(run.probePid), `${signal} ${JSON.stringify(env)}: the probe (pid ${run.probePid}) is still running`);
    }
  }
});

test('the guard of owned_cleanup is a block: owned_cleanup moved out of the STATE `if` is refused', () => {
  const out = mutate(REAL_RUN, '  if [ -n "${STATE:-}" ]; then\n    owned_cleanup\n  fi\n', '  if [ -n "${STATE:-}" ]; then\n    :\n  fi\n  owned_cleanup\n');
  assert.match(scriptProblems(out).join('\n'), /INSIDE the STATE guard/);
  assert.deepEqual(scriptProblems(REAL_RUN), []);
});

test('every curl call is bounded by --max-time (a hung port 80 cannot hold a try for ever), on port 80 and on 443', () => {
  const run = runAcme(REAL_RUN);
  assert.equal(run.status, 0, run.output);
  assert.ok(run.curlCalls.length >= 6, `too few curl calls to prove it: ${run.curlCalls.length}`);
  const unbounded = run.curlCalls.filter((call) => !/--max-time \d+/.test(call));
  assert.deepEqual(unbounded, [], 'a curl call with no --max-time');
  assert.ok(run.curlCalls.some((call) => call.includes(':18081')), 'no call to port 80 was seen');
});

test('F9: a `down -v` that fails is reported with its exit code and its own words, and the run still ends with its own status; a clean one says nothing', () => {
  const failing = runAcme(REAL_RUN, { STUB_FAIL: 'down' });
  assert.equal(failing.status, 0, failing.output);
  assert.match(failing.output, /clean-up: docker compose down -v ended with exit code 1:\nstub docker: down fails/);
  assert.doesNotMatch(runAcme(REAL_RUN).output, /clean-up:/);
  const silent = mutate(REAL_RUN, 'down -v --remove-orphans 2>&1)', 'down -v --remove-orphans >/dev/null 2>&1)');
  assert.doesNotMatch(runAcme(silent, { STUB_FAIL: 'down' }).output, /stub docker: down fails/, 'the plant (everything to /dev/null) hides the reason: the real text must differ');
});

const isMount = (call: string): boolean => call.startsWith('run ') && /\s-v\s/.test(call);

/** `compose create` must be called, and before the first container run that mounts a project volume. */
function orderProblem(run: Run): string | undefined {
  const created = run.calls.findIndex((call) => /^compose .* create\b/.test(call));
  const firstMount = run.calls.findIndex(isMount);
  if (created < 0) return 'no `compose create` was called';
  return firstMount >= 0 && created > firstMount ? `the first container run that mounts a project volume (call ${firstMount}) comes before compose create (call ${created})` : undefined;
}

/** Every `-v` source of a mounting call is the folder's project plus one of the four volume names. */
function sourceProblems(run: Run): string[] {
  const allowed = new Set(VOLUMES.map((name) => `${run.folderProject}_${name}`));
  return run.calls.filter(isMount).flatMap((call) => [...call.matchAll(/\s-v\s+([^:\s]+):/g)].map((hit) => hit[1]).filter((source) => !allowed.has(source)).map((source) => `the -v source ${source} is not ${run.folderProject}_ plus one of ${VOLUMES.join(', ')}: ${call}`));
}

/** The volume rules of a run: the order of create and the first mount, and the names of the sources. */
function volumeProblems(run: Run): string[] {
  const noMount = run.calls.some(isMount) ? undefined : 'no container run mounts a volume: the order cannot be proved';
  return [orderProblem(run), noMount, ...sourceProblems(run)].filter((problem): problem is string => problem !== undefined);
}

test('E2.4-f: compose create comes before the first container run that mounts a project volume, and every -v source is the folder\'s project plus one of the four volumes', () => {
  const run = runAcme(REAL_RUN);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(volumeProblems(run), []);
  assert.doesNotMatch(run.output, /not what this run wrote/, 'the clean-up calls owned_cleanup and the helper must not warn about a release it did not see');
});

test('E2.4-f: the plants go red: a fixed `acme_data` for `${PROJECT}_data`, and the create moved after the chown', () => {
  const fixed = runAcme(mutate(REAL_RUN, '-v "${PROJECT}_data:/d"', '-v "acme_data:/d"'));
  assert.match(volumeProblems(fixed).join('\n'), /-v source acme_data is not/);
  const createLine = '"${COMPOSE[@]}" create >/dev/null\n';
  const chown = /docker run --rm -v "\$\{PROJECT\}_data:\/d" -v "\$\{PROJECT\}_logs:\/l" alpine chown -R 10001:10001 \/d \/l >\/dev\/null\n/;
  const text = mutate(REAL_RUN, createLine, '');
  const late = runAcme(mutate(text, chown, `$&${createLine}`));
  assert.match(volumeProblems(late).join('\n'), /comes before compose create/);
});

test('E2.4-h: run under stubs, `PROJECT=acme` names a project that is not the folder\'s', () => {
  const run = runAcme(mutate(REAL_RUN, PROJECT_LINE, 'PROJECT=acme'));
  assert.notDeepEqual([...new Set(projectsOf(run))], [run.folderProject]);
});

// --- E2.4-f: the labels and the named volumes -----------------------------------------------------------------------------------------

test('E2.4-f: the compose file has no fixed name, the owner label on the four services, the network and the four named volumes, and no bind mount of a state folder', () => {
  assert.deepEqual(composeProblems(REAL_COMPOSE), []);
});

test('E2.4-f: the rule refuses a volume, a service or the network without the label, a fixed name, and a state bind mount', () => {
  assert.match(composeProblems(mutate(REAL_COMPOSE, /  certs-www:\n    <<: \*owned\n/, '  certs-www: {}\n')).join('\n'), /named volumes without the owner label.*certs-www/);
  assert.match(composeProblems(mutate(REAL_COMPOSE, /  logs:\n    <<: \*owned\n/, '  logs: {}\n')).join('\n'), /named volumes without the owner label.*logs/);
  assert.match(composeProblems(mutate(REAL_COMPOSE, /  edge:\n    driver: bridge\n    <<: \*owned\n/, '  edge:\n    driver: bridge\n')).join('\n'), /networks without the owner label: edge/);
  assert.match(composeProblems(mutate(REAL_COMPOSE, /(  certbot:\n    image: certbot\/certbot:latest\n)    <<: \*owned\n/, '$1')).join('\n'), /services without the owner label.*certbot/);
  assert.match(composeProblems(`name: cred-vault-acme-test\n\n${REAL_COMPOSE}`).join('\n'), /fixes a project name/);
  assert.match(composeProblems(mutate(REAL_COMPOSE, '      - data:/data', '      - ./state/data:/data')).join('\n'), /bind mount of a state folder/);
});

test('E2.4-f: the label value comes from the exported owner record, and run.sh exports it before any compose call', () => {
  const run = runAcme(REAL_RUN);
  assert.equal(run.status, 0, run.output);
  const text = REAL_RUN.split('\n').map((line) => line.trim());
  const exported = text.findIndex((line) => /^export TESTS_TO_DELETE_OWNER="\$OWNED_OWNER"$/.test(line));
  const first = text.findIndex((line) => /\bcompose\b|COMPOSE=/.test(line) && !line.startsWith('#'));
  assert.ok(exported >= 0 && exported < first, `TESTS_TO_DELETE_OWNER is exported at line ${exported + 1}, the first compose line is ${first + 1}`);
});

// --- the clean-up guards what is not made yet (rule 3) ------------------------------------------------------------------------------

const UNGUARDED = (text: string): string => mutate(text, 'if [ -n "${PROJECT:-}" ]; then', 'if true; then');

test('a failure before PROJECT is set runs no compose teardown and leaves nothing: the owned folder cannot be made', () => {
  const run = runWithoutRoot(REAL_RUN);
  assert.equal(run.status, 1, run.output);
  assert.deepEqual(composeCalls(run, 'down'), [], `a teardown ran with no project:\n${run.calls.join('\n')}`);
  assert.deepEqual(run.left, []);
  assert.doesNotMatch(run.output, /No such|invalid|unknown shorthand/);
});

test('an unguarded clean-up runs `docker compose -p "" … down` when PROJECT is unset: the plant the guard test refuses', () => {
  const run = runWithoutRoot(UNGUARDED(REAL_RUN));
  assert.equal(composeCalls(run, 'down').length, 1, run.calls.join('\n'));
  assert.match(composeCalls(run, 'down')[0], /^compose -p {2}-f /);
});

// --- the certificate is asked for through a container (rule 4) ----------------------------------------------------------------------

const CERT_PROBE = /cert_probe_cmd=\(docker run --rm -v "\$\{PROJECT\}_certs-conf:\/s:ro" alpine sh -c 'if test -f \/s\/live\/vaulthost\/fullchain\.pem; then echo cert:yes; else echo cert:no; fi'\)/;

test('the certificate is asked for through a container: a certificate only a container can see is found, and its absence is reported', () => {
  const seen = runAcme(REAL_RUN);
  assert.equal(seen.status, 0, seen.output);
  assert.match(seen.output, /ok\S*\s+certbot obtained a certificate through a real HTTP-01 challenge/);
  assert.ok(seen.calls.some((call) => /^run --rm -v \S+_certs-conf:\/s:ro alpine sh -c if test -f \/s\/live\/vaulthost\/fullchain\.pem; then echo cert:yes; else echo cert:no; fi$/.test(call)), `no container read of the certificate:\n${seen.calls.join('\n')}`);

  const absent = runAcme(REAL_RUN, { STUB_CERT: '0' });
  assert.equal(absent.status, 1, absent.output);
  assert.match(absent.output, /FAIL\S*\s+no certificate was issued/);
  assert.deepEqual(absent.left, [], 'a failing run leaves nothing');
});

test('the certificate wait is bounded by ONE deadline, not a count of tries: a slow probe that keeps saying cert:no stops at the deadline', () => {
  const began = Date.now();
  const run = runAcme(REAL_RUN, { STUB_CERT: '0', STUB_PROBE_DELAY: '1', ACME_CERT_DEADLINE: '3' });
  const seconds = (Date.now() - began) / 1000;
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /FAIL\S*\s+no certificate was issued within 3 s \(the last try found no file\)/);
  assert.doesNotMatch(run.output, /after 150 tries/);
  assert.ok(probeTries(run) >= 2 && probeTries(run) <= 6, `${probeTries(run)} probes for a 3 s deadline and 1 s probes`);
  assert.ok(seconds < 25, `the wait ran for ${seconds} s`);
  assert.deepEqual(run.left, []);
});

test('the certificate wait says it is waiting on a time interval, with the seconds and the deadline; a run that finds the certificate at once says nothing', () => {
  const slow = runAcme(REAL_RUN, { STUB_CERT: '0', STUB_PROBE_DELAY: '0.5', ACME_CERT_DEADLINE: '4', ACME_CERT_NOTE_EVERY: '1' });
  const notes = [...slow.output.matchAll(/still waiting for the certificate: (\d+) s of 4 s/g)].map((hit) => Number(hit[1]));
  assert.ok(notes.length >= 2 && notes.length <= 4, slow.output);
  assert.deepEqual(notes, [...notes].sort((x, y) => x - y), 'the seconds only grow');
  assert.doesNotMatch(runAcme(REAL_RUN).output, /still waiting for the certificate/);
});

test('a probe that ignores TERM is killed after the bound plus five seconds, in both modes: the run fails with the timeout text and the probe is gone', () => {
  for (const env of [{}, { ACME_PROBE_WATCHDOG: '1' }] as Array<Record<string, string>>) {
    const began = Date.now();
    const run = runAcme(REAL_RUN, { ACME_PROBE_TIMEOUT: '2', STUB_PROBE_IGNORE_TERM: '1', ...env });
    const seconds = (Date.now() - began) / 1000;
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /the certificate check failed in docker, not for want of a file \(the probe timed out after 2 s/, `${JSON.stringify(env)}: ${run.output}`);
    assert.ok(seconds < 15, `${JSON.stringify(env)}: a probe that ignores TERM held the run for ${seconds} s`);
    assert.deepEqual(run.left, []);
    assert.ok(run.probePid !== undefined && !alive(run.probePid), `${JSON.stringify(env)}: the probe (pid ${run.probePid}) is still running`);
  }
});

test('a certificate check from the host, as the job\'s user, says "no certificate was issued" although the volume holds it: the plant the test above refuses', () => {
  assert.match(REAL_RUN, CERT_PROBE, 'run.sh does not read the certificate through a throwaway alpine container');
  const host = mutate(REAL_RUN, CERT_PROBE, `cert_probe_cmd=(sh -c 'if test -f "$PWD/certs/live/vaulthost/fullchain.pem"; then echo cert:yes; else echo cert:no; fi')`);
  const run = runAcme(host);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /FAIL\S*\s+no certificate was issued/);
});

test('run.sh never reads the certificate with sudo and never names a state folder of the checkout', () => {
  assert.deepEqual(scriptProblems(REAL_RUN).filter((problem) => /sudo|state folder|removes a folder/.test(problem)), []);
  assert.match(scriptProblems(`${REAL_RUN}\nsudo test -f x`).join('\n'), /uses sudo/);
  assert.match(scriptProblems(`${REAL_RUN}\nrm -rf state`).join('\n'), /state folder|removes a folder/);
});

// --- the traps (rule 5) -------------------------------------------------------------------------------------------------------------

test('the script sets `owned_trap cleanup` once, sources owned.sh, and has no trap of its own', () => {
  assert.deepEqual(scriptProblems(REAL_RUN), []);
});

test('the rule refuses a trap of its own, a missing `owned_trap cleanup` and a missing source', () => {
  assert.match(scriptProblems(mutate(REAL_RUN, /^owned_trap cleanup$/m, "trap cleanup EXIT\ntrap 'exit 130' INT")).join('\n'), /trap of its own/);
  assert.match(scriptProblems(mutate(REAL_RUN, /^owned_trap cleanup$/m, 'true')).join('\n'), /`owned_trap cleanup` exactly once/);
  assert.match(scriptProblems(mutate(REAL_RUN, /^source \.\.\/\.\.\/\.github\/scripts\/lib\/owned\.sh$/m, 'true')).join('\n'), /does not source owned\.sh/);
});

// --- a whole run under stubs: sc. 5 (the green and the failing run) and sc. 7 (an interrupt) ------------------------------------------

const TEARDOWN = /^compose -p (\S+) -f docker-compose\.acme-test\.yml down -v --remove-orphans$/;

/** The one thing every path must end with: the project taken down by name with its volumes, and the temp root empty. */
function assertCleaned(run: Run): void {
  const downs = composeCalls(run, 'down');
  assert.equal(downs.length, 1, `expected one teardown:\n${run.calls.join('\n')}\n${run.output}`);
  assert.match(downs[0], TEARDOWN);
  assert.equal(TEARDOWN.exec(downs[0])?.[1], run.folderProject);
  assert.deepEqual(run.left, [], 'the owned folder and its claim are gone');
}

test('sc. 5 a green run: the janitor is called first with --token creds and a 10-minute age, the project is taken down with -v, nothing is left', () => {
  const run = runAcme(REAL_RUN);
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /ALL ISSUANCE CHECKS PASSED/);
  assert.equal(run.calls[0], 'janitor --token creds MIN_AGE=10', run.calls.join('\n'));
  assertCleaned(run);
});

test('sc. 5 a failing run (the stack does not start): non-zero, the project is taken down with -v, nothing is left', () => {
  const run = runAcme(REAL_RUN, { STUB_FAIL: 'up' });
  assert.notEqual(run.status, 0, run.output);
  assertCleaned(run);
});

test('sc. 5 a failing run (no certificate is issued): non-zero, the project is taken down with -v, nothing is left', () => {
  const run = runAcme(REAL_RUN, { STUB_CERT: '0' });
  assert.equal(run.status, 1, run.output);
  assertCleaned(run);
});

test('the janitor call: 0 and 3 are fine and silent; 127 names the command that mounts the rules; any other code is one line; the run goes on', () => {
  for (const code of ['0', '3']) {
    const run = runAcme(REAL_RUN, { STUB_JANITOR_RC: code });
    assert.equal(run.status, 0, `rc ${code}: ${run.output}`);
    assert.doesNotMatch(run.output, /janitor/i, `rc ${code} is fine and says nothing`);
  }
  const unmounted = runAcme(REAL_RUN, { STUB_JANITOR_RC: '127' });
  assert.equal(unmounted.status, 0, unmounted.output);
  assert.match(unmounted.output, /janitor: exit code 127.*git submodule update --init \.claude\/rules\/shared/);
  const other = runAcme(REAL_RUN, { STUB_JANITOR_RC: '2' });
  assert.equal(other.status, 0, other.output);
  assert.equal(other.output.split('\n').filter((line) => /janitor/i.test(line)).length, 1, other.output);
  assert.match(other.output, /janitor: exit code 2\b/);
});

test('sc. 7 (a) an interrupt during the janitor call ends the run with 130, makes nothing and runs no teardown', () => {
  const run = runAcme(REAL_RUN, { STUB_JANITOR_SIGNAL: 'INT' });
  assert.equal(run.status, 130, run.output);
  assert.deepEqual(composeCalls(run, 'down'), []);
  assert.deepEqual(run.left, []);
  assert.doesNotMatch(run.output, /No such|invalid|unknown shorthand/);
});

test('sc. 7 (b) SIGINT during the first `compose up` ends the run with 130 and the project and the owned folder are gone', () => {
  const run = runAcme(REAL_RUN, { STUB_SIGNAL_ON: 'up', STUB_SIGNAL: 'INT' });
  assert.equal(run.status, 130, run.output);
  assertCleaned(run);
});

test('sc. 7 (c) SIGTERM during the first `compose up` ends the run with 143 and the project and the owned folder are gone', () => {
  const run = runAcme(REAL_RUN, { STUB_SIGNAL_ON: 'up', STUB_SIGNAL: 'TERM' });
  assert.equal(run.status, 143, run.output);
  assertCleaned(run);
});

// --- the shipped guard reads it ---------------------------------------------------------------------------------------------------

const guardPath = path.join(REPO, '.claude', 'rules', 'shared', 'tools', 'leftovers-check.mjs');

type Finding = { cls: string; line: number; text: string };
type GuardModule = { scanText: (file: string, text: string) => Finding[]; loadYaml: (repo: undefined) => unknown };

/** The mounted guard, or the reason it cannot be had (its `yaml` module lives in the mount's own `node_modules`). */
async function loadGuard(): Promise<GuardModule | string> {
  if (!fs.existsSync(guardPath)) return 'the shared rules are not mounted';
  const module = (await import(pathToFileURL(guardPath).href)) as GuardModule;
  try {
    module.loadYaml(undefined);
  } catch {
    return 'the mounted guard cannot load its yaml module (run npm ci in .claude/rules/shared)';
  }
  return module;
}

test('the shipped guard reads run.sh and the compose file with no finding', async (t) => {
  const guard = await loadGuard();
  if (typeof guard === 'string') return t.skip(guard);
  assert.deepEqual(guard.scanText(RUN, REAL_RUN), []);
  assert.deepEqual(guard.scanText(COMPOSE, REAL_COMPOSE), []);
});
