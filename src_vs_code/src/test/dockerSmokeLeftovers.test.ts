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
// has no Docker. So the step bodies are RUN here, under the shell GitHub gives them (`bash -e {0}` for a step with no `shell:`,
// `bash --noprofile --norc -eo pipefail {0}` for `shell: bash`), against a stub `docker` that keeps a small world of named resources. Every rule is then shown to be able to fail: each has a planted fault (a mutated copy of the real text) that
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

/** The items before the first one `stop` accepts (all of them when none does). */
function upTo<T>(items: T[], stop: (item: T) => boolean): T[] {
  const end = items.findIndex(stop);
  return end < 0 ? items : items.slice(0, end);
}

/** The lines of each step: a step starts at a six-space dash; a comment line is not part of any step. */
function blocksOf(text: string): string[][] {
  const blocks: string[][] = [];
  for (const line of text.split(/\r?\n/).filter((each) => !/^\s*#/.test(each))) {
    if (/^ {6}- /.test(line)) blocks.push([line]);
    else blocks.at(-1)?.push(line);
  }
  return blocks;
}

/** The `run: |` body of a step's lines, dedented. */
function runBodyOf(lines: string[]): string {
  const start = lines.findIndex((line) => /^ {8}run:\s*\|\s*$/.test(line));
  if (start < 0) return '';
  return upTo(lines.slice(start + 1), (line) => line.trim() !== '' && !/^ {10}/.test(line)).map((line) => line.slice(10)).join('\n').trimEnd() + '\n';
}

/** The steps of the `image` job. */
function stepsOf(text: string): Step[] {
  return blocksOf(text).map((lines) => {
    const label = /^ {6}- (?:name|uses):\s*(.+?)\s*$/m.exec(lines.join('\n'));
    return { name: label?.[1] ?? '', text: lines.join('\n'), run: runBodyOf(lines) };
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
  const continued = upTo(lines.slice(start + 1), (line) => !/^ {10}/.test(line)).map((line) => line.trim());
  return [lines[start].replace(/^ {8}if:\s*[>|]?-?\s*/, ''), ...continued].join(' ').trim();
}

/** The one place a planted fault is made: it fails when the text to replace is not there exactly once, so a drifted workflow cannot hide behind it. */
function mutate(text: string, from: string | RegExp, to: string): string {
  const hits = typeof from === 'string' ? text.split(from).length - 1 : [...text.matchAll(new RegExp(from.source, from.flags.includes('g') ? from.flags : `${from.flags}g`))].length;
  assert.equal(hits, 1, `the planted fault needs exactly one place to change, found ${hits}: ${String(from)}`);
  return typeof from === 'string' ? text.replace(from, () => to) : text.replace(from, to);
}

/** Where a block of lines ends: at the next step or comment of the job's indent. */
function blockEnd(lines: string[], from: number): number {
  const end = lines.slice(from + 1).findIndex((line) => /^ {6}[-#]/.test(line));
  return end < 0 ? lines.length : from + 1 + end;
}

/** Where a step starts, counting the comment lines just above it. */
function blockStart(lines: string[], from: number): number {
  let first = from;
  while (/^ {6}#/.test(lines[first - 1] ?? '')) first -= 1;
  return first;
}

/** The line of a step's header: `- name: <key>`, or a `- uses: <key>…` step (a key that starts the action's name, as `docker/setup-buildx-action@`). */
function headerOf(lines: string[], key: string): number {
  const at = lines.findIndex((line) => line === `      - name: ${key}` || line.startsWith(`      - uses: ${key}`));
  assert.ok(at >= 0, `no step ${key}`);
  return at;
}

/** The text with the step `name` (and the comment lines just above it) cut out and put again right after the step `after`. */
function moveStepAfter(text: string, name: string, after: string): string {
  const lines = text.split('\n');
  const from = headerOf(lines, name);
  const first = blockStart(lines, from);
  const block = lines.slice(first, blockEnd(lines, from));
  const rest = [...lines.slice(0, first), ...lines.slice(blockEnd(lines, from))];
  const target = headerOf(rest, after);
  const stop = blockEnd(rest, target);
  return [...rest.slice(0, stop), ...block, ...rest.slice(stop)].join('\n');
}

/** The text with the step `name` cut out and put again as the very first step of the job (before checkout). */
function moveStepFirst(text: string, name: string): string {
  const lines = text.split('\n');
  const from = headerOf(lines, name);
  const first = blockStart(lines, from);
  const block = lines.slice(first, blockEnd(lines, from));
  const rest = [...lines.slice(0, first), ...lines.slice(blockEnd(lines, from))];
  const firstStep = rest.findIndex((line) => /^ {6}- /.test(line));
  return [...rest.slice(0, firstStep), ...block, ...rest.slice(firstStep)].join('\n');
}

// --- the rules: each a function of the workflow text that answers a problem or nothing, so a planted fault goes through the same check --

type Check = (text: string) => string | undefined;

const problemsOf = (checks: Check[], text: string): string[] => checks.map((check) => check(text)).filter((problem): problem is string => problem !== undefined);
const unless = (holds: boolean, problem: string): string | undefined => (holds ? undefined : problem);
/** A check of the step `name`: "no step" when it is missing, else what `check` says of it. */
const onStep = (name: string, check: (found: Step, text: string) => string | undefined): Check => (text) => {
  const found = step(text, name);
  return found === undefined ? `no step named "${name}"` : check(found, text);
};

const FIRST_COMMAND = '[ "$(id -u)" = 1001 ] || exit 1';
const firstCommand = (run: string): string | undefined => run.split('\n').find((line) => line.trim() !== '')?.trim();
const isRemoval = (line: string): boolean => /\bdocker (?:rm|volume rm)\b/.test(line);
const removalLines = (run: string): string[] => run.split('\n').filter(isRemoval);
/** The first of the four names the text does not mention in a line of `lines` (written with the id as `${SMOKE_ID}`), as `[key, name]`. */
const missingName = (mentions: (name: string) => boolean): [string, string] | undefined => Object.entries(names('${SMOKE_ID}')).find(([, name]) => !mentions(name));

/** Row E2.4-c: the naming step is after checkout, before Build, and its first command is the uid check. */
const NAMING_CHECKS: Check[] = [
  onStep(NAMING, (_found, text) => unless(indexOfStep(text, 'Build') > indexOfStep(text, NAMING), 'the naming step comes after Build (or there is no Build): an image is built before the uid is known')),
  onStep(NAMING, (_found, text) => unless(stepsOf(text).findIndex((candidate) => /actions\/checkout@/.test(candidate.text)) < indexOfStep(text, NAMING), 'the naming step does not come after checkout')),
  onStep(NAMING, (_found, text) => unless(indexOfStep(text, NAMING) < stepsOf(text).findIndex((candidate) => /docker\/setup-buildx-action@/.test(candidate.text)), 'the naming step does not come before docker/setup-buildx-action, which starts a builder container')),
  onStep(NAMING, (found) => unless(firstCommand(found.run) === FIRST_COMMAND, `the first command is ${JSON.stringify(firstCommand(found.run))}, not ${FIRST_COMMAND}`)),
];

/** The smoke steps' own names: every `--name "…"` and the last quoted name of every volume-create line, as the workflow spells them. */
function smokeNames(text: string): string[] {
  const smoke = [step(text, 'Smoke-test'), step(text, REFUSED)].map((found) => found?.run ?? '').join('\n');
  const containers = [...smoke.matchAll(/--name "([^"]+)"/g)].map((hit) => hit[1]);
  const volumes = [...smoke.matchAll(/volume create [^\n]*"([^"]+)"\s*$/gm)].map((hit) => hit[1]);
  return [...containers, ...volumes].sort();
}

/** The set of names the smoke makes is exactly the four names the remover and the check are written for. */
const NAME_SET_CHECKS: Check[] = [
  (text) => {
    const made = smokeNames(text);
    const wanted = Object.values(names('${SMOKE_ID}')).sort();
    return unless(JSON.stringify(made) === JSON.stringify(wanted), `the smoke makes ${JSON.stringify(made)}, the remover and the check are written for ${JSON.stringify(wanted)}`);
  },
];

/** Row E2.4-b, the text half: ONE remover, in its place, `shell: bash`, always, `|| true` on each of four unquoted removals. */
const REMOVER_CHECKS: Check[] = [
  (text) => {
    const count = stepsOf(text).filter((candidate) => isRemoval(candidate.run)).length;
    return unless(count === 1, `${count} steps remove a container or volume, expected exactly one`);
  },
  onStep(REMOVER, (found) => unless(keyOf(found, 'shell') === 'bash', 'the remover has no `shell: bash`')),
  onStep(REMOVER, (found) => unless(conditionOf(found) === 'always()', `the remover's if is "${conditionOf(found)}", not always()`)),
  onStep(REMOVER, (found) => unless(keyOf(found, 'continue-on-error') === 'true', 'the remover has no continue-on-error: true')),
  onStep(REMOVER, (_found, text) => unless(indexOfStep(text, REFUSED) < indexOfStep(text, REMOVER) && indexOfStep(text, REMOVER) < indexOfStep(text, LOGIN), 'the remover is not after the last step that reads the containers and before Log in')),
  onStep(REMOVER, (found) => unless(removalLines(found.run).length === 4, `the remover has ${removalLines(found.run).length} removal lines, expected 4`)),
  onStep(REMOVER, (found) => {
    const bad = removalLines(found.run).find((line) => !/ \|\| true$/.test(line));
    return unless(bad === undefined, `a removal without || true: ${bad}`);
  }),
  onStep(REMOVER, (found) => {
    const bad = removalLines(found.run).find((line) => /["']/.test(line));
    return unless(bad === undefined, `a removal with quotes (the guard does not read a quoted remover): ${bad}`);
  }),
  onStep(REMOVER, (found) => {
    const lines = removalLines(found.run);
    const missing = missingName((name) => lines.some((line) => line.includes(` ${name}`)));
    return unless(missing === undefined, `no removal of ${missing?.[0]}: ${missing?.[1]}`);
  }),
];

/** Row E2.4-k, the text half: the check follows the remover, always runs, can only turn the job red, and reads by filter, never by `inspect`. */
const CHECK_CHECKS: Check[] = [
  onStep(CHECK, (_found, text) => unless(indexOfStep(text, CHECK) === indexOfStep(text, REMOVER) + 1, 'the check is not the step right after the remover')),
  onStep(CHECK, (found) => unless(keyOf(found, 'shell') === 'bash', 'the check has no `shell: bash`')),
  onStep(CHECK, (found) => unless(conditionOf(found) === 'always()', `the check's if is "${conditionOf(found)}", not always()`)),
  onStep(CHECK, (found) => unless(keyOf(found, 'continue-on-error') === undefined, 'the check has continue-on-error: it could never fail the job')),
  onStep(CHECK, (found) => unless(!/\bdocker inspect\b/.test(found.run), 'the check uses `docker inspect`, which the guard reads as a reader after the remover')),
  onStep(CHECK, (found) => unless(removalLines(found.run).length === 0, 'the check removes something')),
  onStep(CHECK, (found) => {
    const missing = missingName((name) => found.run.includes(`name=^${name}$`));
    return unless(missing === undefined, `the check does not ask for ${missing?.[0]} by exact name: ^${missing?.[1]}$`);
  }),
];

/** Row 10, the text half: a failed smoke stays failed. Only the remover may continue on error; only the remover and the check may run past a failure. */
const VERDICT_CHECKS: Check[] = [
  (text) => {
    const offender = stepsOf(text).find((candidate) => candidate.name !== REMOVER && keyOf(candidate, 'continue-on-error') !== undefined);
    return unless(offender === undefined, `"${offender?.name}" has continue-on-error`);
  },
  (text) => {
    const offender = stepsOf(text).find((candidate) => candidate.name !== REMOVER && candidate.name !== CHECK && /\b(?:always|failure|cancelled)\(\)/.test(conditionOf(candidate)));
    return unless(offender === undefined, `"${offender?.name}" runs past a failure: if ${offender === undefined ? '' : conditionOf(offender)}`);
  },
  onStep('Publish', (found) => unless(conditionOf(found) !== '', 'Publish has no if: it would run on every dispatch')),
];

const namingProblems = (text: string): string[] => problemsOf(NAMING_CHECKS, text);
const removerProblems = (text: string): string[] => problemsOf(REMOVER_CHECKS, text);
const checkProblems = (text: string): string[] => problemsOf(CHECK_CHECKS, text);
const verdictProblems = (text: string): string[] => problemsOf(VERDICT_CHECKS, text);
const nameSetProblems = (text: string): string[] => problemsOf(NAME_SET_CHECKS, text);

/** The shell GitHub runs a step with: `bash -e` when it has no `shell:`, the long form for `shell: bash`. */
const shellArgsOf = (text: string, name: string): string[] => {
  const found = step(text, name);
  assert.ok(found !== undefined, `no step ${name}`);
  return keyOf(found, 'shell') === 'bash' ? ['--noprofile', '--norc', '-eo', 'pipefail'] : ['-e'];
};

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

  // before checkout: the rule that it follows checkout
  assert.match(namingProblems(moveStepFirst(REAL, NAMING)).join('\n'), /does not come after checkout/);
  // between setup-buildx and Build: buildx starts a builder container, so an id made after it is too late (D5: before any container)
  const afterBuildx = moveStepAfter(REAL, NAMING, 'docker/setup-buildx-action@');
  assert.match(namingProblems(afterBuildx).join('\n'), /before docker\/setup-buildx-action/);
  assert.doesNotMatch(namingProblems(afterBuildx).join('\n'), /after Build/, 'that plant is before Build: only the buildx rule may refuse it');
});

test('the harness runs each step the way GitHub does: bash -e for the naming step, the long form for `shell: bash`', () => {
  assert.deepEqual(shellArgsOf(REAL, NAMING), ['-e']);
  assert.deepEqual(shellArgsOf(REAL, REMOVER), ['--noprofile', '--norc', '-eo', 'pipefail']);
  assert.deepEqual(shellArgsOf(REAL, CHECK), ['--noprofile', '--norc', '-eo', 'pipefail']);
  // a pipeline whose first stage fails ends a pipefail shell and not a plain `bash -e`: the two shells are really different here
  const dir = ownedDir(scope, 'shells');
  const script = path.join(dir, 'pipe.sh');
  fs.writeFileSync(script, 'false | true\n');
  assert.equal(spawnSync('bash', [...shellArgsOf(REAL, NAMING), script]).status, 0);
  assert.equal(spawnSync('bash', [...shellArgsOf(REAL, REMOVER), script]).status, 1);
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
    // The naming step has no `shell:`, so GitHub runs it as `bash -e {0}`, without pipefail.
    const result = spawnSync('bash', [...shellArgsOf(REAL, NAMING), script], { env: { PATH: `${bin}:${process.env.PATH ?? ''}`, GITHUB_ENV: envFile }, encoding: 'utf8', timeout: 30000 });
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

// --- a command that fails inside a command substitution must fail the step (the rollout's entry 8.1) ----------------------------------

/** A folder with the given stubs (`name -> script body`) first on PATH, and one GITHUB_ENV file. */
function stubbed(stubs: Record<string, string>): { dir: string; bin: string; envFile: string } {
  const dir = ownedDir(scope, 'stubs');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const [name, body] of Object.entries(stubs)) fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  const envFile = path.join(dir, 'github-env');
  fs.writeFileSync(envFile, '');
  return { dir, bin, envFile };
}

const DOWN = 'echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" >&2\nexit 1';

/** Runs a step body as GitHub runs that step, against `stubs`; returns its status, output and what it wrote to GITHUB_ENV. */
function runWith(text: string, name: string, stubs: Record<string, string>, extraEnv: Record<string, string> = {}): { status: number | null; output: string; env: string } {
  const where = stubbed(stubs);
  const script = path.join(where.dir, 'step.sh');
  fs.writeFileSync(script, bodyOf(text, name));
  const result = spawnSync('bash', [...shellArgsOf(text, name), script], { env: { PATH: `${where.bin}:${process.env.PATH ?? ''}`, GITHUB_ENV: where.envFile, ...extraEnv }, encoding: 'utf8', timeout: 30000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}`, env: fs.readFileSync(where.envFile, 'utf8') };
}

test('entry 8.1: when docker itself fails (the daemon is down) the check step fails, it does not read an empty answer as "nothing left"', () => {
  const run = runWith(REAL, CHECK, { docker: DOWN }, { SMOKE_ID: 'abcd1234' });
  assert.notEqual(run.status, 0, `the check passed with no docker daemon:\n${run.output}`);
  assert.match(run.output, /Cannot connect to the Docker daemon/);
  // the plant is the old line: a failing command inside `[ -z "$(…)" ]` is an empty answer, and the old check is green
  const old = REAL.replace(/out=\$\((docker [^\n]*)\)\n {10}\[ -z "\$out" \]/g, '[ -z "$($1)" ]');
  assert.notEqual(old, REAL, 'the plant must change the four lines');
  assert.equal(runWith(old, CHECK, { docker: DOWN }, { SMOKE_ID: 'abcd1234' }).status, 0, 'the old shape of a check line is green while docker is down: the real check must differ');
});

test('entry 8.1: when openssl fails the naming step fails and writes no SMOKE_ID; an id that is not 8 hex digits is refused', () => {
  const id1001 = '[ "$1" = -u ] && { echo 1001; exit 0; }\nexec /usr/bin/id "$@"';
  const down = runWith(REAL, NAMING, { id: id1001, openssl: 'echo "openssl: broken" >&2\nexit 1' });
  assert.notEqual(down.status, 0, `the naming step passed with a failing openssl:\n${down.output}`);
  assert.doesNotMatch(down.env, /SMOKE_ID/, 'an empty id must never be written');
  for (const bad of ['', 'xyz', '1234567', '123456789', 'ABCD1234', 'abcd123g']) {
    const run = runWith(REAL, NAMING, { id: id1001, openssl: `echo "${bad}"` });
    assert.notEqual(run.status, 0, `the id "${bad}" was accepted:\n${run.output}`);
    assert.doesNotMatch(run.env, /SMOKE_ID/, `the id "${bad}" was written`);
  }
  const good = runWith(REAL, NAMING, { id: id1001, openssl: 'echo abcd1234' });
  assert.equal(good.status, 0, good.output);
  assert.match(good.env, /^SMOKE_ID=abcd1234$/m);
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

test('E2.4-b: the rule refuses a remover without continue-on-error, one before the last reader, and one after Log in', () => {
  assert.match(removerProblems(mutate(REAL, `        if: always()\n        continue-on-error: true\n        shell: bash\n`, `        if: always()\n        shell: bash\n`)).join('\n'), /no continue-on-error: true/);
  // before the last reader: the refused-start step (it reads the container's logs) now comes after the remover
  assert.match(removerProblems(moveStepAfter(REAL, REFUSED, REMOVER)).join('\n'), /not after the last step that reads the containers/);
  // after Log in: the remover would run only after the publish credentials were used
  assert.match(removerProblems(moveStepAfter(REAL, REMOVER, LOGIN)).join('\n'), /not after the last step that reads the containers and before Log in/);
});

test('E2.4-b: the rule refuses a remover without `shell: bash`, without always(), quoted, a second remover, or one before the last reader', () => {
  assert.match(removerProblems(mutate(REAL, `        if: always()\n        continue-on-error: true\n        shell: bash\n`, `        if: always()\n        continue-on-error: true\n`)).join('\n'), /no `shell: bash`/);
  assert.match(removerProblems(mutate(REAL, `        if: always()\n        continue-on-error: true\n`, `        continue-on-error: true\n`)).join('\n'), /not always\(\)/);
  assert.match(removerProblems(mutate(REAL, 'docker volume rm testsToDelete-u1001-creds-refused-data-${SMOKE_ID} || true', 'docker volume rm "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}" || true')).join('\n'), /quotes/);
  assert.match(removerProblems(mutate(REAL, /\n {10}docker volume rm testsToDelete-u1001-creds-refused-logs-\$\{SMOKE_ID\} \|\| true/, '')).join('\n'), /4 removal lines|no removal of logs/);
  assert.match(removerProblems(`${REAL.replace('      - name: Summary', `      - name: Again\n        run: |\n          docker rm -f x\n\n      - name: Summary`)}`).join('\n'), /2 steps remove/);
  assert.match(removerProblems(moveStepAfter(REAL, REFUSED, REMOVER)).join('\n'), /not after the last step that reads the containers/);
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
  for (const [key, stuck, kind] of [['cv', n.cv, 'c'], ['refused', n.refused, 'c'], ['refused-data', n.data, 'v'], ['refused-logs', n.logs, 'v']] as const) {
    const run = runSteps([bodyOf(REAL, REMOVER), bodyOf(REAL, CHECK)], { stuck: [stuck] });
    assert.equal(run.status, 1, `${key}: ${run.output}`);
    assert.deepEqual(run.left, [`${kind} ${stuck}`]);
    assert.match(run.output, new RegExp(`left after removal:.*\\b${key}\\b`), `${key}: the check did not name it:\n${run.output}`);
  }
});

test('E2.4-k: a remover that forgets one volume is caught by the check, not by luck', () => {
  const planted = mutate(REAL, /\n {10}docker volume rm testsToDelete-u1001-creds-refused-logs-\$\{SMOKE_ID\} \|\| true/, '');
  const run = runSteps([bodyOf(planted, REMOVER), bodyOf(planted, CHECK)]);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /left after removal:.*refused-logs/);
});

/** Siblings whose names OVERLAP this id's: one that continues it (`…-<id>5`) and one that holds it after a prefix (`x…-<id>`). */
function addOverlappingSiblings(where: { worldFile: string }): string[] {
  const own = names('abcd1234');
  const longer = names('abcd12345');
  const lines = [`c ${longer.cv}`, `c ${longer.refused}`, `v ${longer.data}`, `v ${longer.logs}`, `c x${own.cv}`, `v x${own.data}`];
  fs.appendFileSync(where.worldFile, lines.join('\n') + '\n');
  return lines;
}

function runBothInWorld(text: string, id: string): { status: number | null; output: string; left: string[]; siblings: string[] } {
  const where = world(id);
  const siblings = addOverlappingSiblings(where);
  const script = path.join(where.dir, 'both.sh');
  fs.writeFileSync(script, `${bodyOf(text, REMOVER)}${bodyOf(text, CHECK)}`);
  const result = spawnSync('bash', [...shellArgsOf(text, REMOVER), script], { env: { PATH: `${where.stubs}:${process.env.PATH ?? ''}`, STUB_WORLD: where.worldFile, STUB_CALLS: where.callsFile, SMOKE_ID: id }, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}`, left: fs.readFileSync(where.worldFile, 'utf8').split('\n').filter(Boolean), siblings };
}

test('E2.4-k: the exact-name filter does not match a sibling whose id continues this id or whose name holds it after a prefix', () => {
  const run = runBothInWorld(REAL, 'abcd1234');
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.left, run.siblings, 'only this id\'s four resources go; the six overlapping siblings stay, and the check does not count them');
});

test('E2.4-k: without the ^ and $ anchors the check calls the overlapping siblings its own and fails: the anchors are what the test above pins', () => {
  const noEnd = mutate(REAL, 'filter "name=^testsToDelete-u1001-creds-refused-data-${SMOKE_ID}$"', 'filter "name=^testsToDelete-u1001-creds-refused-data-${SMOKE_ID}"');
  const withoutEnd = runBothInWorld(noEnd, 'abcd1234');
  assert.equal(withoutEnd.status, 1, `no $: ${withoutEnd.output}`);
  assert.match(withoutEnd.output, /left after removal:.*refused-data/);
  const noStart = mutate(REAL, 'filter "name=^testsToDelete-u1001-creds-cv-${SMOKE_ID}$"', 'filter "name=testsToDelete-u1001-creds-cv-${SMOKE_ID}$"');
  const withoutStart = runBothInWorld(noStart, 'abcd1234');
  assert.equal(withoutStart.status, 1, `no ^: ${withoutStart.output}`);
  assert.match(withoutStart.output, /left after removal:.*\bcv\b/);
});

test('E2.4-k: the rule refuses a check with continue-on-error, without always(), with `docker inspect`, or a name left out', () => {
  assert.match(checkProblems(mutate(REAL, `      - name: ${CHECK}\n        if: always()\n`, `      - name: ${CHECK}\n        if: always()\n        continue-on-error: true\n`)).join('\n'), /continue-on-error/);
  assert.match(checkProblems(mutate(REAL, `      - name: ${CHECK}\n        if: always()\n`, `      - name: ${CHECK}\n`)).join('\n'), /not always\(\)/);
  assert.match(checkProblems(mutate(REAL, '[ -z "$left" ] || { echo "left after removal:$left"; exit 1; }', '[ -z "$left" ] || { docker inspect testsToDelete-u1001-creds-cv-${SMOKE_ID}; exit 1; }')).join('\n'), /docker inspect/);
  assert.match(checkProblems(mutate(REAL, /\n {10}out=\$\(docker volume ls -q --filter "name=\^testsToDelete-u1001-creds-refused-logs-\$\{SMOKE_ID\}\$"\)\n {10}\[ -z "\$out" \] \|\| left="\$left refused-logs"/, '')).join('\n'), /refused-logs/);
});

test('E2.4-k: the rule refuses a check that is not right after the remover, without `shell: bash`, or one that removes something', () => {
  assert.match(checkProblems(moveStepAfter(REAL, CHECK, LOGIN)).join('\n'), /not the step right after the remover/);
  assert.match(checkProblems(mutate(REAL, `      - name: ${CHECK}\n        if: always()\n        shell: bash\n`, `      - name: ${CHECK}\n        if: always()\n`)).join('\n'), /no `shell: bash`/);
  assert.match(checkProblems(mutate(REAL, '          [ -z "$left" ] || { echo "left after removal:$left"; exit 1; }', '          docker rm -f testsToDelete-u1001-creds-cv-${SMOKE_ID} || true\n          [ -z "$left" ] || { echo "left after removal:$left"; exit 1; }')).join('\n'), /the check removes something/);
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

test('the rule refuses a Publish with no if:, which would publish on every dispatch', () => {
  assert.match(verdictProblems(mutate(REAL, `      - name: Publish\n        if: github.event.workflow_run.head_branch == 'main' || github.ref == 'refs/heads/main'\n`, `      - name: Publish\n`)).join('\n'), /Publish has no if/);
});

test('the rule refuses continue-on-error on the check or on a smoke step, and an always() Publish', () => {
  assert.match(verdictProblems(mutate(REAL, `      - name: Smoke-test\n`, `      - name: Smoke-test\n        continue-on-error: true\n`)).join('\n'), /Smoke-test" has continue-on-error/);
  assert.match(verdictProblems(mutate(REAL, `      - name: Publish\n        if: github.event.workflow_run.head_branch == 'main' || github.ref == 'refs/heads/main'`, `      - name: Publish\n        if: always() && github.ref == 'refs/heads/main'`)).join('\n'), /Publish" runs past a failure/);
});

test('the names the smoke makes are exactly the four the remover and the check are written for', () => {
  assert.deepEqual(nameSetProblems(REAL), []);
  assert.deepEqual(smokeNames(REAL), Object.values(names('${SMOKE_ID}')).sort());
});

test('the rule refuses a volume renamed in its create and its -v only, a name added, and a name left out', () => {
  const renamed = mutate(mutate(REAL, 'docker volume create --label "testsToDelete.owner=$SMOKE_OWNER" "testsToDelete-u1001-creds-refused-logs-${SMOKE_ID}"', 'docker volume create --label "testsToDelete.owner=$SMOKE_OWNER" "testsToDelete-u1001-creds-refused-logz-${SMOKE_ID}"'), '-v "testsToDelete-u1001-creds-refused-logs-${SMOKE_ID}:/logs"', '-v "testsToDelete-u1001-creds-refused-logz-${SMOKE_ID}:/logs"');
  assert.match(nameSetProblems(renamed).join('\n'), /refused-logz/, 'the remover and the check still name refused-logs: the new name would be left by every run');
  assert.deepEqual(removerProblems(renamed), [], 'only the name-set rule can see this plant: the remover rule is satisfied');
  assert.deepEqual(checkProblems(renamed), [], 'and so is the check rule');
  const extra = mutate(REAL, '--name "testsToDelete-u1001-creds-cv-${SMOKE_ID}"', '--name "testsToDelete-u1001-creds-cv-${SMOKE_ID}" --network-alias "x"');
  assert.deepEqual(nameSetProblems(extra), [], 'a flag that is not a name changes nothing');
  const third = mutate(REAL, 'docker volume create --label "testsToDelete.owner=$SMOKE_OWNER" "testsToDelete-u1001-creds-refused-logs-${SMOKE_ID}"', 'docker volume create --label "testsToDelete.owner=$SMOKE_OWNER" "testsToDelete-u1001-creds-refused-logs-${SMOKE_ID}"\n          docker volume create --label "testsToDelete.owner=$SMOKE_OWNER" "testsToDelete-u1001-creds-refused-more-${SMOKE_ID}"');
  assert.match(nameSetProblems(third).join('\n'), /refused-more/);
  const missing = mutate(REAL, '\n          docker volume create --label "testsToDelete.owner=$SMOKE_OWNER" "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}"', '');
  assert.match(nameSetProblems(missing).join('\n'), /the smoke makes/);
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

  const sourceAlone = mutate(REAL, '-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data"', '-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}":/data');
  assert.deepEqual(classes(guard, sourceAlone), ['docker-run']);

  const unquoted = mutate(REAL, '-v "testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data"', '-v testsToDelete-u1001-creds-refused-data-${SMOKE_ID}:/data');
  assert.deepEqual(classes(guard, unquoted), [], 'a -v argument unquoted is allowed, as the real text quotes it WHOLE');

  const inspect = mutate(REAL, 'out=$(docker ps -a -q --filter "name=^testsToDelete-u1001-creds-cv-${SMOKE_ID}$")\n          [ -z "$out" ] || left="$left cv"', 'docker inspect testsToDelete-u1001-creds-cv-${SMOKE_ID} || left="$left cv"');
  assert.deepEqual(classes(guard, inspect), ['docker-run']);

  const reader = mutate(REAL, `      - name: ${CHECK}`, `      - name: Read the logs after the remover\n        run: docker logs testsToDelete-u1001-creds-cv-\${SMOKE_ID}\n\n      - name: ${CHECK}`);
  assert.deepEqual(classes(guard, reader), ['docker-run']);

  const shortName = mutate(REAL, '--name "testsToDelete-u1001-creds-cv-${SMOKE_ID}"', '--name cv');
  assert.ok(classes(guard, shortName).includes('docker-name'));
});
