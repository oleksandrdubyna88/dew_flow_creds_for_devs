// The pass/fail line of the bridged `psql` harness, shared by its three files: a check prints `ok`/`FAIL`, and a FAIL is counted.
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) {
      console.log(`       ${String(detail).split('\n').join('\n       ')}`);
    }
  }
}

/** How many checks have failed so far. */
const failureCount = () => failures;

module.exports = { check, failureCount };
