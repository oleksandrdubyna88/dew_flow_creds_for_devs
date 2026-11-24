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

/**
 * Per job (the value of `BRIDGED_DB_JOB`): the served builds it must find. An entry is `{ client, platform, vendor, version, tag, driver?, legs }`: the row's client and platform, the build exactly as the
 * row records it, and the ids of its legs (`legsOf` in `dbAssertRules.cjs` for the vendor). The ODBC `sqlcmd` on Linux, turned on the record of run 45390171118: each image's job must find its build.
 */
const ODBC_LEGS = ['PS1-0', 'PS1-1', 'PS1-5', 'PE1-7', 'PS1-9-control', 'PS1-9', 'PS1-4-control', 'PS1-4'];
const odbcLinux = (version, driver) => ({ client: 'sqlcmd', platform: 'linux', vendor: 'odbc-sqlcmd', version, tag: 'Linux', driver, legs: ODBC_LEGS });
const SERVED_JOBS = {
  'bridged-ps1-linux-ubuntu-22.04': [odbcLinux('17.11.0001.1', '17.11.1.1')],
  'bridged-ps1-linux-ubuntu-24.04': [odbcLinux('18.7.0001.1', '18.7.1.1')],
  'bridged-ps1-linux-ubuntu-latest': [odbcLinux('18.7.0001.1', '18.7.1.1')],
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

/** `${{ matrix.os }}` of a job name in the workflow: any one image name of the job's matrix. */
const MATRIX_OS = '${{ matrix.os }}';

/** The pattern a `BRIDGED_DB_JOB: <name>` of a step stands for: the name itself, with `${{ matrix.os }}` for any one image name. */
const patternOf = (name) => new RegExp(`^${name.split(MATRIX_OS).map((part) => part.replaceAll(/\W/g, (char) => `\\${char}`)).join('[A-Za-z0-9._-]+')}$`);

/** The job names a step sets. */
const namesOfStep = (step) => [...step.matchAll(/BRIDGED_DB_JOB: ([^\r\n]+)/g)].map((found) => patternOf(found[1].trim()));

/** Whether the workflow has a step that sets `BRIDGED_DB_JOB: <job>` (a matrix name names each of its images) and runs `scripts/<harness>`. */
const hasJobStep = (workflow, job, harness) => stepsOf(workflow).some((step) => step.includes(`scripts/${harness}`) && namesOfStep(step).some((name) => name.test(job)));

/**
 * The problems of the lock, as sentences (DP21): every served build stands in at least one job's list; every entry of a list is a served build, with the legs of its vendor and no others; every job a list
 * names is a step of the workflow that sets that name and runs its family's harness. `legsOf(client, vendor)` is the ids of the legs of a build.
 */
function lockProblems({ rows, jobs, workflow, legsOf }) {
  const served = servedBuilds(rows);
  const listed = Object.entries(jobs).flatMap(([job, builds]) => builds.map((build) => ({ job, build })));
  const unlisted = served.filter((build) => !listed.some((entry) => keyOf(entry.build) === keyOf(build))).map((build) => `the served build ${wordsOf(build)} stands in no job's list`);
  const unserved = listed.filter((entry) => !served.some((build) => keyOf(build) === keyOf(entry.build))).map((entry) => `job ${entry.job} lists ${wordsOf(entry.build)}, which no served row records`);
  const legs = listed.flatMap(({ job, build }) => {
    const wanted = legsOf(build.client, build.vendor);
    const given = build.legs ?? [];
    const off = [...wanted.filter((leg) => !given.includes(leg)).map((leg) => `lacks the leg ${leg}`), ...given.filter((leg) => !wanted.includes(leg)).map((leg) => `names the leg ${leg}, which is no leg of its vendor`)];
    return off.map((what) => `job ${job}, ${wordsOf(build)}: the list ${what}`);
  });
  const steps = Object.entries(jobs).filter(([, builds]) => builds.length > 0).flatMap(([job, builds]) =>
    [...new Set(builds.map((build) => HARNESS_OF[build.client]))].filter((harness) => !hasJobStep(workflow, job, harness)).map((harness) => `job ${job} is no step of the workflow that sets BRIDGED_DB_JOB: ${job} and runs scripts/${harness}`));
  return [...unlisted, ...unserved, ...legs, ...steps];
}

module.exports = { SERVED_JOBS, HARNESS_OF, servedBuilds, keyOf, wordsOf, hasJobStep, lockProblems };
