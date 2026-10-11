#!/usr/bin/env bash
# The ONE shell the WSL harnesses run inside the distribution — constant text, every value an argument.
#
#   wsl.exe -e bash -l wslSteps.sh [NAME=value]... -- <verb> [args]...
#
# `bash -l` so the person's login PATH applies (where their dotnet, node, python3 and OpenSSH live); the
# NAME=value arguments are exported AFTER the profile has run, so a profile that sets SSH_AUTH_SOCK — the
# extension's own rc snippet does exactly that — cannot override a run's socket. No value ever becomes shell
# text: a path with a quote or a space is one argv entry here and one argv entry in whatever this runs
# (security.md: exe + argv, never a shell string — E5 code round, findings 0 and 1). The Windows side bounds
# every call with a timeout; a `wsl.exe` ended by it delivers SIGHUP to what this started, and the harness's
# sweep stops by pid whatever is still there. Nothing here deletes anything.
set -euo pipefail

while [[ $# -gt 0 && "$1" != '--' ]]; do
  export "$1"
  shift
done
if [[ $# -gt 0 ]]; then
  shift
fi
verb="${1:?usage: wslSteps.sh [NAME=value]... -- <verb> [args]...}"
shift

case "$verb" in
  # exec <program> [args]: the program in THIS process, so a signal from the Windows side reaches it directly.
  exec) exec "$@" ;;
  # last-line <program> [args]: its last line, both streams — for an answer read by its tail.
  last-line) "$@" 2>&1 | tail -1 ;;
  # tools <name>...: which of these the distribution lacks, one `missing <name>` line each.
  tools)
    for tool in "$@"; do
      command -v "$tool" > /dev/null || echo "missing $tool"
    done
    ;;
  # cache-root: where this harness family keeps its builds and runs — the person's own cache directory, never /tmp.
  cache-root) printf '%s' "${XDG_CACHE_HOME:-$HOME/.cache}/creds-itest" ;;
  # exists <path>: `yes` when an executable is there.
  exists) [[ -x "$1" ]] && echo yes ;;
  # build <build-dir> <repo> <project> <file>...: the inputs copied under <build-dir>, the project built there.
  # No AOT: the distribution has the SDK but not necessarily a native linker, and the code under test is
  # identical either way — only the packaging differs. No build servers: a compiler server or an MSBuild node
  # left running would be a process of this run that no watch can see (its executable is the SDK's). Lowered
  # (`nice -n 19`, at most 4 MSBuild nodes — common/local-cpu-budget.md): these harnesses only ever run on a
  # developer's machine, where a build must not starve the editor; a hosted runner has no distribution. The
  # whole output goes back, both streams: the harness prints it only when no executable came out, and a build
  # that failed is diagnosed from its first error, not its last five lines (checkpoint round, finding 4).
  build)
    build="$1"
    repo="$2"
    project="$3"
    shift 3
    for file in "$@"; do
      mkdir -p "$build/$(dirname "$file")"
      cp "$repo/$file" "$build/$file"
    done
    cd "$build/$project/src"
    nice -n 19 dotnet build -c Debug -p:PublishAot=false -m:4 --disable-build-servers 2>&1
    ;;
  # copy-build <output> <target>: a build output into this run's own directory.
  copy-build) mkdir -p "$2" && cp -r "$1/." "$2/" ;;
  # disk-usage <root>: what this harness family keeps there — listed, never removed.
  disk-usage) du -sh "$1" 2> /dev/null | tail -1 ;;
  # sign <pub> <payload>: the agent's public key, a payload, a signature made through the relay.
  sign) ssh-add -L > "$1" && echo payload > "$2" && ssh-keygen -Y sign -f "$1" -n file "$2" 2>&1 | tail -1 ;;
  # verify <pub> <payload> <allowed>: the signature checked the way `git commit -S`'s verifier does.
  verify)
    printf '%s %s\n' itest "$(cut -d' ' -f1,2 "$1")" > "$3"
    ssh-keygen -Y verify -f "$3" -I itest -n file -s "$2.sig" < "$2" 2>&1 | tail -1
    ;;
  *)
    echo "wslSteps.sh: no such verb: $verb" >&2
    exit 2
    ;;
esac
