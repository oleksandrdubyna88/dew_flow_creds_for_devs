#!/usr/bin/env bash
# Update the Cred Vault Server in place.
#
#   ./update.sh              # pull the tag in .env and recreate the containers
#   ./update.sh 1.4.0        # switch to a specific version, rewriting VAULT_IMAGE in .env
#   ./update.sh --rollback   # go back to the tag recorded by the previous run
#
# Your data is NOT touched: DATA_DIR / CERT_DIR / LOG_DIR are host bind mounts, and
# nothing here removes volumes. The one destructive flag docker offers for that
# (`down -v`) is deliberately never used in this file.
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=".env"
STATE_FILE=".update-state"

log()  { printf '\033[1;34m[update]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[update]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[update]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "no .env here. Copy .env.example to .env and edit it first."

compose() { docker compose "$@"; }

current_image() { grep -E '^VAULT_IMAGE=' "$ENV_FILE" | head -1 | cut -d= -f2-; }

set_image() {
  local image="$1"
  # Rewrite in place, preserving everything else in the file.
  if grep -qE '^VAULT_IMAGE=' "$ENV_FILE"; then
    sed -i.bak "s|^VAULT_IMAGE=.*|VAULT_IMAGE=${image}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    printf '\nVAULT_IMAGE=%s\n' "$image" >>"$ENV_FILE"
  fi
}

# ---------------------------------------------------------------------------
# Resolve what we are moving to
# ---------------------------------------------------------------------------
PREVIOUS="$(current_image)"

if [[ "${1:-}" == "--rollback" ]]; then
  [[ -f "$STATE_FILE" ]] || die "no previous version recorded — nothing to roll back to."
  TARGET="$(cat "$STATE_FILE")"
  log "rolling back to ${TARGET}"
elif [[ -n "${1:-}" ]]; then
  BASE="${PREVIOUS%:*}"
  TARGET="${BASE}:${1}"
  log "switching to ${TARGET}"
else
  TARGET="$PREVIOUS"
  log "refreshing ${TARGET}"
fi

# ---------------------------------------------------------------------------
# Pre-flight: never update off a broken current state without saying so
# ---------------------------------------------------------------------------
if ! compose config >/dev/null 2>&1; then
  die "docker compose config is invalid — fix .env before updating."
fi

log "pulling ${TARGET} ..."
if ! docker pull "$TARGET" >/dev/null; then
  die "could not pull ${TARGET}. Nothing was changed."
fi

# Record where we came from BEFORE switching, so --rollback has a target.
if [[ "${1:-}" != "--rollback" ]]; then
  echo "$PREVIOUS" >"$STATE_FILE"
fi
set_image "$TARGET"

# ---------------------------------------------------------------------------
# Recreate. Only the app container needs replacing; nginx/certbot keep running,
# so TLS termination never blinks.
# ---------------------------------------------------------------------------
log "recreating the vault container ..."
compose up -d --no-deps vault

# ---------------------------------------------------------------------------
# Verify. An update that leaves the service unhealthy must not exit 0.
# ---------------------------------------------------------------------------
log "waiting for health ..."
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' \
      "$(compose ps -q vault)" 2>/dev/null || echo starting)"
  case "$state" in
    healthy)
      log "healthy — now running ${TARGET}"
      log "roll back with: ./update.sh --rollback"
      exit 0
      ;;
    unhealthy)
      warn "the new container reports UNHEALTHY."
      warn "logs:"; compose logs --tail 40 vault >&2
      die "update failed. Roll back with: ./update.sh --rollback"
      ;;
  esac
  sleep 2
done

warn "still not healthy after 60s. Current logs:"
compose logs --tail 40 vault >&2
die "update did not converge. Roll back with: ./update.sh --rollback"
