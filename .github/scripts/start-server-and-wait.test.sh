#!/usr/bin/env bash
# The start script's own test, against stand-in servers — so the step that decides whether the contract suite may
# run is itself checked on every pull request (`ci-server.yml`, job `contract`), before the real server is built.
#
#   .github/scripts/start-server-and-wait.test.sh
#
# Why it exists (research/PLAN_contract_suite_waits_for_a_built_server.md): the old inline wait ended silently when
# nothing answered, so a cold build that took 67.3 s became 370 `ECONNREFUSED` contract failures on #240.
#
# The stand-ins are one node file with a mode, on a loopback port node itself found free:
#   a. never listens                      → FAIL within the deadline, in one sentence, with the log, the pid stopped;
#   b. prints a Fatal line and exits 78   → FAIL at once although the deadline is long, with the code and the log;
#   c. listens (200) after 2 s            → PASS, and the pid it hands back is alive (this test then stops it);
#   d. answers 500                        → keeps waiting, FAILS no earlier than the deadline, naming the 500;
#   e. no `--`                            → usage, exit 2;
#   f. the URL already answers 2xx        → FAIL at once, starting nothing.
# START_SERVER_SCRIPT points the cases at another implementation — how the old inline loop was shown to pass (a).
# Needs bash, node, curl and GNU date. Its scratch folder is its own `mktemp -d`; the trap removes it and stops
# every pid this test recorded (only those — never anything by name), however the test ends.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
start="${START_SERVER_SCRIPT:-$here/start-server-and-wait.sh}"
work="$(mktemp -d)"
fake="$work/fake-server.cjs"
failures=0
pids=()

# Invoked by the EXIT trap only. Both codes, as in deploy/restore-archive.sh: shellcheck 0.11 calls it SC2329,
# every version before it SC2317.
# shellcheck disable=SC2317,SC2329
cleanup() {
  local p
  for p in "${pids[@]}"; do
    kill "$p" 2> /dev/null || true
  done
  rm -rf "$work"
}
trap cleanup EXIT

cat > "$fake" <<'EOF'
// A stand-in server: node fake-server.cjs <mode> <port>
const http = require('node:http');
const [mode, port] = process.argv.slice(2);
const serve = (status) =>
  http.createServer((_, res) => { res.writeHead(status); res.end(); }).listen(Number(port), '127.0.0.1');
console.log(`stand-in: mode ${mode}, port ${port}`);
if (mode === 'never') setInterval(() => {}, 1000);
if (mode === 'refused') {
  console.log('[00:00:00 FTL] CredVaultServer: exited: code 78, reason startupRefused: No authentication scheme configured');
  process.exit(78);
}
if (mode === 'late') setTimeout(() => serve(200), 2000);
if (mode === 'error' || mode === 'ok') serve(mode === 'ok' ? 200 : 500);
EOF

free_port() {
  node -e "const s=require('node:net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"
}
now_ms() { date +%s%3N; }
alive() { kill -0 "$1" 2> /dev/null; }
says() { grep -qF -- "$1" "$work/run.log"; }

# launch <deadline> <mode>: the script under test against a stand-in on a fresh port.
# Sets $port, $code, $ms (elapsed milliseconds) and $pid (from $GITHUB_OUTPUT, when the script wrote one).
launch() {
  local deadline="$1" mode="$2" began
  port="$(free_port)"
  : > "$work/output"
  began="$(now_ms)"
  code=0
  GITHUB_OUTPUT="$work/output" START_SERVER_LOG="$work/server-$mode.log" START_SERVER_POLL_SECONDS=0.5 \
    bash "$start" "http://127.0.0.1:$port/api/health" "$deadline" -- node "$fake" "$mode" "$port" \
    > "$work/run.log" 2>&1 || code=$?
  ms=$(($(now_ms) - began))
  pid="$(sed -n 's/^pid=//p' "$work/output")"
  started="$(sed -n 's/^started pid \([0-9]*\):.*/\1/p' "$work/run.log")"
  [[ -n "$pid" ]] && pids+=("$pid")
  [[ -n "$started" ]] && pids+=("$started")
  return 0
}

verdict() {
  local name="$1" ok="$2"
  if [[ "$ok" == yes ]]; then
    echo "ok   $name ($(awk "BEGIN{printf \"%.1f\", $ms/1000}") s, exit $code)"
  else
    echo "FAIL $name — exit $code after ${ms} ms; the start script said:"
    sed 's/^/     /' "$work/run.log"
    failures=$((failures + 1))
  fi
}

# a. Never listens: deadline 3 s. Bound: deadline + one 5 s probe + the 5 s stop + 2 s slack.
launch 3 never
ok=no
if [[ "$code" -eq 1 && "$ms" -le 15000 ]] \
  && says "did not answer 2xx on http://127.0.0.1:$port/api/health within 3 s (last answer: no connection)" \
  && says 'stand-in: mode never' && ! alive "$started"; then ok=yes; fi
verdict 'a. a server that never listens fails within the deadline, in one sentence, with its log, and is stopped' "$ok"

# b. Exits 78 with a Fatal line: deadline 30 s, but it must fail within 5.
launch 30 refused
ok=no
if [[ "$code" -eq 1 && "$ms" -lt 5000 ]] && says 'the server exited with code 78 before it answered' \
  && says 'FTL] CredVaultServer: exited: code 78, reason startupRefused'; then ok=yes; fi
verdict 'b. a server that exits 78 fails at once with its exit code and its Fatal line' "$ok"

# c. Listens after 2 s: passes, and the pid handed back is the live server.
launch 20 late
ok=no
if [[ "$code" -eq 0 && -n "$pid" ]] && alive "$pid" && says "it runs as pid $pid" \
  && grep -q '^log=' "$work/output"; then ok=yes; fi
verdict 'c. a server that listens after 2 s passes and hands back its live pid' "$ok"
[[ -n "$pid" ]] && kill "$pid" 2> /dev/null || true

# d. Answers 500: must keep waiting until the 4 s deadline, then fail naming the 500.
launch 4 error
ok=no
if [[ "$code" -eq 1 && "$ms" -ge 4000 && "$ms" -le 16000 ]] \
  && says "did not answer 2xx on http://127.0.0.1:$port/api/health within 4 s (last answer: 500)"; then ok=yes; fi
verdict 'd. a server that answers 500 is waited for until the deadline, then fails naming the 500' "$ok"

# e. Usage.
code=0
ms=0
bash "$start" "http://127.0.0.1:1/api/health" 5 node "$fake" > "$work/run.log" 2>&1 || code=$?
ok=no
if [[ "$code" -eq 2 ]] && says 'usage: start-server-and-wait.sh'; then ok=yes; fi
verdict 'e. a call without -- is a usage error' "$ok"

# f. The URL already answers: a server from an earlier run must not be mistaken for the new one.
port="$(free_port)"
node "$fake" ok "$port" > /dev/null 2>&1 &
squatter=$!
pids+=("$squatter")
for _ in $(seq 1 50); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health" || true)" == 200 ]] && break
  sleep 0.1
done
code=0
began="$(now_ms)"
GITHUB_OUTPUT="$work/output" START_SERVER_LOG="$work/server-squat.log" \
  bash "$start" "http://127.0.0.1:$port/api/health" 20 -- node "$fake" never "$port" > "$work/run.log" 2>&1 || code=$?
ms=$(($(now_ms) - began))
started="$(sed -n 's/^started pid ([0-9]*):.*//p' "$work/run.log")"
[[ -n "$started" ]] && pids+=("$started")
ok=no
if [[ "$code" -eq 1 && "$ms" -lt 5000 ]] && says 'already answers 200' && ! says 'started pid'; then ok=yes; fi
verdict 'f. a URL that already answers refuses to start a second server' "$ok"
kill "$squatter" 2> /dev/null || true

if [[ "$failures" -eq 0 ]]; then
  echo "all start-server self-test checks passed"
else
  echo "$failures start-server self-test check(s) failed"
fi
exit "$failures"
