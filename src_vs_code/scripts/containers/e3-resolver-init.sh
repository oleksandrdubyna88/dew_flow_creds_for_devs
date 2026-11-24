#!/bin/sh
# The start of the container of probe P2 of E3.S3 (`todo/PLAN_person_roads_pin_host_key_E3_S3_spec.md`), run as root by the host part of
# `scripts/itestProbeResolver.cjs`; the worktree is mounted read-only at /work. Root does three things and no more: it makes the one user that the harness
# and the counterpart run as, it starts the resolver of the run (the only process that is root: port 53), and it runs the harness as that user.
# The exit code is the harness's. The container ends with it (`--rm`).
set -u
CONTROL=/run/e3-resolver
useradd -m -s /bin/bash -p '*' probe || exit 90
mkdir -p "$CONTROL" && chown probe "$CONTROL" || exit 91
node /work/src_vs_code/scripts/itestResolverServer.cjs "$CONTROL" &
RESOLVER=$!
TRIES=0
while [ ! -e "$CONTROL/ready" ]; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -gt 100 ] || ! kill -0 "$RESOLVER" 2>/dev/null; then
    echo "e3-resolver-init: the resolver did not come up" >&2
    exit 92
  fi
  sleep 0.1
done
runuser -u probe -- sh -c 'cd /work/src_vs_code && exec node --import ./scripts/lower-priority.mjs scripts/itestFeasibility.cjs resolver --inside'
CODE=$?
kill "$RESOLVER" 2>/dev/null
wait "$RESOLVER" 2>/dev/null
exit "$CODE"
