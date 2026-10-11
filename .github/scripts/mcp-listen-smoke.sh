#!/usr/bin/env bash
# The release smoke of a published `creds-mcp`: it serves a real Claude Code session start — with its
# `subscriptions/listen` held open — and ends when the client closes stdin, writing its own log.
#
#   .github/scripts/mcp-listen-smoke.sh <creds-mcp binary> [log root]
#
# Why a script rather than a workflow step: so the same check runs on a developer's machine against a
# locally published binary before a tag, in `release.yml` on every runner that can execute what it built,
# and in `ci-clients.yml` on every pull request against the binary that job builds — on all three operating
# systems (PLAN_wsl_bridge_outlives_its_client.md, E5.S2 — replacing E1's 2025-06-18 handshake step). Its own
# test is `mcp-listen-smoke.test.sh`.
#
# What it asserts, in order:
#   1. the captured 2026-07-28 session (`src_mcp/tests/fixtures/claude-code-2.1.289-handshake-2026-07-28.jsonl`)
#      is answered — the `tools/list` RESULT (id 1, with its tools; an error reply does not count) arrives while
#      stdin is still open, so the listen is really open when the client leaves (defect A of the plan: the
#      server never exited then, on either build). A reply that never comes is a failure, not a closed stdin
#      and a pass;
#   2. the binary exits within 10 s of the client's end-of-stream, with code 0 — measured with a sub-second
#      clock (bash's SECONDS is whole seconds, which let a server ending 10.2 s after end-of-stream pass a 10 s
#      bound — E5 code round, finding 2);
#   3. its log carries the start line, a real parent pid and `exited: code 0, reason clientClosed` (E1's smoke).
#
# Portable across the release runners: coreutils `timeout` where it exists, `gtimeout` or perl's alarm on
# macOS (which ships neither), perl's Time::HiRes for the clock everywhere, `pwd -W` on Windows so .NET and
# `find` read the same path. The client is a subshell writing into the binary's stdin: it sends the four
# requests, waits for the reply to show up in the captured stdout, records what it saw and when, and exits —
# which is the end-of-stream.
set -euo pipefail

binary="${1:?usage: mcp-listen-smoke.sh <creds-mcp binary> [log root]}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fixture="$here/../../src_mcp/tests/fixtures/claude-code-2.1.289-handshake-2026-07-28.jsonl"
root="${2:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}"
dir="$(cd "$root" && (pwd -W 2>/dev/null || pwd))/creds-mcp-listen-smoke-$$"
mkdir -p "$dir"
out="$dir/stdout.jsonl"
stamp="$dir/stdin-closed"

test -x "$binary" || { echo "not an executable: $binary"; exit 1; }
test -f "$fixture" || { echo "no fixture at $fixture"; exit 1; }

now() { perl -MTime::HiRes=time -e 'printf "%.3f\n", time'; }
# One grep, one line: the id and the tools together — never two greps in a pipe, where a `-q` that closes early
# would end the first with SIGPIPE and `pipefail` would read a real answer as none.
answered() { grep -Eq '"id":1[,}].*"tools"|"tools".*"id":1[,}]' "$out" 2> /dev/null; }

# A hard limit on the whole run, whatever the platform offers.
if command -v timeout > /dev/null; then guard=(timeout 60)
elif command -v gtimeout > /dev/null; then guard=(gtimeout 60)
else guard=(perl -e 'alarm shift; exec @ARGV' 60)
fi

: > "$out"
code=0
(
  cat "$fixture"
  # Hold stdin open until the server has answered tools/list — so the listen is open at the hang-up. Without the
  # answer within 10 s, record that and close anyway, so the run stays bounded: the verdict is read below.
  verdict=timeout
  for _ in $(seq 1 100); do
    if answered; then
      verdict=answered
      break
    fi
    sleep 0.1
  done
  printf '%s %s\n' "$verdict" "$(now)" > "$stamp"
) | CREDS_LOG_DIR="$dir" "${guard[@]}" "$binary" > "$out" || code=$?
exited="$(now)"

read -r verdict closed < "$stamp" || { echo "the client left no record of its end-of-stream"; exit 1; }
if [ "$verdict" != answered ]; then
  echo "the tools/list reply did not arrive within 10 s of the session — stdin was closed without it; stdout was:"
  cat "$out"
  exit 1
fi
elapsed="$(perl -e 'printf "%.3f", $ARGV[1] - $ARGV[0]' "$closed" "$exited")"
echo "tools/list answered while stdin was open; the server exited with code $code ${elapsed} s after the client's end-of-stream"
test "$code" -eq 0 || { echo "expected exit code 0 after the client's end-of-stream"; exit 1; }
perl -e 'exit(($ARGV[0] <= 10) ? 0 : 1)' "$elapsed" || { echo "the server took more than 10 s (${elapsed} s) to exit after end-of-stream"; exit 1; }

log="$(find "$dir" -name 'creds-mcp-*.log' | head -1)"
test -n "$log" || { echo "no log file under $dir"; exit 1; }
cat "$log"
grep -q 'started: serve' "$log" || { echo "the log has no start line"; exit 1; }
grep -Eq 'parent [1-9][0-9]*' "$log" || { echo "the log names no parent pid"; exit 1; }
grep -q 'exited: code 0, reason clientClosed' "$log" || { echo "the log has no 'exited: code 0, reason clientClosed' line"; exit 1; }
echo "listen smoke passed: $binary"
