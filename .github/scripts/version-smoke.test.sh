#!/usr/bin/env bash
# The version smoke's own test, against stand-in binaries — so the check that guards every `creds` and `creds-mcp`
# release is itself checked on every pull request (`ci-clients.yml`), on the three operating systems it runs on.
#
#   .github/scripts/version-smoke.test.sh
#
# The stand-in is one bash script that plays either binary: as `creds-mcp` it answers `--version`, as `creds` it
# writes the `relay-pipe` log a run with no agent writes. What it says is set by environment variables, so each
# case below is a wrong answer the smoke must refuse — or the right one it must pass.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke="$here/version-smoke.sh"
work="$(mktemp -d)"
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

expect 'mcp: the tag version passes'                             0 'passed' mcp 0.10.1 FAKE_VERSION=0.10.1
expect 'mcp: the tag version with a CRLF (Windows) passes'       0 'passed' mcp 0.10.1 FAKE_VERSION=0.10.1 FAKE_CRLF=yes
expect 'mcp: a second line (the WSL Windows half) is not judged' 0 'passed' mcp 0.10.1 FAKE_VERSION=0.10.1 'FAKE_SECOND_LINE=windows half: creds-mcp 0.9.0 (x)'
expect 'mcp: the SDK default 1.0.0 fails'                        1 "printed 'creds-mcp 1.0.0'" mcp 0.10.1 FAKE_VERSION=1.0.0
expect 'mcp: a longer version (0.10.10 for 0.10.1) fails'        1 "printed 'creds-mcp 0.10.10'" mcp 0.10.1 FAKE_VERSION=0.10.10
expect 'mcp: a dot is not a wildcard (0x10x1 for 0.10.1) fails'  1 "printed 'creds-mcp 0x10x1'" mcp 0.10.1 FAKE_VERSION=0x10x1
expect 'mcp: trailing text on the line fails'                    1 "printed 'creds-mcp 0.10.1 (dev)'" mcp 0.10.1 'FAKE_VERSION=0.10.1 (dev)'
expect 'mcp: a non-zero exit fails'                              1 '--version exited 3' mcp 0.10.1 FAKE_VERSION=0.10.1 FAKE_EXIT=3
expect 'mcp: a binary that never ends fails at the guard'        1 'did not end within 3 s' mcp 0.10.1 FAKE_VERSION=0.10.1 FAKE_HANG=yes
expect 'cli: the tag version in the log start line passes'       0 'passed' cli 0.4.1 FAKE_VERSION=0.4.1
expect 'cli: the same with CRLF line ends passes'                0 'passed' cli 0.4.1 FAKE_VERSION=0.4.1 FAKE_CRLF=yes
expect 'cli: the SDK default 1.0.0 fails'                        1 'does not name version 0.4.1' cli 0.4.1 FAKE_VERSION=1.0.0
expect 'cli: a longer version (0.4.10 for 0.4.1) fails'          1 'does not name version 0.4.1' cli 0.4.1 FAKE_VERSION=0.4.10
expect 'cli: no log at all fails'                                1 'wrote no log' cli 0.4.1 FAKE_VERSION=0.4.1 FAKE_LOG=no
expect 'cli: a binary that never ends fails at the guard'        1 'did not end within 3 s' cli 0.4.1 FAKE_VERSION=0.4.1 FAKE_HANG=yes
expect 'an expected version that is not X.Y.Z is refused'        1 'must be X.Y.Z' mcp 0.10.1-rc.1 FAKE_VERSION=0.10.1-rc.1
expect 'an unknown kind is refused'                              1 'usage:' server 0.10.1 FAKE_VERSION=0.10.1

rm -rf "$work"
if [[ "$failures" -eq 0 ]]; then
  echo "all version smoke self-test checks passed"
else
  echo "$failures version smoke self-test check(s) failed"
fi
exit "$failures"
