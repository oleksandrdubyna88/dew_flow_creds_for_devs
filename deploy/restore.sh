#!/usr/bin/env bash
# Restore a backup.
#
#   ./restore.sh                              # the newest archive in BACKUP_DIR
#   ./restore.sh /mnt/nas/cred-vault-….tar.gz # a specific one
#   ./restore.sh --list                       # what is available
#
# A backup nobody has restored is a rumour, so this exists as a script rather
# than as a paragraph in a README telling you which tar flags to use at 3am.
#
# It stops the stack, moves the current data aside (never deletes it), unpacks the
# archive, and starts back up. The displaced data stays as data.before-restore-<ts>
# until you remove it — a restore that turns out to be the wrong archive must be
# undoable.
set -euo pipefail
cd "$(dirname "$0")"

log()  { printf '\033[1;34m[restore]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[restore]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[restore]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die "no .env here — run this from the deploy/ directory."

set -a
# shellcheck source=/dev/null
. ./.env
set +a

DATA_DIR="${DATA_DIR:-./data}"
CERT_DIR="${CERT_DIR:-./certbot-data}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

if [[ "${1:-}" == "--list" ]]; then
  log "archives in ${BACKUP_DIR}:"
  ls -lh "${BACKUP_DIR}"/cred-vault-*.tar.gz 2>/dev/null || die "none found"
  exit 0
fi

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  # find, not ls: the timestamped names sort lexically = chronologically, and
  # find copes with a destination path that has spaces in it (a mounted Drive
  # folder frequently does).
  ARCHIVE="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'cred-vault-*.tar.gz' 2>/dev/null | sort | tail -1 || true)"
  [[ -n "$ARCHIVE" ]] || die "no archives in ${BACKUP_DIR}. Try: ./restore.sh --list"
  log "newest archive: ${ARCHIVE}"
fi
[[ -f "$ARCHIVE" ]] || die "'${ARCHIVE}' does not exist"

# Verify BEFORE touching anything that is currently working.
tar -tzf "$ARCHIVE" >/dev/null 2>&1 || die "'${ARCHIVE}' is not a readable archive; nothing was changed"
log "archive verifies"

VAULTS=$(tar -tzf "$ARCHIVE" | grep -c '/vaults/.*\.bin$' || true)
log "it contains ${VAULTS} vault blob(s)"
if [[ "$VAULTS" -eq 0 ]]; then
  warn "this archive contains NO vault blobs — restoring it would leave an empty server."
  warn "pick a different one: ./restore.sh --list"
  die "refusing to restore an empty archive over live data"
fi

read -r -p "Restore over ${DATA_DIR}? The current data is moved aside, not deleted. [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { log "aborted; nothing was changed"; exit 0; }

log "stopping the stack"
docker compose down >/dev/null 2>&1 || true

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DISPLACED=""

# Past this line the service is DOWN and the data has been moved. Any failure
# from here must put both back — found by rehearsing: the script died on a bad
# archive and left the stack stopped with the data sitting under another name,
# which is a worse position than the one the operator started in.
# Invoked only by the EXIT trap below.
# shellcheck disable=SC2329
rollback() {
  local rc=$?
  [[ $rc -eq 0 ]] && return 0
  warn "restore failed — putting everything back"
  if [[ -n "$DISPLACED" && -d "$DISPLACED" ]]; then
    rm -rf "$DATA_DIR"
    mv "$DISPLACED" "$DATA_DIR"
    warn "original data restored to ${DATA_DIR}"
  fi
  docker compose up -d >/dev/null 2>&1 || true
  warn "the stack has been started again; nothing was lost"
  return "$rc"
}
trap rollback EXIT

if [[ -d "$DATA_DIR" ]]; then
  DISPLACED="${DATA_DIR}.before-restore-${STAMP}"
  mv "$DATA_DIR" "$DISPLACED"
  log "current data moved to ${DISPLACED}"
fi
mkdir -p "$DATA_DIR"

# The archive stores its sources under the names the backup gave them (/src0,
# /src1 for the manual path; data, certs for the scheduled one), so unpack into a
# staging directory and take whichever member actually holds the vaults.
STAGE="$(mktemp -d)"
tar -xzf "$ARCHIVE" -C "$STAGE"

SRC="$(find "$STAGE" -type d -name vaults -print -quit || true)"
[[ -n "$SRC" ]] || die "no vaults/ directory inside the archive; left everything as it was"
SRC="$(dirname "$SRC")"
log "restoring from $(basename "$SRC") inside the archive"

cp -a "$SRC/." "$DATA_DIR/"

CERTS="$(find "$STAGE" -type d -name live -print -quit || true)"
if [[ -n "$CERTS" && -d "$CERT_DIR" ]]; then
  cp -a "$(dirname "$CERTS")/." "${CERT_DIR}/conf/" 2>/dev/null || true
  log "certificates restored"
fi
rm -rf "$STAGE"

# The app runs unprivileged; restored files must belong to it.
docker run --rm -v "$(realpath "$DATA_DIR")":/d alpine chown -R 10001:10001 /d >/dev/null

log "starting the stack"
docker compose up -d >/dev/null 2>&1

for _ in $(seq 1 40); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q vault)" 2>/dev/null || echo starting)"
  [[ "$state" == "healthy" ]] && break
  sleep 2
done

if [[ "${state:-}" == "healthy" ]]; then
  trap - EXIT
  log "restored and healthy. ${VAULTS} vault(s) are back."
  log "if this was the wrong archive: docker compose down && rm -rf ${DATA_DIR} && mv ${DATA_DIR}.before-restore-${STAMP} ${DATA_DIR}"
  exit 0
fi

warn "the stack did not become healthy after the restore:"
docker compose logs --tail 30 vault >&2
die "restore did not converge. The previous data is still at ${DATA_DIR}.before-restore-${STAMP}"
