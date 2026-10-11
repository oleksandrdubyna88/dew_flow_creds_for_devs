#!/usr/bin/env bash
# The release smoke of a published `creds-mcp`: it serves a real Claude Code session start — with its
# `subscriptions/listen` held open — and ends when the client closes stdin, writing its own log.
#
#   .github/scripts/mcp-listen-smoke.sh <creds-mcp binary> [log root]
#
# Why a script rather than a workflow step: so the same check runs on a developer's machine against a
# locally published binary before a tag, and in `release.yml` on every runner that can execute what it
# built (PLAN_wsl_bridge_outlives_its_client.md, E5.S2 — replacing E1's 2025-06-18 handshake step).
#
# What it asserts, in order:
#   1. the captured 2026-07-28 session (`src_mcp/tests/fixtures/claude-code-2.1.289-handshake-2026-07-28.jsonl`)
#      is answered — the `tools/list` reply (id 1) arrives while stdin is still open, so the listen is really
#      open when the client leaves (defect A of the plan: the server never exited then, on either build);
#   2. the binary exits within 10 s of the client's end-of-stream, with code 0;
#   3. its log carries the start line, a real parent pid and `exited: code 0, reason clientClosed` (E1's smoke).
#
# Portable across the release runners: coreutils `timeout` where it exists, `gtimeout` or perl's alarm on
# macOS (which ships neither), `pwd -W` on Windows so .NET and `find` read the same path. The client is a
# subshell writing into the binary's stdin: it sends the four requests, waits for the reply to show up in
# the captured stdout, and exits — which is the end-of-stream.
set -euo pipefail

binary="${1:?usage: mcp-listen-smoke.sh <creds-mcp binary> [log root]}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fixture="$here/../../src_mcp/tests/fixtures/claude-code-2.1.289-handshake-2026-07-28.jsonl"
root="${2:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}"
dir="$(cd "$root" && (pwd -W 2>/dev/null || pwd))/creds-mcp-listen-smoke-$$"
mkdir -p "$dir"
out="$dir/stdout.jsonl"
stamp="$dir/stdin-closed-at"

test -x "$binary" || { echo "not an executable: $binary"; exit 1; }
test -f "$fixture" || { echo "no fixture at $fixture"; exit 1; }

# A hard limit on the whole run, whatever the platform offers.
if command -v timeout > /dev/null; then guard=(timeout 60)
elif command -v gtimeout > /dev/null; then guard=(gtimeout 60)
else guard=(perl -e 'alarm shift; exec @ARGV' 60)
fi

: > "$out"
code=0
(
  cat "$fixture"
  # Hold stdin open until the server has answered tools/list — then the listen is open at the hang-up.
  for _ in $(seq 1 100); do
    grep -q '"id":1[,}]' "$out" 2>/dev/null && break
    sleep 0.1
  done
  echo "$SECONDS" > "$stamp"
) | CREDS_LOG_DIR="$dir" "${guard[@]}" "$binary" > "$out" || code=$?
exited=$SECONDS

grep -q '"id":1[,}]' "$out" || { echo "the tools/list reply never arrived — stdout was:"; cat "$out"; exit 1; }
closed="$(cat "$stamp" 2>/dev/null || echo "$exited")"
echo "tools/list answered; stdin closed at ${closed}s, the server exited with code $code at ${exited}s"
test "$code" -eq 0 || { echo "expected exit code 0 after the client's end-of-stream"; exit 1; }
test $((exited - closed)) -le 10 || { echo "the server took more than 10 s to exit after end-of-stream"; exit 1; }

log="$(find "$dir" -name 'creds-mcp-*.log' | head -1)"
test -n "$log" || { echo "no log file under $dir"; exit 1; }
cat "$log"
grep -q 'started: serve' "$log"
grep -Eq 'parent [1-9][0-9]*' "$log"
grep -q 'exited: code 0, reason clientClosed' "$log"
echo "listen smoke passed: $binary"
