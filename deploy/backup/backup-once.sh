#!/bin/sh
# Take ONE verified backup. Used by both the scheduled container and the manual
# host script, so there is exactly one implementation of "what a backup is".
#
#   backup-once.sh <destination-dir> <source-dir> [more source dirs...]
#
# Environment:
#   RETAIN_DAYS   delete archives older than this (default 30; 0 = keep forever)
#   LABEL         archive name prefix (default cred-vault)
#   SKIP_IF_UNCHANGED  "true" to skip when nothing changed since the last archive
#
# Exit 0 on success or a deliberate skip, non-zero if no usable backup exists.
set -eu

DEST="${1:?destination directory required}"
shift
[ "$#" -gt 0 ] || { echo "at least one source directory required" >&2; exit 2; }

RETAIN_DAYS="${RETAIN_DAYS:-30}"
LABEL="${LABEL:-cred-vault}"
SKIP_IF_UNCHANGED="${SKIP_IF_UNCHANGED:-true}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [backup] $*"; }
die() { log "ERROR: $*"; exit 1; }

[ -d "$DEST" ] || mkdir -p "$DEST" || die "destination '$DEST' cannot be created"
[ -w "$DEST" ] || die "destination '$DEST' is not writable"

for src in "$@"; do
  [ -d "$src" ] || die "source '$src' does not exist"
done

# ---------------------------------------------------------------------------
# Skip when nothing changed.
#
# Matters most when the destination is a metered or synced folder: a daily backup
# of a vault nobody edited would otherwise upload the same bytes forever. The
# fingerprint is over names, sizes and mtimes — not contents — which is enough,
# because every write in this system replaces a whole file atomically.
# ---------------------------------------------------------------------------
fingerprint() {
  # `find | sort` so the order cannot depend on the filesystem.
  find "$@" -type f ! -name '*.tmp' -exec ls -ln {} + 2>/dev/null \
    | awk '{print $5, $9}' | sort | sha256sum | cut -d' ' -f1
}

STAMP_FILE="${DEST}/.${LABEL}-last-fingerprint"
CURRENT="$(fingerprint "$@")"

# ---------------------------------------------------------------------------
# Never let an EMPTY backup become the newest one.
#
# Found by rehearsing a restore, which is the only way this surfaces: the data
# directory was destroyed, the stack was restarted, and the scheduled backup
# dutifully archived the empty directory. Because archives are named by
# timestamp, that empty archive became "the newest" — and a restore that takes
# the newest would have restored nothing over a disaster it was meant to undo.
#
# So: a source tree with no files is only backed up when there is nothing to
# lose. If any archive already exists, this run refuses and says why.
# ---------------------------------------------------------------------------
FILE_COUNT="$(find "$@" -type f ! -name '*.tmp' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$FILE_COUNT" -lt "${MIN_FILES:-1}" ]; then
  if ls "${DEST}/${LABEL}-"*.tar.gz >/dev/null 2>&1; then
    log "REFUSING to back up: the source holds ${FILE_COUNT} file(s) and archives already exist."
    log "An empty archive would become the newest one and shadow a good restore point."
    log "If the data really is gone, restore first — do not let this overwrite your history."
    exit 0
  fi
  log "source holds ${FILE_COUNT} file(s), but no archive exists yet — taking the first one anyway"
fi

if [ "$SKIP_IF_UNCHANGED" = "true" ] && [ -f "$STAMP_FILE" ]; then
  if [ "$(cat "$STAMP_FILE" 2>/dev/null)" = "$CURRENT" ]; then
    # Only a legitimate skip if a backup is actually present to fall back on.
    if ls "${DEST}/${LABEL}-"*.tar.gz >/dev/null 2>&1; then
      log "nothing changed since the last backup — skipping"
      exit 0
    fi
    log "fingerprint matches but no archive is present; taking one anyway"
  fi
fi

# ---------------------------------------------------------------------------
# Write, atomically.
#
# The archive is built under a .tmp name and renamed only once it verifies. A
# cloud-sync folder uploads whatever appears in it the moment it appears, so a
# half-written file under the real name would be replicated as a "backup".
# ---------------------------------------------------------------------------
TS="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="${DEST}/${LABEL}-${TS}.tar.gz"
# The stamp has one-second granularity, so two runs in the same second would
# resolve to the same name and the second would silently REPLACE the first.
# Unreachable on an hourly schedule, ordinary when someone runs it by hand twice.
suffix=1
while [ -e "$FINAL" ]; do
  FINAL="${DEST}/${LABEL}-${TS}-${suffix}.tar.gz"
  suffix=$((suffix + 1))
done
TMP="${FINAL%.tar.gz}.tar.gz.tmp"

# Invoked only by the trap below — a failed or interrupted run must not leave a
# partial archive behind for a sync client to upload.
# shellcheck disable=SC2329
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

log "archiving: $*"
# Vault writes are atomic (write temp, rename), so a running server cannot leave
# a half-written blob in here — no downtime is needed. *.tmp files are in-flight
# writes by definition and are excluded.
tar -czf "$TMP" --exclude='*.tmp' "$@" 2>/dev/null || die "tar failed; nothing was written"

# An unverified backup is a rumour.
tar -tzf "$TMP" >/dev/null 2>&1 || die "the archive did not verify; discarding it"

mv "$TMP" "$FINAL"
trap - EXIT
chmod 600 "$FINAL" 2>/dev/null || true
printf '%s' "$CURRENT" > "$STAMP_FILE" 2>/dev/null || true

SIZE="$(du -h "$FINAL" 2>/dev/null | cut -f1)"
log "wrote ${FINAL} (${SIZE}), verified"

# ---------------------------------------------------------------------------
# Retention — and the rule that makes it safe.
# ---------------------------------------------------------------------------
if [ "$RETAIN_DAYS" -gt 0 ]; then
  # NEVER let retention empty the destination. A clock skew, a paused server, or
  # a destination that was unreachable for a month must not turn "prune old
  # backups" into "delete every backup".
  TOTAL="$(find "$DEST" -maxdepth 1 -name "${LABEL}-*.tar.gz" | wc -l)"
  OLD="$(find "$DEST" -maxdepth 1 -name "${LABEL}-*.tar.gz" -mtime "+${RETAIN_DAYS}" | wc -l)"
  if [ "$OLD" -gt 0 ] && [ "$TOTAL" -gt "$OLD" ]; then
    find "$DEST" -maxdepth 1 -name "${LABEL}-*.tar.gz" -mtime "+${RETAIN_DAYS}" -delete
    log "pruned ${OLD} archive(s) older than ${RETAIN_DAYS} days (${TOTAL} were present)"
  elif [ "$OLD" -gt 0 ]; then
    log "refusing to prune: all ${TOTAL} archive(s) are older than ${RETAIN_DAYS} days"
  fi
fi

# Also clear temp files abandoned by an earlier interrupted run.
find "$DEST" -maxdepth 1 -name ".${LABEL}-*.tar.gz.tmp" -mmin +60 -delete 2>/dev/null || true
exit 0
