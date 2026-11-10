#!/usr/bin/env bash
# The self-test of owned.sh, the claim-first bash helper (rule common/test-leftovers.md section 2). It runs on Linux, on macOS with
# /bin/bash (3.2) and on Git for Windows' bash, from ci-clients.yml, and by hand:
#
#   .github/scripts/lib/owned.test.sh
#
# One runner, three areas, each in its own bash with its own private root (owned.test.lib.sh is their harness):
#   owned.test.record.sh   the name, the claim, the owner record, the token
#   owned.test.exit.sh     the traps, the exit chain, the signals, the removal
#   owned.test.sweeps.sh   the kills, and the shipped janitor and the mounted Node sweep over what they leave
# Every case runs the helper in a REAL child bash (see owned.test.lib.sh). T_OWNED_SH names a changed copy of the helper (the by-hand REDs).
# Spec: todo/PLAN_test_leftovers_E2.4_S1_spec.md (section 6, T1 to T21).
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
status=0
for area in record exit sweeps; do
  echo "=== owned.test.$area.sh"
  "$BASH" "$here/owned.test.$area.sh" || status=1
done
if [ "$status" = 0 ]; then echo "owned.test.sh: all areas passed"; else echo "owned.test.sh: an area FAILED"; fi
exit "$status"
