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
#      ($START_SERVER_LOG, else `server.log` in a new owned folder of lib/owned.sh, in $TMPDIR or /tmp), and records
#      its pid. That folder is claimed and KEPT: the log is handed on (it is printed, and written to $GITHUB_OUTPUT), so
#      the script never removes it. The claim names this script's shell: the next sweep of the test-leftovers rule
#      collects folder and claim once that shell is gone and the folder is 10 minutes old — and it cannot tell that the
#      SERVER outlives the script, so a log read later than about 10 minutes after the server started may be gone. Give
#      START_SERVER_LOG (CI does) to keep the log where you say. Off CI under Git Bash (Windows) the folder needs Node and the
#      shared rules mount (`git submodule update --init .claude/rules/shared`): without them the script stops before it starts
#      anything — set START_SERVER_LOG there;
#   3. probes <health-url> every ${START_SERVER_POLL_SECONDS:-1} s (curl: connect 2 s, at most 5 s a probe, and
#      never past the deadline):
#        - 2xx while the process is alive   → exit 0, the server left running, its pid and log printed and, when
#                                             $GITHUB_OUTPUT is set, written there as `pid=` and `log=`;
#        - the process EXITED                → exit 1 at once, with its exit code and its whole log;
#        - the deadline passed               → the process is stopped, exit 1 with one sentence and its whole log;
#        - this script is interrupted (INT, TERM, HUP) while it waits → the process is stopped, exit 128 + the signal
#                                             number (143 for TERM, the cancel of a CI step).
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
# (code round 1). It is the clean-up function of owned_trap, so it runs at every exit — after owned.sh's signal trap has
# ended the script with 128 + the signal number — and stops the server only while $waiting is 1: every path that ends
# the wait itself (an answer, an exit, the deadline) sets it to 0 first. Invoked by the helper's exit trap only, hence
# the disable (SC2329 in shellcheck 0.11, SC2317 before). It runs in a subshell, so it acts on files and processes only.
# shellcheck disable=SC2317,SC2329
on_exit() {
  [[ "$waiting" == 1 ]] || return 0
  echo "interrupted while waiting for $url; stopping pid $pid"
  stop_own
  show_log
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

# The helper owns every trap of this script. The clean-up function is registered first, before the first step that can
# fail after a resource exists; a script of its own `trap` on EXIT, INT, TERM or HUP would replace the helper's.
waiting=0
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR
# shellcheck source=lib/owned.sh
source "$here/lib/owned.sh"
owned_trap on_exit || exit 1

before="$(probe)"
if [[ "$before" == 2?? ]]; then
  echo "something already answers $before on $url — refusing to start a second server there; stop the first one"
  exit 1
fi

if [[ -n "${START_SERVER_LOG:-}" ]]; then
  log="$START_SERVER_LOG"
else
  # The log is handed on, so its folder is claimed and made but never put in the clean-up list (OWNED_KEEP).
  logdir="" # set by owned_dir through printf -v, which ShellCheck cannot see (SC2154)
  OWNED_KEEP=1 owned_dir logdir server-log || exit 1
  log="$logdir/server.log"
fi
: > "$log"
"$@" < /dev/null > "$log" 2>&1 &
pid=$!
waiting=1
# The program only: an argument may carry a secret, and this line goes to a CI log (code round 1).
echo "started pid $pid: $1"

began="$(now_ms)"
deadline=$((began + timeout_s * 1000))
last=000
while :; do
  last="$(probe "$(budget)")"
  # Alive is checked AFTER the probe, so a 2xx from some other process in the moment ours died does not count.
  if ! kill -0 "$pid" 2> /dev/null; then
    waiting=0
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
    waiting=0
    exit 0
  fi
  if (($(now_ms) >= deadline)); then
    break
  fi
  sleep "$poll"
done

echo "the server did not answer 2xx on $url within $timeout_s s (last answer: $(describe "$last")); stopping pid $pid"
waiting=0
stop_own
show_log
exit 1
