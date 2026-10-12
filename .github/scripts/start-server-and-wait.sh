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
#   3. probes <health-url> every ${START_SERVER_POLL_SECONDS:-1} s (curl: connect 2 s, at most 5 s a probe):
#        - 2xx while the process is alive   → exit 0, the server left running, its pid and log printed and, when
#                                             $GITHUB_OUTPUT is set, written there as `pid=` and `log=`;
#        - the process EXITED                → exit 1 at once, with its exit code and its whole log;
#        - the deadline passed               → the process is stopped, exit 1 with one sentence and its whole log.
#   Exit 2 is a usage error.
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
probe() {
  curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "$url" 2> /dev/null || true
}

describe() { [[ "$1" == 000 || -z "$1" ]] && echo "no connection" || echo "$1"; }

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
echo "started pid $pid: $*"

began="$(now_ms)"
deadline=$((began + timeout_s * 1000))
last=000
while :; do
  last="$(probe)"
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
    exit 0
  fi
  if (($(now_ms) >= deadline)); then
    break
  fi
  sleep "$poll"
done

echo "the server did not answer 2xx on $url within $timeout_s s (last answer: $(describe "$last")); stopping pid $pid"
kill -TERM "$pid" 2> /dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  kill -0 "$pid" 2> /dev/null || break
  sleep 0.5
done
if kill -0 "$pid" 2> /dev/null; then
  kill -KILL "$pid" 2> /dev/null || true
fi
wait "$pid" 2> /dev/null || true
show_log
exit 1
