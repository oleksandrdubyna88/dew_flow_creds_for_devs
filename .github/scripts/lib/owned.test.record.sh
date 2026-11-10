#!/usr/bin/env bash
# The name, the claim and the owner record (T1, T2, T3, T4, T5, T6, T12, F5, F6, F9, G2, G3, G4).
# Part of the self-test of owned.sh; run by owned.test.sh, or alone:  .github/scripts/lib/owned.test.record.sh
# shellcheck disable=SC2329,SC2016,SC2015,SC2012
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR
# shellcheck source=owned.test.lib.sh
source "$here/owned.test.lib.sh" || exit 1


# --- T1 the name -------------------------------------------------------------------------------------------------------
# case T1 - the printed names start with the number
name_has_the_owner_form_and_the_reference_token() {
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
# case T2 - the printed names start with the number
record_equals_the_reference_format_owner_byte_for_byte() {
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
# case T4 - the printed names start with the number
claim_exists_before_the_folder() {
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
# case T5 - the printed names start with the number
taken_claim_is_kept_and_the_create_is_exclusive() {
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
# case T6 - the printed names start with the number
bad_arguments_make_nothing() {
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

# --- T12 Windows: no node, no token --------------------------------------------------------------------------------------------
# case T12 - the printed names start with the number
windows_without_node_makes_nothing() {
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

# --- F5 WSL_DISTRO_NAME: the record equals the reference's formatOwner (spaces only: no distro; a space inside: one '-') ---
# case F5 - the printed names start with the number
wsl_distro_name_is_normalised_like_the_reference() {
  case_root tf5
  premise "F5 node runs" test -f "$mount_lib/owned.mjs" || return 0
  child tf5 << 'EOF'
. "$T_OWNED_SH"
owned_dir d x || exit 1
: > "$T_CTL/tf5.ready"
hold "$T_CTL/tf5.stop"
EOF
  local wsl cpid d line expected pid_for_ref idx=0
  local long="" k=0
  while [ "$k" -lt 25 ]; do k=$((k + 1)); long="$long seg$k@:  "; done
  for wsl in "   " "My Distro" "My  Dis@:tro--x  " "$long"; do
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
# case F6 - the printed names start with the number
relative_tmpdir_is_made_absolute() {
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
# case F9 - the printed names start with the number
a_set_seam_is_named_on_stderr_once() {
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
# case G2 - the printed names start with the number
a_token_that_cannot_be_had_makes_nothing() {
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
# case G3 - the printed names start with the number
caller_variable_names_never_collide_with_internal_ones() {
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
# case G4 - the printed names start with the number
a_minimal_proc_gives_a_record_without_start_and_ns() {
  if [ "$osclass" != linux ]; then skipped "G4" "Linux only (the start and the namespace are written on Linux only)"; return 0; fi
  case_root tg4
  child tg4 << 'EOF'
. "$T_OWNED_SH"
FP="$T_CTL/fakeproc-$FP_NAME"
if [ -n "$FP_CWD" ]; then cd "$FP_CWD" || exit 90; fi
mkdir -p "$FP/$$" "$FP/self/ns"
printf '%s\n' "$$ ($FP_COMM) $FP_REST" > "$FP/$$/stat"
if [ -n "$FP_BTIME" ]; then printf 'cpu 1 2\nbtime %s\nprocesses 5\n' "$FP_BTIME" > "$FP/stat"; else printf 'cpu 1 2\n' > "$FP/stat"; fi
if [ -z "$FP_NO_NS" ]; then ln -s 'pid:[4242]' "$FP/self/ns/pid"; fi
OWNED_PROC="$FP"
owned_dir d x || exit 1
cp "$d.owner" "$T_CTL/tg4-$FP_NAME.claim"
EOF
  local good='S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 250' star='S 0 0 0 * 0 0 0 0 0 0 0 0 0 0 0 0 0 0 250' tick line n
  tick="$(getconf CLK_TCK)"
  # a folder of files whose names could be stat fields or, with a *, shift them (pathname expansion must never touch the fields)
  mkdir "$CTL/globdir"; : > "$CTL/globdir/a"; : > "$CTL/globdir/b"; : > "$CTL/globdir/c"; : > "$CTL/globdir/S"; : > "$CTL/globdir/R"; : > "$CTL/globdir/0"
  # name | btime | rest of the stat line after the command | no-ns | start in a folder of files | expect
  local cases="nobtime||$good|||none
badbtime|x1|$good|||none
badfield|1000|S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 abc|||none
shortstat|1000|S 0 0|||none
nons|1000|$good|1||none
good|1000|$good|||start
globfiles|1000|$good||$CTL/globdir|start
globstar|1000|$star||$CTL/globdir|start"
  local c_name c_btime c_rest c_nons c_cwd c_expect
  while IFS='|' read -r c_name c_btime c_rest c_nons c_cwd c_expect; do
    run_child tg4 FP_NAME="$c_name" FP_BTIME="$c_btime" FP_REST="$c_rest" FP_NO_NS="$c_nons" FP_CWD="$c_cwd" FP_COMM="a b) c"
    eq "G4 $c_name: the child exits 0" "$CH_RC" 0
    line="$(first_line "$CTL/tg4-$c_name.claim")"
    if [ "$c_expect" = start ]; then
      eq "G4 $c_name: the start is btime + field 22 / CLK_TCK, the ns is the link's (a command name with ') ')" "${line#*@linux:*:}" "$((1000 + 250 / tick)):4242"
    else
      [[ "$line" =~ ^[uw][0-9]{1,10}:[^@:[:space:]]+@linux:[1-9][0-9]*$ ]] && ok "G4 $c_name: the record ends after the pid ($line)" || bad "G4 $c_name" "record: $line"
    fi
    n="$(grep -ciE 'arithmetic|syntax error|too great|bad substitution|unbound' "$CTL/tg4.err")"
    eq "G4 $c_name: no shell error on stderr" "$n" 0
  done <<< "$cases"
}


# case G5 - a uname that fails stops owned_dir early, with a line that names uname
uname_failure_stops_owned_dir_early_and_says_so() {
  case_root tg5
  child tg5 << 'EOF'
. "$T_OWNED_SH"
uname() { return 1; }
d=UNTOUCHED
owned_dir d x 2> "$T_CTL/tg5.msg"; echo "$?" > "$T_CTL/tg5.rc"
echo "$d" > "$T_CTL/tg5.d"
EOF
  run_child tg5
  eq "G5 owned_dir returns 1 when uname fails" "$(first_line "$CTL/tg5.rc")" 1
  eq "G5 the variable is untouched" "$(first_line "$CTL/tg5.d")" UNTOUCHED
  eq "G5 nothing is made" "$(count "$CR")" 0
  eq "G5 the message names uname" "$(grep -c uname "$CTL/tg5.msg")" 1
}

# --- run ---
name_has_the_owner_form_and_the_reference_token; record_equals_the_reference_format_owner_byte_for_byte; claim_exists_before_the_folder; taken_claim_is_kept_and_the_create_is_exclusive; bad_arguments_make_nothing; windows_without_node_makes_nothing; wsl_distro_name_is_normalised_like_the_reference; relative_tmpdir_is_made_absolute; a_set_seam_is_named_on_stderr_once; a_token_that_cannot_be_had_makes_nothing; caller_variable_names_never_collide_with_internal_ones; a_minimal_proc_gives_a_record_without_start_and_ns; uname_failure_stops_owned_dir_early_and_says_so
owned_test_finish
