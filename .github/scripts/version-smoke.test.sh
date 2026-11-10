#!/usr/bin/env bash
# The version smoke's own test, against stand-in binaries — so the check that guards every `creds` and `creds-mcp`
# release is itself checked on every pull request (`ci-clients.yml`), on the three operating systems it runs on.
#
#   .github/scripts/version-smoke.test.sh
#
# The stand-in is one bash script that plays either binary: as `creds-mcp` it answers `--version`, as `creds` it
# writes the `relay-pipe` log a run with no agent writes. What it says is set by environment variables, so each
# case below is a wrong answer the smoke must refuse — or the right one it must pass.
# Under Git Bash (Windows) the helper needs Node and the shared rules mount (`git submodule update --init .agents/conventions`).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke="$here/version-smoke.sh"
# The scratch folder is an owned folder (lib/owned.sh): claimed first, removed by the helper's exit trap on EVERY way
# the test ends — a failing command under set -e, an interrupt, a normal end. The test sets no trap of its own.
# shellcheck source-path=SCRIPTDIR
# shellcheck source=lib/owned.sh
source "$here/lib/owned.sh"
work="" # set by owned_dir through printf -v, which ShellCheck cannot see (SC2154)
owned_dir work smoke-test || exit 1
fake="$work/fake-binary.sh"
failures=0

cat > "$fake" <<'EOF'
#!/usr/bin/env bash
eol=$'\n'
[[ "${FAKE_CRLF:-no}" == yes ]] && eol=$'\r\n'
# exec: the guard's signal then reaches the sleeping process itself, and no orphan is left behind
[[ "${FAKE_HANG:-no}" == yes ]] && exec sleep 30
case "${1:-}" in
  --version)
    printf 'creds-mcp %s%s' "$FAKE_VERSION" "$eol"
    [[ -n "${FAKE_SECOND_LINE:-}" ]] && printf '%s%s' "$FAKE_SECOND_LINE" "$eol"
    exit "${FAKE_EXIT:-0}"
    ;;
  relay-pipe)
    if [[ "${FAKE_LOG:-yes}" == yes ]]; then
      mkdir -p "$CREDS_LOG_DIR"
      printf 'started: relay-pipe, version %s, pid 1, parent 2%s' "$FAKE_VERSION" "$eol" > "$CREDS_LOG_DIR/creds-relay-pipe-fake.log"
      printf 'exited: code 90, reason noAgentAnnounced, after 0.000 s%s' "$eol" >> "$CREDS_LOG_DIR/creds-relay-pipe-fake.log"
    fi
    exit 90
    ;;
esac
exit 64
EOF
chmod +x "$fake"

# expect <name> <exit code the smoke must give> <text its output must hold> <kind> <expected version> [VAR=value ...]
# The text is what makes a failing case honest: a smoke that refuses for the WRONG reason (no log, where the case
# is about the guard) would still exit 1, and the exit code alone would call that a pass.
# What a passing run says — one constant for every case that must pass.
passes='version smoke passed'

expect() {
  local name="$1" wanted="$2" says="$3" kind="$4" version="$5"
  shift 5
  local code=0
  env SMOKE_GUARD_SECONDS=3 "$@" bash "$smoke" "$kind" "$fake" "$version" "$work" > "$work/run.log" 2>&1 || code=$?
  if [[ "$code" -eq "$wanted" ]] && grep -qF -- "$says" "$work/run.log"; then
    echo "ok   $name (the smoke exited $code)"
  else
    echo "FAIL $name — expected the smoke to exit $wanted saying '$says', it exited $code; its output:"
    sed 's/^/     /' "$work/run.log"
    failures=$((failures + 1))
  fi
}

expect 'mcp: the tag version passes'                             0 "$passes" mcp 0.10.1 FAKE_VERSION=0.10.1
expect 'mcp: the tag version with a CRLF (Windows) passes'       0 "$passes" mcp 0.10.1 FAKE_VERSION=0.10.1 FAKE_CRLF=yes
expect 'mcp: a second line (the WSL Windows half) is not judged' 0 "$passes" mcp 0.10.1 FAKE_VERSION=0.10.1 'FAKE_SECOND_LINE=windows half: creds-mcp 0.9.0 (x)'
expect 'mcp: the SDK default 1.0.0 fails'                        1 "printed 'creds-mcp 1.0.0'" mcp 0.10.1 FAKE_VERSION=1.0.0
expect 'mcp: a longer version (0.10.10 for 0.10.1) fails'        1 "printed 'creds-mcp 0.10.10'" mcp 0.10.1 FAKE_VERSION=0.10.10
expect 'mcp: a dot is not a wildcard (0x10x1 for 0.10.1) fails'  1 "printed 'creds-mcp 0x10x1'" mcp 0.10.1 FAKE_VERSION=0x10x1
expect 'mcp: trailing text on the line fails'                    1 "printed 'creds-mcp 0.10.1 (dev)'" mcp 0.10.1 'FAKE_VERSION=0.10.1 (dev)'
expect 'mcp: a non-zero exit fails'                              1 '--version exited 3' mcp 0.10.1 FAKE_VERSION=0.10.1 FAKE_EXIT=3
expect 'mcp: a binary that never ends fails at the guard'        1 'did not end within 3 s' mcp 0.10.1 FAKE_VERSION=0.10.1 FAKE_HANG=yes
expect 'cli: the tag version in the log start line passes'       0 "$passes" cli 0.4.1 FAKE_VERSION=0.4.1
expect 'cli: the same with CRLF line ends passes'                0 "$passes" cli 0.4.1 FAKE_VERSION=0.4.1 FAKE_CRLF=yes
expect 'cli: the SDK default 1.0.0 fails'                        1 'does not name version 0.4.1' cli 0.4.1 FAKE_VERSION=1.0.0
expect 'cli: a longer version (0.4.10 for 0.4.1) fails'          1 'does not name version 0.4.1' cli 0.4.1 FAKE_VERSION=0.4.10
expect 'cli: no log at all fails'                                1 'wrote no log' cli 0.4.1 FAKE_VERSION=0.4.1 FAKE_LOG=no
expect 'cli: a binary that never ends fails at the guard'        1 'did not end within 3 s' cli 0.4.1 FAKE_VERSION=0.4.1 FAKE_HANG=yes
expect 'an expected version that is not X.Y.Z is refused'        1 'must be X.Y.Z' mcp 0.10.1-rc.1 FAKE_VERSION=0.10.1-rc.1
expect 'an unknown kind is refused'                              1 'usage:' server 0.10.1 FAKE_VERSION=0.10.1

# off_ci <name> <exit code the smoke must give> <text its output must hold> <kind> <expected version> [VAR=value ...]
# The smoke as a person runs it: no log root and no RUNNER_TEMP, so it makes its own scratch in TMPDIR — a private
# root here — and that root must be empty when the smoke is gone, whether the smoke passed or failed (E2.4.S2, sc. 4).
off_ci_count=0
off_ci() {
  local name="$1" wanted="$2" says="$3" kind="$4" version="$5" code=0 left
  shift 5
  off_ci_count=$((off_ci_count + 1))
  mkdir "$work/root-$off_ci_count"
  env -u RUNNER_TEMP SMOKE_GUARD_SECONDS=3 "$@" TMPDIR="$work/root-$off_ci_count" bash "$smoke" "$kind" "$fake" "$version" > "$work/run.log" 2>&1 || code=$?
  left="$(ls -A "$work/root-$off_ci_count")"
  if [[ "$code" -eq "$wanted" ]] && grep -qF -- "$says" "$work/run.log" && [[ -z "$left" ]]; then
    echo "ok   $name (the smoke exited $code and left nothing)"
  else
    echo "FAIL $name — expected exit $wanted saying '$says' and an empty root; exit $code, left: [$left]; its output:"
    sed 's/^/     /' "$work/run.log"
    failures=$((failures + 1))
  fi
}

# The cli kind makes its scratch only after the binary check, so a failure AFTER the folder is a log that was never written.
off_ci 'off CI, cli: a run that writes no log fails after the folder is made and leaves nothing' 1 'wrote no log' cli 0.4.1 FAKE_VERSION=0.4.1 FAKE_LOG=no
off_ci 'off CI, cli: a passing run leaves nothing'                                              0 "$passes"      cli 0.4.1 FAKE_VERSION=0.4.1

# A log root that does not exist (or cannot be entered) is refused with a message, for the cli kind that makes its leaf in the root. The leaf must NOT be
# made at the filesystem root, which is what `$(cd "$root" && pwd)` gave when the `cd` failed: an empty answer, and `/version-smoke-log-<pid>`.
# The root of this case is private; the check looks at `/` and at HOME for a leaf (on Git Bash the filesystem root is writable).
leaf_somewhere() { compgen -G "/version-smoke-log-*" > /dev/null || compgen -G "${HOME:-/nonexistent}/version-smoke-log-*" > /dev/null; }
mkdir "$work/root-missing"
code=0
env -u RUNNER_TEMP SMOKE_GUARD_SECONDS=3 FAKE_VERSION=0.4.1 TMPDIR="$work/root-missing" bash "$smoke" cli "$fake" 0.4.1 "$work/no-such-root" > "$work/run.log" 2>&1 || code=$?
if [[ "$code" -eq 1 ]] && grep -qF -- "the log root '$work/no-such-root' cannot be entered" "$work/run.log" && ! leaf_somewhere && [[ -z "$(ls -A "$work/root-missing")" ]]; then
  echo "ok   cli: a log root that does not exist is refused with a message and no leaf is made at / or in HOME (the smoke exited $code)"
else
  echo "FAIL cli: a log root that does not exist — expected exit 1 saying the root cannot be entered, no leaf at / or in HOME; exit $code; its output:"
  sed 's/^/     /' "$work/run.log"
  failures=$((failures + 1))
fi

if [[ "$failures" -eq 0 ]]; then
  echo "all version smoke self-test checks passed"
else
  echo "$failures version smoke self-test check(s) failed"
fi
exit "$failures"
