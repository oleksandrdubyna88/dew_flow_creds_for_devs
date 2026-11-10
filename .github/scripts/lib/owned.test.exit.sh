#!/usr/bin/env bash
# The traps, the exit chain, the signals and the removal (T7a-d, T8, T9, T9b, T10, T11, T18, T19, T20, F1, F2, F4).
# Part of the self-test of owned.sh; run by owned.test.sh, or alone:  .github/scripts/lib/owned.test.exit.sh
# shellcheck disable=SC2329,SC2016,SC2015,SC2012
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR
# shellcheck source=owned.test.lib.sh
source "$here/owned.test.lib.sh" || exit 1


# --- T7 the traps ------------------------------------------------------------------------------------------------------------
# case T7A - the printed names start with the number
callers_set_no_trap_of_their_own() {
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
  callers="$(git -C "$repo" grep -l 'lib/owned.sh' -- '*.sh' 2>/dev/null | grep -Ev '^\.github/scripts/lib/owned(\.test(\.[a-z]+)?)?\.sh$')"
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
# case T7B - the printed names start with the number
owned_trap_runs_the_function_then_the_cleanup() {
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
# case T7C - the printed names start with the number
first_owned_dir_sets_the_traps() {
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
# case T7D - the printed names start with the number
a_trap_set_after_the_call_replaces_the_helper_and_leaves_the_folder() {
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
# case T8 - the printed names start with the number
squatter_folder_is_never_adopted_or_removed() {
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
# case T9 - the printed names start with the number
owned_remove_refuses_other_runs_folders() {
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

# --- T9b a planted folder that holds THIS run's own record is still not registered (the registry check, not the claim text, refuses) ---
# case T9B - the printed names start with the number
owned_remove_refuses_an_unregistered_folder_with_our_own_record() {
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

# --- T10 owned_remove of an own folder --------------------------------------------------------------------------------------
# case T10 - the printed names start with the number
owned_remove_removes_an_own_folder_once() {
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
# case T11 - the printed names start with the number
owned_remove_gives_up_with_one_line_on_a_read_only_parent() {
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

# --- T18 the chain under set -e (C2) ----------------------------------------------------------------------------------------
# case T18 - the printed names start with the number
exit_status_survives_the_chain_under_set_e() {
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
# case T19 - the printed names start with the number
helper_works_under_set_u_with_nothing_registered() {
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
# case T20 - the printed names start with the number
a_signal_during_mkdir_is_held_until_the_state_is_recorded() {
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

# --- F1 the caller's function ends the shell (P1) or meets an unbound variable (P2): the cleanup still runs, the status is kept ---
# case F1 - the printed names start with the number
caller_function_that_exits_or_hits_unbound_does_not_stop_the_cleanup() {
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
# case F2 - the printed names start with the number
second_signal_in_the_chain_does_not_cut_it_short() {
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
# case F4 - the printed names start with the number
traps_exist_before_the_first_claim_is_written() {
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


# --- run ---
callers_set_no_trap_of_their_own; owned_trap_runs_the_function_then_the_cleanup; first_owned_dir_sets_the_traps; a_trap_set_after_the_call_replaces_the_helper_and_leaves_the_folder; squatter_folder_is_never_adopted_or_removed; owned_remove_refuses_other_runs_folders; owned_remove_refuses_an_unregistered_folder_with_our_own_record; owned_remove_removes_an_own_folder_once; owned_remove_gives_up_with_one_line_on_a_read_only_parent; exit_status_survives_the_chain_under_set_e; helper_works_under_set_u_with_nothing_registered; a_signal_during_mkdir_is_held_until_the_state_is_recorded; caller_function_that_exits_or_hits_unbound_does_not_stop_the_cleanup; second_signal_in_the_chain_does_not_cut_it_short; traps_exist_before_the_first_claim_is_written
owned_test_finish
