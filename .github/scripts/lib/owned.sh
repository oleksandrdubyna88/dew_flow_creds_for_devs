# shellcheck shell=bash
# SC2329: the functions of a sourced library are used by the scripts that source it.
# shellcheck disable=SC2329
# owned.sh - the claim-first bash helper of this repository (rule common/test-leftovers.md, sections 1 to 4).
#
# Source it, never run it:   source "$here/lib/owned.sh"
#
# It gives a script ONE owned folder. The name is testsToDelete-<owner>-creds-<what>-<8 hex>. The order is the rule's:
#   1. CLAIM  - write the owner record to <folder>.owner with an exclusive create. A claim that is already there is
#               somebody else's: draw another id (three draws at most).
#   2. REGISTER - keep the entry and set the traps (the first call of the script).
#   3. CREATE - make the folder with mkdir, which fails on an existing folder. A folder that is already there is
#               never adopted and never removed: warn once, drop the own claim, draw again.
# The folder is removed on every exit path by its exact name, never by the prefix. A kill with signal 9 runs no trap:
# it leaves the claim (and maybe the folder) with a dead pid, and the next sweep of the rule collects it.
#
# Use in a script:
#   set -euo pipefail
#   source "$here/lib/owned.sh"
#   owned_dir work smoke-test || exit 1         # $work is the folder; the traps are set by this call
# A script with a clean-up of its own sets it with `owned_trap my_cleanup` BEFORE its first owned_dir. It must never
# use `trap` of its own for EXIT, INT, TERM or HUP: that would replace the traps of this helper.
# Call owned_dir in the shell of the script, never in a subshell, a command substitution, a pipeline or `&`.
#
# What the file reads: TMPDIR (the root; no value means /tmp), WSL_DISTRO_NAME, OWNED_KEEP (1: make and claim the
# folder, but do not remove it at exit), PATH (node, on Windows only). Test seams, unset in a real run:
# OWNED_HOOK_AFTER_CLAIM (a function that runs after the claim and before the mkdir, with the drawn path as $1),
# OWNED_TEST_IDS (ids to draw in order, instead of random ones) and owned_create_dir (a test may define it again).
# It does NOT read TESTSTODELETE_RUN or TESTSTODELETE_OWNER (decided in the plan: a limit, not a feature).
#
# bash 3.2 or later. No set -e, set -u or set -o pipefail of its own, and it works under a caller that has them. It uses
# no associative array, no mapfile, no stat, no touch -d. Functions return; only owned_exit_chain and owned_signal
# end the script, as the caller's own exit would.

# The token of this repository: the ONLY place it is written (rule section 1; the guard reads the name). OWNED_REPO is the same text for the patterns
# below. Sourcing this file sets REPO_TOKEN and so overwrites a REPO_TOKEN of the caller: a caller must not use that name.
REPO_TOKEN="creds"; OWNED_REPO="$REPO_TOKEN"

# The state is set once. A second source of this file in the same shell keeps what the first one registered.
if [ -z "${OWNED_LOADED:-}" ]; then
  OWNED_LOADED=1
  OWNED_TOKEN=""
  OWNED_OWNER=""
  OWNED_UNAME=""
  OWNED_TRAP_SET=""
  OWNED_CALLER_FN=""
  OWNED_BUSY=0
  OWNED_PENDING=""
  OWNED_SEAM_HOOK_SAID=""
  OWNED_SEAM_IDS_SAID=""
  OWNED_PATHS=()
  OWNED_STATES=()
  OWNED_TEXTS=()
fi
OWNED_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

owned_say() { printf 'owned: %s\n' "$*" >&2; }

owned_uname() {
  if [ -z "$OWNED_UNAME" ]; then OWNED_UNAME="$(uname -s)"; fi
}

# owned_token: print the owner token of the caller and keep it in OWNED_TOKEN.
# Linux and macOS: u<uid>, no child process. Git for Windows: ONE node child per script that asks the shared
# reference (owned.mjs, thisOwnerToken) - so the token is the one every other reader computes.
owned_token() {
  if [ -n "$OWNED_TOKEN" ]; then printf '%s\n' "$OWNED_TOKEN"; return 0; fi
  owned_uname
  case "$OWNED_UNAME" in
    MINGW* | MSYS* | CYGWIN*)
      local dir why="" token="" re='^w[0-9]{1,10}$'
      if ! command -v node > /dev/null 2>&1; then
        why="node is not on PATH"
      else
        dir="$(cd "$OWNED_HERE/../../../.claude/rules/shared/tools/lib" 2> /dev/null && { pwd -W 2> /dev/null || pwd; })"
        if [ -z "$dir" ] || [ ! -f "$dir/owned.mjs" ]; then
          why="the shared rules are not mounted"
        else
          # An empty TESTSTODELETE_OWNER is no value, so the override the reference could read is never read.
          if token="$(TESTSTODELETE_OWNER='' LIB_DIR="$dir" node --input-type=module -e "import url from 'node:url'; import path from 'node:path'; const m = await import(url.pathToFileURL(path.join(process.env.LIB_DIR, 'owned.mjs')).href); process.stdout.write(m.thisOwnerToken());" 2> /dev/null)"; then
            [[ "$token" =~ $re ]] || why="the answer '$token' is not an owner token"
          else
            why="node failed"
          fi
        fi
      fi
      if [ -n "$why" ]; then owned_say "cannot learn the owner token ($why) — nothing is made"; return 1; fi
      OWNED_TOKEN="$token"
      ;;
    *)
      OWNED_TOKEN="u${UID:-$(id -u)}"
      ;;
  esac
  printf '%s\n' "$OWNED_TOKEN"
}

# owned_norm <text>: each run of '@', ':' or white space becomes ONE '-' (nothing is trimmed, the case is kept).
# The result is in OWNED_NORM. The same rule as owned.mjs hostName.
owned_norm() {
  local s="$1" out="" c i=0 gap=0
  while [ "$i" -lt "${#s}" ]; do
    c="${s:$i:1}"
    if [[ "$c" == [@:[:space:]] ]]; then
      if [ "$gap" = 0 ]; then out="$out-"; gap=1; fi
    else
      out="$out$c"; gap=0
    fi
    i=$((i + 1))
  done
  OWNED_NORM="$out"
}

# owned_owner: print the owner record <token>:<host>@<os>:<pid>[:<start>:<ns>] and keep it in OWNED_OWNER.
# <start> and <ns> are written on Linux only, and both or none (the record stays judgeable as unknown, never wrong).
owned_owner() {
  if [ -n "$OWNED_OWNER" ]; then printf '%s\n' "$OWNED_OWNER"; return 0; fi
  owned_token > /dev/null || return 1
  local os host wsl pid rec line rest btime k v tick nsl start="" ns="" re_num='^[0-9]+$' re_pos='^[1-9][0-9]*$' re_ns='^pid:\[([0-9]+)\]$'
  local -a words
  case "$OWNED_UNAME" in
    Linux) os=linux ;;
    Darwin) os=macos ;;
    MINGW* | MSYS* | CYGWIN*) os=windows ;;
    *) owned_say "no owner record for the system '$OWNED_UNAME'"; return 1 ;;
  esac
  if ! host="$(hostname)" || [ -z "$host" ]; then owned_say "cannot read the host name"; return 1; fi
  owned_norm "$host"; host="$OWNED_NORM"
  wsl="${WSL_DISTRO_NAME:-}"
  if [ -n "${wsl//[[:space:]]/}" ]; then owned_norm "$wsl"; host="$host~$OWNED_NORM"; fi
  pid="$$"
  if [ "$os" = windows ]; then
    if ! IFS= read -r pid < "/proc/$$/winpid" 2> /dev/null || [ -z "$pid" ]; then owned_say "cannot read the Windows pid of this shell"; return 1; fi
  fi
  rec="$OWNED_TOKEN:$host@$os:$pid"
  if [ "$os" = linux ]; then
    # Field 22 of /proc/<pid>/stat is the 20th word AFTER THE LAST ')' (a command name may hold spaces and ')').
    if IFS= read -r line < "/proc/$$/stat" 2> /dev/null; then
      rest="${line##*)}"
      # shellcheck disable=SC2206
      words=($rest) # word splitting is wanted: the stat fields are separated by one space
      btime=""
      while IFS=' ' read -r k v; do
        if [ "$k" = btime ]; then btime="$v"; break; fi
      done < /proc/stat
      tick="$(getconf CLK_TCK 2> /dev/null)" || tick=""
      nsl="$(readlink /proc/self/ns/pid 2> /dev/null)" || nsl=""
      if [ "${#words[@]}" -ge 20 ] && [[ "${words[19]}" =~ $re_num ]] && [[ "$btime" =~ $re_num ]] && [[ "$tick" =~ $re_pos ]] \
        && [[ "$nsl" =~ $re_ns ]]; then
        ns="${BASH_REMATCH[1]}"
        start=$((10#$btime + 10#${words[19]} / 10#$tick))
        rec="$rec:$start:$ns"
      fi
    fi
  fi
  if [ "${#rec}" -gt 500 ]; then owned_say "the owner record is too long (${#rec} characters)"; return 1; fi
  OWNED_OWNER="$rec"
  printf '%s\n' "$OWNED_OWNER"
}

# --- the traps ---------------------------------------------------------------------------------------------------------

owned_install_traps() {
  trap owned_exit_chain EXIT
  trap 'owned_signal INT' INT
  trap 'owned_signal TERM' TERM
  trap 'owned_signal HUP' HUP
  OWNED_TRAP_SET=1
}

# owned_trap <function>: the ONE way a caller sets its own clean-up. The function runs at exit, then owned_cleanup.
owned_trap() {
  local fn="${1-}"
  if [ -z "$fn" ] || ! declare -F "$fn" > /dev/null 2>&1; then owned_say "owned_trap needs the name of a defined function, got '$fn'"; return 1; fi
  OWNED_CALLER_FN="$fn"
  owned_install_traps
}

# owned_exit_chain: the EXIT trap. The caller's function, then owned_cleanup, whatever either returns; the script
# ends with the status it had (C2).
owned_exit_chain() {
  local rc=$?
  # A signal that comes now is only recorded (owned_signal): the status is the first one's, and the cleanup is not cut short.
  OWNED_BUSY=1
  # set +eu: the caller's own options (set -e, set -u) must not end the chain. The function runs in a subshell, so an
  # `exit` in it, or an unbound variable, ends only the subshell and owned_cleanup still runs.
  set +eu
  if [ -n "$OWNED_CALLER_FN" ]; then ( "$OWNED_CALLER_FN" ) || true; fi
  owned_cleanup || true
  exit "$rc"
}

# owned_signal <sig>: the INT, TERM and HUP trap. While owned_dir works (OWNED_BUSY=1) it only records the signal;
# owned_dir raises it after the state of the entry is recorded (C1). Otherwise it ends the script with 128 + n, so the
# EXIT chain runs once.
owned_signal() {
  local n
  case "${1-}" in INT) n=2 ;; HUP) n=1 ;; *) n=15 ;; esac
  if [ "$OWNED_BUSY" = 1 ]; then
    if [ -z "$OWNED_PENDING" ]; then OWNED_PENDING="${1-TERM}"; fi
    return 0
  fi
  exit $((128 + n))
}

# --- the claim ---------------------------------------------------------------------------------------------------------

# owned_holds <file> <text>: is <file> a regular file (not a link) of exactly ONE line equal to <text>?
owned_holds() {
  local line="" extra=""
  if [ ! -f "$1" ] || [ -L "$1" ]; then return 1; fi
  { IFS= read -r line && ! IFS= read -r extra; } < "$1" 2> /dev/null || return 1
  [ "$line" = "$2" ]
}

# owned_claim <dir>: write the claim <dir>.owner. Returns 0: written and read back; 2: the name is taken (draw again);
# 1: another error (nothing was written).
owned_claim() {
  local p="$1.owner"
  if [ -e "$p" ] || [ -L "$p" ]; then return 2; fi
  # noclobber refuses only an existing REGULAR file, so the pre-check above and the read-back below close the rest.
  if ! ( set -o noclobber; printf '%s\n' "$OWNED_OWNER" > "$p" ) 2> /dev/null; then
    if [ -e "$p" ] || [ -L "$p" ]; then return 2; fi
    return 1
  fi
  # A link to /dev/null or a device is not ours: it is never removed, draw again.
  if owned_holds "$p" "$OWNED_OWNER"; then return 0; fi
  return 2
}

# owned_unclaim <index>: remove the claim of an entry, only while it still holds what this run wrote.
owned_unclaim() {
  local d="${OWNED_PATHS[$1]}"
  if owned_holds "$d.owner" "${OWNED_TEXTS[$1]}"; then rm -f -- "$d.owner" 2> /dev/null || true; fi
}

# owned_create_dir <dir>: the one place the folder is made. mkdir fails on an existing path.
# Where perl exists its mkdir is used: the kernel's own exclusive create. The plain mkdir of uutils coreutils is not always exclusive in a
# race (measured: two racing calls both succeeded). Without perl, on uutils, that limit stays (the claim is exclusive in any case).
owned_create_dir() {
  if command -v perl > /dev/null 2>&1; then
    perl -e 'mkdir $ARGV[0] or exit 1' "$1" 2> /dev/null
  else
    mkdir -- "$1" 2> /dev/null
  fi
}

# owned_leave: end of the busy window of owned_dir; a signal that came meanwhile is raised now.
owned_leave() {
  local sig="$OWNED_PENDING"
  OWNED_BUSY=0
  if [ -n "$sig" ]; then
    OWNED_PENDING=""
    owned_signal "$sig"
  fi
}

owned_next_id() { # sets OWNED_ID
  local ids="${OWNED_TEST_IDS:-}"
  if [ -n "$ids" ]; then
    OWNED_ID="${ids%% *}"
    ids="${ids#"$OWNED_ID"}"
    OWNED_TEST_IDS="${ids# }"
  else
    printf -v OWNED_ID '%04x%04x' "$RANDOM" "$RANDOM"
  fi
}

# owned_dir <var> <what>: set <var> to a new owned folder. Returns 0 with the variable set; else 1, variable untouched.
owned_dir() {
  local var="${1-}" what="${2-}" root dir i draws=0 rc re_var='^[A-Za-z_][A-Za-z0-9_]*$'
  if ! [[ "$var" =~ $re_var ]]; then owned_say "owned_dir: '$var' is not a variable name"; return 1; fi
  if [ -z "$what" ] || [[ "$what" == *[/\\]* ]] || [[ "$what" == *[[:cntrl:]]* ]] || [ "${what#-}" != "$what" ] || [ "${#what}" -gt 22 ]; then
    owned_say "owned_dir: '$what' is not a good name part (not empty, no / or \\ or control character, no leading -, at most 22 characters)"
    return 1
  fi
  owned_token > /dev/null || return 1
  owned_owner > /dev/null || return 1
  root="${TMPDIR:-/tmp}"
  while [ "${root%/}" != "$root" ]; do root="${root%/}"; done
  # A relative root would break the cleanup after a `cd`: the root is made absolute here, once.
  case "$root" in
    /*) ;;
    *) if ! root="$(cd "${root:-.}" 2> /dev/null && pwd)" || [ -z "$root" ]; then owned_say "owned_dir: the temp root '${TMPDIR:-/tmp}' cannot be entered"; return 1; fi ;;
  esac
  # The seams are named on stderr, once each, so nobody takes a test run for a real one.
  if [ -n "${OWNED_HOOK_AFTER_CLAIM:-}" ] && [ -z "$OWNED_SEAM_HOOK_SAID" ]; then OWNED_SEAM_HOOK_SAID=1; owned_say "test seam OWNED_HOOK_AFTER_CLAIM is set"; fi
  if [ -n "${OWNED_TEST_IDS:-}" ] && [ -z "$OWNED_SEAM_IDS_SAID" ]; then OWNED_SEAM_IDS_SAID=1; owned_say "test seam OWNED_TEST_IDS is set"; fi
  # The traps are set BEFORE the first claim is written (a signal right after the write must find them).
  if [ -z "$OWNED_TRAP_SET" ]; then owned_install_traps; fi
  while [ "$draws" -lt 3 ]; do
    draws=$((draws + 1))
    owned_next_id
    dir="$root/testsToDelete-${OWNED_TOKEN}-${OWNED_REPO}-${what}-${OWNED_ID}"
    OWNED_BUSY=1
    # 1. CLAIM
    owned_claim "$dir" && rc=0 || rc=$?
    if [ "$rc" = 2 ]; then owned_leave; continue; fi
    if [ "$rc" != 0 ]; then
      owned_leave
      owned_say "cannot write the claim $dir.owner"
      return 1
    fi
    # 2. REGISTER
    i="${#OWNED_PATHS[@]}"
    OWNED_PATHS[$i]="$dir"
    OWNED_STATES[$i]="claimed"
    OWNED_TEXTS[$i]="$OWNED_OWNER"
    if [ -n "${OWNED_HOOK_AFTER_CLAIM:-}" ]; then "$OWNED_HOOK_AFTER_CLAIM" "$dir" || true; fi
    # 3. CREATE
    owned_create_dir "$dir" && rc=0 || rc=$?
    if [ "$rc" = 0 ]; then
      if [ "${OWNED_KEEP:-}" = 1 ]; then OWNED_STATES[$i]="kept"; else OWNED_STATES[$i]="created"; fi
      owned_leave
      printf -v "$var" '%s' "$dir"
      return 0
    fi
    if [ -e "$dir" ] || [ -L "$dir" ]; then
      owned_say "the name $dir is already used by something that is not ours: left as it is, another name is drawn"
      owned_unclaim "$i"
      OWNED_STATES[$i]="released"
      owned_leave
      continue
    fi
    owned_unclaim "$i"
    OWNED_STATES[$i]="released"
    owned_leave
    owned_say "cannot make the folder $dir"
    return 1
  done
  owned_say "no free name for '$what' after 3 draws"
  return 1
}

# --- the removal -------------------------------------------------------------------------------------------------------

# owned_remove_at <index>: five tries 0.1 s apart. Returns 0 (also when it gives up, with one line).
owned_remove_at() {
  local d="${OWNED_PATHS[$1]}" tries=0
  while [ "$tries" -lt 5 ]; do
    rm -rf -- "$d" 2> /dev/null || true
    if [ ! -e "$d" ] && [ ! -L "$d" ]; then
      rm -f -- "$d.owner" 2> /dev/null || true
      OWNED_STATES[$1]="released"
      return 0
    fi
    tries=$((tries + 1))
    if [ "$tries" -lt 5 ]; then sleep 0.1; fi
  done
  owned_say "could not remove $d - it stays prefixed and claimed for the next sweep"
  return 0
}

# owned_remove <dir>: remove a folder THIS RUN made and registered (state created or kept) while its claim still holds
# what this run wrote. Anything else is one line and return 1, nothing touched (C3).
owned_remove() {
  local dir="${1-}" i n found=-1 base
  if [ -z "$dir" ]; then owned_say "owned_remove needs a path"; return 1; fi
  n="${#OWNED_PATHS[@]}"
  i=0
  while [ "$i" -lt "$n" ]; do
    if [ "${OWNED_PATHS[$i]}" = "$dir" ] && { [ "${OWNED_STATES[$i]}" = created ] || [ "${OWNED_STATES[$i]}" = kept ]; }; then found="$i"; fi
    i=$((i + 1))
  done
  if [ "$found" -lt 0 ]; then
    owned_say "owned_remove: $dir is not a folder this run made and still owns - not touched"
    return 1
  fi
  base="${dir##*/}"
  case "$base" in
    "testsToDelete-${OWNED_TOKEN}-${OWNED_REPO}-"?*) ;;
    *) owned_say "owned_remove: $dir does not have the name of this owner - not touched"; return 1 ;;
  esac
  if ! owned_holds "$dir.owner" "${OWNED_TEXTS[$found]}"; then
    owned_say "owned_remove: the claim of $dir is not what this run wrote - not touched"
    return 1
  fi
  owned_remove_at "$found"
}

# owned_cleanup: last entry first. A created folder is removed; a claim without a folder is removed while it is ours;
# a released or kept entry is left. Safe to call twice.
owned_cleanup() {
  local i="${#OWNED_PATHS[@]}"
  while [ "$i" -gt 0 ]; do
    i=$((i - 1))
    case "${OWNED_STATES[$i]}" in
      created)
        if owned_holds "${OWNED_PATHS[$i]}.owner" "${OWNED_TEXTS[$i]}"; then
          owned_remove_at "$i"
        else
          owned_say "the claim of ${OWNED_PATHS[$i]} is not what this run wrote - the folder is left"
          OWNED_STATES[$i]="released"
        fi
        ;;
      claimed)
        owned_unclaim "$i"
        OWNED_STATES[$i]="released"
        ;;
    esac
  done
  return 0
}
