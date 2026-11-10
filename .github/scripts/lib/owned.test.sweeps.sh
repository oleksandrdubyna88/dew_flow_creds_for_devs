#!/usr/bin/env bash
# The kills and the sweeps: the shipped janitor and the mounted Node sweep over what a killed run left (T13, T15, T16).
# Part of the self-test of owned.sh; run by owned.test.sh, or alone:  .github/scripts/lib/owned.test.sweeps.sh
# shellcheck disable=SC2329,SC2016,SC2015,SC2012
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR
# shellcheck source=owned.test.lib.sh
source "$here/owned.test.lib.sh" || exit 1

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
# case T13 - the printed names start with the number
kill_between_claim_and_mkdir_leaves_one_claim_the_sweeps_collect() {
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
# case T15 - the printed names start with the number
kill_after_mkdir_leaves_folder_and_claim_the_janitor_collects() {
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
# case T16 - the printed names start with the number
kept_folder_is_claimed_and_collected_later() {
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


# --- run ---
kill_between_claim_and_mkdir_leaves_one_claim_the_sweeps_collect; kill_after_mkdir_leaves_folder_and_claim_the_janitor_collects; kept_folder_is_claimed_and_collected_later
owned_test_finish
