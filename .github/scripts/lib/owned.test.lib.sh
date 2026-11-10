# shellcheck shell=bash
# The shared harness of the self-test of owned.sh (sourced by the area files; see owned.test.sh).
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
# SC2012: ls -A only counts names of folders this test made. SC2034: this file is sourced; the area files read the variables it
# sets (janitor, TOK, repo_native, CH_RC, re_rec_linux), which ShellCheck cannot see from here.
# shellcheck disable=SC2329,SC2016,SC2015,SC2012,SC2034
set -o pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
T_OWNED="${T_OWNED_SH:-$here/owned.sh}"
janitor="$repo/.agents/conventions/tools/janitor.sh"
mount_lib="$repo/.agents/conventions/tools/lib"

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
ROOT="" # set by owned_dir through printf -v, which ShellCheck cannot see (SC2153)
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
njs() { LIB_DIR="$lib_native" TESTSTODELETE_OWNER='' TESTSTODELETE_RUN='' node --input-type=module -e "$NJS_PRE $1"; }

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

re_rec_linux='^[uw][0-9]{1,10}:[^@:[:space:]]+@linux:[1-9][0-9]*:[0-9]+:[0-9]+$'

# The end of an area file: the totals, and the exit status.
owned_test_finish() {
  echo "$(basename "$0"): $PASS passed, $FAILN failed"
  if [ "$FAILN" -gt 0 ]; then exit 1; fi
  exit 0
}
