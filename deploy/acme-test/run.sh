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
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.acme-test.yml)
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

cleanup() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "image under test: ${VAULT_IMAGE}"
cleanup
rm -rf state && mkdir -p state/certs/conf state/certs/www state/data state/logs
# The app runs unprivileged; a fresh host directory belongs to root.
docker run --rm -v "$(pwd)/state":/s alpine sh -c 'chown -R 10001:10001 /s/data /s/logs' >/dev/null

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
for _ in $(seq 1 45); do
  [ -f state/certs/conf/live/vaulthost/fullchain.pem ] && break
  sleep 2
done
if [ -f state/certs/conf/live/vaulthost/fullchain.pem ]; then
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
