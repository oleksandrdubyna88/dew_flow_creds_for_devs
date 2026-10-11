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
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke="$here/mcp-listen-smoke.sh"
work="$(mktemp -d)"
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
printf '%s\n' 'started: serve, version 0, pid 1, parent 2' 'exited: code 0, reason clientClosed, after 1 s' > "$CREDS_LOG_DIR/creds-mcp-fake.log"
EOF
chmod +x "$fake"

# expect <name> <delay> <answers> <exit code the smoke must give>
expect() {
  local name="$1" delay="$2" answers="$3" wanted="$4"
  local code=0
  FAKE_DELAY="$delay" FAKE_ANSWERS="$answers" bash "$smoke" "$fake" "$work" > "$work/run.log" 2>&1 || code=$?
  if [[ "$code" -eq "$wanted" ]]; then
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

rm -rf "$work"
if [[ "$failures" -eq 0 ]]; then
  echo "all smoke self-test checks passed"
else
  echo "$failures smoke self-test check(s) failed"
fi
exit "$failures"
