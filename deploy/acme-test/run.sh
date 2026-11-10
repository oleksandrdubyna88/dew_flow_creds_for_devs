#!/usr/bin/env bash
# Proves the certificate pipeline actually issues — end to end, in about a minute,
# without touching Let's Encrypt.
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
# run's first act is the shared janitor, which collects them once they are 10 minutes old. An
# interrupt (INT, TERM, HUP) ends the run with 128 + n and the same clean-up runs once.
set -euo pipefail
cd "$(dirname "$0")"

# shellcheck source=../../.github/scripts/lib/owned.sh
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
# against an empty name. `down -v` removes the containers, the network and the named volumes. The
# helper calls it from a subshell, so it never removes the folder itself.
# shellcheck disable=SC2317,SC2329
cleanup() {
  if [ -n "${PROJECT:-}" ]; then
    docker compose -p "$PROJECT" -f docker-compose.acme-test.yml down -v --remove-orphans >/dev/null 2>&1 || true
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
  code=$(code_of "${HTTP}/api/vault")
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
       404 "$(code_of "${HTTP}/.well-known/acme-challenge/probe")"

echo
echo "-- 2. issuance -------------------------------------------------"
"${COMPOSE[@]}" up -d certbot >/dev/null 2>&1
# certbot's live folder is `drwx------ root`: the job's user cannot see into it from the host (a host
# `[ -f ]` said "no certificate" while certbot had one). A one-shot container reads the volume as root.
have_cert() { docker run --rm -v "${PROJECT}_certs-conf:/s:ro" alpine test -f /s/live/vaulthost/fullchain.pem; }
for _ in $(seq 1 150); do
  have_cert 2>/dev/null && break
  sleep 2
done
if have_cert 2>/dev/null; then
  pass "certbot obtained a certificate through a real HTTP-01 challenge"
else
  fail "no certificate was issued"
  "${COMPOSE[@]}" logs certbot | tail -25
fi

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
       401 "$(code_of -k "${HTTPS}/api/vault")"
expect "port 80 redirects to HTTPS instead of answering 503" \
       301 "$(code_of "${HTTP}/api/vault")"

echo
if [ "$FAILED" = "0" ]; then
  echo "ALL ISSUANCE CHECKS PASSED"
  exit 0
fi
echo "SOME CHECKS FAILED"
exit 1
