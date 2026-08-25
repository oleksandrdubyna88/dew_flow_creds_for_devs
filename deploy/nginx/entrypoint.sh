#!/bin/sh
# Runs inside the stock nginx image's /docker-entrypoint.d/ hook, before nginx starts.
#
# It has one hard problem to solve: on a first boot there is no certificate yet, and
# nginx refuses to start when ssl_certificate names a file that does not exist — but
# certbot cannot obtain that certificate until nginx is up to answer the HTTP-01
# challenge on port 80. A deadlock.
#
# The way out is NOT a self-signed placeholder. The VS Code extension calls fetch()
# with no certificate override, so it would reject a placeholder anyway; all a fake
# certificate achieves is turning "TLS is not ready yet" into "your certificate is
# untrusted", which is a much harder thing to diagnose. (It would also need the openssl
# CLI, which nginx:alpine does not ship — the first version of this script crashed with
# exit 127 for exactly that reason.)
#
# Instead: port 80 always listens and always serves the ACME challenge. Port 443 does
# not listen at all until a real certificate exists. The reload loop notices when one
# arrives and rewrites the config. A deployment mid-issuance therefore answers 503 with
# a sentence saying why, which is the truth.
set -eu

CERT_LIVE="/etc/letsencrypt/live"
TEMPLATE="/etc/cred-vault/vault.conf.template"
CONF="/etc/nginx/conf.d/vault.conf"
RELOAD_INTERVAL="${RELOAD_INTERVAL_SECONDS:-21600}" # 6h

log() { echo "[cred-vault/nginx] $*"; }

# The stock image ships /etc/nginx/conf.d/default.conf, and conf.d loads alphabetically,
# so "default" sorts before "vault" and its `listen 80` block becomes the default server
# for any Host we do not name. Every request then lands on the nginx welcome page.
rm -f /etc/nginx/conf.d/default.conf

case "${TLS_MODE}" in
  domain|ip) CERT_NAME="${SERVER_NAME}" ;;
  custom)    CERT_NAME="custom" ;;
  none)      CERT_NAME="" ;;
  *) log "FATAL: unknown TLS_MODE '${TLS_MODE}' (expected domain|ip|custom|none)"; exit 1 ;;
esac

REAL_CERT="${CERT_LIVE}/${CERT_NAME}/fullchain.pem"
REAL_KEY="${CERT_LIVE}/${CERT_NAME}/privkey.pem"

tls_ready() {
  [ "${TLS_MODE}" != "none" ] && [ -f "${REAL_CERT}" ] && [ -f "${REAL_KEY}" ]
}

# ---------------------------------------------------------------------------
# The shared rate-limit zones and the port-80 server. Always written.
# ---------------------------------------------------------------------------
write_config() {
  # Defence in depth: the app rate-limits per authenticated caller, this limits per
  # source address, so a flood of UNAUTHENTICATED requests never reaches the app.
  cat >"${CONF}" <<'ZONES'
# WHO THE CLIENT IS. Behind an outer terminator (TLS_MODE=none or custom) $remote_addr
# is that proxy's address for every caller alive — so the zones below, which key on it,
# become ONE bucket for the whole internet, and so does the application's own anonymous
# partition. A live deployment was found in exactly that state on 2026-08-25.
#
# Private ranges only, deliberately: this container publishes no port, so a private
# address is the only way a request can arrive, and a public one appearing here would
# mean the topology is not what this file assumes.
set_real_ip_from 10.0.0.0/8;
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
set_real_ip_from 127.0.0.0/8;
real_ip_header X-Forwarded-For;
real_ip_recursive on;

limit_req_zone $binary_remote_addr zone=vault_api:10m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=vault_conn:10m;
# 503 reads as "the server broke"; 429 says what happened, and matches what the
# application answers when its own limiter refuses a caller.
limit_req_status 429;
limit_conn_status 429;
ZONES

  if [ "${TLS_MODE}" = "none" ]; then
    # Plain HTTP end to end. The operator has asserted that something else terminates
    # TLS in front of this stack.
    cat >>"${CONF}" <<PLAIN
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    server_tokens off;
    client_max_body_size ${MAX_BODY_MB}m;

    location = /api/health {
        access_log off;
        proxy_pass http://vault:8080;
        proxy_set_header Host \$host;
    }
    location /api/ {
        limit_req zone=vault_api burst=40 nodelay;
        limit_conn vault_conn 20;
        proxy_pass http://vault:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        # SET, never appended: after the real_ip block above this is the true client in
        # either topology, so the app reads one entry it can trust rather than a list
        # whose left half a caller wrote.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 120s;
        proxy_request_buffering off;
    }
    location / { return 404; }
}
PLAIN
    return
  fi

  if tls_ready; then
    # $host and $request_uri are nginx runtime variables — the single quotes keep the
    # shell from eating them, which is the intent, not an oversight.
    # shellcheck disable=SC2016
    ROOT_ACTION='return 301 https://$host$request_uri;'
  else
    # Honest, greppable, and it tells the operator exactly which knob is unfinished.
    ROOT_ACTION='return 503 "TLS is not ready: no certificate has been issued yet. Check: docker compose logs certbot\n";'
  fi

  cat >>"${CONF}" <<HTTP
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAME};
    server_tokens off;

    # The ACME challenge must stay reachable over plain HTTP forever — renewals use it.
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
    }

    location / {
        default_type text/plain;
        ${ROOT_ACTION}
    }
}
HTTP

  if tls_ready; then
    SSL_CERT="${REAL_CERT}"
    SSL_KEY="${REAL_KEY}"
    export SSL_CERT SSL_KEY SERVER_NAME MAX_BODY_MB HSTS_MAX_AGE
    # The single quotes are required: envsubst takes a LITERAL list of names to
    # substitute, so expanding them here would pass their values and rewrite nothing.
    # Naming the list also protects nginx's own $host/$scheme/$remote_addr variables.
    # shellcheck disable=SC2016
    envsubst '${SSL_CERT} ${SSL_KEY} ${SERVER_NAME} ${MAX_BODY_MB} ${HSTS_MAX_AGE}' \
      <"${TEMPLATE}" >>"${CONF}"
    log "serving TLS with ${CERT_NAME}"
  else
    log "no certificate at ${REAL_CERT} yet — port 443 stays closed, port 80 answers 503"
    log "certbot is trying; watch it with: docker compose logs -f certbot"
  fi
}

write_config

# ---------------------------------------------------------------------------
# Pick up an issued or renewed certificate without a human
# ---------------------------------------------------------------------------
# A reload is cheap and never drops a connection. Doing it on a timer — rather than
# from a certbot deploy-hook — keeps this container off the Docker socket, which is the
# difference between "nginx can reload itself" and "nginx is root on the host".
#
# The first interval is short so a certificate issued seconds after boot goes live in
# under a minute rather than in six hours.
(
  attempt=0
  while true; do
    if [ "${attempt}" -lt 20 ] && ! grep -q 'listen 443' "${CONF}" 2>/dev/null; then
      sleep 15          # still waiting for the very first certificate
      attempt=$((attempt + 1))
    else
      sleep "${RELOAD_INTERVAL}"
    fi

    before="$(cat "${CONF}")"
    write_config
    if [ "${before}" = "$(cat "${CONF}")" ]; then
      # Nothing changed; a renewal still needs the reload to pick up new key material.
      [ "${attempt}" -ge 20 ] || continue
    fi

    if nginx -t >/dev/null 2>&1; then
      nginx -s reload && log "reloaded"
    else
      log "config test FAILED — restoring the previous config"
      printf '%s' "${before}" >"${CONF}"
    fi
  done
) &

log "startup complete (TLS_MODE=${TLS_MODE}, server_name=${SERVER_NAME})"
