/**
 * The snippets themselves, keyed `language:variant`.
 *
 * <p>Its own module because `configSnippet.ts` owns the table, the picker and the rules, and
 * twenty programs of prose would have buried all three. Nothing here is logic — it is text with
 * two placeholders, `__ENV__` and `__FILE__`, filled in by `snippetFor`.</p>
 *
 * <p><b>Every one of them is written to be pasted by somebody who will not read it first.</b> So
 * each says what it does in its own comments, each fails LOUDLY on a non-zero exit — a silently
 * empty configuration is how a service starts against the wrong database and nobody finds out
 * until it writes something — and each passes the key to the process as an ARGUMENT rather than
 * building a command line for a shell to re-read. C++ is the one exception and says so in place:
 * `popen` takes a command string, so the key is checked against the alphabet it is drawn from
 * before it is concatenated.</p>
 *
 * <p>No backticks anywhere in these strings, deliberately: they are template literals, and a
 * backtick in a comment about a shell command would end the literal in the middle of a program.</p>
 */

export const SNIPPET_BODIES: Readonly<Record<string, string>> = {
  'csharp:net6': `// "creds config <key>" asks the VS Code window holding your vault for this config and
// prints it. The key names WHICH config — it is not the secret itself, and the vault keeps
// only a hash of it, so it cannot be read back out if you lose it.
static string ReadFromVault(string key)
{
    var start = new System.Diagnostics.ProcessStartInfo("creds")
    {
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
    };
    // ArgumentList, never one joined string: the key crosses as a single argument whatever
    // is in it, with no shell in between to reinterpret anything.
    start.ArgumentList.Add("config");
    start.ArgumentList.Add(key);

    using var process = System.Diagnostics.Process.Start(start)!;
    var text = process.StandardOutput.ReadToEnd();
    process.WaitForExit();
    if (process.ExitCode != 0)
    {
        // Loudly. A silently empty configuration is how an application starts against the
        // wrong database, and nobody finds out until it writes something.
        throw new InvalidOperationException(
            $"creds config exited {process.ExitCode}: {process.StandardError.ReadToEnd()}");
    }
    return text;
}

var vaultKey = Environment.GetEnvironmentVariable("__ENV__")
    ?? throw new InvalidOperationException("__ENV__ is not set.");

// AddJsonStream comes with Microsoft.Extensions.Configuration.Json, which every ASP.NET
// Core app already references. Added LAST, so these values win wherever appsettings.json
// defines the same key.
builder.Configuration.AddJsonStream(
    new MemoryStream(System.Text.Encoding.UTF8.GetBytes(ReadFromVault(vaultKey))));`,

  'csharp:netfx': `// .NET Framework has no WebApplicationBuilder, and ConfigurationManager reads app.config
// rather than a stream — so the configuration stack comes from NuGet. Both packages target
// netstandard2.0 and work on net472:
//     Install-Package Microsoft.Extensions.Configuration
//     Install-Package Microsoft.Extensions.Configuration.Json
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using Microsoft.Extensions.Configuration;

static string ReadFromVault(string key)
{
    // Framework has no ArgumentList. A config key is base64url with a fixed prefix, so it
    // needs no quoting — but nothing else may ever be concatenated into this string.
    var start = new ProcessStartInfo("creds", "config " + key)
    {
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        CreateNoWindow = true,
    };
    using (var process = Process.Start(start))
    {
        var text = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0)
        {
            // Loudly. A silently empty configuration starts against the wrong database.
            throw new InvalidOperationException(
                "creds config exited " + process.ExitCode + ": " + process.StandardError.ReadToEnd());
        }
        return text;
    }
}

var vaultKey = Environment.GetEnvironmentVariable("__ENV__");
if (vaultKey == null) throw new InvalidOperationException("__ENV__ is not set.");

IConfiguration configuration = new ConfigurationBuilder()
    .AddJsonStream(new MemoryStream(Encoding.UTF8.GetBytes(ReadFromVault(vaultKey))))
    .Build();

var connection = configuration["ConnectionStrings:Default"];`,

  'fsharp:default': `open System
open System.Diagnostics
open System.IO
open System.Text
open Microsoft.Extensions.Configuration

/// Runs "creds config <key>", which asks the VS Code window holding the vault for this
/// config. The key names which config; it is not the secret itself.
let readFromVault (key: string) =
    let start = ProcessStartInfo("creds", RedirectStandardOutput = true,
                                 RedirectStandardError = true, UseShellExecute = false)
    // One argument at a time, so no shell can reinterpret the key.
    start.ArgumentList.Add("config")
    start.ArgumentList.Add(key)
    use p = Process.Start(start)
    let text = p.StandardOutput.ReadToEnd()
    p.WaitForExit()
    // Loudly: a silently empty configuration starts against the wrong database.
    if p.ExitCode <> 0 then
        failwithf "creds config exited %d: %s" p.ExitCode (p.StandardError.ReadToEnd())
    text

let vaultKey =
    match Environment.GetEnvironmentVariable("__ENV__") with
    | null -> failwith "__ENV__ is not set."
    | value -> value

// Added last, so these values win over appsettings.json where both define a key.
builder.Configuration.AddJsonStream(
    new MemoryStream(Encoding.UTF8.GetBytes(readFromVault vaultKey))) |> ignore`,

  'vbnet:default': `Imports System.Diagnostics
Imports System.IO
Imports System.Text
Imports Microsoft.Extensions.Configuration

' Runs "creds config <key>", which asks the VS Code window holding the vault for this
' config. The key names which config; it is not the secret itself.
Function ReadFromVault(key As String) As String
    Dim start As New ProcessStartInfo("creds") With {
        .RedirectStandardOutput = True,
        .RedirectStandardError = True,
        .UseShellExecute = False
    }
    ' One argument at a time, so no shell can reinterpret the key.
    start.ArgumentList.Add("config")
    start.ArgumentList.Add(key)

    Using process = Diagnostics.Process.Start(start)
        Dim text = process.StandardOutput.ReadToEnd()
        process.WaitForExit()
        If process.ExitCode <> 0 Then
            ' Loudly: a silently empty configuration starts against the wrong database.
            Throw New InvalidOperationException(
                "creds config exited " & process.ExitCode & ": " & process.StandardError.ReadToEnd())
        End If
        Return text
    End Using
End Function

Dim vaultKey = Environment.GetEnvironmentVariable("__ENV__")
If vaultKey Is Nothing Then Throw New InvalidOperationException("__ENV__ is not set.")

' Added last, so these values win over appsettings.json where both define a key.
builder.Configuration.AddJsonStream(
    New MemoryStream(Encoding.UTF8.GetBytes(ReadFromVault(vaultKey))))`,

  'java:default': `// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
static String readFromVault(String key) throws Exception {
    // The list form, never a joined command string: no shell sees the key.
    Process process = new ProcessBuilder("creds", "config", key).start();
    String text = new String(process.getInputStream().readAllBytes(),
                             java.nio.charset.StandardCharsets.UTF_8);
    if (process.waitFor() != 0) {
        // Loudly. A silently empty configuration starts against the wrong database.
        throw new IllegalStateException("creds config exited " + process.exitValue());
    }
    return text;
}

String vaultKey = System.getenv("__ENV__");
if (vaultKey == null) throw new IllegalStateException("__ENV__ is not set.");

// Parse it with whatever you already use — Jackson here.
var config = new com.fasterxml.jackson.databind.ObjectMapper().readTree(readFromVault(vaultKey));
String connection = config.at("/ConnectionStrings/Default").asText();`,

  'kotlin:default': `// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config. The key names WHICH config; it is not the secret itself.
fun readFromVault(key: String): String {
    // The vararg form, never a joined command string: no shell sees the key.
    val process = ProcessBuilder("creds", "config", key).start()
    val text = process.inputStream.readBytes().toString(Charsets.UTF_8)
    // Loudly: a silently empty configuration starts against the wrong database.
    check(process.waitFor() == 0) { "creds config exited " + process.exitValue() }
    return text
}

val vaultKey = System.getenv("__ENV__") ?: error("__ENV__ is not set.")

// Parse it with whatever you already use — kotlinx.serialization here.
val config = kotlinx.serialization.json.Json.parseToJsonElement(readFromVault(vaultKey))`,

  'scala:default': `import scala.sys.process._

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config. The key names WHICH config; it is not the secret itself.
def readFromVault(key: String): String = {
  // The Seq form, never a single string: no shell sees the key.
  val out = new StringBuilder
  val exit = Seq("creds", "config", key).!(ProcessLogger(line => out.append(line).append('\\n'), _ => ()))
  // Loudly: a silently empty configuration starts against the wrong database.
  if (exit != 0) throw new IllegalStateException("creds config exited " + exit)
  out.toString
}

val vaultKey = sys.env.getOrElse("__ENV__", throw new IllegalStateException("__ENV__ is not set."))
val config = ujson.read(readFromVault(vaultKey))`,

  'python:default': `import json
import os
import subprocess

# Runs "creds config <key>", which asks the VS Code window holding your vault for this
# config and prints it. The key names WHICH config; it is not the secret itself, and the
# vault keeps only a hash of it, so it cannot be read back out if you lose it.
def read_from_vault(key: str) -> str:
    # A list, never a string with shell=True: no shell sees the key.
    result = subprocess.run(
        ["creds", "config", key],
        capture_output=True,
        text=True,
        check=True,   # loudly — a silently empty config starts against the wrong database
    )
    return result.stdout

vault_key = os.environ.get("__ENV__")
if not vault_key:
    raise RuntimeError("__ENV__ is not set.")

config = json.loads(read_from_vault(vault_key))
connection = config["ConnectionStrings"]["Default"]`,

  'javascript:esm': `import { execFileSync } from 'node:child_process';

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
function readFromVault(key) {
  // execFileSync, never execSync: no shell sees the key, and nothing in it can be
  // reinterpreted. It throws on a non-zero exit, which is what we want — a silently empty
  // configuration is how a service starts against the wrong database.
  return execFileSync('creds', ['config', key], { encoding: 'utf8' });
}

const vaultKey = process.env.__ENV__;
if (!vaultKey) throw new Error('__ENV__ is not set.');

export const config = JSON.parse(readFromVault(vaultKey));`,

  'javascript:cjs': `const { execFileSync } = require('node:child_process');

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
function readFromVault(key) {
  // execFileSync, never execSync: no shell sees the key, and nothing in it can be
  // reinterpreted. It throws on a non-zero exit, which is what we want — a silently empty
  // configuration is how a service starts against the wrong database.
  return execFileSync('creds', ['config', key], { encoding: 'utf8' });
}

const vaultKey = process.env.__ENV__;
if (!vaultKey) throw new Error('__ENV__ is not set.');

module.exports = JSON.parse(readFromVault(vaultKey));`,

  'typescript:default': `import { execFileSync } from 'node:child_process';

// Describe only what you actually read. A type mirroring the whole document is a second
// copy of it to keep in step.
interface VaultConfig {
  ConnectionStrings: { Default: string };
}

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config. The key names WHICH config; it is not the secret itself.
function readFromVault(key: string): string {
  // execFileSync, never execSync: no shell sees the key. It throws on a non-zero exit,
  // which is what we want — a silently empty config starts against the wrong database.
  return execFileSync('creds', ['config', key], { encoding: 'utf8' });
}

const vaultKey = process.env.__ENV__;
if (!vaultKey) throw new Error('__ENV__ is not set.');

export const config = JSON.parse(readFromVault(vaultKey)) as VaultConfig;`,

  'go:default': `import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
)

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
func readFromVault(key string) ([]byte, error) {
	// Arguments as arguments, never a joined command line: no shell sees the key.
	out, err := exec.Command("creds", "config", key).Output()
	if err != nil {
		// Loudly. A silently empty configuration starts against the wrong database.
		return nil, fmt.Errorf("creds config: %w", err)
	}
	return out, nil
}

vaultKey := os.Getenv("__ENV__")
if vaultKey == "" {
	return fmt.Errorf("__ENV__ is not set")
}

raw, err := readFromVault(vaultKey)
if err != nil {
	return err
}
var config struct {
	ConnectionStrings struct{ Default string }
}
if err := json.Unmarshal(raw, &config); err != nil {
	return fmt.Errorf("vault config is not valid JSON: %w", err)
}`,

  'rust:default': `use std::env;
use std::process::Command;

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
fn read_from_vault(key: &str) -> anyhow::Result<String> {
    // Arguments as arguments, never a joined command line: no shell sees the key.
    let out = Command::new("creds").arg("config").arg(key).output()?;
    if !out.status.success() {
        // Loudly. A silently empty configuration starts against the wrong database.
        anyhow::bail!("creds config exited {}", out.status);
    }
    Ok(String::from_utf8(out.stdout)?)
}

let vault_key = env::var("__ENV__").map_err(|_| anyhow::anyhow!("__ENV__ is not set"))?;
let config: serde_json::Value = serde_json::from_str(&read_from_vault(&vault_key)?)?;`,

  'php:default': `<?php
// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
function readFromVault(string $key): string {
    // proc_open with an ARRAY, never shell_exec with a string: no shell sees the key.
    $process = proc_open(['creds', 'config', $key], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $text = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    if (proc_close($process) !== 0) {
        // Loudly. A silently empty configuration starts against the wrong database.
        throw new RuntimeException('creds config failed');
    }
    return $text;
}

$vaultKey = getenv('__ENV__');
if ($vaultKey === false) {
    throw new RuntimeException('__ENV__ is not set.');
}

$config = json_decode(readFromVault($vaultKey), true, 512, JSON_THROW_ON_ERROR);`,

  'ruby:default': `require 'json'
require 'open3'

# Runs "creds config <key>", which asks the VS Code window holding your vault for this
# config and prints it. The key names WHICH config; it is not the secret itself.
def read_from_vault(key)
  # Separate arguments, never backticks with an interpolated string: no shell sees the key.
  text, status = Open3.capture2('creds', 'config', key)
  # Loudly. A silently empty configuration starts against the wrong database.
  raise "creds config exited " + status.exitstatus.to_s unless status.success?
  text
end

vault_key = ENV.fetch('__ENV__') { raise '__ENV__ is not set.' }
CONFIG = JSON.parse(read_from_vault(vault_key)).freeze`,

  'cpp:default': `#include <array>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>

// Runs "creds config <key>" and reads its output.
//
// popen DOES go through a shell, which is the one place this needs care — so the key is
// checked against the alphabet it is drawn from before it is ever concatenated. A config
// key is base64url with a fixed prefix, so anything else is not one.
std::string readFromVault(const std::string& key) {
    if (key.find_first_not_of(
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
        != std::string::npos) {
        throw std::runtime_error("that is not a config key");
    }
    const std::string command = "creds config " + key;
    std::array<char, 4096> buffer{};
    std::string out;
    FILE* pipe = popen(command.c_str(), "r");
    if (pipe == nullptr) throw std::runtime_error("could not run creds");
    while (std::fgets(buffer.data(), static_cast<int>(buffer.size()), pipe) != nullptr) {
        out += buffer.data();
    }
    // Loudly. A silently empty configuration starts against the wrong database.
    if (pclose(pipe) != 0) throw std::runtime_error("creds config failed");
    return out;
}

const char* vaultKey = std::getenv("__ENV__");
if (vaultKey == nullptr) throw std::runtime_error("__ENV__ is not set.");
// Parse readFromVault(vaultKey) with whatever JSON library you already use.`,

  'swift:default': `import Foundation

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
func readFromVault(_ key: String) throws -> Data {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    // Arguments as arguments, never a joined command line: no shell sees the key.
    process.arguments = ["creds", "config", key]
    let pipe = Pipe()
    process.standardOutput = pipe
    try process.run()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    // Loudly. A silently empty configuration starts against the wrong database.
    guard process.terminationStatus == 0 else {
        throw NSError(domain: "creds", code: Int(process.terminationStatus))
    }
    return data
}

guard let vaultKey = ProcessInfo.processInfo.environment["__ENV__"] else {
    fatalError("__ENV__ is not set.")
}
let config = try JSONSerialization.jsonObject(with: readFromVault(vaultKey))`,

  'dart:default': `import 'dart:convert';
import 'dart:io';

// Runs "creds config <key>", which asks the VS Code window holding your vault for this
// config and prints it. The key names WHICH config; it is not the secret itself.
String readFromVault(String key) {
  // runInShell stays false: no shell sees the key, and nothing in it is reinterpreted.
  final result = Process.runSync('creds', ['config', key]);
  if (result.exitCode != 0) {
    // Loudly. A silently empty configuration starts against the wrong database.
    throw StateError('creds config exited ' + result.exitCode.toString());
  }
  return result.stdout as String;
}

final vaultKey = Platform.environment['__ENV__'];
if (vaultKey == null) throw StateError('__ENV__ is not set.');

final config = jsonDecode(readFromVault(vaultKey)) as Map<String, dynamic>;`,

  'elixir:default': `# Runs "creds config <key>", which asks the VS Code window holding your vault for this
# config and prints it. The key names WHICH config; it is not the secret itself.
defmodule VaultConfig do
  def read!(key) do
    # System.cmd takes arguments as a list and starts no shell: nothing in the key is
    # reinterpreted.
    case System.cmd("creds", ["config", key]) do
      {text, 0} -> Jason.decode!(text)
      # Loudly. A silently empty configuration starts against the wrong database.
      {_, code} -> raise "creds config exited " <> Integer.to_string(code)
    end
  end
end

vault_key = System.get_env("__ENV__") || raise "__ENV__ is not set."
config = VaultConfig.read!(vault_key)`,

  'perl:default': `use strict;
use warnings;
use JSON::PP;

# Runs "creds config <key>", which asks the VS Code window holding your vault for this
# config and prints it. The key names WHICH config; it is not the secret itself.
sub read_from_vault {
    my ($key) = @_;
    # The LIST form of open, never a single string: no shell sees the key.
    open(my $pipe, '-|', 'creds', 'config', $key) or die "could not run creds";
    local $/;
    my $text = <$pipe>;
    # Loudly. A silently empty configuration starts against the wrong database.
    close($pipe) or die "creds config failed";
    return $text;
}

my $vault_key = $ENV{'__ENV__'} or die "__ENV__ is not set.";
my $config = decode_json(read_from_vault($vault_key));`,

  'bash:default': `# Runs "creds config <key>", which asks the VS Code window holding your vault for this
# config and prints it. The key names WHICH config; it is not the secret itself.
set -euo pipefail

: "\${__ENV__:?__ENV__ is not set}"

# Captured FIRST, written second. creds exits non-zero on failure and set -e stops here —
# loudly, because a silently empty config starts against the wrong database. Because the
# redirect happens only after creds succeeded, a failed read never truncates a good file.
config=$(creds config "\${__ENV__}")
printf '%s' "\${config}" > '__FILE__'

# Or keep it off the filesystem entirely and read straight from the variable:
#   echo "\${config}" | jq -r .ConnectionStrings.Default`,

  'powershell:default': `# Runs "creds config <key>", which asks the VS Code window holding your vault for this
# config and prints it. The key names WHICH config; it is not the secret itself.
$ErrorActionPreference = 'Stop'

if (-not $env:__ENV__) { throw '__ENV__ is not set.' }

$configText = & creds config $env:__ENV__
# Loudly. A silently empty configuration starts against the wrong database.
if ($LASTEXITCODE -ne 0) { throw "creds config exited $LASTEXITCODE" }

# As an object to read from...
$config = $configText | ConvertFrom-Json
$connection = $config.ConnectionStrings.Default

# ...or straight to the file your program already reads. Written only after creds
# succeeded, so a failed read never truncates a good file.
Set-Content -Path '__FILE__' -Value $configText -NoNewline`,
};
