#!/usr/bin/env bash
# Update the Cred Vault Server in place.
#
#   ./update.sh              # pull the tag in .env and recreate the containers
#   ./update.sh 1.4.0        # switch to a specific version, rewriting VAULT_IMAGE in .env
#   ./update.sh --rollback   # step back to the previous deployment; again to the one before it
#
# Your data is NOT touched: DATA_DIR / CERT_DIR / LOG_DIR are host bind mounts, and
# nothing here removes volumes. The one destructive flag docker offers for that
# (`down -v`) is deliberately never used in this file.
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=".env"
STATE_FILE=".update-state"

# How many deployments back `--rollback` can reach. Three, because the case that needs a rollback is
# often "the last two are both bad", and a depth of one turns that into a rebuild under pressure —
# see development-workflow.md, "A rollback must not BUILD". The images themselves never expire: they
# are version tags in the registry, so this file is a trail and not a store.
HISTORY_DEPTH=3

log()  { printf '\033[1;34m[update]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[update]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[update]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "no .env here. Copy .env.example to .env and edit it first."

compose() { docker compose "$@"; }

current_image() { grep -E '^VAULT_IMAGE=' "$ENV_FILE" | head -1 | cut -d= -f2-; }

# Newest first, one image per line, capped. Pushing a duplicate of the head is a no-op: a plain
# `./update.sh` refresh must not push the current image and quietly bury the real previous one.
push_history() {
  local image="$1" kept
  [[ -n "$image" ]] || return 0
  [[ -f "$STATE_FILE" && "$(head -1 "$STATE_FILE")" == "$image" ]] && return 0
  # Spelled as an `if` rather than `A && B || C`: shellcheck SC2015 is right that the two are not
  # the same, and here the difference bites — an unreadable STATE_FILE would take the `|| true`
  # branch and silently blank the trail rather than failing, which is the one thing a rollback trail
  # must not do quietly.
  kept=""
  if [[ -f "$STATE_FILE" ]]; then
    kept="$(head -n "$((HISTORY_DEPTH - 1))" "$STATE_FILE")"
  fi
  { printf '%s
' "$image"; [[ -n "$kept" ]] && printf '%s
' "$kept"; } >"${STATE_FILE}.new"
  mv "${STATE_FILE}.new" "$STATE_FILE"
}

# Take the newest entry off the trail and print it. Consecutive rollbacks therefore walk BACKWARDS
# instead of returning to the place they just came from, which is what one-deep did.
pop_history() {
  local top
  [[ -s "$STATE_FILE" ]] || return 1
  top="$(head -1 "$STATE_FILE")"
  tail -n +2 "$STATE_FILE" >"${STATE_FILE}.new" && mv "${STATE_FILE}.new" "$STATE_FILE"
  printf '%s
' "$top"
}

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
  TARGET="$(pop_history)" || die "no previous version recorded — nothing to roll back to."
  log "rolling back to ${TARGET} ($(wc -l <"$STATE_FILE" | tr -d ' ') older still recorded)"
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

# Record where we came from BEFORE switching, so --rollback has a target. A rollback does not push:
# the image it is leaving is the one just judged bad, and putting it back on the trail would make the
# next --rollback return to it.
if [[ "${1:-}" != "--rollback" ]]; then
  push_history "$PREVIOUS"
fi
set_image "$TARGET"


# ---------------------------------------------------------------------------
# Retention. A host that only ever pulls fills its disk, and it fills it on the
# day of a release rather than gradually — see development-workflow.md,
# "Self-hosted means somebody has to delete things".
#
# What is kept is exactly what --rollback can reach: the running image and the
# trail. That is not a coincidence to be maintained by hand — the retention
# policy IS the rollback depth, so the two cannot drift apart.
# ---------------------------------------------------------------------------
prune_images() {
  local base keep tag total
  base="$(current_image)"; base="${base%:*}"
  [[ -n "$base" ]] || return 0
  # OURS ONLY, by repository name. Never `docker system prune -a`: this host may
  # be shared, and a blanket prune deletes what somebody else is depending on.
  keep="$(printf '%s
' "$(current_image)"; [[ -f "$STATE_FILE" ]] && cat "$STATE_FILE")"
  total="$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -c "^${base}:" || true)"
  # Never empty the shelf: the same rule the backup script states. If everything
  # we can see is a candidate, something is wrong with our view and not with the
  # disk.
  [[ "$total" -gt 1 ]] || return 0
  while read -r tag; do
    [[ -n "$tag" ]] || continue
    printf '%s
' "$keep" | grep -qxF "$tag" && continue
    docker image rm "$tag" >/dev/null 2>&1 && log "pruned ${tag}"
  done < <(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${base}:" || true)
}

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
      # Only once the new one is proven: a prune before the health check would
      # delete the image the rollback is about to need.
      prune_images
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
