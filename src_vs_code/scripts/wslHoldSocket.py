#!/usr/bin/env python3
"""Hold one connection to a unix socket open until this process's stdin closes.

    python3 wslHoldSocket.py <socket-path>

Run inside the distribution by `wsl-agent-relay-itest.cjs` (`wsl.exe -e python3 <this file> <socket>`, argv only).
A connected client that says nothing is what makes the relay start a `creds.exe relay-pipe` on Windows and keep it
for as long as the connection lasts — the live child the harness then expects the relay's own ending to take down
(PLAN_wsl_bridge_outlives_its_client.md, E5.S1: `manager.dispose()` → 0 survivors). It prints `held` once connected
and leaves when the Windows side closes its stdin, so nothing has to signal it. Nothing here deletes anything.
"""
import socket
import sys


def main(argv):
    if len(argv) != 1:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as held:
        held.connect(argv[0])
        print("held", flush=True)
        sys.stdin.buffer.read()


if __name__ == "__main__":
    main(sys.argv[1:])
