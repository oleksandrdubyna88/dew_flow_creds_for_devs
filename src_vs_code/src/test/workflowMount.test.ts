// Every CI job that runs the extension's unit tests, or a scenario harness, makes its scratch through `scripts/lib/leftovers.cjs`, which loads
// the mounted shared rules and refuses without them ("leftovers: the shared rules are not mounted"). A job that runs the tests and does not
// fetch the mount fails 44 files at once — which is how the SonarCloud job found out, a day after the other three had the step. The
// harnesses (E2.2) use the same wrapper, the server's backup harness included.
//
// E2.3 adds the C# test executables to the same rule. The leftovers tests copied into `CredsForDevs.ServiceDefaults.Tests` read the mounted
// owner vectors and the `## Tokens` table, so every job that RUNS one of the five executables fetches the mount first; and that one
// executable also starts `node` (the guard's script classifier, the Windows handoff), so a job that runs it sets up Node 22 first.
//
// "A check that only runs during a release has never run" (testing.md): the workflows are read here, in the ordinary suite, job by job.
// And a scan that matches nothing passes for ever, so it has a companion: it must find the jobs known to run the tests.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO } from './repoFiles';

const WORKFLOWS = path.join(REPO, '.github', 'workflows');

/** What runs the extension's unit tests: the npm script, the runner, or `node --test` over the compiled folder (SonarCloud, through c8). */
const RUNS_UNIT_TESTS = /\bnpm test\b|scripts\/run-tests\.mjs|\bnode --test\b/;
/** What runs a scenario harness: an `itest:` alias, the runner of all of them, a `*-itest.cjs` script, the bench. */
const RUNS_HARNESS = /\bitest:|run-itests\.mjs|-itest\.cjs|tree-perf-bench/;
/** What runs a C# test executable: the built runner of one of the five xUnit v3 projects (`dotnet test` has no host here). */
const RUNS_CSHARP_TESTS = /tests\/bin\/(?:Debug|Release)\//;
/** What runs the one C# executable that starts `node`: the shared service-defaults tests, where the copied leftovers tests compile. */
const RUNS_NODE_TESTS = /src_service_defaults\/tests\/bin\/(?:Debug|Release)\//;
/** What needs the mount: the unit tests, the harnesses and the C# executables. */
const NEEDS_MOUNT = new RegExp(`${RUNS_UNIT_TESTS.source}|${RUNS_HARNESS.source}|${RUNS_CSHARP_TESTS.source}`);
/** The repository's one way of setting up Node for CI: the pinned action, with the 22.x line (Node 20.19 or 22.12 and later load the wrapper's ES module). */
const SETS_UP_NODE_22 = /uses:\s*actions\/setup-node@\S+[^\n]*\n\s*with:\s*\n\s*node-version:\s*['"]?22\.x['"]?/;
/** The repository's one way of fetching the mount. */
const FETCHES_MOUNT = /git submodule update --init[^\n]*\.agents\/conventions/;

/** `[job, text]` of each job under `jobs:`: a job starts at a two-space key and runs to the next one. */
function jobsOf(lines: string[]): Array<[string, string]> {
  const found: Array<[string, string[]]> = [];
  for (const line of lines.slice(lines.indexOf('jobs:') + 1)) { // no `jobs:` means index -1 + 1 = 0: the whole file, which has no two-space keys that are jobs
    const key = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key !== null) found.push([key[1], []]);
    else found.at(-1)?.[1].push(line);
  }
  return found.map(([name, text]) => [name, text.join('\n')]);
}

/** `[file, job, text]` of every job of every workflow. */
function jobs(): Array<[string, string, string]> {
  return fs
    .readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith('.yml'))
    .flatMap((file) => jobsOf(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8').split(/\r?\n/)).map(([job, text]): [string, string, string] => [file, job, text]));
}

const withoutComments = (text: string): string => text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');

/** Does this job run the unit tests or a harness without fetching the mount BEFORE the first such command? */
function lacksMountFirst(text: string): boolean {
  const live = withoutComments(text);
  const tests = live.search(NEEDS_MOUNT);
  if (tests < 0) return false;
  const fetch = live.search(FETCHES_MOUNT);
  return fetch < 0 || fetch > tests; // a step's text is in step order, so a fetch below the first test command came too late
}

test('every job that runs the extension\'s unit tests, a scenario harness or a C# test executable fetches the shared-rules mount first', () => {
  const missing = jobs()
    .filter(([, , text]) => lacksMountFirst(text))
    .map(([file, job]) => `${file}:${job}`);

  assert.deepEqual(missing, [], 'these jobs run the unit tests, a harness or a C# executable with no mount, so the wrapper refuses and every test file fails');
});

/** Does this job run the service-defaults executable without setting up Node 22 BEFORE the first such command? */
function lacksNodeFirst(text: string): boolean {
  const live = withoutComments(text);
  const tests = live.search(RUNS_NODE_TESTS);
  if (tests < 0) return false;
  const setup = live.search(SETS_UP_NODE_22);
  return setup < 0 || setup > tests;
}

test('every job that runs the service-defaults test executable sets up Node 22 first [E2.3 S1.5 b]', () => {
  const missing = jobs()
    .filter(([, , text]) => lacksNodeFirst(text))
    .map(([file, job]) => `${file}:${job}`);

  assert.deepEqual(missing, [], 'these jobs run CredsForDevs.ServiceDefaults.Tests with no actions/setup-node 22.x before it, so the image\'s own Node decides');
});

test('the scan still finds the jobs known to run a C# test executable, so it cannot pass for matching nothing [E2.3 S1.5]', () => {
  const running = jobs().filter(([, , text]) => RUNS_CSHARP_TESTS.test(withoutComments(text))).map(([file, job]) => `${file}:${job}`);

  for (const known of ['ci-server.yml:build-test', 'sonarcloud.yml:sonar', 'ci-clients.yml:build-test', 'release.yml:cli-binaries', 'release.yml:mcp-binaries']) {
    assert.ok(running.includes(known), `${known} is not recognised as a job that runs a C# test executable (found: ${running.join(', ')})`);
  }
  const node = jobs().filter(([, , text]) => RUNS_NODE_TESTS.test(withoutComments(text))).map(([file, job]) => `${file}:${job}`);
  assert.ok(node.length >= 2, `fewer than two jobs are recognised as running the service-defaults executable (found: ${node.join(', ')})`);
});

test('a C# executable with no fetch before it is a job with no mount, and the fetch below it comes too late [E2.3 S1.5 a]', () => {
  const run = '      - run: ./src_cli/tests/bin/Release/net10.0/CredsCli.Tests';
  const fetch = '      - run: git submodule update --init --depth 1 .agents/conventions';

  assert.equal(lacksMountFirst(run), true, 'the executable with no fetch');
  assert.equal(lacksMountFirst([run, fetch].join('\n')), true, 'the fetch below the executable');
  assert.equal(lacksMountFirst([fetch, run].join('\n')), false, 'the companion: the fetch before the executable is the mount');
  assert.equal(lacksMountFirst('      - run: dotnet build src_cli/tests/CredsCli.Tests.csproj -c Release'), false, 'a build of a test project runs no test');
});

test('the service-defaults executable with no Node 22 before it is a job that lacks Node [E2.3 S1.5 b]', () => {
  const run = '      - run: ./src_service_defaults/tests/bin/Release/net10.0/CredsForDevs.ServiceDefaults.Tests';
  const node = ['      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0', '        with:', '          node-version: 22.x'].join('\n');
  const node20 = node.replace('22.x', '20.x');

  assert.equal(lacksNodeFirst(run), true, 'no setup at all');
  assert.equal(lacksNodeFirst([run, node].join('\n')), true, 'the setup below the executable');
  assert.equal(lacksNodeFirst([node20, run].join('\n')), true, 'another Node line is no pin');
  assert.equal(lacksNodeFirst([node, run].join('\n')), false, 'the companion: Node 22 before the executable');
  assert.equal(lacksNodeFirst('      - run: ./src_cli/tests/bin/Release/net10.0/CredsCli.Tests'), false, 'the other executables start no node');
});

test('the scan still finds the jobs known to run the unit tests, so it cannot pass for matching nothing', () => {
  const running = jobs().filter(([, , text]) => RUNS_UNIT_TESTS.test(withoutComments(text))).map(([file, job]) => `${file}:${job}`);

  for (const known of ['ci-extension.yml:build-test', 'ci-extension.yml:runner-windows', 'release.yml:extension', 'sonarcloud.yml:sonar']) {
    assert.ok(running.includes(known), `${known} is not recognised as a job that runs the unit tests (found: ${running.join(', ')})`);
  }
});

test('the scan still finds the jobs known to run a harness, so it cannot pass for matching nothing', () => {
  const running = jobs().filter(([, , text]) => RUNS_HARNESS.test(withoutComments(text))).map(([file, job]) => `${file}:${job}`);

  for (const known of ['ci-extension.yml:build-test', 'ci-server.yml:build-test']) {
    assert.ok(running.includes(known), `${known} is not recognised as a job that runs a harness (found: ${running.join(', ')})`);
  }
});

test('a harness with no fetch before it is a job with no mount: the harness has already refused by then [E2.2 S1.9]', () => {
  const noFetch = ['      - run: node src_minimalapi_server/scripts/backup-archive-itest.cjs'].join('\n');
  const fetchFirst = ['      - run: git submodule update --init --depth 1 .agents/conventions', '      - run: npm run itest:agent'].join('\n');

  assert.equal(lacksMountFirst(noFetch), true, 'the backup harness with no fetch');
  assert.equal(lacksMountFirst(fetchFirst), false, 'the companion: the fetch before the harness is the mount');
});

test('a fetch step BELOW the tests is no fetch: the tests have already refused by then [E2.1 code7 4]', () => {
  const job = ['      - run: npm test', '      - run: git submodule update --init --depth 1 .agents/conventions'].join('\n');
  const fetchFirst = ['      - run: git submodule update --init --depth 1 .agents/conventions', '      - run: npm test'].join('\n');

  assert.equal(lacksMountFirst(job), true, 'the fetch comes after npm test, so the job runs the tests with no mount');
  assert.equal(lacksMountFirst(fetchFirst), false, 'the companion: the fetch before the tests is the mount');
});

// --- E2.5 S2.4: where the guard-reading tests run, the mount's modules are installed and the flag makes a skip a failure --------------------
//
// `dockerSmokeLeftovers`, `acmeRunLeftovers` and `leftoversGuardFixtures` read the SHIPPED Node guard through `mountedGuard.ts`, and the guard reads
// workflows through `yaml`, which lives in the mount's own `node_modules`. A job that runs those tests and does not install them skips them, and
// a skipped test is green. So a job that runs the WHOLE unit suite installs the mount's modules BEFORE the step that runs it and sets
// `CREDS_GUARD_TESTS_REQUIRED: "1"` on that step (then `mountedGuard.ts` fails with the reason instead of skipping). `runner lifecycle · windows`
// names seven files, none of which reads the guard, so the rule does not name it (the brief's F5): it matches what a job RUNS, not the words `node --test`.

/** What runs the WHOLE unit suite: the npm script, the runner, or `node --test` over the whole compiled folder (SonarCloud, through c8). */
const RUNS_WHOLE_SUITE = /\bnpm test\b|scripts\/run-tests\.mjs|\bnode --test\b[^\n]*out\/test\/"?\*\.test\.js/;
/** The mount's own dependencies, installed without lifecycle scripts (SonarCloud githubactions:S6505). */
const INSTALLS_MOUNT_MODULES = /npm ci --ignore-scripts --prefix \S*\.agents\/conventions\b/;
/** The flag, on the step that runs the tests. */
const SETS_GUARD_FLAG = /CREDS_GUARD_TESTS_REQUIRED:\s*["']?1["']?/;

/** A job's live text split into steps: a step starts at a six-space `- `. */
function stepsOf(text: string): string[] {
  const steps: string[][] = [];
  for (const line of withoutComments(text).split('\n')) {
    if (/^ {6}- /.test(line)) steps.push([line]);
    else steps.at(-1)?.push(line);
  }
  return steps.map((step) => step.join('\n'));
}

/** Does this job run `runs` in a step that has the flag, with the mount's modules installed in a step BEFORE it (or earlier in the same step)? */
function lacksGuardInstallOrFlag(text: string, runs: RegExp): boolean {
  const steps = stepsOf(text);
  const at = steps.findIndex((step) => runs.test(step));
  if (at < 0) return false;
  const installedBefore = steps.slice(0, at).some((step) => INSTALLS_MOUNT_MODULES.test(step)) || INSTALLS_MOUNT_MODULES.test(steps[at].slice(0, steps[at].search(runs)));
  return !installedBefore || !SETS_GUARD_FLAG.test(steps[at]);
}

/** The base names of the compiled test files that read the guard: the `*.test.ts` of `src/test/` that import `./mountedGuard`. */
function guardReadingTests(): string[] {
  const folder = path.join(REPO, 'src_vs_code', 'src', 'test');
  return fs
    .readdirSync(folder)
    .filter((name) => name.endsWith('.test.ts'))
    .filter((name) => /from '\.\/mountedGuard'/.test(fs.readFileSync(path.join(folder, name), 'utf8')))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort();
}

/** The job's `node --test` NAMES one of these files. */
const namesGuardReader = (names: string[]): RegExp => new RegExp(`\\bnode --test\\b[^\\n]*\\b(?:${names.join('|')})\\.js`);

const jobIds = (found: Array<[string, string, string]>): string[] => found.map(([file, job]) => `${file}:${job}`).sort();

test('the jobs that run the whole unit suite are exactly the three that need the guard\'s modules, and the scan cannot pass for matching nothing [E2.5 S2.4]', () => {
  const running = jobIds(jobs().filter(([, , text]) => RUNS_WHOLE_SUITE.test(withoutComments(text))));

  assert.deepEqual(running, ['ci-extension.yml:build-test', 'release.yml:extension', 'sonarcloud.yml:sonar']);
});

test('every job that runs the whole unit suite installs the mount\'s modules before it and sets CREDS_GUARD_TESTS_REQUIRED on the step [E2.5 S2.4 a]', () => {
  const missing = jobIds(jobs().filter(([, , text]) => lacksGuardInstallOrFlag(text, RUNS_WHOLE_SUITE)));

  assert.deepEqual(missing, [], 'these jobs run the guard-reading tests without the modules or the flag, so the tests skip and a skip is green');
});

test('the guard-reading test files are the three, and no job names one of them in a `node --test` of its own today [E2.5 S2.4 b, F5]', () => {
  const readers = guardReadingTests();

  assert.deepEqual(readers, ['acmeRunLeftovers.test', 'dockerSmokeLeftovers.test', 'leftoversGuardFixtures.test']);
  assert.deepEqual(jobIds(jobs().filter(([, , text]) => namesGuardReader(readers).test(withoutComments(text)))), [], 'a job that names a reader needs the same install and flag; none does');
});

test('a job that names a guard-reading file in its `node --test` needs the install and the flag too [E2.5 S2.4 b]', () => {
  const job = (...steps: string[]): string => steps.join('\n');
  const runs = namesGuardReader(['dockerSmokeLeftovers.test']);
  const named = '      - run: node --test out/test/dockerSmokeLeftovers.test.js';
  const install = '      - run: npm ci --ignore-scripts --prefix .agents/conventions';
  const flagged = ['      - run: node --test out/test/dockerSmokeLeftovers.test.js', '        env:', '          CREDS_GUARD_TESTS_REQUIRED: "1"'].join('\n');

  assert.equal(lacksGuardInstallOrFlag(job(named), runs), true, 'no install, no flag');
  assert.equal(lacksGuardInstallOrFlag(job(install, named), runs), true, 'the install, no flag');
  assert.equal(lacksGuardInstallOrFlag(job(flagged), runs), true, 'the flag, no install');
  assert.equal(lacksGuardInstallOrFlag(job(flagged, install), runs), true, 'the install after the step comes too late');
  assert.equal(lacksGuardInstallOrFlag(job(install, flagged), runs), false, 'the companion: the install first, the flag on the step');
  assert.equal(lacksGuardInstallOrFlag(job('      - run: node --test out/test/leftoversRunner.test.js'), runs), false, 'a job that names no reader is not asked');
});
