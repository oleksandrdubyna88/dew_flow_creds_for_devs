#!/usr/bin/env bash
# The smoke script's own test, against a stand-in server — so the check that guards every release is itself
# checked on every pull request (`ci-clients.yml`), on the same three operating systems the release runs on.
#
#   .github/scripts/mcp-listen-smoke.test.sh
#
# Three servers, written here as bash scripts the smoke runs in place of `creds-mcp`:
#   - one that answers the session and ends at once after end-of-stream  → the smoke must PASS;
#   - one that answers and ends 10.5 s after end-of-stream               → the smoke must FAIL (the bound is 10 s;
#     a whole-second clock let this one through — E5 code round, finding 2);
#   - one that never answers tools/list                                   → the smoke must FAIL (the listen was
#     never open when the client left, so a pass would say nothing about defect A).
# And, with SMOKE_VERSION asked: a log naming that version must PASS; one naming `1.0.0` or a longer `0.10.10`
# must FAIL (research/PLAN_release_binaries_carry_their_version.md).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke="$here/mcp-listen-smoke.sh"
# The scratch folder is an owned folder (lib/owned.sh): claimed first, removed by the helper's exit trap on EVERY way
# the test ends — a failing command under set -e, an interrupt, a normal end. The test sets no trap of its own.
# shellcheck source=lib/owned.sh
source "$here/lib/owned.sh"
owned_dir work smoke-test || exit 1
fake="$work/fake-creds-mcp.sh"
failures=0

# The stand-in: reads the session from stdin, answers the fourth request (tools/list, id 1) unless told not to,
# reads on to end-of-stream, waits FAKE_DELAY seconds, writes the three lines the smoke greps for, exits 0.
cat > "$fake" <<'EOF'
#!/usr/bin/env bash
n=0
while IFS= read -r line; do
  n=$((n + 1))
  if [[ "$n" -eq 4 && "${FAKE_ANSWERS:-yes}" == yes ]]; then
    echo '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}'
  elif [[ "$n" -eq 4 && "${FAKE_ANSWERS:-yes}" == error ]]; then
    echo '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"\"tools\" unavailable","data":{"tools":[]}}}'
  fi
done
sleep "${FAKE_DELAY:-0}"
mkdir -p "$CREDS_LOG_DIR"
printf '%s\n' "started: serve, version ${FAKE_VERSION:-0}, pid 1, parent 2" 'exited: code 0, reason clientClosed, after 1 s' > "$CREDS_LOG_DIR/creds-mcp-fake.log"
# A later line that merely QUOTES a start line — the smoke must judge the first one, not any line.
[[ -n "${FAKE_LATER_LINE:-}" ]] && printf '%s\n' "$FAKE_LATER_LINE" >> "$CREDS_LOG_DIR/creds-mcp-fake.log"
exit 0
EOF
chmod +x "$fake"

# expect <name> <delay> <answers> <exit code the smoke must give> [SMOKE_VERSION the smoke asks for] [version the stand-in logs]
#        [text the output must hold — so a refusal for a DIFFERENT reason does not count as this case passing]
expect() {
  local name="$1" delay="$2" answers="$3" wanted="$4" asked="${5:-}" logged="${6:-0}" says="${7:-}"
  local code=0
  SMOKE_VERSION="$asked" FAKE_VERSION="$logged" FAKE_DELAY="$delay" FAKE_ANSWERS="$answers" bash "$smoke" "$fake" "$work" > "$work/run.log" 2>&1 || code=$?
  if [[ "$code" -eq "$wanted" ]] && { [[ -z "$says" ]] || grep -qF -- "$says" "$work/run.log"; }; then
    echo "ok   $name (the smoke exited $code)"
  else
    echo "FAIL $name — expected the smoke to exit $wanted, it exited $code; its output:"
    sed 's/^/     /' "$work/run.log"
    failures=$((failures + 1))
  fi
}

expect 'a server that answers and ends at once after end-of-stream passes' 0 yes 0
expect 'a server that ends 10.5 s after end-of-stream fails the 10 s bound' 10.5 yes 1
expect 'a server that never answers tools/list fails' 0 no 1
expect 'a server that answers tools/list with an ERROR that merely mentions tools fails' 0 error 1
expect 'a server whose log names the asked version passes' 0 yes 0 0.10.1 0.10.1 'listen smoke passed'
expect 'a server whose log says 1.0.0 (the unstamped build) fails the asked 0.10.1' 0 yes 1 0.10.1 1.0.0 'does not name version 0.10.1'
expect 'a server whose log says 0.10.10 fails the asked 0.10.1' 0 yes 1 0.10.1 0.10.10 'does not name version 0.10.1'
# The start line is judged, not any line: 1.0.0 at the start and the asked version only on a later line fails
# (code round 1, findings 1 and 2).
FAKE_LATER_LINE='note: started: serve, version 0.10.1, pid 3, parent 4' \
  expect 'a server whose START line says 1.0.0 fails even when a later line names 0.10.1' 0 yes 1 0.10.1 1.0.0 'does not name version 0.10.1'

# off_ci <name> <exit code the smoke must give> <text its output must hold> [smoke arguments...]
# The smoke as a person runs it: no log root and no RUNNER_TEMP, so it makes its own scratch in TMPDIR — a private
# root here — and that root must be empty when the smoke is gone, whether the smoke passed or failed (E2.4.S2, sc. 4).
off_ci_count=0
off_ci() {
  local name="$1" wanted="$2" says="$3" code=0 left
  shift 3
  off_ci_count=$((off_ci_count + 1))
  mkdir "$work/root-$off_ci_count"
  env -u RUNNER_TEMP -u SMOKE_VERSION TMPDIR="$work/root-$off_ci_count" bash "$smoke" "$@" > "$work/run.log" 2>&1 || code=$?
  left="$(ls -A "$work/root-$off_ci_count")"
  if [[ "$code" -eq "$wanted" ]] && grep -qF -- "$says" "$work/run.log" && [[ -z "$left" ]]; then
    echo "ok   $name (the smoke exited $code and left nothing)"
  else
    echo "FAIL $name — expected exit $wanted saying '$says' and an empty root; exit $code, left: [$left]; its output:"
    sed 's/^/     /' "$work/run.log"
    failures=$((failures + 1))
  fi
}

printf '#!/usr/bin/env bash\nexit 0\n' > "$work/not-executable.sh"
off_ci 'off CI: a binary that is not executable fails after the folder is made and leaves nothing' 1 'not an executable' "$work/not-executable.sh"
off_ci 'off CI: a passing run leaves nothing' 0 'listen smoke passed' "$fake"

if [[ "$failures" -eq 0 ]]; then
  echo "all smoke self-test checks passed"
else
  echo "$failures smoke self-test check(s) failed"
fi
exit "$failures"
