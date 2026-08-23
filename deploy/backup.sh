#!/usr/bin/env bash
# Snapshot everything that cannot be rebuilt: the vault blobs, the share inboxes, the
# ACME account + certificates, and the .env that describes the deployment.
#
#   ./backup.sh                  # writes ./backups/cred-vault-<UTC timestamp>.tar.gz
#   ./backup.sh /mnt/nas/vault   # writes it somewhere that survives this host dying
#
# The archive contains CIPHERTEXT ONLY — the server never holds a key that opens a vault
# — but it also contains .env, which may hold LOCAL_SIGNING_KEY. Treat it as a secret.
#
# Run it from cron:
#   0 3 * * *  /opt/cred-vault/deploy/backup.sh /mnt/nas/vault >> /var/log/vault-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"

DEST="${1:-./backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"

log() { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[backup]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die "no .env here — run this from the deploy/ directory."

set -a
# shellcheck source=/dev/null  # .env is operator-authored and not in the repo
. ./.env
set +a

DATA_DIR="${DATA_DIR:-./data}"
CERT_DIR="${CERT_DIR:-./certbot-data}"

[[ -d "$DATA_DIR" ]] || die "DATA_DIR '$DATA_DIR' does not exist — is the stack up?"

mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${DEST}/cred-vault-${STAMP}.tar.gz"

# Vault writes are atomic (write temp, rename), so a running server cannot leave a
# half-written blob in the archive. Stopping the stack is therefore not required —
# which matters, because a backup that needs downtime is a backup nobody runs.
log "archiving ${DATA_DIR}, ${CERT_DIR} and .env ..."
tar -czf "$ARCHIVE" \
    --exclude='*.tmp' \
    .env \
    "$DATA_DIR" \
    "$CERT_DIR" 2>/dev/null || die "tar failed — nothing written."

chmod 600 "$ARCHIVE"

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
VAULTS="$(find "$DATA_DIR/vaults" -name '*.bin' 2>/dev/null | wc -l | tr -d ' ')"
SHARES="$(find "$DATA_DIR/shares" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
log "wrote ${ARCHIVE} (${SIZE}; ${VAULTS} vaults, ${SHARES} pending shares)"

# Verify the archive is readable before trusting it. An unverified backup is a rumour.
if ! tar -tzf "$ARCHIVE" >/dev/null 2>&1; then
  die "the archive did not verify — ${ARCHIVE} is NOT a usable backup."
fi
log "archive verified"

if [[ "$RETAIN_DAYS" -gt 0 ]]; then
  removed="$(find "$DEST" -name 'cred-vault-*.tar.gz' -mtime "+${RETAIN_DAYS}" -print -delete | wc -l | tr -d ' ')"
  [[ "$removed" -gt 0 ]] && log "pruned ${removed} archive(s) older than ${RETAIN_DAYS} days"
fi

log "restore with: tar -xzf ${ARCHIVE} -C /path/to/deploy && docker compose up -d"
exit 0
