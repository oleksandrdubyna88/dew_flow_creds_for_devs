// The last step of a probe job of E1.7 (the spec `todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.7: a row is judged per recorded BUILD, and every leg of a pair must run on the build the row records):
// ONE line that names the build of every client the job's legs ran, by the version each client says, the libpq file a `psql` loads and the packages that carry the libraries. The harnesses of the job
// (PA1, PP1, PE1, PK1, PS1) each print their own line of the same name for their own clients; this one covers all of them at once, with the same names (`BRIDGED_*`) they were given.
//
//   node scripts/bridged-db-builds.cjs
const { discover, buildsRecord } = require('./lib/dbProbeClients.cjs');

buildsRecord(discover());
