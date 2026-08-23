#!/bin/sh
# The scheduled half: take a backup, sleep, repeat, forever.
#
# Deliberately a sleep loop rather than cron. Three reasons, in order of how much
# they cost when ignored:
#   - cron in a container needs a running daemon, its own log plumbing, and its
#     failures are silent by default. This writes to stdout, which docker already
#     captures and rotates.
#   - a sleep loop cannot drift into "the container is up but nothing is
#     scheduled", which is the classic cron-in-docker outage.
#   - the interval people actually want here is "every N hours", not a calendar
#     expression.
#
# One backup failure never ends the loop — the next window is the retry.
set -eu

DEST="${BACKUP_DEST:-/backup}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
ON_START="${BACKUP_ON_START:-true}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [backup] $*"; }

case "$INTERVAL_HOURS" in
  ''|*[!0-9]*) log "FATAL: BACKUP_INTERVAL_HOURS must be a whole number of hours, got '${INTERVAL_HOURS}'"; exit 1 ;;
esac
[ "$INTERVAL_HOURS" -ge 1 ] || { log "FATAL: BACKUP_INTERVAL_HOURS must be at least 1"; exit 1; }

INTERVAL_SECONDS=$((INTERVAL_HOURS * 3600))

# Everything worth keeping. Certificates are included because re-issuing them
# needs the network and the DNS to be right again, which during a restore is
# exactly what you may not have.
#
# NOT included: the operator's .env. It carries LOCAL_SIGNING_KEY, and this
# destination is frequently a cloud-sync folder — copying a signing key there is
# a decision the operator should make deliberately, not a side effect of turning
# backups on. Keep .env wherever you keep secrets.
SOURCES="/data"
[ -d /certs ] && SOURCES="/data /certs"

log "destination: ${DEST}"
log "every ${INTERVAL_HOURS}h, keeping ${RETAIN_DAYS:-30} days"

run_once() {
  # shellcheck disable=SC2086  # SOURCES is a deliberate space-separated list
  if /backup-once.sh "$DEST" $SOURCES; then
    return 0
  fi
  log "this run failed; the next window in ${INTERVAL_HOURS}h is the retry"
  return 1
}

# Take one immediately, so an operator learns the destination is wrong NOW
# rather than discovering it tomorrow — or during a restore.
if [ "$ON_START" = "true" ]; then
  log "taking an initial backup"
  run_once || true
fi

while true; do
  sleep "$INTERVAL_SECONDS"
  run_once || true
done
