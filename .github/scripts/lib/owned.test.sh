#!/usr/bin/env bash
# The self-test of owned.sh, the claim-first bash helper (rule common/test-leftovers.md section 2). It runs on Linux, on
# macOS with /bin/bash (3.2) and on Git for Windows' bash, from ci-clients.yml, and by hand:
#
#   .github/scripts/lib/owned.test.sh
#
# Every case runs the helper in a REAL child bash process (a script file written under the private root), waits for it
# with `wait`, and reads the folder only after the child is gone. The test makes its own private root with the helper
# under test; each case has its own temp root below it, so a root listing shows only what that case made.
#
# Spec: todo/PLAN_test_leftovers_E2.4_S1_spec.md (section 6, T1 to T21). RED today: no owned.sh, so the source line
# fails. The by-hand REDs of the spec are done with T_OWNED_SH: it names a changed copy of the helper.
#
# The janitor and the Node sweep of the shared rules also read this checkout's worktrees and branches and, where docker
# answers, its containers, volumes and networks. Before each run the test asserts that none of them has a name of the
# owner form with the creds token, so the only entries they can act on are in the private roots made here.
# SC2329: test_cleanup runs through owned_trap. SC2016: the child scripts are in single quotes on purpose. SC2015: ok never fails.
# SC2012: ls -A only counts names of folders this test made.
# shellcheck disable=SC2329,SC2016,SC2015,SC2012
set -o pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
T_OWNED="${T_OWNED_SH:-$here/owned.sh}"
janitor="$repo/.claude/rules/shared/tools/janitor.sh"
mount_lib="$repo/.claude/rules/shared/tools/lib"

# T21: say which bash this leg runs. On macOS it must be /bin/bash 3.2, not Homebrew's bash 5.
echo "bash: $BASH_VERSION"
echo "BASH: $BASH"
echo "uname -s: $(uname -s)"
case "$(uname -s)" in
  Linux) osclass=linux ;;
  Darwin) osclass=macos ;;
  MINGW* | MSYS* | CYGWIN*) osclass=windows ;;
  *) osclass=other ;;
esac

PASS=0
FAILN=0
ok() { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAILN=$((FAILN + 1)); echo "FAIL $1: $2"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected [$3], got [$2]"; fi; }
istrue() { local label="$1"; shift; if "$@"; then ok "$label"; else bad "$label" "condition false: $*"; fi; }
isfalse() { local label="$1"; shift; if "$@"; then bad "$label" "condition true: $*"; else ok "$label"; fi; }
# A premise that does not hold is a failure with its own name; the case stops (return 1 to the caller).
premise() { local label="$1"; shift; if "$@"; then return 0; fi; bad "PREMISE $label" "did not hold: $*"; return 1; }
skipped() { echo "skip $1: $2"; }

# T21 asserts
if [ "$osclass" = macos ]; then
  case "$BASH_VERSION" in 3.2*) ok "T21 macOS bash is 3.2" ;; *) bad "T21 macOS bash is 3.2" "BASH_VERSION is $BASH_VERSION" ;; esac
  eq "T21 macOS BASH is /bin/bash" "$BASH" "/bin/bash"
else
  ok "T21 bash version printed ($BASH_VERSION)"
fi

# The helpers read these two when they are set (the janitor and the Windows node child): the self-test runs without them.
unset TESTSTODELETE_OWNER TESTSTODELETE_RUN
if [ -z "${TESTSTODELETE_OWNER+x}" ] && [ -z "${TESTSTODELETE_RUN+x}" ]; then ok "TESTSTODELETE_OWNER and TESTSTODELETE_RUN are unset"; else bad "env" "still set"; fi

# shellcheck source-path=SCRIPTDIR
# shellcheck source=owned.sh
source "$T_OWNED" || { echo "FAIL cannot source $T_OWNED" >&2; exit 1; }

CHILD_PIDS=()
test_cleanup() {
  local p
  if [ "${#CHILD_PIDS[@]}" -gt 0 ]; then
    for p in "${CHILD_PIDS[@]}"; do kill -9 "$p" 2>/dev/null || true; done
  fi
}
owned_trap test_cleanup
owned_dir ROOT selftest || { echo "FAIL owned_dir cannot make the private root" >&2; exit 1; }
re_root='^testsToDelete-[uw][0-9]{1,10}-creds-selftest-[0-9a-f]{8}$'
[[ "${ROOT##*/}" =~ $re_root ]] && ok "the private root has the owner-form name (${ROOT##*/})" || bad "private root name" "${ROOT##*/}"
istrue "the private root exists" test -d "$ROOT"
istrue "the private root's claim exists" test -f "$ROOT.owner"
owned_token > /dev/null
TOK="$OWNED_TOKEN"

CTL="$ROOT/ctl"
SCRIPTS="$ROOT/scripts"
mkdir "$CTL" "$SCRIPTS"
cat > "$SCRIPTS/prelude.sh" << 'EOF'
# hold: wait for a stop file in short steps, so a trapped signal is handled within a tenth of a second
hold() { local n=0; while [ ! -e "$1" ] && [ "$n" -lt 600 ]; do sleep 0.1; n=$((n + 1)); done; }
EOF

native() { (cd "$1" 2>/dev/null && { pwd -W 2>/dev/null || pwd; }); }
lib_native="$(native "$mount_lib")"
repo_native="$(native "$repo")"
NJS_PRE="import url from 'node:url'; import path from 'node:path'; const lib = (n) => import(url.pathToFileURL(path.join(process.env.LIB_DIR, n)).href);"
njs() { LIB_DIR="$lib_native" TESTSTODELETE_OWNER= TESTSTODELETE_RUN= node --input-type=module -e "$NJS_PRE $1"; }

# --- the harness -------------------------------------------------------------------------------------------------------
CR=""
case_root() { CR="$ROOT/$1"; mkdir "$CR"; }
entries() { ls -A "$1" | sort | tr '\n' ' '; }
count() { echo $(($(ls -A "$1" | wc -l))); }
# child <name>: body from stdin becomes $SCRIPTS/<name>.sh
child() { { echo '. "$T_PRELUDE"'; cat; } > "$SCRIPTS/$1.sh"; }
# run_child <name> [VAR=value ...]: a real bash, waited for. Sets CH_RC, CH_PID, files $CTL/<name>.out and .err
run_child() {
  local name="$1"; shift
  env "$@" TMPDIR="$CR" T_CTL="$CTL" T_OWNED_SH="$T_OWNED" T_PRELUDE="$SCRIPTS/prelude.sh" CR="$CR" "$BASH" "$SCRIPTS/$name.sh" > "$CTL/$name.out" 2> "$CTL/$name.err" &
  CH_PID=$!
  CHILD_PIDS+=("$CH_PID")
  { wait "$CH_PID"; } 2> /dev/null
  CH_RC=$?
}
# start_child <name> [VAR=value ...]: the same, not waited for. Sets CH_PID.
start_child() {
  local name="$1"; shift
  env "$@" TMPDIR="$CR" T_CTL="$CTL" T_OWNED_SH="$T_OWNED" T_PRELUDE="$SCRIPTS/prelude.sh" CR="$CR" "$BASH" "$SCRIPTS/$name.sh" > "$CTL/$name.out" 2> "$CTL/$name.err" &
  CH_PID=$!
  CHILD_PIDS+=("$CH_PID")
}
await_file() { local n=0; while [ ! -e "$1" ] && [ "$n" -lt 150 ]; do sleep 0.1; n=$((n + 1)); done; [ -e "$1" ]; }
lines_of() { echo $(($(wc -l < "$1"))); }
first_line() { local l=""; IFS= read -r l < "$1" || true; printf '%s' "$l"; }
alive() { kill -0 "$1" 2>/dev/null; }

# The scope of the janitor and the Node sweep (spec section 6): nothing of the owner form with the creds token outside the private roots.
scope_premise() {
  local lists
  lists="$(git -C "$repo" worktree list --porcelain 2>&1; git -C "$repo" for-each-ref refs/heads 2>&1)"
  if command -v docker > /dev/null 2>&1; then
    lists="$lists$(docker ps -a --format '{{.Names}}' 2>/dev/null; docker volume ls -q 2>/dev/null; docker network ls --format '{{.Name}}' 2>/dev/null)"
  fi
  if printf '%s\n' "$lists" | grep -qi "teststodelete[-_]${TOK}[-_]creds"; then return 1; fi
  return 0
}
janitor_said() { # <label> <root>: when the janitor left something, say why (its own words)
  if [ "$(count "$2")" != 0 ]; then echo "$1 the janitor said: $(head -n 3 "$CTL/janitor.err" | tr '\n' '|')"; fi
}
age() { local p; for p in "$@"; do touch -t 200001010000 "$p"; done; }
run_janitor() { # <root>; sets J_RC, files $CTL/janitor.out and .err
  (cd "$repo" && JANITOR_MIN_AGE_MINUTES=10 TMPDIR="$1" "$BASH" "$janitor" --token creds > "$CTL/janitor.out" 2> "$CTL/janitor.err")
  J_RC=$?
}
run_node_sweep() { # <root>; prints R/L/P lines (removed, listed, preserved)
  ARG_TMP="$(native "$1")" ARG_REPO="$repo_native" LIB_DIR="$lib_native" TESTSTODELETE_OWNER= TESTSTODELETE_RUN= node --input-type=module -e "$NJS_PRE
    const s = await lib('leftovers-sweep.mjs');
    const r = s.sweepLeftovers({ tmp: process.env.ARG_TMP, token: 'creds', repo: process.env.ARG_REPO });
    for (const x of r.removed) console.log('R ' + JSON.stringify(x));
    for (const x of r.listed) console.log('L ' + JSON.stringify(x));
    for (const x of r.preserved) console.log('P ' + JSON.stringify(x));
    for (const x of r.errors) console.log('E ' + JSON.stringify(x));"
}
re_rec_linux='^[uw][0-9]{1,10}:[^@:[:space:]]+@linux:[1-9][0-9]*:[0-9]+:[0-9]+$'

# --- T1 the name -------------------------------------------------------------------------------------------------------
t1() {
  case_root t1
  premise "T1 node runs and the mount's owned.mjs exists" test -f "$mount_lib/owned.mjs" || return 0
  node_token="$(njs "const o = await lib('owned.mjs'); process.stdout.write(o.thisOwnerToken());")" || { bad "T1 premise" "node cannot read the mount"; return 0; }
  child t1 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
printf '%s\n' "$d" > "$T_CTL/t1.dir"
EOF
  run_child t1
  eq "T1 the child exits 0" "$CH_RC" 0
  local d base
  d="$(first_line "$CTL/t1.dir")"
  base="${d##*/}"
  [[ "$base" =~ ^testsToDelete-[uw][0-9]{1,10}-creds-x-[0-9a-f]{8}$ ]] && ok "T1 the name matches the pattern ($base)" || bad "T1 the name" "$base"
  eq "T1 the folder is under the case root" "${d%/*}" "$CR"
  local seg="${base:14}"; seg="${seg%%-*}"  # 14 characters are the prefix
  eq "T1 the owner segment equals the mounted thisOwnerToken()" "$seg" "$node_token"
  eq "T1 the case root is empty after the exit" "$(count "$CR")" 0
}

# --- T2 the record, T3 the Windows pid ---------------------------------------------------------------------------------
t2() {
  case_root t2
  premise "T2 node runs" test -f "$mount_lib/owned.mjs" || return 0
  if [ "$osclass" = linux ]; then premise "T2 /proc/self/ns/pid is readable" test -r /proc/self/ns/pid || return 0; fi
  child t2 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
printf '%s\n' "$d" > "$T_CTL/t2.dir"
: > "$T_CTL/t2.ready"
hold "$T_CTL/t2.stop"
EOF
  start_child t2
  local cpid="$CH_PID"
  premise "T2 the child is alive when the record is read" await_file "$CTL/t2.ready" || { : > "$CTL/t2.stop"; wait "$cpid"; return 0; }
  local d claim line extra n
  d="$(first_line "$CTL/t2.dir")"
  claim="$d.owner"
  premise "T2 the claim exists" test -f "$claim" || { : > "$CTL/t2.stop"; wait "$cpid"; return 0; }
  { IFS= read -r line; if IFS= read -r extra; then echo second > "$CTL/t2.second"; fi; } < "$claim"
  isfalse "T2 the claim is ONE line (a second read fails)" test -e "$CTL/t2.second"
  local re_head='^[uw][0-9]{1,10}:[^@:[:space:]]+@(linux|macos|windows):[1-9][0-9]*'
  [[ "$line" =~ $re_head ]] && ok "T2 the record starts with the grammar ($line)" || bad "T2 the record grammar" "$line"
  local want_os host want_host
  case "$osclass" in linux) want_os=linux ;; macos) want_os=macos ;; *) want_os=windows ;; esac
  if [ "$osclass" = linux ]; then
    [[ "$line" =~ $re_rec_linux ]] && ok "T2 on Linux the record ends with :<start>:<ns>" || bad "T2 Linux record" "$line"
  else
    [[ "$line" =~ ^[uw][0-9]{1,10}:[^@:[:space:]]+@(macos|windows):[1-9][0-9]*$ ]] && ok "T2 on this OS the record ends after the pid" || bad "T2 record end" "$line"
  fi
  host="$(printf '%s' "$(hostname)" | sed 's/[@:[:space:]][@:[:space:]]*/-/g')"
  want_host="$host"
  if [ -n "${WSL_DISTRO_NAME:-}" ]; then want_host="$host~$(printf '%s' "$WSL_DISTRO_NAME" | sed 's/[@:[:space:]][@:[:space:]]*/-/g')"; fi
  local rest="${line#*:}"
  eq "T2 the host and the os match this machine" "${rest%%:*}" "$want_host@$want_os"
  eq "T2 the record's owner equals the name's" "${line%%:*}" "$TOK"
  # the byte-for-byte half (C4): the reference's formatOwner for the CHILD's pid
  local pid_for_ref="$cpid"
  if [ "$osclass" = windows ]; then pid_for_ref="$(first_line "/proc/$cpid/winpid")"; fi
  local expected
  expected="$(ARG_PID="$pid_for_ref" njs "const o = await lib('owned.mjs'); const pid = Number(process.env.ARG_PID);
    process.stdout.write(o.formatOwner({ owner: o.thisOwnerToken(), host: o.thisOwner().host, pid, start: o.processProbe(pid).start, ns: o.readPidNamespace() }));")" || { bad "T2 reference" "node failed"; expected=""; }
  eq "T2 the claim line equals the reference's formatOwner (byte for byte)" "$line" "$expected"
  n="$(wc -c < "$claim")"; n=$((n))
  eq "T2 the claim file is the text plus one LF" "$n" "$((${#expected} + 1))"
  if [ "$osclass" = linux ]; then
    local parsed
    parsed="$(ARG_LINE="$line" ARG_PID="$cpid" njs "const o = await lib('owned.mjs'); const fs = await import('node:fs');
      const p = o.parseOwner(process.env.ARG_LINE); const pid = Number(process.env.ARG_PID);
      const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
      const btime = Number(/^btime\s+(\d+)/m.exec(fs.readFileSync('/proc/stat', 'utf8'))[1]);
      const ref = o.startFromProcStat(stat, btime);
      console.log([p.unreadable === true ? 'unreadable' : 'ok', p.ns === o.readPidNamespace() ? 'ns' : 'nsDIFF', Math.abs(p.start - ref) <= o.START_TOLERANCE_S ? 'start' : 'startDIFF'].join(' '));")" || parsed="node failed"
    eq "T2 parseOwner reads start and ns; ns equals readPidNamespace(); start is within 2 s" "$parsed" "ok ns start"
  fi
  # T3, Windows only: the record's pid is the Windows pid of the running child, and tasklist lists it
  if [ "$osclass" = windows ]; then
    local wp rec_pid rest3 tl
    wp="$(first_line "/proc/$cpid/winpid")"
    rest3="${line#*:}"; rest3="${rest3#*:}"; rec_pid="${rest3%%:*}"
    premise "T3 the child is alive" alive "$cpid" || { : > "$CTL/t2.stop"; wait "$cpid"; return 0; }
    eq "T3 the record's pid equals /proc/<pid>/winpid" "$rec_pid" "$wp"
    tl="$(tasklist //NH //FO CSV //FI "PID eq $wp" 2>&1)"
    case "$tl" in *'","'"$wp"'","'*) ok "T3 tasklist lists the pid $wp" ;; *) bad "T3 tasklist" "$tl" ;; esac
  else
    skipped "T3" "Windows only"
  fi
  : > "$CTL/t2.stop"
  wait "$cpid"
  eq "T2 the child exits 0" "$?" 0
}
# --- T4 the claim comes first -------------------------------------------------------------------------------------------
t4() {
  case_root t4
  child t4 << 'EOF'
. "$T_OWNED_SH"
hook() { if [ -e "$1.owner" ] && [ ! -e "$1" ]; then echo true; else echo false; fi > "$T_CTL/t4.record"; }
OWNED_HOOK_AFTER_CLAIM=hook
owned_dir d x || exit 1
if [ "$d.owner" -nt "$d" ]; then echo "claim newer than folder"; else echo "claim not newer than folder"; fi > "$T_CTL/t4.info"
EOF
  run_child t4
  premise "T4 the hook ran (its record exists)" test -f "$CTL/t4.record" || return 0
  eq "T4 at the hook the claim exists and the folder does not" "$(first_line "$CTL/t4.record")" true
  echo "T4 info: $(first_line "$CTL/t4.info")"
}

# --- T5 an existing claim is kept; the exclusive create of the OS ----------------------------------------------------------
t5() {
  case_root t5
  printf 'foreign content\n' > "$CR/testsToDelete-$TOK-creds-x-aaaaaaaa.owner"
  premise "T5 the planted claim exists before the call" test -f "$CR/testsToDelete-$TOK-creds-x-aaaaaaaa.owner" || return 0
  child t5 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
printf '%s\n' "$d" > "$T_CTL/t5.dir"
EOF
  run_child t5 OWNED_TEST_IDS="aaaaaaaa bbbbbbbb"
  eq "T5 the child exits 0" "$CH_RC" 0
  eq "T5 the folder is the second name" "$(first_line "$CTL/t5.dir")" "$CR/testsToDelete-$TOK-creds-x-bbbbbbbb"
  eq "T5 the planted claim is unchanged" "$(first_line "$CR/testsToDelete-$TOK-creds-x-aaaaaaaa.owner")" "foreign content"
  isfalse "T5 no folder exists at the first name" test -e "$CR/testsToDelete-$TOK-creds-x-aaaaaaaa"
  # C5: two real children race ONE owned_create_dir (the helper's own create) on an absent path, 20 rounds. The helper uses perl's
  # mkdir where perl exists: the kernel's exclusive create. Plain mkdir of uutils coreutils is not always exclusive (measured 2026-11-09).
  case_root t5race
  mkdir "$CR/taken"; : > "$CR/taken/sentinel"
  local n=0 a b ra rb zeros bad_rounds=0 shape=""
  while [ "$n" -lt 20 ]; do
    n=$((n + 1))
    rm -f "$CTL/t5.go" "$CTL/t5.a" "$CTL/t5.b"
    "$BASH" -c '. "$4"; while [ ! -e "$2" ]; do :; done; owned_create_dir "$1"; echo $? > "$3"' _ "$CR/race$n" "$CTL/t5.go" "$CTL/t5.a" "$T_OWNED" &
    a=$!; CHILD_PIDS+=("$a")
    "$BASH" -c '. "$4"; while [ ! -e "$2" ]; do :; done; owned_create_dir "$1"; echo $? > "$3"' _ "$CR/race$n" "$CTL/t5.go" "$CTL/t5.b" "$T_OWNED" &
    b=$!; CHILD_PIDS+=("$b")
    sleep 0.2
    : > "$CTL/t5.go"
    wait "$a"; wait "$b"
    ra="$(first_line "$CTL/t5.a")"; rb="$(first_line "$CTL/t5.b")"
    zeros=0
    [ "$ra" = 0 ] && zeros=$((zeros + 1)); [ "$rb" = 0 ] && zeros=$((zeros + 1))
    if [ "$zeros" != 1 ]; then bad_rounds=$((bad_rounds + 1)); shape="$shape($ra,$rb)"; fi
  done
  if mkdir --version 2>&1 | grep -qi uutils && ! command -v perl > /dev/null 2>&1; then
    echo "T5 NOTE: mkdir is uutils and perl is missing: the helper's create is not exclusive in a race ($bad_rounds of 20 rounds had no single winner $shape); the limit is documented"
    ok "T5 race measured, no exclusive create on this machine ($bad_rounds of 20)"
  else
    eq "T5 exactly one of two racing owned_create_dir wins, 20 rounds (bad rounds: $shape)" "$bad_rounds" 0
  fi
  local rtaken
  "$BASH" -c '. "$2"; owned_create_dir "$1"' _ "$CR/taken" "$T_OWNED"
  rtaken=$?
  isfalse "T5 owned_create_dir of an existing folder fails" test "$rtaken" = 0
  istrue "T5 the sentinel of the existing folder is unchanged" test -f "$CR/taken/sentinel"
}

# --- T6 refusals -------------------------------------------------------------------------------------------------------------
t6() {
  case_root t6
  premise "T6 the root is empty before" test "$(count "$CR")" = 0 || return 0
  child t6 << 'EOF'
. "$T_OWNED_SH"
d=UNTOUCHED
long=aaaaaaaaaaaaaaaaaaaaaaa
res=""
owned_dir d 'a/b' 2>/dev/null; res="$res $?"
owned_dir d '' 2>/dev/null; res="$res $?"
owned_dir d -x 2>/dev/null; res="$res $?"
owned_dir d "$long" 2>/dev/null; res="$res $?"
owned_dir 'd e' x 2>/dev/null; res="$res $?"
echo "$res" > "$T_CTL/t6.res"
echo "$d" > "$T_CTL/t6.d"
EOF
  run_child t6
  eq "T6 every call returns 1" "$(first_line "$CTL/t6.res")" " 1 1 1 1 1"
  eq "T6 the variable is untouched" "$(first_line "$CTL/t6.d")" UNTOUCHED
  eq "T6 the root is unchanged" "$(count "$CR")" 0
}

# --- T7 the traps ------------------------------------------------------------------------------------------------------------
t7a() {
  local pattern='(^|[^[:alnum:]_-])trap[[:space:]].*(EXIT|INT|TERM|HUP|[[:space:]]0([[:space:]]|$))' fixture callers f hits=0 line
  # comment lines are dropped first; then every spelling of a trap that would replace the helper's must be found
  # A backslash at the end of a line joins it to the next one (a trap list may sit on the second physical line); a comment line is never
  # joined (a comment that ends in a backslash does not continue in the shell, and must not hide the line after it).
  trap_scan() {
    awk '{ if (buf == "" && $0 ~ /^[[:space:]]*#/) { next } if ($0 ~ /\\$/) { sub(/\\$/, ""); buf = buf $0 " "; next } print buf $0; buf = "" } END { if (buf != "") print buf }' | grep -E "$pattern"
  }
  # every spelling of a trap that would replace the helper's, each in a line of its own (a scan that finds nothing passes forever)
  for line in '  trap cleanup EXIT' 'trap f 0' 'echo before; trap cleanup EXIT' 'if x; then trap cleanup TERM; fi' '  trap - INT'; do
    if printf '%s\n' "$line" | trap_scan > /dev/null; then ok "T7a the scan finds the planted line [$line]"; else bad "T7a fixture [$line]" "the pattern found nothing"; fi
  done
  # multiline spellings: the signal list on the next physical line, and a trap line after a comment that ends in a backslash
  if printf '%s\n' "  trap 'cleanup' \\" "    EXIT" | trap_scan > /dev/null; then ok "T7a the scan finds a multiline trap (the list on the second line)"; else bad "T7a multiline fixture" "the pattern found nothing"; fi
  if printf '%s\n' "trap 'cleanup' \\" "  INT TERM" | trap_scan > /dev/null; then ok "T7a the scan finds a multiline trap with two signals"; else bad "T7a multiline fixture 2" "the pattern found nothing"; fi
  if printf '%s\n' "# a note that ends in a backslash \\" "trap cleanup EXIT" | trap_scan > /dev/null; then ok "T7a a comment ending in a backslash does not hide the next line"; else bad "T7a comment backslash" "the trap line after it was missed"; fi
  fixture='# trap cleanup EXIT is what a caller must never write'
  if printf '%s\n' "$fixture" | trap_scan > /dev/null; then bad "T7a comment" "a comment line was found"; else ok "T7a a comment about a trap is not a trap"; fi
  callers="$(git -C "$repo" grep -l 'lib/owned.sh' -- '*.sh' 2>/dev/null | grep -v -e '^.github/scripts/lib/owned.sh$' -e '^.github/scripts/lib/owned.test.sh$')"
  if [ -z "$callers" ]; then
    echo "T7a note: no caller sources lib/owned.sh yet (E2.4.S2 and S4 write them); only the fixture is checked"
    return 0
  fi
  while IFS= read -r f; do
    if trap_scan < "$repo/$f" > /dev/null; then bad "T7a $f" "sets a trap of its own: $(trap_scan < "$repo/$f" | head -n 1)"; hits=$((hits + 1)); fi
  done <<< "$callers"
  [ "$hits" = 0 ] && ok "T7a no caller sets a trap of its own ($(printf '%s\n' "$callers" | wc -l | tr -d ' ') scanned)"
  return 0
}
t7b() {
  case_root t7b
  child t7b << 'EOF'
. "$T_OWNED_SH"
cleanup() { : > "$T_CTL/t7b.marker"; }
declare -F cleanup > /dev/null || exit 98
owned_trap cleanup || exit 97
owned_dir d x
echo "$?" > "$T_CTL/t7b.rc"
printf '%s\n' "$d" > "$T_CTL/t7b.dir"
: > "$T_CTL/t7b.ready"
hold "$T_CTL/t7b.stop"
EOF
  rm -f "$CTL/t7b.marker"
  : > "$CTL/t7b.stop"
  run_child t7b
  eq "T7b owned_trap then owned_dir returns 0" "$(first_line "$CTL/t7b.rc")" 0
  eq "T7b the child exits 0" "$CH_RC" 0
  istrue "T7b the caller's function ran" test -f "$CTL/t7b.marker"
  eq "T7b folder and claim are gone" "$(count "$CR")" 0
  # the same shape, ended by SIGTERM while it waits
  rm -f "$CTL/t7b.marker" "$CTL/t7b.stop" "$CTL/t7b.ready"
  start_child t7b
  local cpid="$CH_PID"
  premise "T7b the child reached its wait" await_file "$CTL/t7b.ready" || { kill -9 "$cpid"; return 0; }
  kill -TERM "$cpid"
  wait "$cpid"
  eq "T7b SIGTERM ends the child with 143" "$?" 143
  istrue "T7b the caller's function ran on the signal" test -f "$CTL/t7b.marker"
  eq "T7b folder and claim are gone after the signal" "$(count "$CR")" 0
}
t7c() {
  case_root t7c
  child t7c << 'EOF'
trap -p EXIT > "$T_CTL/t7c.before"
. "$T_OWNED_SH"
owned_dir d x || exit 1
printf '%s\n' "$OWNED_TRAP_SET" > "$T_CTL/t7c.flag"
trap -p EXIT > "$T_CTL/t7c.trap"
EOF
  run_child t7c
  premise "T7c the child had no trap before the call" test ! -s "$CTL/t7c.before" || return 0
  eq "T7c OWNED_TRAP_SET is 1 after the first owned_dir" "$(first_line "$CTL/t7c.flag")" 1
  case "$(first_line "$CTL/t7c.trap")" in *owned_exit_chain*) ok "T7c trap -p EXIT names owned_exit_chain" ;; *) bad "T7c trap" "$(first_line "$CTL/t7c.trap")" ;; esac
  eq "T7c nothing remains" "$(count "$CR")" 0
}
t7d() {
  case_root t7d
  child t7d << 'EOF'
. "$T_OWNED_SH"
cleanup() { : > "$T_CTL/t7d.marker"; }
owned_dir d x || exit 1
trap cleanup EXIT
printf '%s\n' "$d" > "$T_CTL/t7d.dir"
EOF
  rm -f "$CTL/t7d.marker"
  run_child t7d
  local d
  d="$(first_line "$CTL/t7d.dir")"
  premise "T7d the trap was set after the call (marker file is the proof)" test -f "$CTL/t7d.marker" || return 0
  istrue "T7d the replaced trap ran" test -f "$CTL/t7d.marker"
  istrue "T7d the folder REMAINS (the limit: a replaced trap is not seen)" test -d "$d"
  istrue "T7d the claim REMAINS" test -f "$d.owner"
  echo "T7d clean-up by hand: rm -rf $d $d.owner"
  rm -rf "$d" "$d.owner"
}

# --- T8 the squatter ---------------------------------------------------------------------------------------------------------
t8() {
  case_root t8
  child t8 << 'EOF'
. "$T_OWNED_SH"
hook() { if [ "${1##*-}" = cccccccc ]; then mkdir "$1"; : > "$1/sentinel"; : > "$T_CTL/t8.planted"; fi; }
OWNED_HOOK_AFTER_CLAIM=hook
owned_dir d x
echo "$?" > "$T_CTL/t8.rc"
printf '%s\n' "$d" > "$T_CTL/t8.dir"
EOF
  run_child t8 OWNED_TEST_IDS="cccccccc dddddddd"
  premise "T8 the sentinel was planted before the child exited" test -f "$CTL/t8.planted" || return 0
  eq "T8 the child exits 0" "$CH_RC" 0
  eq "T8 owned_dir returns 0" "$(first_line "$CTL/t8.rc")" 0
  eq "T8 the folder is the second name" "$(first_line "$CTL/t8.dir")" "$CR/testsToDelete-$TOK-creds-x-dddddddd"
  eq "T8 one warning naming the squatter" "$(grep -c cccccccc "$CTL/t8.err")" 1
  istrue "T8 the squatter's sentinel survives" test -f "$CR/testsToDelete-$TOK-creds-x-cccccccc/sentinel"
  isfalse "T8 no claim for the squatter" test -e "$CR/testsToDelete-$TOK-creds-x-cccccccc.owner"
  isfalse "T8 our folder is gone" test -e "$CR/testsToDelete-$TOK-creds-x-dddddddd"
  isfalse "T8 our claim is gone" test -e "$CR/testsToDelete-$TOK-creds-x-dddddddd.owner"
  eq "T8 the root holds exactly one entry" "$(count "$CR")" 1
}

# --- T9 owned_remove: only this run's folders ------------------------------------------------------------------------------
t9() {
  case_root t9
  mkdir "$CR/other"; mkdir "$CR/testsToDelete-u0-creds-x-00000000"
  premise "T9 the planted entries exist" test -d "$CR/other" -a -d "$CR/testsToDelete-u0-creds-x-00000000" || return 0
  child t9b << 'EOF'
. "$T_OWNED_SH"
owned_dir b x || exit 1
printf '%s\n' "$b" > "$T_CTL/t9b.path"
: > "$T_CTL/t9b.ready"
hold "$T_CTL/t9b.stop"
EOF
  child t9a << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
chk() { local label="$1" rc n; shift; "$@" 2> "$T_CTL/t9.err"; rc=$?; n=$(wc -l < "$T_CTL/t9.err"); echo "$label $rc $((n))" >> "$T_CTL/t9.res"; }
chk empty owned_remove ""
chk other owned_remove "$CR/other"
chk foreign owned_remove "$CR/testsToDelete-u0-creds-x-00000000"
chk slash owned_remove "$d/"
chk live owned_remove "$B_PATH"
EOF
  rm -f "$CTL/t9.res"
  start_child t9b
  local bpid="$CH_PID"
  premise "T9 process B made its folder and is alive" await_file "$CTL/t9b.ready" || { kill -9 "$bpid"; return 0; }
  premise "T9 B is alive" alive "$bpid" || { kill -9 "$bpid"; return 0; }
  local b claim_before
  b="$(first_line "$CTL/t9b.path")"
  claim_before="$(first_line "$b.owner")"
  run_child t9a B_PATH="$b"
  eq "T9 A exits 0" "$CH_RC" 0
  local label
  for label in empty other foreign slash live; do
    eq "T9 owned_remove ($label) returns 1 with one line" "$(grep "^$label " "$CTL/t9.res" | tr -d '\n')" "$label 1 1"
  done
  istrue "T9 the planted folders remain" test -d "$CR/other" -a -d "$CR/testsToDelete-u0-creds-x-00000000"
  istrue "T9 B's folder remains" test -d "$b"
  eq "T9 B's claim is unchanged" "$(first_line "$b.owner")" "$claim_before"
  : > "$CTL/t9b.stop"
  wait "$bpid"
}

# --- T10 owned_remove of an own folder --------------------------------------------------------------------------------------
t10() {
  case_root t10
  child t10 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
[ -d "$d" ] && echo yes > "$T_CTL/t10.existed"
owned_remove "$d"; echo "$?" > "$T_CTL/t10.rc1"
[ -e "$d" ] && echo folder >> "$T_CTL/t10.left"
[ -e "$d.owner" ] && echo claim >> "$T_CTL/t10.left"
owned_remove "$d" 2> /dev/null; echo "$?" > "$T_CTL/t10.rc2"
EOF
  rm -f "$CTL/t10.left"
  run_child t10
  premise "T10 the folder existed" test -f "$CTL/t10.existed" || return 0
  eq "T10 the first owned_remove returns 0" "$(first_line "$CTL/t10.rc1")" 0
  isfalse "T10 folder and claim are gone" test -e "$CTL/t10.left"
  eq "T10 a second owned_remove returns 1 (entry already released)" "$(first_line "$CTL/t10.rc2")" 1
}

# --- T11 a removal that gives up ----------------------------------------------------------------------------------------------
t11() {
  if [ "$osclass" = windows ]; then skipped "T11" "POSIX only (a Windows held handle is not tried)"; return 0; fi
  case_root t11
  child t11 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
chmod a-w "$CR"
if [ "$(id -u)" != 0 ] && [ ! -w "$CR" ]; then echo ok > "$T_CTL/t11.premise"; fi
owned_remove "$d" 2> "$T_CTL/t11.msg"; echo "$?" > "$T_CTL/t11.rc"
[ -d "$d" ] && echo folder > "$T_CTL/t11.left"
[ -f "$d.owner" ] && echo claim >> "$T_CTL/t11.left"
chmod u+w "$CR"
EOF
  rm -f "$CTL/t11.left" "$CTL/t11.premise"
  run_child t11
  premise "T11 id -u is not 0 and the parent is not writable" test -f "$CTL/t11.premise" || { chmod u+w "$CR"; return 0; }
  eq "T11 owned_remove returns 0 when it gives up" "$(first_line "$CTL/t11.rc")" 0
  eq "T11 ONE stderr line" "$(lines_of "$CTL/t11.msg")" 1
  eq "T11 folder and claim remain" "$(tr '\n' ' ' < "$CTL/t11.left")" "folder claim "
  eq "T11 the exit chain removes them once the parent is writable" "$(count "$CR")" 0
}

# --- T12 Windows: no node, no token --------------------------------------------------------------------------------------------
t12() {
  if [ "$osclass" != windows ]; then skipped "T12" "Windows only"; return 0; fi
  case_root t12
  child t12a << 'EOF'
PATH=/usr/bin
command -v node > /dev/null && echo "node found" > "$T_CTL/t12.node"
. "$T_OWNED_SH"
owned_token 2> "$T_CTL/t12.msg"; echo "$?" > "$T_CTL/t12.rc"
d=UNTOUCHED
owned_dir d x 2> /dev/null; echo "$?" > "$T_CTL/t12.rc2"
echo "$d" > "$T_CTL/t12.d"
EOF
  rm -f "$CTL/t12.node"
  run_child t12a
  premise "T12 node is not on PATH in the child" test ! -e "$CTL/t12.node" || return 0
  eq "T12 owned_token returns 1" "$(first_line "$CTL/t12.rc")" 1
  eq "T12 owned_token writes one line" "$(lines_of "$CTL/t12.msg")" 1
  eq "T12 owned_dir returns 1" "$(first_line "$CTL/t12.rc2")" 1
  eq "T12 the variable is untouched" "$(first_line "$CTL/t12.d")" UNTOUCHED
  eq "T12 nothing is in the root" "$(count "$CR")" 0
  child t12b << 'EOF'
. "$T_OWNED_SH"
owned_token > "$T_CTL/t12.token"
EOF
  run_child t12b TESTSTODELETE_OWNER=u77
  local tk
  tk="$(first_line "$CTL/t12.token")"
  [[ "$tk" =~ ^w[0-9]{1,10}$ ]] && ok "T12 the override u77 is never read (token $tk)" || bad "T12 override" "$tk"
}

# --- T13 the kill between the two steps ---------------------------------------------------------------------------------------
kill_between() { # <root name>; leaves the root holding the aged claim; sets KB_PID, KB_RC
  case_root "$1"
  child "$1" << 'EOF'
. "$T_OWNED_SH"
die() { : > "$T_CTL/$KB_NAME.hook"; kill -9 $$; }
OWNED_HOOK_AFTER_CLAIM=die
owned_dir d x
EOF
  rm -f "$CTL/$1.hook"
  run_child "$1" KB_NAME="$1"
  KB_PID="$CH_PID"; KB_RC="$CH_RC"
}
t13() {
  premise "T13 the janitor and the sweep see nothing of ours outside the private roots" scope_premise || return 0
  kill_between t13
  eq "T13 the child died by signal 9 (wait returns 137)" "$KB_RC" 137
  premise "T13 the hook ran: the child was killed between the steps" test -f "$CTL/t13.hook" || return 0
  eq "T13 the root holds exactly ONE entry" "$(count "$CR")" 1
  local claim
  claim="$(ls -A "$CR")"
  [[ "$claim" =~ ^testsToDelete-${TOK}-creds-x-[0-9a-f]{8}\.owner$ ]] && ok "T13 the one entry is the claim ($claim)" || { bad "T13 the entry" "$claim"; return 0; }
  premise "T13 the pid is dead" test "$(kill -0 "$KB_PID" 2>/dev/null; echo $?)" != 0 || return 0
  if [ "$osclass" = linux ]; then
    [[ "$(first_line "$CR/$claim")" =~ $re_rec_linux ]] && ok "T13 the Linux record ends in :<start>:<ns>" || { bad "T13 record" "$(first_line "$CR/$claim")"; return 0; }
  fi
  age "$CR/$claim"
  if [ "$osclass" = windows ]; then windows_listing "T13/T14" "$CR" "$claim"; return 0; fi
  local root_j="$CR"
  run_janitor "$root_j"
  case "$J_RC" in 0 | 3) ok "T13 the janitor exits 0 or 3 ($J_RC)" ;; *) bad "T13 janitor exit" "$J_RC: $(head -n 3 "$CTL/janitor.err")" ;; esac
  eq "T13 the janitor leaves the root EMPTY" "$(count "$root_j")" 0
  janitor_said T13 "$root_j"
  # the Node sweep over a second root of the same shape
  premise "T13 scope again" scope_premise || return 0
  kill_between t13node
  claim="$(ls -A "$CR")"
  age "$CR/$claim"
  run_node_sweep "$CR" > "$CTL/t13.sweep" 2>&1
  eq "T13 the Node sweep leaves the root empty" "$(count "$CR")" 0
  istrue "T13 result.removed names the claim" grep -q "^R .*$claim" "$CTL/t13.sweep"
}
# the Windows outcome (T14, and the Windows half of T15): the janitor is a dry run, the Node sweep lists and removes nothing (F16)
windows_listing() { # <label> <root> <entries to remain...>
  local label="$1" root="$2" e
  shift 2
  run_janitor "$root"
  echo "$label janitor stdout: $(tr '\n' '|' < "$CTL/janitor.out")"
  grep -q "not armed" "$CTL/janitor.err" && ok "$label the janitor says it is a dry run" || bad "$label dry run" "$(head -n 2 "$CTL/janitor.err")"
  local first="$1"
  if [ -O "$root/$first" ]; then
    grep -q "would run: rm -f" "$CTL/janitor.out" && ok "$label the janitor names the removal it would do" || bad "$label would run" "$(cat "$CTL/janitor.out")"
  else
    echo "$label F31: the claim belongs to another owner on this runner"
  fi
  run_node_sweep "$root" > "$CTL/windows.sweep" 2>&1
  grep -q '^L .*unverified:' "$CTL/windows.sweep" && ok "$label the Node sweep lists unverified: (F16)" || bad "$label unverified" "$(head -n 3 "$CTL/windows.sweep")"
  isfalse "$label the Node sweep removed nothing" grep -q '^R ' "$CTL/windows.sweep"
  for e in "$@"; do istrue "$label $e remains" test -e "$root/$e"; done
}

# --- T15 a kill after the mkdir ----------------------------------------------------------------------------------------------
t15() {
  premise "T15 scope" scope_premise || return 0
  case_root t15
  child t15 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
printf '%s\n' "$d" > "$T_CTL/t15.dir"
[ -d "$d" ] && : > "$T_CTL/t15.folder"
"$BASH" -c "kill -9 $$"
sleep 5
EOF
  rm -f "$CTL/t15.folder"
  run_child t15
  eq "T15 the child died by signal 9" "$CH_RC" 137
  premise "T15 the folder existed before the kill" test -f "$CTL/t15.folder" || return 0
  local d
  d="$(first_line "$CTL/t15.dir")"
  istrue "T15 folder remains" test -d "$d"
  istrue "T15 claim remains" test -f "$d.owner"
  if [ "$osclass" = linux ]; then
    [[ "$(first_line "$d.owner")" =~ $re_rec_linux ]] && ok "T15 the Linux record ends in :<start>:<ns>" || bad "T15 record" "$(first_line "$d.owner")"
  fi
  age "$d" "$d.owner"
  if [ "$osclass" = windows ]; then windows_listing "T15" "$CR" "${d##*/}" "${d##*/}.owner"; return 0; fi
  run_janitor "$CR"
  case "$J_RC" in 0 | 3) ok "T15 the janitor exits 0 or 3 ($J_RC)" ;; *) bad "T15 janitor exit" "$J_RC: $(head -n 3 "$CTL/janitor.err")" ;; esac
  eq "T15 the janitor collects folder and claim (root empty)" "$(count "$CR")" 0
  janitor_said T15 "$CR"
}

# --- T16 OWNED_KEEP ----------------------------------------------------------------------------------------------------------
t16() {
  premise "T16 scope" scope_premise || return 0
  case_root t16
  child t16 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
printf '%s\n' "$d" > "$T_CTL/t16.dir"
echo "$$" > "$T_CTL/t16.pid"
EOF
  run_child t16 OWNED_KEEP=1
  eq "T16 the child exits 0" "$CH_RC" 0
  local d line rest
  d="$(first_line "$CTL/t16.dir")"
  istrue "T16 the kept folder remains" test -d "$d"
  istrue "T16 the claim remains" test -f "$d.owner"
  line="$(first_line "$d.owner")"
  rest="${line#*:}"; rest="${rest#*:}"; rest="${rest%%:*}"
  eq "T16 the claim names the child's pid" "$rest" "$(first_line "$CTL/t16.pid")"
  if [ "$osclass" = linux ]; then
    [[ "$line" =~ $re_rec_linux ]] && ok "T16 the Linux record ends in :<start>:<ns>" || bad "T16 record" "$line"
  fi
  age "$d" "$d.owner"
  if [ "$osclass" = windows ]; then skipped "T16 janitor" "Windows lists only (rows 10 and 12)"; return 0; fi
  run_janitor "$CR"
  case "$J_RC" in 0 | 3) ok "T16 the janitor exits 0 or 3 ($J_RC)" ;; *) bad "T16 janitor exit" "$J_RC: $(head -n 3 "$CTL/janitor.err")" ;; esac
  eq "T16 the janitor collects the kept folder and its claim" "$(count "$CR")" 0
  janitor_said T16 "$CR"
}

# --- T18 the chain under set -e (C2) ----------------------------------------------------------------------------------------
t18() {
  case_root t18
  child t18a << 'EOF'
set -euo pipefail
. "$T_OWNED_SH"
case "$-" in *e*) : > "$T_CTL/t18.errexit" ;; esac
cleanup() { : > "$T_CTL/t18.marker"; false; }
owned_trap cleanup
owned_dir d x
exit 3
EOF
  rm -f "$CTL/t18.marker" "$CTL/t18.errexit"
  run_child t18a
  premise "T18 errexit is on in the child" test -f "$CTL/t18.errexit" || return 0
  eq "T18 the status is 3" "$CH_RC" 3
  istrue "T18 the caller's function ran" test -f "$CTL/t18.marker"
  eq "T18 the root is empty" "$(count "$CR")" 0
  child t18b << 'EOF'
set -euo pipefail
. "$T_OWNED_SH"
owned_dir d x
exit 3
EOF
  run_child t18b
  eq "T18 with no owned_trap the status is 3" "$CH_RC" 3
  eq "T18 with no owned_trap the root is empty" "$(count "$CR")" 0
}

# --- T19 set -u with no entry ------------------------------------------------------------------------------------------------
t19() {
  case_root t19
  child t19a << 'EOF'
set -u
. "$T_OWNED_SH"
f() { :; }
owned_trap f
exit 0
EOF
  run_child t19a
  eq "T19 set -u, owned_trap, exit: status 0" "$CH_RC" 0
  eq "T19 no 'unbound variable' on stderr" "$(grep -c unbound "$CTL/t19a.err")" 0
  child t19b << 'EOF'
set -u
. "$T_OWNED_SH"
owned_cleanup
owned_cleanup
exit 0
EOF
  run_child t19b
  eq "T19 owned_cleanup twice with nothing registered: status 0" "$CH_RC" 0
  eq "T19 no 'unbound variable' on stderr (cleanup)" "$(grep -c unbound "$CTL/t19b.err")" 0
}

# --- T20 the signal window (C1) ----------------------------------------------------------------------------------------------
t20() {
  case_root t20a
  child t20a << 'EOF'
. "$T_OWNED_SH"
cleanup() { : > "$T_CTL/t20a.cleanup"; }
owned_trap cleanup
owned_create_dir() { mkdir -- "$1"; : > "$T_CTL/t20a.stub"; kill -TERM $$; return 0; }
owned_dir d x
: > "$T_CTL/t20a.survived"
EOF
  rm -f "$CTL/t20a.cleanup" "$CTL/t20a.stub" "$CTL/t20a.survived"
  run_child t20a
  premise "T20a the stub ran" test -f "$CTL/t20a.stub" || return 0
  eq "T20a the child ends with 143" "$CH_RC" 143
  isfalse "T20a the child did not go on after owned_dir" test -f "$CTL/t20a.survived"
  istrue "T20a the caller's function ran" test -f "$CTL/t20a.cleanup"
  eq "T20a the root holds NO folder and NO claim" "$(count "$CR")" 0
  case_root t20b
  mkdir "$CR/testsToDelete-$TOK-creds-x-eeeeeeee"; : > "$CR/testsToDelete-$TOK-creds-x-eeeeeeee/sentinel"
  child t20b << 'EOF'
. "$T_OWNED_SH"
cleanup() { : > "$T_CTL/t20b.cleanup"; }
owned_trap cleanup
owned_create_dir() { : > "$T_CTL/t20b.stub"; kill -TERM $$; return 1; }
owned_dir d x
: > "$T_CTL/t20b.survived"
EOF
  rm -f "$CTL/t20b.cleanup" "$CTL/t20b.stub" "$CTL/t20b.survived"
  run_child t20b OWNED_TEST_IDS=eeeeeeee
  premise "T20b the stub ran" test -f "$CTL/t20b.stub" || return 0
  eq "T20b the child ends with 143" "$CH_RC" 143
  istrue "T20b the squatter's sentinel exists" test -f "$CR/testsToDelete-$TOK-creds-x-eeeeeeee/sentinel"
  isfalse "T20b the squatter's folder has no claim" test -e "$CR/testsToDelete-$TOK-creds-x-eeeeeeee.owner"
  eq "T20b nothing else remains" "$(entries "$CR")" "testsToDelete-$TOK-creds-x-eeeeeeee "
}

# --- T9b a planted folder that holds THIS run's own record is still not registered (the registry check, not the claim text, refuses) ---
t9b() {
  case_root t9b
  child t9b << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
planted="$CR/testsToDelete-$OWNED_TOKEN-creds-x-11111111"
mkdir "$planted"; : > "$planted/sentinel"
printf '%s\n' "$OWNED_OWNER" > "$planted.owner"
owned_remove "$planted" 2> "$T_CTL/t9b.msg"; echo "$?" > "$T_CTL/t9b.rc"
[ -d "$d" ] && echo kept > "$T_CTL/t9b.d"
EOF
  run_child t9b
  eq "T9b the child exits 0" "$CH_RC" 0
  eq "T9b owned_remove of an unregistered folder with our own record returns 1" "$(first_line "$CTL/t9b.rc")" 1
  eq "T9b it says so in one line" "$(lines_of "$CTL/t9b.msg")" 1
  istrue "T9b the planted folder and its sentinel remain" test -f "$CR/testsToDelete-$TOK-creds-x-11111111/sentinel"
  istrue "T9b the registered folder was not removed in its place" test -f "$CTL/t9b.d"
  eq "T9b only the planted folder and its claim are left (the child's own are gone)" "$(count "$CR")" 2
}

# --- F1 the caller's function ends the shell (P1) or meets an unbound variable (P2): the cleanup still runs, the status is kept ---
tf1() {
  case_root tf1
  child tf1a << 'EOF'
. "$T_OWNED_SH"
f() { : > "$T_CTL/tf1a.marker"; exit 5; }
owned_trap f
owned_dir d x
exit 3
EOF
  rm -f "$CTL/tf1a.marker"
  run_child tf1a
  premise "F1 the caller's function ran" test -f "$CTL/tf1a.marker" || return 0
  eq "F1 P1: f calls exit 5: the status is the script's 3" "$CH_RC" 3
  eq "F1 P1: the root is empty" "$(count "$CR")" 0
  child tf1b << 'EOF'
set -u
. "$T_OWNED_SH"
f() { : > "$T_CTL/tf1b.marker"; echo "$NOT_SET_ANYWHERE" > /dev/null; }
owned_trap f
owned_dir d x
exit 3
EOF
  rm -f "$CTL/tf1b.marker"
  run_child tf1b
  premise "F1 the caller's function ran (P2)" test -f "$CTL/tf1b.marker" || return 0
  eq "F1 P2: an unbound variable in f: the status is 3" "$CH_RC" 3
  eq "F1 P2: the root is empty" "$(count "$CR")" 0
}

# --- F2 a second signal during the exit chain (P3, P3b) ---
tf2() {
  case_root tf2
  child tf2a << 'EOF'
. "$T_OWNED_SH"
f() { : > "$T_CTL/tf2a.inchain"; hold "$T_CTL/tf2a.stop2"; }
owned_trap f
owned_dir d x
: > "$T_CTL/tf2a.ready"
hold "$T_CTL/tf2a.stop1"
EOF
  rm -f "$CTL/tf2a.inchain" "$CTL/tf2a.ready" "$CTL/tf2a.stop1" "$CTL/tf2a.stop2"
  start_child tf2a
  local cpid="$CH_PID"
  premise "F2 the child reached its wait" await_file "$CTL/tf2a.ready" || { kill -9 "$cpid"; return 0; }
  kill -TERM "$cpid"
  premise "F2 the exit chain started" await_file "$CTL/tf2a.inchain" || { kill -9 "$cpid"; return 0; }
  kill -HUP "$cpid"   # HUP, not INT: a background child of a script ignores SIGINT from its start, and an ignored signal cannot be trapped
  sleep 0.3
  : > "$CTL/tf2a.stop2"
  { wait "$cpid"; } 2> /dev/null
  eq "F2 P3: TERM then HUP in the chain: the status is the first signal's, 143" "$?" 143
  eq "F2 P3: folder and claim are gone" "$(count "$CR")" 0
  child tf2b << 'EOF'
. "$T_OWNED_SH"
f() { kill -HUP $$; }
owned_trap f
owned_dir d x
owned_dir e y
exit 3
EOF
  run_child tf2b
  eq "F2 P3b: a HUP during the chain: the status is 3" "$CH_RC" 3
  eq "F2 P3b: both folders and both claims are gone" "$(count "$CR")" 0
}

# --- F4 the traps are set before the claim is written (P4): a signal right after the claim write leaves nothing ---
tf4() {
  case_root tf4
  child tf4 << 'EOF'
. "$T_OWNED_SH"
owned_holds() {
  if [ ! -e "$T_CTL/tf4.sent" ]; then : > "$T_CTL/tf4.sent"; kill -TERM $$; fi
  local line="" extra=""
  if [ ! -f "$1" ] || [ -L "$1" ]; then return 1; fi
  { IFS= read -r line && ! IFS= read -r extra; } < "$1" 2> /dev/null || return 1
  [ "$line" = "$2" ]
}
owned_dir d x
: > "$T_CTL/tf4.survived"
EOF
  rm -f "$CTL/tf4.sent" "$CTL/tf4.survived"
  run_child tf4
  premise "F4 the signal was sent right after the claim write" test -f "$CTL/tf4.sent" || return 0
  eq "F4 P4: the child ends with 143" "$CH_RC" 143
  eq "F4 P4: the claim is not left (the root is empty)" "$(entries "$CR")" ""
}

# --- F5 WSL_DISTRO_NAME: the record equals the reference's formatOwner (spaces only: no distro; a space inside: one '-') ---
tf5() {
  case_root tf5
  premise "F5 node runs" test -f "$mount_lib/owned.mjs" || return 0
  child tf5 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
: > "$T_CTL/tf5.ready"
hold "$T_CTL/tf5.stop"
EOF
  local wsl cpid d line expected pid_for_ref idx=0
  for wsl in "   " "My Distro"; do
    idx=$((idx + 1))
    rm -f "$CTL/tf5.ready" "$CTL/tf5.stop"
    start_child tf5 WSL_DISTRO_NAME="$wsl"
    cpid="$CH_PID"
    premise "F5 the child is alive" await_file "$CTL/tf5.ready" || { kill -9 "$cpid"; return 0; }
    d="$(ls -A "$CR" | grep -v '\.owner$' | head -n 1)"
    line="$(first_line "$CR/$d.owner")"
    pid_for_ref="$cpid"
    if [ "$osclass" = windows ]; then pid_for_ref="$(first_line "/proc/$cpid/winpid")"; fi
    expected="$(WSL_DISTRO_NAME="$wsl" ARG_PID="$pid_for_ref" njs "const o = await lib('owned.mjs'); const pid = Number(process.env.ARG_PID);
      process.stdout.write(o.formatOwner({ owner: o.thisOwnerToken(), host: o.thisOwner().host, pid, start: o.processProbe(pid).start, ns: o.readPidNamespace() }));")"
    eq "F5 WSL_DISTRO_NAME [$wsl]: the claim equals the reference's formatOwner" "$line" "$expected"
    : > "$CTL/tf5.stop"
    { wait "$cpid"; } 2> /dev/null
    eq "F5 the folder and claim are gone after the exit" "$(count "$CR")" 0
  done
}

# --- F6 a relative TMPDIR still cleans up after the script changes directory (P7) ---
tf6() {
  case_root tf6
  child tf6 << 'EOF'
. "$T_OWNED_SH"
cd "$CR/.." || exit 90
TMPDIR="${CR##*/}"
owned_dir d x || exit 1
printf '%s\n' "$d" > "$T_CTL/tf6.dir"
cd / || exit 91
exit 0
EOF
  run_child tf6
  eq "F6 the child exits 0" "$CH_RC" 0
  case "$(first_line "$CTL/tf6.dir")" in /*) ok "F6 the folder path is absolute" ;; *) bad "F6 path" "$(first_line "$CTL/tf6.dir")" ;; esac
  eq "F6 folder and claim are gone after the cd" "$(count "$CR")" 0
}

# --- F9 a seam that is set is named on stderr, once ---
tf9() {
  case_root tf9
  child tf9 << 'EOF'
. "$T_OWNED_SH"
hk() { :; }
OWNED_HOOK_AFTER_CLAIM=hk
OWNED_TEST_IDS="f1f1f1f1 f2f2f2f2"
owned_dir d x || exit 1
owned_dir e y || exit 1
EOF
  run_child tf9
  eq "F9 OWNED_HOOK_AFTER_CLAIM is named once" "$(grep -c OWNED_HOOK_AFTER_CLAIM "$CTL/tf9.err")" 1
  eq "F9 OWNED_TEST_IDS is named once" "$(grep -c OWNED_TEST_IDS "$CTL/tf9.err")" 1
  child tf9b << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
EOF
  run_child tf9b
  eq "F9 with no seam the helper writes nothing" "$(lines_of "$CTL/tf9b.err")" 0
}

# --- G2 a token that cannot be had makes nothing, whatever the reason; the cache holds only a success ---
tg2() {
  case_root tg2
  child tg2a << 'EOF'
. "$T_OWNED_SH"
# the Windows branch on any OS, with no node on PATH: owned_token must fail and leave OWNED_TOKEN empty
OWNED_UNAME=MINGW64_NT-10.0
PATH=/nonexistent-path-of-the-test
d=UNTOUCHED
owned_token 2> "$T_CTL/tg2a.msg"; echo "$?" > "$T_CTL/tg2a.rc1"
echo "[$OWNED_TOKEN]" > "$T_CTL/tg2a.tok"
owned_dir d x 2> /dev/null; echo "$?" > "$T_CTL/tg2a.rc2"
echo "$d" > "$T_CTL/tg2a.d"
EOF
  run_child tg2a
  eq "G2 a failed token: owned_token returns 1" "$(first_line "$CTL/tg2a.rc1")" 1
  eq "G2 a failed token: OWNED_TOKEN is empty" "$(first_line "$CTL/tg2a.tok")" "[]"
  eq "G2 a failed token: owned_dir returns 1" "$(first_line "$CTL/tg2a.rc2")" 1
  eq "G2 a failed token: the variable is untouched" "$(first_line "$CTL/tg2a.d")" UNTOUCHED
  eq "G2 a failed token: nothing is made" "$(count "$CR")" 0
  child tg2b << 'EOF'
. "$T_OWNED_SH"
# a token function that says "ok" and leaves the token empty (whatever the reason): owned_dir must still refuse
owned_token() { OWNED_UNAME=Linux; return 0; }
d=UNTOUCHED
owned_dir d x 2> /dev/null; echo "$?" > "$T_CTL/tg2b.rc"
echo "$d" > "$T_CTL/tg2b.d"
EOF
  run_child tg2b
  eq "G2 an empty token after a successful call: owned_dir returns 1" "$(first_line "$CTL/tg2b.rc")" 1
  eq "G2 an empty token: the variable is untouched" "$(first_line "$CTL/tg2b.d")" UNTOUCHED
  eq "G2 an empty token: no entry with an empty owner segment is made" "$(count "$CR")" 0
  child tg2c << 'EOF'
. "$T_OWNED_SH"
owned_token > "$T_CTL/tg2c.first"
# the environment changes after a success: the cached value is the script's constant, it is never recomputed, never stale-empty
OWNED_UNAME=MINGW64_NT-10.0
PATH=/nonexistent-path-of-the-test
owned_token > "$T_CTL/tg2c.second"; echo "$?" > "$T_CTL/tg2c.rc"
EOF
  run_child tg2c
  eq "G2 after a success the second call returns 0" "$(first_line "$CTL/tg2c.rc")" 0
  eq "G2 after a success the second call gives the cached value" "$(first_line "$CTL/tg2c.second")" "$(first_line "$CTL/tg2c.first")"
}

# --- G3 a caller's variable named like an internal one of owned_dir is still the caller's ---
tg3() {
  case_root tg3
  child tg3 << 'EOF'
. "$T_OWNED_SH"
for name in dir var what root i rc draws re_var; do
  unset "$name"
  owned_dir "$name" x || echo "failed $name" >> "$T_CTL/tg3.res"
  printf '%s=%s\n' "$name" "${!name-UNSET}" >> "$T_CTL/tg3.res"
done
EOF
  rm -f "$CTL/tg3.res"
  run_child tg3
  local name val
  for name in dir var what root i rc draws re_var; do
    val="$(grep "^$name=" "$CTL/tg3.res" | head -n 1)"
    case "$val" in "$name=$CR/testsToDelete-$TOK-creds-x-"*) ok "G3 owned_dir $name x sets the caller's $name" ;; *) bad "G3 owned_dir $name x" "got [$val]" ;; esac
  done
}

# --- G4 a minimal /proc: no start and no ns, never an error (the seam OWNED_PROC names the /proc root) ---
tg4() {
  if [ "$osclass" != linux ]; then skipped "G4" "Linux only (the start and the namespace are written on Linux only)"; return 0; fi
  case_root tg4
  child tg4 << 'EOF'
. "$T_OWNED_SH"
FP="$T_CTL/fakeproc-$FP_NAME"
mkdir -p "$FP/$$" "$FP/self/ns"
printf '%s\n' "$$ ($FP_COMM) $FP_REST" > "$FP/$$/stat"
if [ -n "$FP_BTIME" ]; then printf 'cpu 1 2\nbtime %s\nprocesses 5\n' "$FP_BTIME" > "$FP/stat"; else printf 'cpu 1 2\n' > "$FP/stat"; fi
if [ -z "$FP_NO_NS" ]; then ln -s 'pid:[4242]' "$FP/self/ns/pid"; fi
OWNED_PROC="$FP"
owned_dir d x || exit 1
cp "$d.owner" "$T_CTL/tg4-$FP_NAME.claim"
EOF
  local good='S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 250' tick line re_end n
  tick="$(getconf CLK_TCK)"
  # name | btime | rest of the stat line after the command | no-ns
  local cases="nobtime||$good|
badbtime|x1|$good|
badfield|1000|S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 abc|
shortstat|1000|S 0 0|
nons|1000|$good|1
good|1000|$good|"
  local c_name c_btime c_rest c_nons
  while IFS='|' read -r c_name c_btime c_rest c_nons; do
    run_child tg4 FP_NAME="$c_name" FP_BTIME="$c_btime" FP_REST="$c_rest" FP_NO_NS="$c_nons" FP_COMM="a b) c"
    eq "G4 $c_name: the child exits 0" "$CH_RC" 0
    line="$(first_line "$CTL/tg4-$c_name.claim")"
    if [ "$c_name" = good ]; then
      eq "G4 $c_name: the start is btime + field 22 / CLK_TCK, the ns is the link's (a command name with ') ')" "${line#*@linux:*:}" "$((1000 + 250 / tick)):4242"
    else
      [[ "$line" =~ ^[uw][0-9]{1,10}:[^@:[:space:]]+@linux:[1-9][0-9]*$ ]] && ok "G4 $c_name: the record ends after the pid ($line)" || bad "G4 $c_name" "record: $line"
    fi
    n="$(grep -ciE 'arithmetic|syntax error|too great|bad substitution|unbound' "$CTL/tg4.err")"
    eq "G4 $c_name: no shell error on stderr" "$n" 0
  done <<< "$cases"
}

# --- run ----------------------------------------------------------------------------------------------------------------------
t1; t2; t4; t5; t6; t7a; t7b; t7c; t7d; t8; t9; t9b; t10; t11; t12; t13; t15; t16; t18; t19; t20
tf1; tf2; tf4; tf5; tf6; tf9; tg2; tg3; tg4

echo "owned.test.sh: $PASS passed, $FAILN failed"
if [ "$FAILN" -gt 0 ]; then exit 1; fi
exit 0
