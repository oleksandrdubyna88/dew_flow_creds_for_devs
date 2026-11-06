# PLAN — Two parent-watch tests fail on any Linux run inside WSL

> Status: **plan only, nothing implemented, 2026-11-06.** The owner asked for this to be recorded and not fixed now. Scope:
> `src_mcp/tests/ParentWatchProcessTests.cs` only. No product change is proposed.

## Symptom

Run on a WSL machine, the MCP test suite is never fully green: 167 of 169 pass. These two cases fail:

- `The_server_ends_when_its_parent_is_killed_while_stdin_stays_open` (`ParentWatchProcessTests.cs:29`). The server exits,
  but the assertion at `:41` expects `exited: code 0, reason parentGone`. The log says `exited: code 99, reason
  windowsHalfMissing`.
- `The_server_keeps_serving_when_the_watch_is_off`, the `CREDS_MCP_NO_PARENT_WATCH` case (`:47`). The server exits within
  the 5 s in which it must stay alive (`:57`).

The third case, the `WslInterop.RelayedVariable` row of that theory, passes here.

Measured 2026-11-06 on one WSL Ubuntu machine with no `creds-mcp.exe` on the PATH: 3 of 3 runs failed the same way. Two
were whole-suite runs on the #304 branch and one was a run of this class alone on a clean `origin/main` (`7d5e180`). All
of `clients · build · test` passes on `ubuntu-latest`, `windows-latest` and `macos-latest`, so CI does not see this.

Only the first failure's log was read. The second failure's cause below is inferred from its assertion and from the
third case passing, and the first step of the build order confirms it.

## Cause

The tests start the real `creds-mcp` binary. Inside WSL that binary is not a server, it is the bridge to the Windows
half:

- `WslInterop.ShouldRelayHere` (`src_broker_client/src/WslInterop.cs:113`) reads `WSL_DISTRO_NAME` and `/proc/version`, and
  `ShouldRelay` (`:101`) answers yes when either says WSL, unless the process was itself started by a relay.
- `Program.cs:145` takes that road. With no Windows binary to start, it logs the message at `Program.cs:287` and ends with
  code 99, before the test has killed the parent.

So these tests measure the Windows half being missing, not the parent watch.

The relayed case passes because `RelayedVariable` also stops `ShouldRelay` from answering yes, so that server answers
locally with the watch off.

## What will not work

- **Clearing `WSL_DISTRO_NAME` in the test.** `/proc/version` still says WSL, and a test cannot change that.
- **Setting `RelayedVariable` on the failing cases.** It turns the parent watch off (`Program.cs:300` and below), so the
  first test could no longer pass, and the second would pass for a reason other than the one it names.
- **Installing `creds-mcp.exe` on the machine.** The server would then relay to it, and the test would still not be
  watching this binary's parent. Not measured.

## Build order

1. Read the second failure's log to confirm the cause above.
2. Decide between the two routes. The recommendation is the first.
   - **Skip with a stated reason** when `WslInterop.ShouldRelayHere()` is true and `RelayedVariable` is not what the case
     sets. The suite then says that these cases cannot run here, rather than failing. `ubuntu-latest` still runs them, and
     `VersionTests.cs:122` and `:135` still cover both branches of `WatchParent` on every machine.
   - **A test-only way to answer locally inside WSL.** This keeps the process test running here, but it adds a switch to
     a shipped binary for the benefit of one test, and that switch would need its own security reading.
3. Check the suite's skip count on CI afterwards, so that a skip cannot spread to `ubuntu-latest` unnoticed.

`todo/PLAN_test_leftovers_E2.md:298` also names `ParentWatchProcessTests.cs`, for its temp folders. Whichever lands second
reconciles with the other.

## Test plan

- On this WSL machine: the MCP suite reports 0 failed, and the two cases as skipped with the reason.
- On CI: `ubuntu-latest`, `windows-latest` and `macos-latest` still RUN all three cases. Read the test results for the
  class, not only the job's colour.
- RED, GREEN, RED: remove the skip condition and the two cases fail here again.

## Definition of Done

- [ ] A whole MCP suite run on a WSL machine reports 0 failed.
- [ ] All three cases are shown to run on all three CI legs.
- [ ] `research/module_tests.md` says what these tests do not cover inside WSL.
- [ ] This plan moves to `research/` with its status changed and its README rows updated.
