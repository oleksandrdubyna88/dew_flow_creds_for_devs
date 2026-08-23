#!/usr/bin/env bash
# Take a backup right now, by hand.
#
#   ./backup.sh                    # into BACKUP_DIR from .env
#   ./backup.sh /mnt/nas/vault     # into somewhere else, just this once
#
# The scheduled `backup` service in docker-compose.yml does the same thing on a
# timer. Both call backup/backup-once.sh, so "what a backup is" — atomic write,
# verification, retention that never empties the destination — is defined once.
#
# Restore with ./restore.sh.
set -euo pipefail
cd "$(dirname "$0")"

log() { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[backup]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die "no .env here — run this from the deploy/ directory."

set -a
# shellcheck source=/dev/null  # .env is operator-authored and not in the repo
. ./.env
set +a

DATA_DIR="${DATA_DIR:-./data}"
CERT_DIR="${CERT_DIR:-./certbot-data}"
DEST="${1:-${BACKUP_DIR:-./backups}}"

[[ -d "$DATA_DIR" ]] || die "DATA_DIR '$DATA_DIR' does not exist — is the stack up?"

SOURCES=("$DATA_DIR")
[[ -d "$CERT_DIR" ]] && SOURCES+=("$CERT_DIR")

# Run it in a container rather than on the host: the archive is then produced by
# exactly the same busybox tar as the scheduled service, so an archive taken by
# hand and one taken on the timer are byte-for-byte the same shape.
mkdir -p "$DEST"
log "archiving ${SOURCES[*]} -> ${DEST}"

MOUNTS=()
for i in "${!SOURCES[@]}"; do
  MOUNTS+=(-v "$(realpath "${SOURCES[$i]}")":"/src${i}":ro)
done
CONTAINER_SOURCES=()
for i in "${!SOURCES[@]}"; do CONTAINER_SOURCES+=("/src${i}"); done

docker run --rm \
  "${MOUNTS[@]}" \
  -v "$(realpath "$DEST")":/backup \
  -v "$(realpath ./backup/backup-once.sh)":/backup-once.sh:ro \
  -e RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}" \
  -e LABEL=cred-vault \
  -e SKIP_IF_UNCHANGED=false \
  alpine:3.20 sh /backup-once.sh /backup "${CONTAINER_SOURCES[@]}"

log "done. Restore with: ./restore.sh <archive>"
