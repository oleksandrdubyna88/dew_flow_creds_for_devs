'use strict';
// The CI lock of the E1.7 spec (§S7.7 "The lock in CI", DP21): what each CI job must find, written down. A served row of the production table (`src/bridgedDbProfile.ts`) stands here, in the list of
// at least one job, with the legs that job must run on that build; a job FAILS when an expected client is not on its image, when its real version line (read through the real client check against the
// production table) names another build, or when one of the build's legs did not run, was skipped or printed `UNMEASURED` (PP1 excepted, as the parent says). A served build that no job lists, and an
// entry of this list that no row serves, fail the unit test DP21, so a row is turned only by a commit that records its legs here too.
//
//
// A job names itself with `BRIDGED_DB_JOB` in the step that runs the family's harness (`HARNESS_OF`); the harness reads this list under that name.

/** The harness each family of the table is asserted by (§S7.12): legs (u), (v) and (w). */
const HARNESS_OF = { psql: 'bridged-psql-assert-itest.cjs', mysql: 'bridged-mysql-assert-itest.cjs', sqlcmd: 'bridged-sqlcmd-itest.cjs' };

/** The harness of the `container` platform (change 11.1, S3): the ODBC `sqlcmd` of the shipped image, through the product's container road. */
const CONTAINER_HARNESS = 'bridged-container-sqlcmd-itest.cjs';

/** The harness that asserts one build: the container's own on that platform, else its family's. */
const harnessOf = (build) => (build.platform === 'container' ? CONTAINER_HARNESS : HARNESS_OF[build.client]);

/**
 * Per job (the value of `BRIDGED_DB_JOB`): the served builds it must find. An entry is `{ client, platform, vendor, version, tag, driver?, legs }`: the row's client and platform, the build exactly as the
 * row records it, and the ids of its legs (`legsOf` in `dbAssertRules.cjs` for the vendor). The ODBC `sqlcmd` on Linux, turned on the record of run 45390171118: each image's job must find its build.
 */
const CONTAINER_LEGS = ['CI-0', 'CI-1', 'PS1-1', 'PE1-7', 'PS1-8', 'PS1-9-control', 'PS1-9', 'PS1-4-control', 'PS1-4', 'CI-argv', 'CI-envfile'];
const ODBC_LEGS = ['PS1-0', 'PS1-1', 'PS1-5', 'PE1-7', 'PS1-9-control', 'PS1-9', 'PS1-4-control', 'PS1-4'];
const odbcLinux = (version, driver) => ({ client: 'sqlcmd', platform: 'linux', vendor: 'odbc-sqlcmd', version, tag: 'Linux', driver, legs: ODBC_LEGS });
const SERVED_JOBS = {
  'bridged-ps1-linux-ubuntu-22.04': [odbcLinux('17.11.0001.1', '17.11.1.1')],
  'bridged-ps1-linux-ubuntu-24.04': [odbcLinux('18.7.0001.1', '18.7.1.1')],
  'bridged-ps1-linux-ubuntu-latest': [odbcLinux('18.7.0001.1', '18.7.1.1')],
  // The ODBC `sqlcmd` in the image (change 11.1, S3), turned on the record of run 45893005996: the container legs of `containerSqlcmdRules`.
  'bridged-db-container': [{ client: 'sqlcmd', platform: 'container', vendor: 'odbc-sqlcmd', version: '18.7.0001.1', tag: 'Linux', driver: '18.7.1.1', legs: CONTAINER_LEGS }],
};

/** The builds a table serves, one entry each: client, platform, vendor, version, tag and (the ODBC client) driver. */
function servedBuilds(rows) {
  return rows.filter((row) => row.served === true).flatMap((row) =>
    (row.clients ?? []).flatMap((served) => served.builds.map((build) => ({ client: row.client, platform: row.platform, vendor: served.vendor, version: build.version, tag: build.tag, driver: build.driver }))));
}

/** One build as a key, and as words. */
const keyOf = (build) => [build.client, build.platform, build.vendor, build.version, build.tag, build.driver ?? ''].join('|');
const wordsOf = (build) => `${build.client} ${build.vendor} ${build.version} ${JSON.stringify(build.tag)} on ${build.platform}${build.driver === undefined ? '' : ` with the driver ${build.driver}`}`;

/** The steps of a workflow file: the text from one `- name:` line to the next. */
const stepsOf = (workflow) => workflow.split(/\n\s*- name:/).slice(1);

/** `${{ matrix.os }}` of a job name in the workflow: each image name of that job's own matrix, and no other. */
const MATRIX_OS = '${{ matrix.os }}';

/**
 * The jobs of a workflow file, `{ steps, images }`: the text under `jobs:` cut at each job's two-space key, its steps, and the images of its `os: [ ... ]` matrix (none when it has no such list). A text with
 * no `jobs:` (a test's fragment) is one job with no matrix.
 */
function jobsOf(workflow) {
  const start = workflow.search(/^jobs:[ \t]*$/m);
  const body = start === -1 ? `\n  fragment:\n${workflow}` : workflow.slice(start);
  return body.split(/\n {2}[A-Za-z0-9_-]+:[ \t]*(?=\r?\n)/).slice(1).map((text) => ({
    steps: stepsOf(text),
    images: (/\n\s+os: \[([^\]]*)\]/.exec(text)?.[1] ?? '').split(',').map((image) => image.trim()).filter((image) => image !== ''),
  }));
}

/** The job names a step sets, with `${{ matrix.os }}` put in for each image of the step's own job: a name for an image the matrix does not run is no name. */
const namesOfStep = (step, images) => [...step.matchAll(/BRIDGED_DB_JOB: ([^\r\n]+)/g)].flatMap((found) => {
  const name = found[1].trim();
  return name.includes(MATRIX_OS) ? images.map((image) => name.replaceAll(MATRIX_OS, image)) : [name];
});

/** Whether the workflow has a step that sets `BRIDGED_DB_JOB: <job>` (a matrix name names each image of its job's matrix) and runs `scripts/<harness>`. */
const hasJobStep = (workflow, job, harness) => jobsOf(workflow).some(({ steps, images }) => steps.some((step) => step.includes(`scripts/${harness}`) && namesOfStep(step, images).includes(job)));

/**
 * The problems of the lock, as sentences (DP21): every served build stands in at least one job's list; every entry of a list is a served build, with the legs of its vendor and no others; every job a list
 * names is a step of the workflow that sets that name and runs its family's harness. `legsOf(client, vendor, platform)` is the ids of the legs of a build on its platform.
 */
function lockProblems({ rows, jobs, workflow, legsOf }) {
  const served = servedBuilds(rows);
  const listed = Object.entries(jobs).flatMap(([job, builds]) => builds.map((build) => ({ job, build })));
  const unlisted = served.filter((build) => !listed.some((entry) => keyOf(entry.build) === keyOf(build))).map((build) => `the served build ${wordsOf(build)} stands in no job's list`);
  const unserved = listed.filter((entry) => !served.some((build) => keyOf(build) === keyOf(entry.build))).map((entry) => `job ${entry.job} lists ${wordsOf(entry.build)}, which no served row records`);
  const legs = listed.flatMap(({ job, build }) => {
    const wanted = legsOf(build.client, build.vendor, build.platform);
    const given = build.legs ?? [];
    const off = [...wanted.filter((leg) => !given.includes(leg)).map((leg) => `lacks the leg ${leg}`), ...given.filter((leg) => !wanted.includes(leg)).map((leg) => `names the leg ${leg}, which is no leg of its vendor`)];
    return off.map((what) => `job ${job}, ${wordsOf(build)}: the list ${what}`);
  });
  const steps = Object.entries(jobs).filter(([, builds]) => builds.length > 0).flatMap(([job, builds]) =>
    [...new Set(builds.map(harnessOf))].filter((harness) => !hasJobStep(workflow, job, harness)).map((harness) => `job ${job} is no step of the workflow that sets BRIDGED_DB_JOB: ${job} and runs scripts/${harness}`));
  return [...unlisted, ...unserved, ...legs, ...steps];
}

module.exports = { SERVED_JOBS, HARNESS_OF, CONTAINER_HARNESS, harnessOf, servedBuilds, keyOf, wordsOf, hasJobStep, lockProblems };
