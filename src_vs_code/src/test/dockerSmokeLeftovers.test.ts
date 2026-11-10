// The image workflow's smoke starts two containers and two volumes on the hosted runner. Under the leftovers contract
// (common/test-leftovers.md §5, detail §7) that is a carve-out with four parts, and this file reads `docker.yml` for each of them:
//
//   1. the names spell the runner's uid as a LITERAL (`testsToDelete-u1001-creds-…-${SMOKE_ID}`), and the step that makes the id
//      checks that uid FIRST, before the image is built and before any container or volume exists (row E2.4-c);
//   2. ONE always-run remover takes the four names out, each removal ending `|| true` under `bash -eo pipefail`, so a removal that
//      fails does not stop the ones after it (row E2.4-b);
//   3. a check step after it lists the two containers and the two volumes by exact name and fails the job when one is left, and it
//      never decides the verdict the other way (row E2.4-k);
//   4. a failed smoke stays failed: nothing in the job turns a failure green, and `Publish` carries no status function of its own.
//
// "A check that only runs during a release has never run" (testing.md): `docker.yml` never runs for a pull request, and this machine
// has no Docker. So the step bodies are RUN here, under the shell GitHub gives them, against a stub `docker` that keeps a small world
// of named resources. Every rule is then shown to be able to fail: each has a planted fault (a mutated copy of the real text) that
// the same check must refuse. A check that cannot go red is not one.
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

const WORKFLOW = '.github/workflows/docker.yml';
const REAL = fs.readFileSync(path.join(REPO, WORKFLOW), 'utf8');

const NAMING = "Name the smoke's resources";
const REMOVER = "Remove the smoke's containers and volumes";
const CHECK = 'Check that nothing of the smoke is left';
const REFUSED = 'Smoke-test a refused start';
const LOGIN = 'Log in to ghcr.io';

/** The four names the smoke makes, for one id, as the workflow spells them. */
const names = (id: string) => ({
  cv: `testsToDelete-u1001-creds-cv-${id}`,
  refused: `testsToDelete-u1001-creds-refused-${id}`,
  data: `testsToDelete-u1001-creds-refused-data-${id}`,
  logs: `testsToDelete-u1001-creds-refused-logs-${id}`,
});

// --- reading the steps ---------------------------------------------------------------------------------------------------------

interface Step {
  /** `name:` of the step, else its `uses:`. */
  readonly name: string;
  /** The step's live lines (comments dropped), joined. */
  readonly text: string;
  /** The `run: |` body, dedented; empty when the step has none. */
  readonly run: string;
}

/** The steps of the `image` job: a step starts at a six-space dash; a comment line is not part of any step. */
function stepsOf(text: string): Step[] {
  const blocks: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    if (/^      - /.test(line)) blocks.push([line]);
    else blocks.at(-1)?.push(line);
  }
  return blocks.map((lines) => {
    const joined = lines.join('\n');
    const label = /^ {6}- (?:name|uses):\s*(.+?)\s*$/m.exec(joined);
    const start = lines.findIndex((line) => /^ {8}run:\s*\|\s*$/.test(line));
    const body: string[] = [];
    if (start >= 0) {
      for (const line of lines.slice(start + 1)) {
        if (line.trim() !== '' && !/^ {10}/.test(line)) break;
        body.push(line.slice(10));
      }
    }
    return { name: label?.[1] ?? '', text: joined, run: body.join('\n').trimEnd() + '\n' };
  });
}

const step = (text: string, name: string): Step | undefined => stepsOf(text).find((candidate) => candidate.name === name);
const indexOfStep = (text: string, name: string): number => stepsOf(text).findIndex((candidate) => candidate.name === name);
/** A step's own key: `shell:`, `continue-on-error:` and the like, at the step's indent. */
const keyOf = (candidate: Step, key: string): string | undefined => new RegExp(`^ {8}${key}:\\s*(.+?)\\s*$`, 'm').exec(candidate.text)?.[1];
/** A step's `if:`, which may continue over several lines (`>-`). */
function conditionOf(candidate: Step): string {
  const lines = candidate.text.split('\n');
  const start = lines.findIndex((line) => /^ {8}if:/.test(line));
  if (start < 0) return '';
  const continued: string[] = [lines[start].replace(/^ {8}if:\s*[>|]?-?\s*/, '')];
  for (const line of lines.slice(start + 1)) {
    if (!/^ {10}/.test(line)) break;
    continued.push(line.trim());
  }
  return continued.join(' ').trim();
}

/** The one place a planted fault is made: it fails when the text to replace is not there exactly once, so a drifted workflow cannot hide behind it. */
function mutate(text: string, from: string | RegExp, to: string): string {
  const hits = typeof from === 'string' ? text.split(from).length - 1 : [...text.matchAll(new RegExp(from.source, from.flags.includes('g') ? from.flags : `${from.flags}g`))].length;
  assert.equal(hits, 1, `the planted fault needs exactly one place to change, found ${hits}: ${String(from)}`);
  return typeof from === 'string' ? text.replace(from, () => to) : text.replace(from, to);
}

/** The text with the step `name` (and the comment lines just above it) cut out and put again right after the step `after`. */
function moveStepAfter(text: string, name: string, after: string): string {
  const lines = text.split('\n');
  const isStart = (line: string, label: string): boolean => line === `      - name: ${label}`;
  const from = lines.findIndex((line) => isStart(line, name));
  assert.ok(from >= 0, `no step ${name}`);
  let first = from;
  while (/^ {6}#/.test(lines[first - 1] ?? '')) first -= 1;
  let end = from + 1;
  while (end < lines.length && !/^ {6}[-#]/.test(lines[end])) end += 1;
  const block = lines.slice(first, end);
  const rest = [...lines.slice(0, first), ...lines.slice(end)];
  const target = rest.findIndex((line) => isStart(line, after));
  assert.ok(target >= 0, `no step ${after}`);
  let stop = target + 1;
  while (stop < rest.length && !/^ {6}[-#]/.test(rest[stop])) stop += 1;
  return [...rest.slice(0, stop), ...block, ...rest.slice(stop)].join('\n');
}

// --- the rules, each a function of the workflow text, so a planted fault can be handed to the same check --------------------------

const FIRST_COMMAND = '[ "$(id -u)" = 1001 ] || exit 1';

/** Row E2.4-c: the naming step is after checkout, before Build, and its first command is the uid check. */
function namingProblems(text: string): string[] {
  const problems: string[] = [];
  const naming = step(text, NAMING);
  if (naming === undefined) return [`no step named "${NAMING}"`];
  const at = indexOfStep(text, NAMING);
  const build = indexOfStep(text, 'Build');
  if (build < 0) problems.push('no Build step');
  else if (at > build) problems.push('the naming step comes after Build: an image is built before the uid is known');
  const checkout = stepsOf(text).findIndex((candidate) => /actions\/checkout@/.test(candidate.text));
  if (checkout < 0 || at < checkout) problems.push('the naming step does not come after checkout');
  const first = naming.run.split('\n').find((line) => line.trim() !== '');
  if (first?.trim() !== FIRST_COMMAND) problems.push(`the first command is ${JSON.stringify(first)}, not ${FIRST_COMMAND}`);
  return problems;
}

/** Row E2.4-b, the text half: ONE remover, in its place, `shell: bash`, always, `|| true` on each of four unquoted removals. */
function removerProblems(text: string): string[] {
  const problems: string[] = [];
  const steps = stepsOf(text);
  const removers = steps.filter((candidate) => /\bdocker (?:rm|volume rm)\b/.test(candidate.run));
  if (removers.length !== 1) return [`${removers.length} steps remove a container or volume, expected exactly one`];
  const remover = removers[0];
  if (remover.name !== REMOVER) problems.push(`the remover is named "${remover.name}"`);
  if (keyOf(remover, 'shell') !== 'bash') problems.push('the remover has no `shell: bash`');
  if (conditionOf(remover) !== 'always()') problems.push(`the remover's if is "${conditionOf(remover)}", not always()`);
  if (keyOf(remover, 'continue-on-error') !== 'true') problems.push('the remover has no continue-on-error: true');
  const at = steps.indexOf(remover);
  if (at < indexOfStep(text, REFUSED)) problems.push('the remover comes before the last step that reads the containers');
  if (at > indexOfStep(text, LOGIN)) problems.push('the remover comes after Log in');
  const lines = remover.run.split('\n').filter((line) => /\bdocker (?:rm|volume rm)\b/.test(line));
  if (lines.length !== 4) problems.push(`the remover has ${lines.length} removal lines, expected 4`);
  for (const line of lines) {
    if (!/ \|\| true$/.test(line)) problems.push(`a removal without || true: ${line}`);
    if (/["']/.test(line)) problems.push(`a removal with quotes (the guard does not read a quoted remover): ${line}`);
  }
  for (const [key, name] of Object.entries(names('${SMOKE_ID}'))) {
    if (!lines.some((line) => line.includes(` ${name} `) || line.includes(` ${name}`))) problems.push(`no removal of ${key}: ${name}`);
  }
  return problems;
}

/** Row E2.4-k, the text half: the check follows the remover, always runs, can only turn the job red, and reads by filter, never by `inspect`. */
function checkProblems(text: string): string[] {
  const problems: string[] = [];
  const steps = stepsOf(text);
  const check = step(text, CHECK);
  if (check === undefined) return [`no step named "${CHECK}"`];
  if (steps.indexOf(check) !== steps.findIndex((candidate) => candidate.name === REMOVER) + 1) problems.push('the check is not the step right after the remover');
  if (keyOf(check, 'shell') !== 'bash') problems.push('the check has no `shell: bash`');
  if (conditionOf(check) !== 'always()') problems.push(`the check's if is "${conditionOf(check)}", not always()`);
  if (keyOf(check, 'continue-on-error') !== undefined) problems.push('the check has continue-on-error: it could never fail the job');
  if (/\bdocker inspect\b/.test(check.run)) problems.push('the check uses `docker inspect`, which the guard reads as a reader after the remover');
  if (/\bdocker (?:rm|volume rm)\b/.test(check.run)) problems.push('the check removes something');
  for (const [key, name] of Object.entries(names('${SMOKE_ID}'))) {
    if (!check.run.includes(`name=^${name}$`)) problems.push(`the check does not ask for ${key} by exact name: ^${name}$`);
  }
  return problems;
}

/** Row 10, the text half: a failed smoke stays failed. Only the remover may continue on error; nothing after it may run past a failure but the two always-steps. */
function verdictProblems(text: string): string[] {
  const problems: string[] = [];
  for (const candidate of stepsOf(text)) {
    if (candidate.name === REMOVER) continue;
    if (keyOf(candidate, 'continue-on-error') !== undefined) problems.push(`"${candidate.name}" has continue-on-error`);
    const condition = conditionOf(candidate);
    if (candidate.name === CHECK) continue;
    if (/\b(?:always|failure|cancelled)\(\)/.test(condition)) problems.push(`"${candidate.name}" runs past a failure: if ${condition}`);
  }
  const publish = step(text, 'Publish');
  if (publish === undefined) problems.push('no Publish step');
  else if (conditionOf(publish) === '') problems.push('Publish has no if: it would run on every dispatch');
  return problems;
}

// --- what runs: a stub `docker` with a world of named resources ----------------------------------------------------------------

const STUB = `#!/bin/bash
# A stand-in for docker. The world is a file of "c <name>" and "v <name>" lines; every call is logged.
# STUB_STUCK is a list of names whose removal fails and which stay.
echo "$*" >> "$STUB_CALLS"
stuck() { case " \${STUB_STUCK:-} " in *" $1 "*) return 0;; esac; return 1; }
exists() { grep -qxF "$1 $2" "$STUB_WORLD"; }
filter() { # the value of --filter name=<regex> in the arguments, or empty
  local previous=""
  for argument in "$@"; do
    if [ "$previous" = "--filter" ] && [ "\${argument#name=}" != "$argument" ]; then printf '%s' "\${argument#name=}"; return; fi
    previous="$argument"
  done
}
labelled() { for argument in "$@"; do [ "$argument" = "label=testsToDelete.owner" ] && return 0; done; return 1; }
kind="$1"; shift
case "$kind" in
  rm)
    name="\${!#}"
    if stuck "$name"; then echo "Error response from daemon: cannot remove $name" >&2; exit 1; fi
    exists c "$name" || { echo "Error: No such container: $name" >&2; exit 1; }
    grep -vxF "c $name" "$STUB_WORLD" > "$STUB_WORLD.next"; mv "$STUB_WORLD.next" "$STUB_WORLD"; echo "$name" ;;
  ps)
    pattern="$(filter "$@")"
    if [ -n "$pattern" ]; then grep '^c ' "$STUB_WORLD" | cut -d' ' -f2 | grep -E -- "$pattern" | sed 's/^/id-/' || true
    elif labelled "$@"; then grep '^c ' "$STUB_WORLD" | cut -d' ' -f2 || true; fi ;;
  volume)
    verb="$1"; shift
    case "$verb" in
      rm)
        name="\${!#}"
        if stuck "$name"; then echo "Error response from daemon: remove $name: volume is in use" >&2; exit 1; fi
        exists v "$name" || { echo "Error: No such volume: $name" >&2; exit 1; }
        grep -vxF "v $name" "$STUB_WORLD" > "$STUB_WORLD.next"; mv "$STUB_WORLD.next" "$STUB_WORLD"; echo "$name" ;;
      ls)
        pattern="$(filter "$@")"
        if [ -n "$pattern" ]; then grep '^v ' "$STUB_WORLD" | cut -d' ' -f2 | grep -E -- "$pattern" || true
        elif labelled "$@"; then grep '^v ' "$STUB_WORLD" | cut -d' ' -f2 || true; fi ;;
      *) echo "stub docker: unexpected volume verb $verb" >&2; exit 99 ;;
    esac ;;
  *) echo "stub docker: unexpected command $kind" >&2; exit 99 ;;
esac
`;

interface Run {
  readonly status: number | null;
  readonly output: string;
  readonly calls: string[];
  /** The world after the run: what is still there. */
  readonly left: string[];
}

/** One scratch folder per call, owned and claimed, with the stub and a fresh world of the four resources for `id`. */
function world(id: string, extra: { prefix?: string } = {}): { dir: string; stubs: string; worldFile: string; callsFile: string } {
  const dir = ownedDir(scope, 'docker-smoke');
  const stubs = path.join(dir, 'bin');
  fs.mkdirSync(stubs);
  fs.writeFileSync(path.join(stubs, 'docker'), STUB, { mode: 0o755 });
  const worldFile = path.join(dir, 'world');
  const n = names(id);
  fs.writeFileSync(worldFile, [`c ${n.cv}`, `c ${n.refused}`, `v ${n.data}`, `v ${n.logs}`].join('\n') + '\n');
  const callsFile = path.join(dir, 'calls');
  fs.writeFileSync(callsFile, extra.prefix ?? '');
  return { dir, stubs, worldFile, callsFile };
}

/** Runs step bodies in order in ONE world, each as GitHub runs a `shell: bash` step: `bash --noprofile --norc -eo pipefail <file>`. */
function runSteps(bodies: string[], options: { id?: string | null; stuck?: string[] } = {}): Run {
  const id = options.id === undefined ? 'abcd1234' : options.id;
  const where = world(id ?? 'abcd1234');
  let status: number | null = 0;
  let output = '';
  bodies.forEach((body, index) => {
    const script = path.join(where.dir, `step-${index}.sh`);
    fs.writeFileSync(script, body);
    const env: NodeJS.ProcessEnv = { PATH: `${where.stubs}:${process.env.PATH ?? ''}`, STUB_WORLD: where.worldFile, STUB_CALLS: where.callsFile, STUB_STUCK: (options.stuck ?? []).join(' ') };
    if (id !== null) env.SMOKE_ID = id;
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], { env, encoding: 'utf8', timeout: 30000 });
    status = result.status;
    output += `${result.stdout}${result.stderr}`;
  });
  const split = (text: string): string[] => text.split('\n').filter((line) => line !== '');
  return { status, output, calls: split(fs.readFileSync(where.callsFile, 'utf8')), left: split(fs.readFileSync(where.worldFile, 'utf8')) };
}

const bodyOf = (text: string, name: string): string => {
  const found = step(text, name);
  assert.ok(found !== undefined && found.run.trim() !== '', `no step "${name}" with a run body`);
  return found.run;
};

/** The remover's four removal calls, as the stub logs them, for `id`. */
const removalCalls = (id: string): string[] => {
  const n = names(id);
  return [`rm -f -v ${n.cv}`, `rm -f -v ${n.refused}`, `volume rm ${n.data}`, `volume rm ${n.logs}`];
};

// --- the naming step, E2.4-c ---------------------------------------------------------------------------------------------------

test('E2.4-c: the naming step comes after checkout and before Build, and its first command is the uid check', () => {
  assert.deepEqual(namingProblems(REAL), []);
});

test('E2.4-c: the rule refuses a naming step without the check, with the check second, or after Build', () => {
  const withoutCheck = mutate(REAL, /\n {10}\[ "\$\(id -u\)" = 1001 \] \|\| exit 1/, '');
  assert.match(namingProblems(withoutCheck).join('\n'), /first command is/);
  const second = mutate(REAL, `          ${FIRST_COMMAND}\n          echo "runner uid: $(id -u)"`, `          echo "runner uid: $(id -u)"\n          ${FIRST_COMMAND}`);
  assert.match(namingProblems(second).join('\n'), /first command is/);

  const moved = moveStepAfter(REAL, NAMING, 'Build');
  assert.match(namingProblems(moved).join('\n'), /after Build/);
});

test('E2.4-c: on a runner whose uid is not 1001 the naming step ends at once with nothing made; on 1001 it writes the id and the owner record', () => {
  const dir = ownedDir(scope, 'naming');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const run = (uid: string) => {
    fs.writeFileSync(path.join(bin, 'id'), `#!/bin/bash\necho ${uid}\n`, { mode: 0o755 });
    const envFile = path.join(dir, `github-env-${uid}`);
    fs.writeFileSync(envFile, '');
    const script = path.join(dir, `naming-${uid}.sh`);
    fs.writeFileSync(script, bodyOf(REAL, NAMING));
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], { env: { PATH: `${bin}:${process.env.PATH ?? ''}`, GITHUB_ENV: envFile }, encoding: 'utf8', timeout: 30000 });
    return { status: result.status, output: `${result.stdout}${result.stderr}`, env: fs.readFileSync(envFile, 'utf8') };
  };

  const wrong = run('1000');
  assert.equal(wrong.status, 1, wrong.output);
  assert.equal(wrong.env, '', 'nothing may be written when the uid is wrong');
  assert.doesNotMatch(wrong.output, /runner uid/);

  const right = run('1001');
  assert.equal(right.status, 0, right.output);
  assert.match(right.output, /runner uid: 1001/);
  assert.match(right.env, /^SMOKE_ID=[0-9a-f]{8}$/m);
  assert.match(right.env, /^SMOKE_OWNER=u1001:[^@:\s]+@linux:\d+$/m);
});

// --- the remover, E2.4-b ----------------------------------------------------------------------------------------------------

test('E2.4-b: there is one remover, always-run, `shell: bash`, with `|| true` on each of the four unquoted removals', () => {
  assert.deepEqual(removerProblems(REAL), []);
});

test('E2.4-b: under bash -eo pipefail every removal runs although the first one fails', () => {
  const run = runSteps([bodyOf(REAL, REMOVER)], { stuck: [names('abcd1234').cv] });
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.calls.filter((call) => /^(?:rm|volume rm) /.test(call)), removalCalls('abcd1234'));
});

test('E2.4-b: a remover whose first removal has no `|| true` stops after one call and fails; the check refuses that plant', () => {
  const planted = mutate(REAL, 'docker rm -f -v testsToDelete-u1001-creds-cv-${SMOKE_ID} || true', 'docker rm -f -v testsToDelete-u1001-creds-cv-${SMOKE_ID}');
  const run = runSteps([bodyOf(planted, REMOVER)], { stuck: [names('abcd1234').cv] });
  assert.equal(run.status, 1);
  assert.equal(run.calls.filter((call) => /^(?:rm|volume rm) /.test(call)).length, 1);
  assert.match(removerProblems(planted).join('\n'), /without \|\| true/);
});

test('E2.4-b: the remover leaves nothing standing when nothing fails, and does nothing without an id', () => {
  const run = runSteps([bodyOf(REAL, REMOVER)]);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.left, []);

  const none = runSteps([bodyOf(REAL, REMOVER), bodyOf(REAL, CHECK)], { id: null });
  assert.equal(none.status, 0, none.output);
  assert.deepEqual(none.calls, [], 'with no smoke id nothing was named: no docker call may be made');
});

test('E2.4-b: the rule refuses a remover without `shell: bash`, without always(), quoted, a second remover, or one before the last reader', () => {
  assert.match(removerProblems(mutate(REAL, `        if: always()\n        continue-on-error: true\n        shell: bash\n`, `        if: always()\n        continue-on-error: true\n`)).join('\n'), /no `shell: bash`/);
  assert.match(removerProblems(mutate(REAL, `        if: always()\n        continue-on-error: true\n`, `        continue-on-error: true\n`)).join('\n'), /not always\(\)/);
  assert.match(removerProblems(mutate(REAL, 'docker volume rm testsToDelete-u1001-creds-refused-data-${SMOKE_ID} || true', 'docker volume rm "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}" || true')).join('\n'), /quotes/);
  assert.match(removerProblems(mutate(REAL, /\n {10}docker volume rm testsToDelete-u1001-creds-refused-logs-\$\{SMOKE_ID\} \|\| true/, '')).join('\n'), /4 removal lines|no removal of logs/);
  assert.match(removerProblems(`${REAL.replace('      - name: Summary', `      - name: Again\n        run: docker rm -f x\n      - name: Summary`)}`).join('\n'), /2 steps remove/);
});

// --- the check, E2.4-k -------------------------------------------------------------------------------------------------------

test('E2.4-k: the check follows the remover, always runs, has no continue-on-error, reads by filter, and names all four by exact name', () => {
  assert.deepEqual(checkProblems(REAL), []);
});

test('E2.4-k: with nothing left the check is green', () => {
  const run = runSteps([bodyOf(REAL, REMOVER), bodyOf(REAL, CHECK)]);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.left, []);
});

test('E2.4-k: with a container or a volume still there after the remover, the check fails and names it', () => {
  const n = names('abcd1234');
  for (const [key, stuck] of [['cv', n.cv], ['refused', n.refused], ['refused-data', n.data], ['refused-logs', n.logs]] as const) {
    const run = runSteps([bodyOf(REAL, REMOVER), bodyOf(REAL, CHECK)], { stuck: [stuck] });
    assert.equal(run.status, 1, `${key}: ${run.output}`);
    assert.deepEqual(run.left, [`${stuck.includes('refused-') ? 'v' : 'c'} ${stuck}`]);
    assert.match(run.output, new RegExp(`left after removal:.*\\b${key}\\b`), `${key}: the check did not name it:\n${run.output}`);
  }
});

test('E2.4-k: a remover that forgets one volume is caught by the check, not by luck', () => {
  const planted = mutate(REAL, /\n {10}docker volume rm testsToDelete-u1001-creds-refused-logs-\$\{SMOKE_ID\} \|\| true/, '');
  const run = runSteps([bodyOf(planted, REMOVER), bodyOf(planted, CHECK)]);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /left after removal:.*refused-logs/);
});

test('E2.4-k: the exact-name filter does not match a sibling job\'s resources, only this id\'s', () => {
  const where = world('abcd1234');
  fs.appendFileSync(where.worldFile, `c ${names('ffff0000').cv}\nv ${names('ffff0000').data}\n`);
  const script = path.join(where.dir, 'both.sh');
  fs.writeFileSync(script, `${bodyOf(REAL, REMOVER)}${bodyOf(REAL, CHECK)}`);
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], { env: { PATH: `${where.stubs}:${process.env.PATH ?? ''}`, STUB_WORLD: where.worldFile, STUB_CALLS: where.callsFile, SMOKE_ID: 'abcd1234' }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.deepEqual(fs.readFileSync(where.worldFile, 'utf8').split('\n').filter(Boolean), [`c ${names('ffff0000').cv}`, `v ${names('ffff0000').data}`]);
});

test('E2.4-k: the rule refuses a check with continue-on-error, without always(), with `docker inspect`, or a name left out', () => {
  assert.match(checkProblems(mutate(REAL, `      - name: ${CHECK}\n        if: always()\n`, `      - name: ${CHECK}\n        if: always()\n        continue-on-error: true\n`)).join('\n'), /continue-on-error/);
  assert.match(checkProblems(mutate(REAL, `      - name: ${CHECK}\n        if: always()\n`, `      - name: ${CHECK}\n`)).join('\n'), /not always\(\)/);
  assert.match(checkProblems(mutate(REAL, '[ -z "$left" ] || { echo "left after removal:$left"; exit 1; }', '[ -z "$left" ] || { docker inspect testsToDelete-u1001-creds-cv-${SMOKE_ID}; exit 1; }')).join('\n'), /docker inspect/);
  assert.match(checkProblems(mutate(REAL, /\n {10}\[ -z "\$\(docker volume ls -q --filter "name=\^testsToDelete-u1001-creds-refused-logs-\$\{SMOKE_ID\}\$"\)" \] \|\| left="\$left refused-logs"/, '')).join('\n'), /refused-logs/);
});

test('E2.4-k: a check that never fails is refused by the run above: its plant leaves a container and exits 0', () => {
  const planted = mutate(REAL, '[ -z "$left" ] || { echo "left after removal:$left"; exit 1; }', 'true');
  const run = runSteps([bodyOf(REAL, REMOVER), bodyOf(planted, CHECK)], { stuck: [names('abcd1234').cv] });
  assert.equal(run.status, 0);
  assert.deepEqual(run.left, [`c ${names('abcd1234').cv}`], 'the plant is green while a container is left: the real check must differ');
});

// --- the whole job: a failed smoke stays failed ------------------------------------------------------------------------------

test('a failed smoke stays failed: no step turns a failure green, only the remover continues on error, and Publish has no status function of its own', () => {
  assert.deepEqual(verdictProblems(REAL), []);
});

test('the rule refuses continue-on-error on the check or on a smoke step, and an always() Publish', () => {
  assert.match(verdictProblems(mutate(REAL, `      - name: Smoke-test\n`, `      - name: Smoke-test\n        continue-on-error: true\n`)).join('\n'), /Smoke-test" has continue-on-error/);
  assert.match(verdictProblems(mutate(REAL, `      - name: Publish\n        if: github.event.workflow_run.head_branch == 'main' || github.ref == 'refs/heads/main'`, `      - name: Publish\n        if: always() && github.ref == 'refs/heads/main'`)).join('\n'), /Publish" runs past a failure/);
});

test('every container and volume the smoke makes carries the owner label and an owner-form name; no short name is left; each `-v` is unquoted or quoted whole', () => {
  const live = stepsOf(REAL).map((candidate) => candidate.run).join('\n');
  const makers = live.split(/\n(?=docker )/).filter((command) => /^docker (?:run|volume create)\b/.test(command));
  assert.equal(makers.length, 4, 'two runs and two volume creates');
  for (const command of makers) assert.ok(command.includes('--label "testsToDelete.owner=$SMOKE_OWNER"'), `no owner label: ${command.split('\n')[0]}`);
  assert.doesNotMatch(live, /--name (?:cv|cv-refused)\b|\bcv-refused-(?:data|logs)\b(?!-\$)|\bdocker (?:logs|wait|cp|rm|exec) cv\b/);
  assert.doesNotMatch(live, /-v\s+"[^"]*"[^\s"\\]/, 'a -v source alone in quotes: the guard reads it as a run that may drop --rm');
  for (const name of Object.values(names('0123abcd'))) assert.ok(name.length <= 53, `${name} is ${name.length} characters`);
});

// --- the shipped guard reads it ----------------------------------------------------------------------------------------------

const guardPath = path.join(REPO, '.claude', 'rules', 'shared', 'tools', 'leftovers-check.mjs');

interface Guard {
  readonly scan: (text: string) => Array<{ cls: string; line: number; text: string }>;
}

/** The mounted guard's `scanText`, or the reason it cannot be had (its `yaml` module lives in the mount's own `node_modules`). */
async function loadGuard(): Promise<Guard | string> {
  if (!fs.existsSync(guardPath)) return 'the shared rules are not mounted';
  const module = (await import(pathToFileURL(guardPath).href)) as { scanText: (file: string, text: string) => ReturnType<Guard['scan']>; loadYaml: (repo: undefined) => unknown };
  try {
    module.loadYaml(undefined);
  } catch {
    return 'the mounted guard cannot load its yaml module (run npm ci in .claude/rules/shared)';
  }
  return { scan: (text) => module.scanText(WORKFLOW, text) };
}

const classes = (guard: Guard, text: string): string[] => guard.scan(text).map((entry) => entry.cls).sort();

test('the shipped guard reads docker.yml with no finding: the names are owner-form and the carve-out is complete', async (t) => {
  const guard = await loadGuard();
  if (typeof guard === 'string') return t.skip(guard);
  assert.deepEqual(guard.scan(REAL), []);
});

test('the shipped guard refuses each plant of the carve-out: quoted remover names, a `-v` source alone in quotes, a reader after the remover', async (t) => {
  const guard = await loadGuard();
  if (typeof guard === 'string') return t.skip(guard);

  const quoted = mutate(REAL, /(docker rm -f -v) (testsToDelete-u1001-creds-cv-\$\{SMOKE_ID\}) \|\| true/, '$1 "$2" || true').replace(/(docker rm -f -v) (testsToDelete-u1001-creds-refused-\$\{SMOKE_ID\}) \|\| true/, '$1 "$2" || true');
  assert.deepEqual(classes(guard, quoted), ['docker-run', 'docker-run']);

  const sourceAlone = mutate(REAL, '-v testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data', '-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}":/data');
  assert.deepEqual(classes(guard, sourceAlone), ['docker-run']);

  const whole = mutate(REAL, '-v testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data', '-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data"');
  assert.deepEqual(classes(guard, whole), [], 'a -v argument quoted WHOLE is allowed');

  const inspect = mutate(REAL, '[ -z "$(docker ps -a -q --filter "name=^testsToDelete-u1001-creds-cv-${SMOKE_ID}$")" ] || left="$left cv"', 'docker inspect testsToDelete-u1001-creds-cv-${SMOKE_ID} || left="$left cv"');
  assert.deepEqual(classes(guard, inspect), ['docker-run']);

  const reader = mutate(REAL, `      - name: ${CHECK}`, `      - name: Read the logs after the remover\n        run: docker logs testsToDelete-u1001-creds-cv-\${SMOKE_ID}\n\n      - name: ${CHECK}`);
  assert.deepEqual(classes(guard, reader), ['docker-run']);

  const shortName = mutate(REAL, '--name testsToDelete-u1001-creds-cv-${SMOKE_ID}', '--name cv');
  assert.ok(classes(guard, shortName).includes('docker-name'));
});
