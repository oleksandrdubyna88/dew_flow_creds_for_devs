// The last step of a probe job of E1.7 (the spec `todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.7: a row is judged per recorded BUILD, and every leg of a pair must run on the build the row records):
// the lines that name the image the job ran on and the build of every client that a leg OF THIS JOB ran, each by the version the client says AND its build tag (two clients can say one number: Oracle's two
// `mysql` 8.4.13), the libpq file a `psql` loads, the ODBC driver library an ODBC client loaded and the packages that carry the libraries. The harnesses of the job (PA1, PP1, PE1, PK1, PS1 and the
// `psql` legs of (r), (s), PD2, PD3 and PQ2) each print their own line of the same name for their own clients and add those clients to the file `BRIDGED_BUILDS_FILE` (the step that begins the job names it);
// this one reads the file, so it lists the clients the job's legs ran and no other. With no file it says so and lists every client the runner has.
//
//   node scripts/bridged-db-builds.cjs
const { discover, buildsRecord, ranClients } = require('./lib/dbProbeClients.cjs');

const ran = ranClients();
if (ran === undefined) {
  console.log('record (R1) no harness of this job wrote the clients its legs ran (BRIDGED_BUILDS_FILE is not named, or holds none): every client the runner has is listed instead, and not all of them ran a leg');
}
buildsRecord(ran ?? discover(), { register: false, inventory: ran === undefined });
