#!/usr/bin/env bash
# The release smoke of the VERSION a published binary reports: it must be exactly the version of its tag.
#
#   .github/scripts/version-smoke.sh mcp <creds-mcp binary> <X.Y.Z> [log root]
#   .github/scripts/version-smoke.sh cli <creds binary>     <X.Y.Z> [log root]
#
# Why it exists: until 2026-10-11 `release.yml` published both binaries without `-p:Version`, so every release
# of `creds-mcp` answered `--version` with `creds-mcp 1.0.0` and every `creds` log said `version 1.0.0` — the SDK
# default — while the extension's WSL install check compares exactly that answer with the release it installed
# (research/PLAN_release_binaries_carry_their_version.md). Nothing failed; every check that ran was green.
#
# What it asserts:
#   mcp — the FIRST line of `--version` equals `creds-mcp <X.Y.Z>`. Inside WSL a second line names the Windows
#         half the bridge would start; it is not judged here, because no release runner is WSL.
#   cli — `creds` has no `--version` verb; it says its version in the start line of a serving verb's log. So
#         `relay-pipe` runs with no agent announced (it ends at once with `noAgentAnnounced`), and its log's start
#         line must hold `started: relay-pipe, version <X.Y.Z>, ` — the trailing comma stops `0.4.1` from
#         matching `0.4.10`.
#
# Literal comparisons only (`[[ == ]]` on a whole line, `grep -F`): a regex would let `.` match any character. A
# trailing CR is stripped first, because .NET ends a line with CRLF on Windows. Every run of the binary is bounded
# by a guard (60 s, or SMOKE_GUARD_SECONDS) so a binary that never ends fails the leg instead of holding it for its
# half hour. Its own test is `version-smoke.test.sh`.
set -euo pipefail

usage='usage: version-smoke.sh <mcp|cli> <binary> <X.Y.Z> [log root]'
kind="${1:?$usage}"
binary="${2:?$usage}"
version="${3:?$usage}"
root="${4:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}"
seconds="${SMOKE_GUARD_SECONDS:-60}"

[[ -x "$binary" ]] || { echo "not an executable: $binary"; exit 1; }
# The binaries print `Assembly.GetName().Version.ToString(3)`, which can only ever be X.Y.Z: a prerelease suffix
# would be cut off, so asking for one would be a check that can never pass.
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "expected version must be X.Y.Z, got '$version'"; exit 1; }

if command -v timeout > /dev/null; then guard=(timeout "$seconds")
elif command -v gtimeout > /dev/null; then guard=(gtimeout "$seconds")
else guard=(perl -e 'alarm shift; exec @ARGV' "$seconds")
fi

# 124 is coreutils' timeout; 142 is 128 + SIGALRM, perl's alarm; 137 is a KILL after it.
ended_by_guard() { [[ "$1" -eq 124 || "$1" -eq 137 || "$1" -eq 142 ]]; }

case "$kind" in
  mcp)
    code=0
    out="$("${guard[@]}" "$binary" --version)" || code=$?
    if ended_by_guard "$code"; then echo "--version did not end within $seconds s"; exit 1; fi
    [[ "$code" -eq 0 ]] || { echo "--version exited $code; it printed:"; printf '%s\n' "$out"; exit 1; }
    first="${out%%$'\n'*}"
    first="${first%$'\r'}"
    if [[ "$first" != "creds-mcp $version" ]]; then
      echo "--version printed '$first', expected exactly 'creds-mcp $version'"
      exit 1
    fi
    echo "version smoke passed: $binary --version prints '$first'"
    ;;
  cli)
    dir="$(cd "$root" && (pwd -W 2> /dev/null || pwd))/creds-version-smoke-$$"
    mkdir -p "$dir"
    code=0
    CREDS_LOG_DIR="$dir" CREDS_ENDPOINT_DIR="$dir/no-endpoints" "${guard[@]}" "$binary" relay-pipe < /dev/null > "$dir/stdout" 2> "$dir/stderr" || code=$?
    if ended_by_guard "$code"; then echo "relay-pipe did not end within $seconds s"; exit 1; fi
    log="$(find "$dir" -name 'creds-relay-pipe-*.log' | head -1)"
    [[ -n "$log" ]] || { echo "relay-pipe (exit $code) wrote no log under $dir; stderr was:"; cat "$dir/stderr"; exit 1; }
    line="$(grep -m1 -F 'started: relay-pipe, ' "$log" | tr -d '\r' || true)"
    [[ -n "$line" ]] || { echo "the log has no start line:"; cat "$log"; exit 1; }
    if [[ "$line" != *"started: relay-pipe, version $version, "* ]]; then
      echo "the log's start line does not name version $version:"
      printf '  %s\n' "$line"
      exit 1
    fi
    echo "version smoke passed: $binary logs '$line'"
    ;;
  *)
    echo "$usage"
    exit 1
    ;;
esac
