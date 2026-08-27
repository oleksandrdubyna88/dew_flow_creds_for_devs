/**
 * The shell one-liners that install `creds` and `creds-mcp` on a machine this extension is not
 * running on.
 *
 * <p>Pure text. What runs it is a terminal somewhere else — a colleague's laptop, a jump box, a
 * fresh container — which is the whole point: the buttons install here, these install there.</p>
 *
 * <p><b>They resolve the newest release every time they run, and carry no version.</b> A script
 * with a version baked in is correct on the day it is copied and wrong afterwards, and the person
 * pasting it has no way to tell which. So the script asks the API, and the extension's own version
 * has no bearing on what gets installed.</p>
 *
 * <p><b>Why the release list and not `releases/latest`.</b> GitHub's "latest" is the newest release
 * of the whole REPOSITORY, and this one publishes four different things under four tag prefixes.
 * Checked 2026-08-27: `releases/latest` was `server-v0.3.1`, whose assets include
 * `cred-vault-server-0.3.1-win-x64.zip` — which a loose `*-win-x64.zip` match would have happily
 * downloaded and installed as `creds`. The pattern is therefore anchored to the binary's own name
 * followed by a digit, which distinguishes `creds-0.1.0` from `creds-mcp-0.1.0` and from
 * `cred-vault-server-0.3.1` without parsing JSON in a shell.</p>
 *
 * <p><b>The checksum is verified, not decorated.</b> Every archive has a `.sha256` beside it in
 * standard `sha256sum` format (`<hash>  <filename>`), which is why the archive is saved under its
 * original name — `sha256sum -c` reads the name out of the file. For a tool that holds
 * credentials, an unverified download is not a detail.</p>
 */

/** The public repository the releases live in. */
export const RELEASES_REPO = 'oleksandrdubyna88/dew_flow_creds_for_devs';

export type InstallTarget = 'creds' | 'creds-mcp';

/** The four things the release workflow builds. */
export type Rid = 'win-x64' | 'win-arm64' | 'linux-x64' | 'linux-arm64';

/**
 * A machine to install on: a fixed architecture, or the instruction to work it out there.
 *
 * <p>Detection is the safer default and stays the recommended choice — the script runs ON the
 * machine it installs to, so `uname -m` knows more than the person copying it does. Pinning is
 * for the case where somebody KNOWS the target and wants a script with no branch in it, which is
 * also the script you can read at a glance before running it on a server.</p>
 */
export type Machine = { os: 'windows' | 'linux'; rid?: Rid };

/**
 * The regular expression that picks one asset, anchored so it cannot pick another binary's.
 *
 * <p>`creds-` followed by a DIGIT is what separates the CLI from `creds-mcp-`; neither matches
 * `cred-vault-server-`, which has no `s` before the dash.</p>
 */
export function assetPattern(target: InstallTarget, rid: string): string {
  return `${target}-[0-9][^"]*-${rid}`;
}

/**
 * Install on a Linux machine — WSL, a container, a server.
 *
 * <p>`~/.local/bin` rather than `/usr/local/bin`: no `sudo`, and it is on the PATH of every
 * distribution's default profile. A script that needs root to install a user's own credential
 * helper is a script people run as root.</p>
 */
export function bashInstall(target: InstallTarget, rid?: Rid): string {
  return [
    'set -eu',
    `repo=${RELEASES_REPO}`,
    rid === undefined
      ? 'case "$(uname -m)" in aarch64|arm64) rid=linux-arm64 ;; *) rid=linux-x64 ;; esac'
      : `rid=${rid}`,
    'url=$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=100" |',
    `  grep -o "https://[^\\"]*${target}-[0-9][^\\"]*-$rid\\.tar\\.gz" | head -1)`,
    `[ -n "\${url:-}" ] || { echo "No ${target} release for $rid has been published yet."; exit 1; }`,
    'tmp=$(mktemp -d); file=${url##*/}',
    'curl -fsSL "$url" -o "$tmp/$file"',
    'curl -fsSL "$url.sha256" -o "$tmp/$file.sha256"',
    '(cd "$tmp" && sha256sum -c "$file.sha256")',
    'tar xzf "$tmp/$file" -C "$tmp"',
    'mkdir -p "$HOME/.local/bin"',
    `install -m755 "$tmp"/*/${target} "$HOME/.local/bin/${target}"`,
    'rm -rf "$tmp"',
    `echo "installed: $HOME/.local/bin/${target}"`,
  ].join('\n');
}

/**
 * Install on a Windows machine.
 *
 * <p>`%LOCALAPPDATA%\\Programs` rather than anywhere under `Program Files`: no elevation, and the
 * PATH entry it adds is the user's own. The same reasoning as `~/.local/bin` above.</p>
 */
export function powershellInstall(target: InstallTarget, rid?: Rid): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$repo = '${RELEASES_REPO}'`,
    rid === undefined
      ? "$rid = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }"
      : `$rid = '${rid}'`,
    '$assets = (Invoke-RestMethod "https://api.github.com/repos/$repo/releases?per_page=100") | ForEach-Object { $_.assets }',
    `$a = $assets | Where-Object { $_.name -match "^${target}-\\d.*-$rid\\.zip$" } | Select-Object -First 1`,
    `if (-not $a) { throw "No ${target} release for $rid has been published yet." }`,
    '$tmp = Join-Path $env:TEMP ([guid]::NewGuid()); New-Item -ItemType Directory $tmp | Out-Null',
    '$zip = Join-Path $tmp $a.name',
    'Invoke-WebRequest $a.browser_download_url -OutFile $zip',
    'Invoke-WebRequest "$($a.browser_download_url).sha256" -OutFile "$zip.sha256"',
    '$want = ((Get-Content "$zip.sha256") -split \'\\s+\')[0]',
    '$got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()',
    'if ($want -ne $got) { throw "checksum mismatch: expected $want, got $got" }',
    'Expand-Archive $zip -DestinationPath $tmp -Force',
    "$dest = Join-Path $env:LOCALAPPDATA 'Programs\\creds'",
    'New-Item -ItemType Directory -Force $dest | Out-Null',
    `Copy-Item (Get-ChildItem $tmp -Recurse -Filter '${target}.exe').FullName $dest -Force`,
    "$path = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "if ($path -notlike \"*$dest*\") { [Environment]::SetEnvironmentVariable('Path', \"$path;$dest\", 'User') }",
    'Remove-Item $tmp -Recurse -Force',
    `Write-Host "installed: $dest\\${target}.exe - open a NEW terminal for the PATH change"`,
  ].join('\n');
}

/**
 * The script for one machine — the shell follows from the operating system.
 *
 * <p>Asking "which shell?" separately invites the one mistake this cannot recover from: a
 * PowerShell script pasted into bash produces a wall of syntax errors, and a bash script pasted
 * into PowerShell quietly runs the first line and stops. The machine is the question a person
 * can answer; the shell is a consequence.</p>
 */
export function installScript(target: InstallTarget, machine: Machine): string {
  return machine.os === 'windows'
    ? powershellInstall(target, machine.rid)
    : bashInstall(target, machine.rid);
}
