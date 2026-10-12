#!/usr/bin/env bash
# Start a server in the background and wait until its health URL answers 2xx — or fail, saying why.
#
#   .github/scripts/start-server-and-wait.sh <health-url> <timeout-seconds> -- <command> [args...]
#
# Why a script (research/PLAN_contract_suite_waits_for_a_built_server.md): the contract job's old inline wait,
# `for _ in $(seq 1 30); do curl … && break; sleep 2; done`, ended SILENTLY when nothing answered. On #240 a cold
# `dotnet run` build took 67.3 s, the loop gave up at 60 s without failing, and the suite reported 370
# `ECONNREFUSED` contract failures for a server that was merely still compiling. So: build in its own step, start
# the BUILT server here, and let only an answering server through. Its own test is `start-server-and-wait.test.sh`.
#
# What it does, in order:
#   1. refuses to start anything when <health-url> ALREADY answers — a server left from an earlier run would
#      answer the probe while the new one dies on EADDRINUSE, and the suite would test the wrong build;
#   2. starts <command> in the background, stdin from /dev/null, stdout+stderr into a log file
#      ($START_SERVER_LOG, else a new file under $RUNNER_TEMP / $TMPDIR / /tmp), and records its pid;
#   3. probes <health-url> every ${START_SERVER_POLL_SECONDS:-1} s (curl: connect 2 s, at most 5 s a probe, and
#      never past the deadline):
#        - 2xx while the process is alive   → exit 0, the server left running, its pid and log printed and, when
#                                             $GITHUB_OUTPUT is set, written there as `pid=` and `log=`;
#        - the process EXITED                → exit 1 at once, with its exit code and its whole log;
#        - the deadline passed               → the process is stopped, exit 1 with one sentence and its whole log;
#        - this script is interrupted (INT, TERM, HUP) while it waits → the process is stopped, exit 143.
#   Exit 2 is a usage error. The start line names the program only, never its arguments (they may carry a secret).
#   The longest it takes: the deadline, plus a 5 s grace when the server has to be stopped.
#
# THE COMMAND MUST BE THE SERVER ITSELF, not a launcher. The only pid this script ever signals is the one it
# started (`$!`), and it never kills anything by name. Under `dotnet run` that pid is the SDK host: a KILL — and
# any signal under Git Bash, where it becomes TerminateProcess — leaves the app holding the port. Run the built
# apphost (`bin/Release/net10.0/<App>`) instead; `dotnet <App>.dll` also runs the app in-process.
#
# Portable across ubuntu and Git Bash: bash, curl and GNU date (`%3N`, a millisecond clock — bash's whole-second
# SECONDS let the sibling smoke pass a bound it had missed).
set -euo pipefail

usage() {
  echo "usage: start-server-and-wait.sh <health-url> <timeout-seconds> -- <command> [args...]" >&2
  exit 2
}

[[ $# -ge 4 && "$3" == "--" ]] || usage
url="$1"
timeout_s="$2"
shift 3
[[ "$timeout_s" =~ ^[1-9][0-9]*$ ]] || usage
poll="${START_SERVER_POLL_SECONDS:-1}"

now_ms() { date +%s%3N; }

# The HTTP status of one probe; `000` (curl's word for no answer at all) when nothing answered. Never fails.
# $1 is the most a probe may take, in whole seconds: 5, or less so no probe runs past the deadline (code round 1 —
# a server that accepts and never answers used to hold the last probe up to 5 s after it).
probe() {
  local most="${1:-5}"
  curl -s -o /dev/null -w '%{http_code}' --connect-timeout "$((most < 2 ? most : 2))" --max-time "$most" "$url" \
    2> /dev/null || true
}

# Whole seconds left before the deadline, at least 1 and at most 5.
budget() {
  local left=$(((deadline - $(now_ms) + 999) / 1000))
  ((left < 1)) && left=1
  ((left > 5)) && left=5
  echo "$left"
}

# Stops ONLY the pid this script started: TERM, up to 5 s, then KILL.
stop_own() {
  kill -TERM "$pid" 2> /dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2> /dev/null || break
    sleep 0.5
  done
  if kill -0 "$pid" 2> /dev/null; then
    kill -KILL "$pid" 2> /dev/null || true
  fi
  wait "$pid" 2> /dev/null || true
}

# A wait cut short — a cancelled step, a Ctrl+C — must not leave the server behind with its pid recorded nowhere
# (code round 1). Invoked by the trap only, hence the disable (SC2329 in shellcheck 0.11, SC2317 before).
# shellcheck disable=SC2317,SC2329
interrupted() {
  echo "interrupted while waiting for $url; stopping pid $pid"
  stop_own
  show_log
  exit 143
}

describe() {
  local status="$1"
  if [[ "$status" == 000 || -z "$status" ]]; then echo "no connection"; else echo "$status"; fi
}

show_log() {
  echo "--- the server's log ($log) ---"
  cat "$log" 2> /dev/null || echo "(no log was written)"
  echo "--- end of the server's log ---"
}

before="$(probe)"
if [[ "$before" == 2?? ]]; then
  echo "something already answers $before on $url — refusing to start a second server there; stop the first one"
  exit 1
fi

log="${START_SERVER_LOG:-$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/start-server-XXXXXX.log")}"
: > "$log"
"$@" < /dev/null > "$log" 2>&1 &
pid=$!
trap interrupted INT TERM HUP
# The program only: an argument may carry a secret, and this line goes to a CI log (code round 1).
echo "started pid $pid: $1"

began="$(now_ms)"
deadline=$((began + timeout_s * 1000))
last=000
while :; do
  last="$(probe "$(budget)")"
  # Alive is checked AFTER the probe, so a 2xx from some other process in the moment ours died does not count.
  if ! kill -0 "$pid" 2> /dev/null; then
    code=0
    wait "$pid" || code=$?
    echo "the server exited with code $code before it answered $url (last answer: $(describe "$last"))"
    show_log
    exit 1
  fi
  if [[ "$last" == 2?? ]]; then
    seconds="$(( ($(now_ms) - began) / 1000 ))"
    echo "the server answered $last on $url after ${seconds} s; it runs as pid $pid, its log is $log"
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      printf 'pid=%s\nlog=%s\n' "$pid" "$log" >> "$GITHUB_OUTPUT"
    fi
    trap - INT TERM HUP
    exit 0
  fi
  if (($(now_ms) >= deadline)); then
    break
  fi
  sleep "$poll"
done

echo "the server did not answer 2xx on $url within $timeout_s s (last answer: $(describe "$last")); stopping pid $pid"
trap - INT TERM HUP
stop_own
show_log
exit 1
