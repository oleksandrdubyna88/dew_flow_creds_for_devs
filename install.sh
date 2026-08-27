#!/bin/sh
# Install `creds` — the CredsForDevs CLI — on this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/oleksandrdubyna88/dew_flow_creds_for_devs/main/install.sh | sh
#
# Reads nothing, sends nothing, and holds no credential: `creds` cannot obtain one. It relays a
# request to the VS Code window that minted the grant token, and that window performs the action.
# What this script does is put a binary on the PATH.
#
# `sh`, not `bash`: a remote host is whatever it is — Alpine's ash, dash on a Debian container,
# busybox in an image nobody chose. Nothing below is a bashism.
#
# WHAT IT VERIFIES, AND WHY THAT IS NOT PARANOIA. Every release carries a `.sha256` beside its
# archive, and the download is refused if it does not match. TLS says the bytes were not altered
# in transit; it says nothing about WHICH bytes they are. Since the whole point of this tool is
# that a credential is never handed over, a binary installed without checking what it is would
# undo the argument at the last step.
set -eu

REPO="oleksandrdubyna88/dew_flow_creds_for_devs"
PREFIX="${CREDS_PREFIX:-/usr/local/bin}"

die() { echo "creds-install: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- what this machine is ------------------------------------------------------------------
os=$(uname -s)
case "$os" in
  Linux) os_part=linux ;;
  Darwin) die "there is no macOS build yet — the release matrix is win-x64/arm64 and linux-x64/arm64." ;;
  *) die "unsupported operating system: $os" ;;
esac

case $(uname -m) in
  x86_64 | amd64) rid="$os_part-x64" ;;
  aarch64 | arm64) rid="$os_part-arm64" ;;
  *) die "unsupported architecture: $(uname -m). Builds exist for x86_64 and aarch64." ;;
esac

have curl || have wget || die "neither curl nor wget is installed."
have tar || die "tar is not installed."

# $1 url, $2 destination. Returns non-zero instead of exiting, and that is load-bearing:
# the checksum fetch is ALLOWED to fail (a release cut before checksums existed has none) and
# must fall through to a warning. An earlier version called `die` in here, so the optional
# fetch killed the whole install — silently, because the failure happened inside an `if`
# condition whose else-branch could therefore never run. Found by running it, not by reading it.
fetch() {
  if have curl; then
    curl -fsSL --retry 3 -o "$2" "$1"
  else
    wget -qO "$2" "$1"
  fi
}

# --- which release ------------------------------------------------------------------------
# The newest `cli-v*` tag, NOT `releases/latest`: this repository tags three products, and the
# latest release is usually the VS Code extension. Asking for "latest" would download a .vsix.
if [ -n "${CREDS_VERSION:-}" ]; then
  version="$CREDS_VERSION"
else
  api="https://api.github.com/repos/$REPO/releases"
  tmp_api=$(mktemp)
  fetch "$api" "$tmp_api" || die "could not reach $api"
  version=$(tr ',' '\n' < "$tmp_api" | grep '"tag_name"' | sed 's/.*"cli-v\([^"]*\)".*/\1/' | grep -v '"' | head -1)
  rm -f "$tmp_api"
  [ -n "$version" ] || die "no cli-v* release found. Set CREDS_VERSION to install a specific one."
fi

name="creds-$version-$rid"
archive="$name.tar.gz"
base="https://github.com/$REPO/releases/download/cli-v$version"

echo "creds-install: $name"

work=$(mktemp -d)
# Leaves nothing behind, including when a checksum refuses the install.
trap 'rm -rf "$work"' EXIT INT TERM

fetch "$base/$archive" "$work/$archive" || die "download failed: $base/$archive"

# --- verify -------------------------------------------------------------------------------
if have sha256sum; then
  sum_cmd="sha256sum"
elif have shasum; then
  sum_cmd="shasum -a 256"
else
  sum_cmd=""
fi

if [ -n "$sum_cmd" ]; then
  if fetch "$base/$archive.sha256" "$work/$archive.sha256" 2>/dev/null; then
    expected=$(cut -d' ' -f1 < "$work/$archive.sha256")
    actual=$($sum_cmd "$work/$archive" | cut -d' ' -f1)
    [ "$expected" = "$actual" ] || die "checksum mismatch — refusing to install.
  expected $expected
  actual   $actual"
    echo "creds-install: checksum ok"
  else
    # Releases before the checksum step existed have none. Say so out loud rather than
    # printing nothing, because a silent skip is indistinguishable from a check that passed.
    echo "creds-install: WARNING — this release publishes no .sha256; the download was NOT verified." >&2
  fi
else
  echo "creds-install: WARNING — no sha256sum or shasum on this host; the download was NOT verified." >&2
fi

# --- install ------------------------------------------------------------------------------
tar xzf "$work/$archive" -C "$work" || die "the archive could not be extracted."
[ -f "$work/$name/creds" ] || die "the archive did not contain $name/creds."

if [ -w "$PREFIX" ]; then
  install -m 0755 "$work/$name/creds" "$PREFIX/creds"
elif have sudo; then
  sudo install -m 0755 "$work/$name/creds" "$PREFIX/creds"
else
  die "$PREFIX is not writable and sudo is not available. Set CREDS_PREFIX to a directory you own."
fi

echo "creds-install: installed $PREFIX/creds"
"$PREFIX/creds" --help | head -1
