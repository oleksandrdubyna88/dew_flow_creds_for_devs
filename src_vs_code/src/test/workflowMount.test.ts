// Every CI job that runs the extension's unit tests, or a scenario harness, makes its scratch through `scripts/lib/leftovers.cjs`, which loads
// the mounted shared rules and refuses without them ("leftovers: the shared rules are not mounted"). A job that runs the tests and does not
// fetch the mount fails 44 files at once — which is how the SonarCloud job found out, a day after the other three had the step. The
// harnesses (E2.2) use the same wrapper, the server's backup harness included.
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
/** What needs the mount: the unit tests and the harnesses. */
const NEEDS_MOUNT = new RegExp(`${RUNS_UNIT_TESTS.source}|${RUNS_HARNESS.source}`);
/** The repository's one way of fetching the mount. */
const FETCHES_MOUNT = /git submodule update --init[^\n]*\.claude\/rules\/shared/;

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

test('every job that runs the extension\'s unit tests or a scenario harness fetches the shared-rules mount first', () => {
  const missing = jobs()
    .filter(([, , text]) => lacksMountFirst(text))
    .map(([file, job]) => `${file}:${job}`);

  assert.deepEqual(missing, [], 'these jobs run the unit tests or a harness with no mount, so the wrapper refuses and every test file fails');
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
  const fetchFirst = ['      - run: git submodule update --init --depth 1 .claude/rules/shared', '      - run: npm run itest:agent'].join('\n');

  assert.equal(lacksMountFirst(noFetch), true, 'the backup harness with no fetch');
  assert.equal(lacksMountFirst(fetchFirst), false, 'the companion: the fetch before the harness is the mount');
});

test('a fetch step BELOW the tests is no fetch: the tests have already refused by then [E2.1 code7 4]', () => {
  const job = ['      - run: npm test', '      - run: git submodule update --init --depth 1 .claude/rules/shared'].join('\n');
  const fetchFirst = ['      - run: git submodule update --init --depth 1 .claude/rules/shared', '      - run: npm test'].join('\n');

  assert.equal(lacksMountFirst(job), true, 'the fetch comes after npm test, so the job runs the tests with no mount');
  assert.equal(lacksMountFirst(fetchFirst), false, 'the companion: the fetch before the tests is the mount');
});
