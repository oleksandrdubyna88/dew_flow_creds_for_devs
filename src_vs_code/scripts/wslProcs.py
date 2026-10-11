#!/usr/bin/env python3
"""The WSL half of the itests' process watch: list and stop ONLY what a run started from its own directory.

    python3 wslProcs.py list <run-dir>            pids whose executable lies under <run-dir>, one per line
    python3 wslProcs.py stop <run-dir> <pid>...   SIGTERM to each of those pids that still matches; prints them
    python3 wslProcs.py fds <run-dir> <pid>       how many descriptors that pid holds open (/proc/<pid>/fd), read-only

Run by `wslStrays.cjs` as `wsl.exe -e python3 <this file> ...` — argv only, no shell between, so nothing here is
ever parsed as a command line (PLAN_wsl_bridge_outlives_its_client.md, E5.S1).

The criterion is the process's EXECUTABLE (`/proc/<pid>/exe`), never its command line and never its parent: the
Claude-shaped client names the wrapper in its own argv, and an interop child is not parented to anything of ours.

A stop goes through a pidfd (gate round 1, finding 1): the descriptor is opened first, the executable is read after
it, and the signal is sent through it — so a pid that exited and was reused in between cannot be hit; the old
process's pidfd answers "gone" instead. Nothing here deletes anything.
"""
import os
import re
import signal
import sys

# `/tmp/creds-itest-<time36>-<pid>` — a RUN directory and nothing else: not a parent, not the shared build
# directory (`/tmp/creds-itest-build-<kind>-<hash>`, from which nothing is ever started), not a prefix that
# could match more (own review of E5).
RUN_DIR = re.compile(r"/tmp/creds-itest-[0-9a-z]+-[0-9]+/?")


def refuse(reason):
    print(reason, file=sys.stderr)
    sys.exit(2)


def run_dir(arg):
    """Only a run directory of these harnesses, in the shape `wslRun.cjs` names them."""
    if RUN_DIR.fullmatch(arg) is None:
        refuse(f"not an itest run directory: {arg!r}")
    return arg.rstrip("/") + "/"


def executable(pid):
    try:
        return os.readlink(f"/proc/{pid}/exe")
    except OSError:
        return ""


def listed(directory):
    me = os.getpid()
    for entry in os.listdir("/proc"):
        if entry.isdigit() and int(entry) != me and executable(entry).startswith(directory):
            yield int(entry)


def stop(directory, pids):
    for pid in pids:
        try:
            handle = os.pidfd_open(pid)
        except (ProcessLookupError, PermissionError):
            continue
        try:
            if executable(pid).startswith(directory):
                signal.pidfd_send_signal(handle, signal.SIGTERM)
                print(pid)
        except ProcessLookupError:
            pass
        finally:
            os.close(handle)


def fds(directory, pid):
    """The relay harness's fd baseline: a count, and only of a process this run started."""
    if not executable(pid).startswith(directory):
        refuse(f"pid {pid} is not a process from {directory}")
    print(len(os.listdir(f"/proc/{pid}/fd")))


def main(argv):
    if len(argv) < 2 or argv[0] not in ("list", "stop", "fds"):
        refuse(__doc__)
    directory = run_dir(argv[1])
    if argv[0] == "list":
        for pid in listed(directory):
            print(pid)
    elif argv[0] == "fds":
        if len(argv) != 3 or not argv[2].isdigit():
            refuse(__doc__)
        fds(directory, int(argv[2]))
    else:
        stop(directory, [int(p) for p in argv[2:] if p.isdigit()])


if __name__ == "__main__":
    main(sys.argv[1:])
