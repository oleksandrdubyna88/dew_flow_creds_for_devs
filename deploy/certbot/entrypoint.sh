#!/bin/sh
# Obtains the certificate once, then renews it forever.
#
# The renewal loop is not optional in this stack. Let's Encrypt issues IP-address
# certificates ONLY under the `shortlived` profile, which is ~160 hours (about six days).
# A deployment on TLS_MODE=ip that is not renewing automatically goes dark inside a week,
# so the loop runs every RENEW_INTERVAL_SECONDS (6h by default) regardless of mode —
# `certbot renew` is a no-op until the certificate is actually close to expiry.
#
# NOTE: this script is repository content. The certificates it writes live under
# CERT_DIR (deploy/certbot-data by default), which is git-ignored — the two are kept in
# separate directories on purpose, so ignoring the data never ignores the script.
set -eu

WEBROOT="/var/www/certbot"
LIVE="/etc/letsencrypt/live"

log() { echo "[cred-vault/certbot] $*"; }

if [ "${TLS_MODE}" = "custom" ] || [ "${TLS_MODE}" = "none" ]; then
  log "TLS_MODE=${TLS_MODE} — nothing to issue. Idling so the service stays 'up' for compose."
  # Sleeping rather than exiting keeps `docker compose ps` honest: an exited container
  # next to three running ones reads as a failure during every future incident.
  while true; do sleep 86400; done
fi

STAGING_ARG=""
if [ "${ACME_STAGING}" = "true" ]; then
  log "using the Let's Encrypt STAGING environment — certificates will NOT be trusted"
  STAGING_ARG="--staging"
fi

EMAIL_ARG="--register-unsafely-without-email"
if [ -n "${ACME_EMAIL}" ]; then
  EMAIL_ARG="--email ${ACME_EMAIL}"
fi

case "${TLS_MODE}" in
  domain)
    if [ -z "${DOMAIN}" ]; then
      log "FATAL: TLS_MODE=domain but DOMAIN is empty"; exit 1
    fi
    IDENTIFIER_ARG="-d ${DOMAIN}"
    PROFILE_ARG=""
    CERT_NAME="${DOMAIN}"
    ;;
  ip)
    if [ -z "${PUBLIC_IP}" ]; then
      log "FATAL: TLS_MODE=ip but PUBLIC_IP is empty"; exit 1
    fi
    # --ip-address needs certbot >= 5.3 (>= 5.4 with --webroot); the image is :latest.
    # `shortlived` is mandatory here, not a preference: Let's Encrypt refuses to issue
    # an IP certificate under any other profile.
    IDENTIFIER_ARG="--ip-address ${PUBLIC_IP}"
    PROFILE_ARG="--preferred-profile shortlived"
    CERT_NAME="${PUBLIC_IP}"
    ;;
  *)
    log "FATAL: unknown TLS_MODE '${TLS_MODE}'"; exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# First issuance
# ---------------------------------------------------------------------------
if [ -f "${LIVE}/${CERT_NAME}/fullchain.pem" ]; then
  log "certificate for ${CERT_NAME} already present — skipping issuance"
else
  log "requesting a certificate for ${CERT_NAME} (mode=${TLS_MODE})"
  # nginx needs a moment to bind :80 and start serving the challenge webroot.
  sleep 10
  # shellcheck disable=SC2086  # the *_ARG values are deliberately word-split
  if certbot certonly \
      --webroot --webroot-path "${WEBROOT}" \
      --non-interactive --agree-tos --keep-until-expiring \
      ${EMAIL_ARG} ${STAGING_ARG} ${PROFILE_ARG} ${IDENTIFIER_ARG}; then
    log "issued — nginx picks it up within a minute and opens port 443"
  else
    log "ISSUANCE FAILED. nginx keeps answering 503 on :80 until this succeeds."
    log "Common causes: :80 not reachable from the internet, DNS not pointing here yet,"
    log "a private PUBLIC_IP (Let's Encrypt cannot validate 10.x/172.16-31.x/192.168.x —"
    log "use TLS_MODE=custom for those), or an ACME rate limit."
    log "Fix the cause, then: docker compose restart certbot"
  fi
fi

# ---------------------------------------------------------------------------
# Renewal loop
# ---------------------------------------------------------------------------
log "entering renewal loop (every ${RENEW_INTERVAL_SECONDS}s)"
while true; do
  sleep "${RENEW_INTERVAL_SECONDS}"
  # One failed attempt must never end the loop — the next window is the retry.
  if certbot renew --webroot --webroot-path "${WEBROOT}" --non-interactive; then
    log "renewal check completed"
  else
    log "renewal check FAILED; retrying in ${RENEW_INTERVAL_SECONDS}s"
  fi
done
