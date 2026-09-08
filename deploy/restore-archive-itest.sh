#!/usr/bin/env bash
# Drives deploy/restore-archive.sh end to end, with `docker` replaced by a shim.
#
#   ./deploy/restore-archive-itest.sh
#
# WHAT THIS IS AND IS NOT. It is not the live-stack rehearsal: no image is pulled, no server runs,
# and nothing here proves that a real archive from a real deployment restores onto a real host. That
# rehearsal is a person's, it is named as open in research/module_deployment.md, and this harness
# does not replace it.
#
# What it IS: the script's own decisions, exercised as a program rather than read. The ORDER it does
# things in is the whole design — verify before stopping, refuse before moving, roll back on any
# failure past the point of no return — and the order is exactly what reading cannot check. The
# review round found the marker check sitting AFTER `docker compose down`, so a retry took the
# running stack offline before refusing; that is a two-line defect no amount of shellcheck sees, and
# scenario 4 below is now the thing that would have caught it.
#
# The shim records every docker invocation, so an assertion can say "the stack was never stopped"
# rather than "the script printed something reassuring".
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${HERE}/restore-archive.sh"
FAILS=0

pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; [[ -n "${2:-}" ]] && printf '      %s\n' "$2"; FAILS=$((FAILS + 1)); }
check() { if [[ "$2" == "yes" ]]; then pass "$1"; else fail "$1" "${3:-}"; fi }
yesno() { if "$@" >/dev/null 2>&1; then echo yes; else echo no; fi }

# ---- a world: a deploy/ directory, a fake archive, and a docker on PATH that we control ---------
world() {
  WORLD="$(mktemp -d)"
  mkdir -p "${WORLD}/deploy" "${WORLD}/bin"
  cp "$SCRIPT" "${WORLD}/deploy/restore-archive.sh"
  chmod +x "${WORLD}/deploy/restore-archive.sh"
  printf 'DATA_DIR=./data\nVAULT_IMAGE=vault:test\n' > "${WORLD}/deploy/.env"
  mkdir -p "${WORLD}/deploy/data/vaults"
  printf 'the vault that is here now' > "${WORLD}/deploy/data/vaults/alice.bin"
  printf 'CVBK-not-really' > "${WORLD}/archive.cvbk"
  DOCKER_LOG="${WORLD}/docker.log"
  : > "$DOCKER_LOG"
  # Knobs the scenarios turn. The shim reads them from files rather than the environment, because
  # the script under test is a child process and these have to be readable from inside it.
  printf '0' > "${WORLD}/verify-rc"
  printf '0' > "${WORLD}/down-rc"
  printf 'healthy' > "${WORLD}/health"
  write_shim
  PATH="${WORLD}/bin:${PATH}"
  export PATH
}

write_shim() {
  cat > "${WORLD}/bin/docker" <<'SHIM'
#!/usr/bin/env bash
# A docker that writes down what it was asked and answers from the knob files beside it.
WORLD="$(dirname "$(dirname "$0")")"
printf '%s\n' "$*" >> "${WORLD}/docker.log"

case "$1 $2" in
  "compose down")
    exit "$(cat "${WORLD}/down-rc")" ;;
  "compose up")
    exit 0 ;;
  "compose ps")
    echo "container-id-1"; exit 0 ;;
esac

if [[ "$1" == "inspect" ]]; then
  cat "${WORLD}/health"
  exit 0
fi

if [[ "$1" == "run" ]]; then
  # The scratch directory is on the command line as `-v <host>:/scratch`; find it so the shim can
  # write where the real binary would have written.
  scratch=""
  prev=""
  for arg in "$@"; do
    [[ "$prev" == "-v" && "$arg" == *":/scratch" ]] && scratch="${arg%:/scratch}"
    prev="$arg"
  done
  for arg in "$@"; do
    case "$arg" in
      --verify-archive)
        rc="$(cat "${WORLD}/verify-rc")"
        [[ "$rc" != "0" ]] && echo "the key does not open this archive" >&2
        exit "$rc" ;;
      --decrypt-archive)
        # What a real decrypt produces: the tree, its vaults, and the plaintext config snapshot.
        mkdir -p "${scratch}/tree/vaults" "${scratch}/tree/org/backup"
        printf 'the vault from the archive' > "${scratch}/tree/vaults/alice.bin"
        printf 'Vault__LoginKey__Kek=SECRETVALUE\nVault__DataDir=/data\n' \
          > "${scratch}/tree/backup-config-snapshot.env"
        exit 0 ;;
    esac
  done
  # chown, and anything else.
  exit 0
fi
exit 0
SHIM
  chmod +x "${WORLD}/bin/docker"
}

run_restore() {
  (cd "${WORLD}/deploy" && printf 'y\n' | ./restore-archive.sh "${WORLD}/archive.cvbk" \
    --key-file "${WORLD}/key.txt" "$@" 2>&1)
}

key() { printf 'BK1-00000-00000-00000-00000-00000-00000-XXXX' > "${WORLD}/key.txt"; }

# ================================================================================================
printf '\nrestore-archive.sh, driven as a program (docker is a shim)\n\n'

# ---- 1. the arguments --------------------------------------------------------------------------
world; key
out="$(cd "${WORLD}/deploy" && ./restore-archive.sh 2>&1)"
check "no archive named: refused with the usage" \
  "$(yesno grep -q 'which archive' <<<"$out")" "$out"
out="$(cd "${WORLD}/deploy" && ./restore-archive.sh /nope.cvbk --key-file "${WORLD}/key.txt" 2>&1)"
check "an archive that does not exist: refused by name" \
  "$(yesno grep -q 'does not exist' <<<"$out")" "$out"
check "...and nothing was asked of docker" \
  "$(yesno test ! -s "$DOCKER_LOG")" "$(cat "$DOCKER_LOG")"

# ---- 2. --verify-only changes nothing -----------------------------------------------------------
world; key
out="$(run_restore --verify-only)"
check "--verify-only says the archive is good" "$(yesno grep -q 'the archive is good' <<<"$out")" "$out"
check "...and the stack was never stopped" \
  "$(yesno grep -qv 'compose down' "$DOCKER_LOG")" "$(cat "$DOCKER_LOG")"
check "...and the live data is untouched" \
  "$(yesno grep -qx 'the vault that is here now' "${WORLD}/deploy/data/vaults/alice.bin")"

# ---- 3. a key that does not open it: refused BEFORE anything is touched --------------------------
world; key
printf '1' > "${WORLD}/verify-rc"
out="$(run_restore)"
check "a key that does not open the archive is refused" \
  "$(yesno grep -q 'did not verify' <<<"$out")" "$out"
check "...before the stack was stopped" \
  "$(yesno bash -c "! grep -q 'compose down' '$DOCKER_LOG'")" "$(cat "$DOCKER_LOG")"
check "...and the live data is still there" \
  "$(yesno test -f "${WORLD}/deploy/data/vaults/alice.bin")"

# ---- 4. an unfinished restore refuses BEFORE the stack is stopped (the review round's finding) ---
world; key
printf 'archive=old\ndisplaced=./data.before-restore-X\n' > "${WORLD}/deploy/data.restore-in-progress"
out="$(run_restore)"
check "an unfinished restore is refused" \
  "$(yesno grep -q 'previous restore did not finish' <<<"$out")" "$out"
check "...and it says nothing was stopped or moved" \
  "$(yesno grep -q 'Nothing has been stopped' <<<"$out")" "$out"
check "...and it really was not: no 'compose down' reached docker" \
  "$(yesno bash -c "! grep -q 'compose down' '$DOCKER_LOG'")" "$(cat "$DOCKER_LOG")"

# ---- 5. a stack that will not stop: nothing is moved --------------------------------------------
world; key
printf '1' > "${WORLD}/down-rc"
out="$(run_restore)"
check "a stack that will not stop refuses the restore" \
  "$(yesno grep -q 'could not be stopped' <<<"$out")" "$out"
check "...and the data directory was NOT moved out from under a live server" \
  "$(yesno test -f "${WORLD}/deploy/data/vaults/alice.bin")"

# ---- 6. the happy path --------------------------------------------------------------------------
world; key
out="$(run_restore)"
check "a good restore reports itself healthy" "$(yesno grep -q 'restored and healthy' <<<"$out")" "$out"
check "...the archive's vault is in place" \
  "$(yesno grep -qx 'the vault from the archive' "${WORLD}/deploy/data/vaults/alice.bin")"
check "...the previous data was moved aside, not deleted" \
  "$(yesno bash -c "ls -d '${WORLD}/deploy/data.before-restore-'* >/dev/null")"
check "...the in-progress marker is gone" \
  "$(yesno test ! -f "${WORLD}/deploy/data.restore-in-progress")"
check "...the plaintext config snapshot is NOT left in the data directory" \
  "$(yesno test ! -f "${WORLD}/deploy/data/backup-config-snapshot.env")"
check "...and its SECRET was never printed" \
  "$(yesno bash -c "! grep -q 'SECRETVALUE' <<<\"\$(cat <<'EOF'
$out
EOF
)\"")" "$out"

# ---- 7. a stack that never becomes healthy: rolled back -----------------------------------------
world; key
printf 'starting' > "${WORLD}/health"
out="$(run_restore)"
check "a stack that never becomes healthy fails the restore" \
  "$(yesno grep -q 'did not converge' <<<"$out")" "$out"
check "...the original data is back where it was" \
  "$(yesno grep -qx 'the vault that is here now' "${WORLD}/deploy/data/vaults/alice.bin")" \
  "$(cat "${WORLD}/deploy/data/vaults/alice.bin" 2>/dev/null)"
check "...and the marker was cleared, so a retry is not refused" \
  "$(yesno test ! -f "${WORLD}/deploy/data.restore-in-progress")"

printf '\n'
if [[ "$FAILS" -eq 0 ]]; then
  printf 'all checks passed\n'
  exit 0
fi
printf '%d check(s) failed\n' "$FAILS"
exit 1
