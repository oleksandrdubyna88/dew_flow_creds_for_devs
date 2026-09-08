#!/usr/bin/env bash
# Restore an ENCRYPTED server archive — the .cvbk one the server takes itself.
#
#   ./restore-archive.sh cred-vault-20260907-030405Z.cvbk       # asks for the key
#   ./restore-archive.sh archive.cvbk --key-file /run/key.txt   # reads it from a file
#   CVBK_KEY='BK1-…' ./restore-archive.sh archive.cvbk          # or from the environment
#   ./restore-archive.sh archive.cvbk --verify-only             # check it and change nothing
#
# This is NOT deploy/restore.sh. That one restores the host-side tar, which is
# unencrypted and made by whoever has a shell here. This one restores the archive
# an administrator took from the editor: encrypted, sealed under the printable
# backup key, and holding everything — vaults, sealed login keys, the registry,
# projects, the event log, and the server's own configuration as a snapshot.
#
# THE KEY. It is the BK1- words shown once when the key was minted. Nothing can
# produce them again, so if they are lost this archive cannot be opened by anyone,
# including whoever wrote this script. Supply them in one of three ways above; the
# prompt is silent and nothing is echoed, logged or left in the shell history.
#
# THE ORDER MATTERS, and it is the difference between a restore and an outage.
# Everything that can be checked is checked BEFORE the stack is stopped and before
# a byte of the current data is moved: the archive is verified, the key is proved
# to open it, and the extraction happens into a scratch directory. Only when a
# complete tree exists on disk is anything that currently works touched.
set -euo pipefail
cd "$(dirname "$0")"

log()  { printf '\033[1;34m[restore-archive]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[restore-archive]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[restore-archive]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die "no .env here — run this from the deploy/ directory."

set -a
# shellcheck source=/dev/null
. ./.env
set +a

DATA_DIR="${DATA_DIR:-./data}"
IMAGE="${VAULT_IMAGE:-ghcr.io/oleksandrdubyna88/cred-vault-server:latest}"

ARCHIVE=""
KEY_FILE=""
VERIFY_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --key-file) KEY_FILE="${2:-}"; shift 2 ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    -*) die "unknown option '$1'. See the header of this script." ;;
    *) ARCHIVE="$1"; shift ;;
  esac
done

[[ -n "$ARCHIVE" ]] || die "which archive? Usage: ./restore-archive.sh <archive.cvbk> [--key-file F] [--verify-only]"
[[ -f "$ARCHIVE" ]] || die "'${ARCHIVE}' does not exist"
ARCHIVE="$(realpath "$ARCHIVE")"

# ---- the key, and never on a command line ------------------------------------------------------
# An argument is visible in `ps` to every user on the box and lands in the shell history. A file
# with mode 600 in a tmpfs is not, which is why even the typed form goes through one.
SCRATCH="$(mktemp -d)"
chmod 700 "$SCRATCH"
cleanup() { rm -rf "$SCRATCH"; }
trap cleanup EXIT

RUN_KEY="${SCRATCH}/key"
umask 077
if [[ -n "$KEY_FILE" ]]; then
  [[ -f "$KEY_FILE" ]] || die "the key file '${KEY_FILE}' does not exist"
  cp "$KEY_FILE" "$RUN_KEY"
elif [[ -n "${CVBK_KEY:-}" ]]; then
  printf '%s' "$CVBK_KEY" > "$RUN_KEY"
else
  # -s: nothing is echoed. The words are the whole deployment.
  read -r -s -p "Backup key (BK1-…): " typed
  printf '\n'
  [[ -n "$typed" ]] || die "no key given; nothing was changed"
  printf '%s' "$typed" > "$RUN_KEY"
  unset typed
fi

# The image is what holds the verbs, so the binary that reads the archive is the same build that
# wrote it. Read-only mounts everywhere: verifying must not be able to change anything.
cvbk() {
  docker run --rm \
    -v "$(dirname "$ARCHIVE")":/archive:ro \
    -v "${SCRATCH}":/scratch \
    "$IMAGE" "$@"
}

# ---- everything checkable, before anything is touched -------------------------------------------
log "verifying ${ARCHIVE} — nothing is stopped and nothing is moved yet"
if ! cvbk --verify-archive "/archive/$(basename "$ARCHIVE")" /scratch/key; then
  die "the archive did not verify. Nothing was changed. If the message named the KEY, the words are
       wrong or belong to a different deployment; if it named a chunk or a truncation, this file is
       damaged and another copy is what you want."
fi
log "it verifies, and the key opens it"

RESTORED="${SCRATCH}/tree"
log "extracting to a scratch directory"
cvbk --decrypt-archive "/archive/$(basename "$ARCHIVE")" /scratch/tree /scratch/key >/dev/null

[[ -d "${RESTORED}/vaults" ]] || die "no vaults/ inside the archive; nothing was changed"
VAULTS="$(find "${RESTORED}/vaults" -name '*.bin' | wc -l | tr -d ' ')"
log "it contains ${VAULTS} vault blob(s)"
if [[ "$VAULTS" -eq 0 ]]; then
  die "this archive holds NO vault blobs — restoring it would leave an empty server. Refusing."
fi

# The configuration the archive carries, against the one running here. Printed rather than applied:
# a restore onto a fresh host needs these values, and a restore onto THIS host must not silently
# rewrite an .env somebody has since changed.
SNAPSHOT="${RESTORED}/backup-config-snapshot.env"
if [[ -f "$SNAPSHOT" ]]; then
  log "the archive's configuration differs from this host's in:"
  # Keys only, never values: the snapshot holds the deployment KEK and the local signing key in
  # clear, and this output goes to a terminal, a CI log or somebody's scrollback.
  comm -3 \
    <(grep -oE '^[A-Za-z0-9_]+' "$SNAPSHOT" | sort -u) \
    <(grep -oE '^[A-Za-z0-9_]+' .env | sort -u) \
    | sed 's/^/    /' || true
  warn "the snapshot holds this deployment's SECRETS in clear. It is inside the restored tree at"
  warn "  ${SNAPSHOT}"
  warn "Copy what you need out of it and do not leave it on disk."
fi

if [[ "$VERIFY_ONLY" -eq 1 ]]; then
  log "--verify-only: the archive is good and opens with this key. Nothing was changed."
  exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DISPLACED=""
MARKER="${DATA_DIR}.restore-in-progress"

# BEFORE the stack is stopped, and before the confirmation. A review round found this after the
# `docker compose down`, which meant a retry took the running stack offline and only THEN refused —
# a second outage handed to somebody who was already recovering from the first.
if [[ -f "$MARKER" ]]; then
  warn "a previous restore did not finish. It left:"
  sed 's/^/    /' "$MARKER" >&2
  die "resolve that first — move the displaced directory back over ${DATA_DIR}, or delete it if the
       restore it was interrupted mid-way is one you still want — then remove ${MARKER}.
       Nothing has been stopped and nothing has been moved."
fi

read -r -p "Restore over ${DATA_DIR}? The current data is moved aside, not deleted. [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { log "aborted; nothing was changed"; exit 0; }

# ---- past this line the service is DOWN --------------------------------------------------------

# A DURABLE marker, not only a trap. A trap does not run when the machine loses power or the shell
# is killed, and the state in between — data moved aside, nothing put back — is the one where a
# person coming to this fresh cannot tell what happened. The marker names the displaced directory,
# so finishing or undoing it by hand is reading one file rather than guessing from timestamps.
finish_marker() { rm -f "$MARKER"; }
# Invoked only by the EXIT trap below.
# shellcheck disable=SC2329
rollback() {
  local rc=$?
  cleanup
  [[ $rc -eq 0 ]] && return 0
  warn "restore failed — putting everything back"
  if [[ -n "$DISPLACED" && -d "$DISPLACED" ]]; then
    rm -rf "$DATA_DIR"
    mv "$DISPLACED" "$DATA_DIR"
    warn "original data restored to ${DATA_DIR}"
  fi
  finish_marker
  # Reported rather than swallowed. A rollback that could not restart the stack leaves the operator
  # with data in the right place and nothing serving it, and they have to be TOLD that, not left to
  # discover it from a health check they may not run.
  if ! docker compose up -d >/dev/null 2>&1; then
    warn "the data is back at ${DATA_DIR} and the stack did NOT start again."
    warn "run 'docker compose up -d' here and read its output."
    return "$rc"
  fi
  warn "the stack has been started again; nothing was lost"
  return "$rc"
}
trap rollback EXIT

# NOT '|| true'. If the stack cannot be stopped, moving its data directory out from under a running
# server is how a half-written vault blob and a live process meet — and the script would then report
# a restore it had corrupted.
log "stopping the stack"
if ! docker compose down >/dev/null 2>&1; then
  trap - EXIT
  cleanup
  die "the stack could not be stopped, so nothing was moved. Read 'docker compose down' here: while
       a server is running, moving its data directory is how a half-written blob is produced."
fi

if [[ -d "$DATA_DIR" ]]; then
  DISPLACED="${DATA_DIR}.before-restore-${STAMP}"
  printf 'archive=%s\ndisplaced=%s\ntarget=%s\nstarted=%s\n' \
    "$ARCHIVE" "$DISPLACED" "$DATA_DIR" "$STAMP" > "$MARKER"
  mv "$DATA_DIR" "$DISPLACED"
  log "current data moved to ${DISPLACED}"
fi
mkdir -p "$DATA_DIR"
cp -a "${RESTORED}/." "${DATA_DIR}/"

# The snapshot travels inside the archive so a restore onto a fresh host has the values it needs. It
# must not be LEFT in the data directory: it is the deployment's secrets in plaintext, and the
# server's own startup sweep would delete it anyway, which would be a surprise rather than a plan.
rm -f "${DATA_DIR}/backup-config-snapshot.env"

# The app runs unprivileged; restored files must belong to it.
docker run --rm -v "$(realpath "$DATA_DIR")":/d alpine:3.20 chown -R 10001:10001 /d >/dev/null

log "starting the stack"
docker compose up -d >/dev/null 2>&1

state=starting
for _ in $(seq 1 40); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q vault)" 2>/dev/null || echo starting)"
  [[ "$state" == "healthy" ]] && break
  sleep 2
done

if [[ "$state" == "healthy" ]]; then
  trap - EXIT
  finish_marker
  cleanup
  log "restored and healthy. ${VAULTS} vault(s) are back."
  log "if this was the wrong archive: docker compose down && rm -rf ${DATA_DIR} && mv ${DISPLACED} ${DATA_DIR}"
  exit 0
fi

warn "the stack did not become healthy after the restore:"
docker compose logs --tail 30 vault >&2
die "restore did not converge. The previous data is still at ${DISPLACED}"
