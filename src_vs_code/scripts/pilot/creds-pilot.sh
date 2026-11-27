#!/bin/sh
# The Remote Bridge pilot's clients on the server (change 11.1, S5): put the branch's `creds` and `creds-mcp` in place, register
# `creds-mcp` with Claude Code, and undo both. The pilot is never released: `install.sh` fetches released assets only.
#
#   sh creds-pilot.sh install <folder>   the folder holds creds, creds-mcp and (checked when present) SHA256SUMS
#   sh creds-pilot.sh status
#   sh creds-pilot.sh undo
#
# Where things go (each can be set in the environment):
#   CREDS_PILOT_HOME  the pilot's own folder: the binaries and what undo needs     default: $HOME/.creds-for-devs/pilot
#   CREDS_PILOT_BIN   the folder whose `creds` and `creds-mcp` become the pilot's   default: $HOME/.local/bin
#   CREDS_PILOT_NAME  the name of the Claude Code registration                     default: creds
#
# What install does, and undo reverses exactly:
#   1. copies the two binaries into $CREDS_PILOT_HOME/bin;
#   2. moves an existing $CREDS_PILOT_BIN/creds and /creds-mcp aside (into $CREDS_PILOT_HOME/aside), and links the pilot's there;
#   3. the registration: none named $CREDS_PILOT_NAME -> it adds one (user scope, the link's absolute path); one whose command is
#      that same path -> it is kept (the new link already serves it); one with another command -> it is NOT changed, and the two
#      commands that would change it are printed for the person to run.
# A `creds-mcp` that is running keeps its old binary until Claude Code starts it again: restart the Claude session once after install.
#
# POSIX sh, no bashisms. Nothing here reads or prints a credential.
set -eu

PILOT_HOME="${CREDS_PILOT_HOME:-$HOME/.creds-for-devs/pilot}"
BIN_DIR="${CREDS_PILOT_BIN:-$HOME/.local/bin}"
NAME="${CREDS_PILOT_NAME:-creds}"
STATE="$PILOT_HOME/state"
TOOLS="creds creds-mcp"

die() { echo "creds-pilot: $*" >&2; exit 1; }
say() { echo "creds-pilot: $*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# The `Command:` line of a registration, as `claude mcp get` prints it (two spaces, `Command: `, the path).
registered_command() {
  claude mcp get "$NAME" 2>/dev/null | sed -n 's/^  Command: //p' | head -n 1
}

check_sums() {
  folder=$1
  [ -f "$folder/SHA256SUMS" ] || { say "no SHA256SUMS in $folder: the binaries are not checked"; return 0; }
  have sha256sum || die "SHA256SUMS is there but sha256sum is not installed"
  for tool in $TOOLS; do
    line=$(grep " $tool\$" "$folder/SHA256SUMS" | grep -v '/' || true)
    [ -n "$line" ] || die "SHA256SUMS names no $tool"
    (cd "$folder" && echo "$line" | sha256sum -c - >/dev/null 2>&1) || die "$tool does not match SHA256SUMS"
  done
  say "both binaries match SHA256SUMS"
}

do_install() {
  folder=${1:-}
  [ -n "$folder" ] || die "usage: creds-pilot.sh install <folder with creds and creds-mcp>"
  [ ! -e "$STATE" ] || die "a pilot is already installed ($STATE). Run: creds-pilot.sh undo"
  for tool in $TOOLS; do
    [ -f "$folder/$tool" ] || die "$folder/$tool is missing"
  done
  check_sums "$folder"
  case "$BIN_DIR" in /*) ;; *) die "CREDS_PILOT_BIN must be an absolute path: $BIN_DIR" ;; esac

  umask 077
  mkdir -p "$PILOT_HOME/bin" "$PILOT_HOME/aside" "$STATE"
  for tool in $TOOLS; do
    cp "$folder/$tool" "$PILOT_HOME/bin/$tool"
    chmod 755 "$PILOT_HOME/bin/$tool"
  done
  "$PILOT_HOME/bin/creds" --help >/dev/null 2>&1 || die "the pilot's creds does not start here (wrong architecture?); nothing was linked. Run: creds-pilot.sh undo"

  mkdir -p "$BIN_DIR"
  for tool in $TOOLS; do
    if [ -e "$BIN_DIR/$tool" ] || [ -L "$BIN_DIR/$tool" ]; then
      mv "$BIN_DIR/$tool" "$PILOT_HOME/aside/$tool"
      echo "$tool" >>"$STATE/aside"
      say "moved the old $BIN_DIR/$tool aside"
    fi
    ln -s "$PILOT_HOME/bin/$tool" "$BIN_DIR/$tool"
    echo "$tool" >>"$STATE/linked"
  done
  say "linked $BIN_DIR/creds and $BIN_DIR/creds-mcp to the pilot"

  register
  say "done. Restart the Claude session once, so it starts the new creds-mcp."
}

register() {
  if ! have claude; then
    echo "none" >"$STATE/registration"
    say "claude is not on the PATH: nothing registered. To register: claude mcp add --scope user $NAME -- $BIN_DIR/creds-mcp"
    return 0
  fi
  current=$(registered_command)
  if [ -z "$current" ]; then
    claude mcp add --scope user "$NAME" -- "$BIN_DIR/creds-mcp" >/dev/null
    echo "added" >"$STATE/registration"
    say "registered $NAME with Claude Code: $BIN_DIR/creds-mcp"
  elif [ "$current" = "$BIN_DIR/creds-mcp" ]; then
    echo "kept" >"$STATE/registration"
    say "the registration $NAME already runs $BIN_DIR/creds-mcp: kept"
  else
    echo "left" >"$STATE/registration"
    say "the registration $NAME runs $current, not the pilot. It was NOT changed. To point it at the pilot, run:"
    say "  claude mcp remove $NAME -s user && claude mcp add --scope user $NAME -- $BIN_DIR/creds-mcp"
    say "(then undo will not restore it: point it back at $current yourself)"
  fi
}

do_undo() {
  [ -d "$STATE" ] || die "no pilot is installed ($STATE is missing)"
  if [ -f "$STATE/linked" ]; then
    while read -r tool; do
      if [ -L "$BIN_DIR/$tool" ] && [ "$(readlink "$BIN_DIR/$tool")" = "$PILOT_HOME/bin/$tool" ]; then
        rm "$BIN_DIR/$tool"
      else
        say "$BIN_DIR/$tool is no longer the pilot's link: left as it is"
      fi
    done <"$STATE/linked"
  fi
  if [ -f "$STATE/aside" ]; then
    while read -r tool; do
      if [ -e "$BIN_DIR/$tool" ] || [ -L "$BIN_DIR/$tool" ]; then
        say "$BIN_DIR/$tool exists: the old one stays at $PILOT_HOME/aside/$tool"
        keep_aside=1
      else
        mv "$PILOT_HOME/aside/$tool" "$BIN_DIR/$tool"
        say "restored the old $BIN_DIR/$tool"
      fi
    done <"$STATE/aside"
  fi
  if [ "$(cat "$STATE/registration" 2>/dev/null || true)" = "added" ]; then
    if have claude && [ "$(registered_command)" = "$BIN_DIR/creds-mcp" ]; then
      claude mcp remove "$NAME" -s user >/dev/null
      say "removed the registration $NAME"
    else
      say "the registration $NAME is not the one install added: left as it is"
    fi
  fi
  if [ "${keep_aside:-0}" = 1 ]; then
    rm -rf "$PILOT_HOME/bin" "$STATE"
    say "undone, except the old binaries kept in $PILOT_HOME/aside"
  else
    rm -rf "$PILOT_HOME"
    say "undone"
  fi
}

do_status() {
  [ -d "$STATE" ] || { say "no pilot is installed"; return 0; }
  say "installed in $PILOT_HOME, linked from $BIN_DIR"
  say "registration: $(cat "$STATE/registration" 2>/dev/null || echo unknown)"
  for tool in $TOOLS; do
    say "$BIN_DIR/$tool -> $(readlink "$BIN_DIR/$tool" 2>/dev/null || echo 'not a link')"
  done
}

case "${1:-}" in
  install) do_install "${2:-}" ;;
  undo) do_undo ;;
  status) do_status ;;
  *) die "usage: creds-pilot.sh install <folder> | status | undo" ;;
esac
