#!/usr/bin/env bash
# Proves the certificate pipeline actually issues — end to end, without touching Let's Encrypt. A run
# that passes takes a few minutes (image pulls, then the issuance). A run that fails reports after about 10 to 11
# minutes (616 s of waits), each bounded by the clock: port 80 for 30 tries of 2 s (60 s); the certificate for
# ONE deadline of 300 s, plus at most one more probe (bounded at 30 s, and 5 s more before a probe that ignores
# TERM is killed) and the 2 s sleeps — 340 s at the worst; nginx's port 443 for 24 tries of 9 s (216 s); up to 4 s
# for each curl that hangs (every curl has --max-time). A line "still waiting for the certificate: N s of 300 s"
# is printed every 30 s. The FIRST docker failure (a non-zero code, a timeout, output that is not `cert:yes` or
# `cert:no`) ends the certificate wait at once with its code and words.
#
#   ./run.sh                                  # uses the published :edge image
#   VAULT_IMAGE=cred-vault-server:local ./run.sh
#
# What it asserts, in order:
#   1. With no certificate, port 443 is closed and port 80 answers 503 — not a
#      confusing "untrusted certificate", and not a deadlock against certbot.
#   2. The production certbot entrypoint obtains a certificate through a REAL
#      HTTP-01 challenge, served from the shared webroot by the nginx config
#      that ships.
#   3. nginx notices the new certificate on its own and opens 443 with it.
#   4. The API is then reachable over TLS, and the forwarded-proto guard is
#      satisfied by nginx rather than bypassed.
#
# Exit 0 only if all four hold.
#
# What it leaves behind: nothing (rule common/test-leftovers.md). The compose project is the name of
# an OWNED folder this run makes (`testsToDelete-<owner>-creds-acme-<id>`, lower-cased), every
# resource carries the owner label, and the state is in named volumes of that project, so the one
# exit clean-up (`down -v`, then the helper's removal of the folder) takes all of it. A run that is
# killed with signal 9 leaves its project, its volumes and the folder with a dead owner; the NEXT
# run's first act is the shared janitor, which collects them once they are 10 minutes old. On
# Windows (Git Bash) the pinned janitor only does a dry run unless JANITOR_WINDOWS_E2E_GREEN is set,
# so there it removes nothing: a killed run's project and folder wait for a person. An interrupt
# (INT, TERM, HUP) ends the run with 128 + n and the same clean-up runs once.
# An old deploy/acme-test/state/ from an earlier version of this script is no longer made, nor ignored by
# git, and can hold root-owned files. Remove it from this folder with:
#   docker run --rm -v "$PWD":/w alpine rm -rf /w/state
set -euo pipefail
cd "$(dirname "$0")"

# shellcheck source-path=SCRIPTDIR source=../../.github/scripts/lib/owned.sh
source ../../.github/scripts/lib/owned.sh
# The owner record goes into the compose file's labels. It is read in THIS shell (a `$( )` would
# lose the helper's cache) and before anything is made.
owned_owner >/dev/null || exit 1
export TESTS_TO_DELETE_OWNER="$OWNED_OWNER"
STATE=""
PROJECT=""
export VAULT_IMAGE="${VAULT_IMAGE:-ghcr.io/oleksandrdubyna88/cred-vault-server:edge}"
HTTP=http://127.0.0.1:18081
HTTPS=https://127.0.0.1:18444

FAILED=0
pass() { printf '  \033[32mok\033[0m    %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILED=1; }

# `$(curl … || echo 000)` is a trap: curl PRINTS the status and THEN exits
# non-zero on some platforms (23, "failed writing body", writing to /dev/null on
# Git Bash), so the fallback runs too and the status reads "503000". Capture the
# output, swallow the exit code, and default only when nothing was printed.
code_of() {
  local out=""
  out=$(curl -s -o /dev/null -w '%{http_code}' "$@" 2>/dev/null) || true
  printf '%s' "${out:-000}"
}

expect() { # expect <description> <expected> <actual>
  if [ "$3" = "$2" ]; then
    pass "$1"
  else
    fail "$1 — expected $2, got $3"
  fi
}

# The clean-up of this script, run by the helper's exit trap before the helper removes the owned
# folder. It skips what is not made yet: a failure before PROJECT is set must not run a teardown
# against an empty name. `down -v` removes the containers, the network and the named volumes; when it
# fails, the run says so (what is left waits for the next run's janitor). `owned_cleanup` removes the
# folder and its claim; the helper runs this function in a subshell and calls `owned_cleanup` again in
# the script's shell, which finds nothing left and says nothing.
# shellcheck disable=SC2317,SC2329
cleanup() {
  local out="" rc=0 volume ids id
  # A probe that is still running (an interrupt came during the certificate wait) is ended first: TERM, up to 10 s for it to
  # go (this runs in a subshell, so `wait` cannot be used: `kill -0` is polled), then KILL.
  if [ -n "${probe_pid:-}" ]; then
    kill "$probe_pid" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 "$probe_pid" 2>/dev/null || break; sleep 0.2; done
    if kill -0 "$probe_pid" 2>/dev/null; then kill -KILL "$probe_pid" 2>/dev/null || true; fi
  fi
  if [ -n "${PROJECT:-}" ]; then
    # The killed docker client passes TERM to the probe's `--rm` container, which is removed asynchronously, and until it is gone it
    # holds the certs-conf volume: `down -v` would fail with "volume is in use" and leave the volume. So anything that still holds a
    # volume of this project goes first, by the project's own volume names (this also covers a container whose client is gone).
    for volume in data logs certs-conf certs-www; do
      ids=$(docker ps -aq --filter "volume=${PROJECT}_${volume}" 2>/dev/null) || ids=""
      for id in $ids; do docker rm -f "$id" >/dev/null 2>&1 || true; done
    done
    out=$(docker compose -p "$PROJECT" -f docker-compose.acme-test.yml down -v --remove-orphans 2>&1) || rc=$?
    if [ "$rc" != 0 ]; then
      echo "clean-up: docker compose down -v ended with exit code $rc:"
      echo "$out"
    fi
  fi
  if [ -n "${STATE:-}" ]; then
    owned_cleanup
  fi
}
# The helper owns EXIT, INT, TERM and HUP: this script sets no trap of its own.
owned_trap cleanup

echo "image under test: ${VAULT_IMAGE}"

echo
echo "-- 0. what a killed run left -----------------------------------"
# The shared janitor collects the project, its volumes and the folder of a run that was killed more
# than 10 minutes ago, and never touches a live run's. It is never a reason to stop this run.
rc=0
JANITOR_MIN_AGE_MINUTES=10 bash ../../.claude/rules/shared/tools/janitor.sh --token creds || rc=$?
case "$rc" in
  0 | 3) ;;
  127) echo "janitor: exit code 127 — the shared rules are not mounted: git submodule update --init .claude/rules/shared (the run goes on)" ;;
  *) echo "janitor: exit code $rc (the run goes on)" ;;
esac

# The owned folder is the identity of this run: its lower-cased name is the compose project, and
# nothing else is.
owned_dir STATE acme || exit 1
PROJECT="$(printf '%s' "${STATE##*/}" | tr '[:upper:]' '[:lower:]')"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.acme-test.yml)
echo "owned folder: ${STATE}"
echo "compose project: ${PROJECT}"

# `create` makes the project's network and its four named volumes, labelled, before anything starts.
# The app runs unprivileged (uid 10001) and a fresh volume belongs to root, so its two folders are
# handed over now, before the first `up`.
"${COMPOSE[@]}" create >/dev/null
docker run --rm -v "${PROJECT}_data:/d" -v "${PROJECT}_logs:/l" alpine chown -R 10001:10001 /d /l >/dev/null

echo
echo "-- 1. before issuance ------------------------------------------"
# Everything except certbot, so the pre-issuance state can be observed at all.
"${COMPOSE[@]}" up -d pebble vault nginx >/dev/null 2>&1
code=000
for _ in $(seq 1 30); do
  code=$(code_of --max-time 4 "${HTTP}/api/vault")
  [ "$code" != "000" ] && break
  sleep 2
done
expect "port 80 answers 503 while TLS is not ready" 503 "$code"

if curl -sk --max-time 4 -o /dev/null "${HTTPS}/api/health" 2>/dev/null; then
  fail "port 443 answered before any certificate existed"
else
  pass "port 443 is closed until a certificate exists"
fi

expect "the ACME challenge path is served (404 = route works, file absent)" \
       404 "$(code_of --max-time 4 "${HTTP}/.well-known/acme-challenge/probe")"

echo
echo "-- 2. issuance -------------------------------------------------"
"${COMPOSE[@]}" up -d certbot >/dev/null 2>&1
# certbot's live folder is `drwx------ root`: the job's user cannot see into it from the host (a host
# `[ -f ]` said "no certificate" while certbot had one). A one-shot container reads the volume as root and
# PRINTS what it found, `cert:yes` or `cert:no`, exiting 0 either way: an exit code alone cannot tell "no file
# yet" from a docker error (`docker run` itself exits 1, 125, 126 or 127 on its own failures). Only that exact
# marker on stdout is an answer; a non-zero code, a timeout, empty or other output is a docker failure.
cert_probe_cmd=(docker run --rm -v "${PROJECT}_certs-conf:/s:ro" alpine sh -c 'if test -f /s/live/vaulthost/fullchain.pem; then echo cert:yes; else echo cert:no; fi')
# Each probe is bounded: a stalled image pull or daemon must not hold the wait, and a probe that ignores TERM is killed
# 5 s later (`timeout -k 5`, or the same in the portable bound). The whole wait has ONE deadline, read from the clock.
# Test seams: ACME_PROBE_TIMEOUT (seconds, 30), ACME_PROBE_WATCHDOG (use the portable bound even where `timeout` exists),
# ACME_CERT_DEADLINE (seconds, 300) and ACME_CERT_NOTE_EVERY (seconds between progress lines, 30).
probe_timeout="${ACME_PROBE_TIMEOUT:-30}"
cert_deadline="${ACME_CERT_DEADLINE:-300}"
cert_note_every="${ACME_CERT_NOTE_EVERY:-30}"
probe_pid=""
probe_rc=0
probe_out=""
probe_err=""
cert_state="no"
cert_why=""

# The portable bound, for a shell with no `timeout` (stock macOS): poll the probe from this shell, send TERM after
# $probe_timeout seconds, and KILL after 5 more if it is still there. Nothing runs beside it, so nothing is left behind;
# a signal ends the loop at once.
watch_probe() {
  local limit=$((SECONDS + probe_timeout)) hard=0 rc=0
  while kill -0 "$probe_pid" 2>/dev/null; do
    if [ "$hard" = 0 ] && [ "$SECONDS" -ge "$limit" ]; then
      kill "$probe_pid" 2>/dev/null || true
      probe_rc=124
      hard=$((SECONDS + 5))
    elif [ "$hard" != 0 ] && [ "$SECONDS" -ge "$hard" ]; then
      kill -KILL "$probe_pid" 2>/dev/null || true
      break
    fi
    sleep 0.2
  done
  wait "$probe_pid" 2>/dev/null || rc=$?
  if [ "$probe_rc" != 124 ]; then probe_rc=$rc; fi
}

# One probe: sets probe_rc, probe_out, probe_err (the files are in the owned folder). The probe runs in the
# background and this shell waits for it, so an INT or TERM is handled at once, and `cleanup` kills it.
run_probe() {
  local began=$SECONDS
  probe_rc=0
  if [ -z "${ACME_PROBE_WATCHDOG:-}" ] && command -v timeout >/dev/null 2>&1; then
    timeout -k 5 "$probe_timeout" "${cert_probe_cmd[@]}" >"$STATE/probe.out" 2>"$STATE/probe.err" &
    probe_pid=$!
    wait "$probe_pid" || probe_rc=$?
    # timeout says 124, or 137 when it had to send KILL; after the bound that is a timeout, not a docker code of its own.
    if { [ "$probe_rc" = 124 ] || [ "$probe_rc" = 137 ]; } && [ $((SECONDS - began)) -ge "$probe_timeout" ]; then probe_rc=124; fi
  else
    "${cert_probe_cmd[@]}" >"$STATE/probe.out" 2>"$STATE/probe.err" &
    probe_pid=$!
    watch_probe
  fi
  probe_pid=""
  probe_out=$(cat "$STATE/probe.out")
  probe_err=$(cat "$STATE/probe.err")
}

# What the last probe said: cert_state is yes, no or failed; cert_why says what failed.
classify_probe() {
  local words
  words=$(printf '%s\n' "$probe_err" | head -n 3 | tr '\n' ' ')
  cert_state="failed"
  if [ "$probe_rc" = 124 ]; then cert_why="the probe timed out after ${probe_timeout} s"
  elif [ "$probe_rc" != 0 ]; then cert_why="docker exited with code ${probe_rc}: ${words}"
  elif [ "$probe_out" = "cert:yes" ]; then cert_state="yes"
  elif [ "$probe_out" = "cert:no" ]; then cert_state="no"
  else cert_why="the probe printed '${probe_out}' and exited 0, not cert:yes or cert:no: ${words}"
  fi
}

cert_started=$SECONDS
cert_note=$cert_note_every
while :; do
  run_probe
  classify_probe
  # The first docker failure ends the wait: it will not turn into a certificate, and alternating failures with "no" answers must not hide it.
  if [ "$cert_state" != "no" ]; then break; fi
  cert_elapsed=$((SECONDS - cert_started))
  if [ "$cert_elapsed" -ge "$cert_deadline" ]; then break; fi
  # The wait can last five minutes: say so on a time interval, so a hosted log or a person does not look at a silent job.
  if [ "$cert_elapsed" -ge "$cert_note" ]; then
    echo "  still waiting for the certificate: ${cert_elapsed} s of ${cert_deadline} s"
    cert_note=$((cert_note + cert_note_every))
  fi
  sleep 2
done
cert_elapsed=$((SECONDS - cert_started))
case "$cert_state" in
  yes) pass "certbot obtained a certificate through a real HTTP-01 challenge" ;;
  failed)
    fail "the certificate check failed in docker, not for want of a file (${cert_why}, after ${cert_elapsed} s)"
    "${COMPOSE[@]}" logs certbot | tail -25 ;;
  *)
    fail "no certificate was issued within ${cert_deadline} s (the last try found no file)"
    "${COMPOSE[@]}" logs certbot | tail -25 ;;
esac

echo
echo "-- 3. nginx picks it up unattended -----------------------------"
code=000
for _ in $(seq 1 24); do
  code=$(code_of -k --max-time 4 "${HTTPS}/api/health")
  [ "$code" = "200" ] && break
  sleep 5
done
expect "nginx opened 443 by itself and serves the API" 200 "$code"

issuer=$(echo | openssl s_client -connect 127.0.0.1:18444 -servername vaulthost 2>/dev/null \
         | openssl x509 -noout -issuer 2>/dev/null || true)
case "$issuer" in
  *Pebble*) pass "it is serving the ACME-issued chain (${issuer#issuer=})" ;;
  *)        fail "unexpected issuer: ${issuer:-none}" ;;
esac

echo
echo "-- 4. the API through TLS --------------------------------------"
expect "unauthenticated request reaches the app and is refused" \
       401 "$(code_of -k --max-time 4 "${HTTPS}/api/vault")"
expect "port 80 redirects to HTTPS instead of answering 503" \
       301 "$(code_of --max-time 4 "${HTTP}/api/vault")"

echo
if [ "$FAILED" = "0" ]; then
  echo "ALL ISSUANCE CHECKS PASSED"
  exit 0
fi
echo "SOME CHECKS FAILED"
exit 1
