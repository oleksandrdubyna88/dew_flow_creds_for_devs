#!/usr/bin/env python3
"""Hold one connection to a run's relay socket open until this process's stdin closes.

    CREDS_ITEST_SOCKET=<cache>/creds-itest/<run>/<name>.sock python3 wslHoldSocket.py

Run inside the distribution by `wsl-agent-relay-itest.cjs` through `wslSteps.sh`, which exports the variable. A
connected client that says nothing is what makes the relay start a `creds.exe relay-pipe` on Windows and keep it
for as long as the connection lasts — the live child the harness then expects the relay's own ending to take down
(PLAN_wsl_bridge_outlives_its_client.md, E5.S1). Only a socket inside a run directory of these harnesses is
accepted — the shape `wslRun.cjs` names — so this can never be pointed at anything else. It prints `held` once
connected and leaves when the Windows side closes its stdin, so nothing has to signal it. Nothing here deletes
anything.
"""
import os
import re
import socket
import sys

SOCKET = re.compile(r"(/[^/]+)+/creds-itest/[0-9a-z]+-[0-9]+/[A-Za-z0-9_.-]+\.sock")


def main():
    path = os.environ.get("CREDS_ITEST_SOCKET", "")
    if SOCKET.fullmatch(path) is None:
        print(f"not a socket of an itest run: {path!r}", file=sys.stderr)
        sys.exit(2)
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as held:
        held.connect(path)
        print("held", flush=True)
        sys.stdin.buffer.read()


if __name__ == "__main__":
    main()
