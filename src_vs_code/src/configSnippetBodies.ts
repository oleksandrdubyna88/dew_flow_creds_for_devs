/**
 * The snippets themselves, keyed `language:variant`.
 *
 * <p>Its own module because `configSnippet.ts` owns the table, the picker and the rules, and
 * twenty programs of prose would have buried all three. Nothing here is logic — it is text with
 * two placeholders, `__ENV__` and `__FILE__`, filled in by `snippetFor`.</p>
 *
 * <p><b>Every one of them is written to be pasted by somebody who will not read it first.</b> So
 * each says what it does in its own comments, and each fails LOUDLY on a non-zero exit — a silently
 * empty configuration is how a service starts against the wrong database and nobody finds out
 * until it writes something.</p>
 *
 * <p><b>The key never travels as an argument.</b> A command line is readable by every user inside
 * WSL and by every process of the same user on Windows, and a config key lives for a year
 * (research/PLAN_config_key_off_the_command_line.md). So each snippet starts `creds config -` and
 * writes the key and a newline to its STDIN, then closes it — with no shell in between. Two cannot:
 * C++ (`popen` reads OR writes a child, and the standard library has nothing else) and Elixir
 * (`System.cmd` has no stdin) put the key into the CHILD's environment as `CREDSFORDEVS_KEY` and
 * run `creds config` with no argument. A process's environment is readable only by its owner.</p>
 *
 * <p>No backticks anywhere in these strings, deliberately: they are template literals, and a
 * backtick in a comment about a shell command would end the literal in the middle of a program.
 * For the same reason a newline inside the generated code is written \\n here, and a shell's
 * dollar-brace is escaped.</p>
 */

export const SNIPPET_BODIES: Readonly<Record<string, string>> = {
  'csharp:net6': `// "creds config -" asks the VS Code window holding your vault for this config and prints
// it. The key names WHICH config — it is not the secret itself, and the vault keeps only a
// hash of it, so it cannot be read back out if you lose it. It goes to creds on STDIN: a
// command line can be read by other processes on this machine, a pipe cannot.
static string ReadFromVault(string key)
{
    var start = new System.Diagnostics.ProcessStartInfo("creds")
    {
        RedirectStandardInput = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
    };
    // "-" means: read the key from stdin. No shell, and nothing variable in the arguments.
    start.ArgumentList.Add("config");
    start.ArgumentList.Add("-");

    using var process = System.Diagnostics.Process.Start(start)!;
    process.StandardInput.WriteLine(key);
    process.StandardInput.Close();
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
    // Framework has no ArgumentList, and this needs none: the arguments are the constant
    // "config -", and the key goes to creds on STDIN — never on a command line, which other
    // processes on this machine can read.
    var start = new ProcessStartInfo("creds", "config -")
    {
        RedirectStandardInput = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        CreateNoWindow = true,
    };
    using (var process = Process.Start(start))
    {
        process.StandardInput.WriteLine(key);
        process.StandardInput.Close();
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

/// Runs "creds config -", which asks the VS Code window holding the vault for this config.
/// The key names which config; it is not the secret itself. It goes to creds on STDIN —
/// never on a command line, which other processes on this machine can read.
let readFromVault (key: string) =
    let start = ProcessStartInfo("creds", RedirectStandardInput = true, RedirectStandardOutput = true,
                                 RedirectStandardError = true, UseShellExecute = false)
    // "-" means: read the key from stdin. No shell, and nothing variable in the arguments.
    start.ArgumentList.Add("config")
    start.ArgumentList.Add("-")
    use p = Process.Start(start)
    p.StandardInput.WriteLine(key)
    p.StandardInput.Close()
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

' Runs "creds config -", which asks the VS Code window holding the vault for this config.
' The key names which config; it is not the secret itself. It goes to creds on STDIN —
' never on a command line, which other processes on this machine can read.
Function ReadFromVault(key As String) As String
    Dim start As New ProcessStartInfo("creds") With {
        .RedirectStandardInput = True,
        .RedirectStandardOutput = True,
        .RedirectStandardError = True,
        .UseShellExecute = False
    }
    ' "-" means: read the key from stdin. No shell, and nothing variable in the arguments.
    start.ArgumentList.Add("config")
    start.ArgumentList.Add("-")

    Using process = Diagnostics.Process.Start(start)
        process.StandardInput.WriteLine(key)
        process.StandardInput.Close()
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

  'java:default': `// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds on
// STDIN — never on a command line, which other processes on this machine can read.
static String readFromVault(String key) throws Exception {
    // The list form, never a joined command string: no shell is involved.
    Process process = new ProcessBuilder("creds", "config", "-")
            .redirectError(ProcessBuilder.Redirect.INHERIT)
            .start();
    try (var stdin = process.getOutputStream()) {
        stdin.write((key + "\\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
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

  'kotlin:default': `// Runs "creds config -", which asks the VS Code window holding your vault for this config.
// The key names WHICH config; it is not the secret itself. It goes to creds on STDIN — never
// on a command line, which other processes on this machine can read.
fun readFromVault(key: String): String {
    // The vararg form, never a joined command string: no shell is involved.
    val process = ProcessBuilder("creds", "config", "-")
        .redirectError(ProcessBuilder.Redirect.INHERIT)
        .start()
    process.outputStream.use { it.write((key + "\\n").toByteArray(Charsets.UTF_8)) }
    val text = process.inputStream.readBytes().toString(Charsets.UTF_8)
    // Loudly: a silently empty configuration starts against the wrong database.
    check(process.waitFor() == 0) { "creds config exited " + process.exitValue() }
    return text
}

val vaultKey = System.getenv("__ENV__") ?: error("__ENV__ is not set.")

// Parse it with whatever you already use — kotlinx.serialization here.
val config = kotlinx.serialization.json.Json.parseToJsonElement(readFromVault(vaultKey))`,

  'scala:default': `import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets.UTF_8
import scala.sys.process._

// Runs "creds config -", which asks the VS Code window holding your vault for this config.
// The key names WHICH config; it is not the secret itself. It goes to creds on STDIN — never
// on a command line, which other processes on this machine can read.
def readFromVault(key: String): String = {
  val out = new StringBuilder
  val stdin = new ByteArrayInputStream((key + "\\n").getBytes(UTF_8))
  // The Seq form, never a single string: no shell is involved.
  val exit = (Seq("creds", "config", "-") #< stdin).!(ProcessLogger(line => out.append(line).append('\\n'), line => System.err.println(line)))
  // Loudly: a silently empty configuration starts against the wrong database.
  if (exit != 0) throw new IllegalStateException("creds config exited " + exit)
  out.toString
}

val vaultKey = sys.env.getOrElse("__ENV__", throw new IllegalStateException("__ENV__ is not set."))
val config = ujson.read(readFromVault(vaultKey))`,

  'python:default': `import json
import os
import subprocess

# Runs "creds config -", which asks the VS Code window holding your vault for this config
# and prints it. The key names WHICH config; it is not the secret itself, and the vault
# keeps only a hash of it, so it cannot be read back out if you lose it. It goes to creds on
# STDIN — never on a command line, which other processes on this machine can read.
def read_from_vault(key: str) -> str:
    # A list, never a string with shell=True: no shell is involved.
    result = subprocess.run(
        ["creds", "config", "-"],
        input=key + "\\n",
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

// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
// on STDIN — never on a command line, which other processes on this machine can read.
function readFromVault(key) {
  // execFileSync, never execSync: no shell is involved. It throws on a non-zero exit, which
  // is what we want — a silently empty configuration is how a service starts against the
  // wrong database.
  return execFileSync('creds', ['config', '-'], { input: key + '\\n', encoding: 'utf8' });
}

const vaultKey = process.env.__ENV__;
if (!vaultKey) throw new Error('__ENV__ is not set.');

export const config = JSON.parse(readFromVault(vaultKey));`,

  'javascript:cjs': `const { execFileSync } = require('node:child_process');

// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
// on STDIN — never on a command line, which other processes on this machine can read.
function readFromVault(key) {
  // execFileSync, never execSync: no shell is involved. It throws on a non-zero exit, which
  // is what we want — a silently empty configuration is how a service starts against the
  // wrong database.
  return execFileSync('creds', ['config', '-'], { input: key + '\\n', encoding: 'utf8' });
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

// Runs "creds config -", which asks the VS Code window holding your vault for this config.
// The key names WHICH config; it is not the secret itself. It goes to creds on STDIN —
// never on a command line, which other processes on this machine can read.
function readFromVault(key: string): string {
  // execFileSync, never execSync: no shell is involved. It throws on a non-zero exit, which
  // is what we want — a silently empty config starts against the wrong database.
  return execFileSync('creds', ['config', '-'], { input: key + '\\n', encoding: 'utf8' });
}

const vaultKey = process.env.__ENV__;
if (!vaultKey) throw new Error('__ENV__ is not set.');

export const config = JSON.parse(readFromVault(vaultKey)) as VaultConfig;`,

  'go:default': `import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
// on STDIN — never on a command line, which other processes on this machine can read.
func readFromVault(key string) ([]byte, error) {
	// Arguments as arguments, never a joined command line: no shell is involved.
	cmd := exec.Command("creds", "config", "-")
	cmd.Stdin = strings.NewReader(key + "\\n")
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
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
use std::io::Write;
use std::process::{Command, Stdio};

// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
// on STDIN — never on a command line, which other processes on this machine can read.
fn read_from_vault(key: &str) -> anyhow::Result<String> {
    // Arguments as arguments, never a joined command line: no shell is involved.
    let mut child = Command::new("creds")
        .args(["config", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
    // Taken and dropped at the end of the statement: dropping it closes stdin, which is how
    // creds knows the line has ended.
    child.stdin.take().expect("stdin is piped").write_all(format!("{key}\\n").as_bytes())?;
    let out = child.wait_with_output()?;
    if !out.status.success() {
        // Loudly. A silently empty configuration starts against the wrong database.
        anyhow::bail!("creds config exited {}", out.status);
    }
    Ok(String::from_utf8(out.stdout)?)
}

let vault_key = env::var("__ENV__").map_err(|_| anyhow::anyhow!("__ENV__ is not set"))?;
let config: serde_json::Value = serde_json::from_str(&read_from_vault(&vault_key)?)?;`,

  'php:default': `<?php
// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
// on STDIN — never on a command line, which other processes on this machine can read.
function readFromVault(string $key): string {
    // proc_open with an ARRAY, never shell_exec with a string: no shell is involved.
    $process = proc_open(['creds', 'config', '-'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    fwrite($pipes[0], $key . "\\n");
    fclose($pipes[0]);
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

# Runs "creds config -", which asks the VS Code window holding your vault for this config
# and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
# on STDIN — never on a command line, which other processes on this machine can read.
def read_from_vault(key)
  # Separate arguments, never backticks with an interpolated string: no shell is involved.
  text, status = Open3.capture2('creds', 'config', '-', stdin_data: key + "\\n")
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

// Runs "creds config" and reads its output. The key names WHICH config; it is not the
// secret itself.
//
// The key goes to creds in its ENVIRONMENT, as CREDSFORDEVS_KEY — never on a command line,
// which other processes on this machine can read. (The other snippets write it to stdin, but
// popen can read OR write a child, not both, and standard C++ has no other way to start one.)
// popen does go through a shell, so the command is a constant: nothing in it can be
// reinterpreted. The Windows CRT spells the same calls _putenv_s, _popen and _pclose — the
// _WIN32 branches below; an empty _putenv_s removes the variable.
std::string readFromVault(const std::string& key) {
    // setenv changes THIS program's environment, so the key is taken back out the moment the
    // child has it — otherwise every process started later would inherit it too.
    const char* before = std::getenv("CREDSFORDEVS_KEY");
    const bool hadBefore = before != nullptr;
    const std::string previous = hadBefore ? before : "";
#ifdef _WIN32
    _putenv_s("CREDSFORDEVS_KEY", key.c_str());
    FILE* pipe = _popen("creds config", "r");
    if (hadBefore) {
        _putenv_s("CREDSFORDEVS_KEY", previous.c_str());
    } else {
        _putenv_s("CREDSFORDEVS_KEY", "");
    }
#else
    setenv("CREDSFORDEVS_KEY", key.c_str(), 1);
    FILE* pipe = popen("creds config", "r");
    if (hadBefore) {
        setenv("CREDSFORDEVS_KEY", previous.c_str(), 1);
    } else {
        unsetenv("CREDSFORDEVS_KEY");
    }
#endif
    if (pipe == nullptr) throw std::runtime_error("could not run creds");
    std::array<char, 4096> buffer{};
    std::string out;
    while (std::fgets(buffer.data(), static_cast<int>(buffer.size()), pipe) != nullptr) {
        out += buffer.data();
    }
    // Loudly. A silently empty configuration starts against the wrong database.
#ifdef _WIN32
    const int exitCode = _pclose(pipe);
#else
    const int exitCode = pclose(pipe);
#endif
    if (exitCode != 0) throw std::runtime_error("creds config failed");
    return out;
}

const char* vaultKey = std::getenv("__ENV__");
if (vaultKey == nullptr) throw std::runtime_error("__ENV__ is not set.");
// Parse readFromVault(vaultKey) with whatever JSON library you already use.`,

  'swift:default': `import Foundation

// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
// on STDIN — never on a command line, which other processes on this machine can read.
func readFromVault(_ key: String) throws -> Data {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    // Arguments as arguments, never a joined command line: no shell is involved.
    process.arguments = ["creds", "config", "-"]
    let input = Pipe()
    let output = Pipe()
    process.standardInput = input
    process.standardOutput = output
    try process.run()
    input.fileHandleForWriting.write(Data((key + "\\n").utf8))
    try input.fileHandleForWriting.close()
    let data = output.fileHandleForReading.readDataToEndOfFile()
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

// Runs "creds config -", which asks the VS Code window holding your vault for this config
// and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
// on STDIN — never on a command line, which other processes on this machine can read.
Future<String> readFromVault(String key) async {
  // runInShell stays false: no shell is involved.
  final process = await Process.start('creds', ['config', '-']);
  process.stdin.writeln(key);
  await process.stdin.close();
  final errors = process.stderr.transform(utf8.decoder).join();
  final text = await process.stdout.transform(utf8.decoder).join();
  final code = await process.exitCode;
  if (code != 0) {
    // Loudly. A silently empty configuration starts against the wrong database.
    throw StateError('creds config exited ' + code.toString() + ': ' + await errors);
  }
  return text;
}

final vaultKey = Platform.environment['__ENV__'];
if (vaultKey == null) throw StateError('__ENV__ is not set.');

final config = jsonDecode(await readFromVault(vaultKey)) as Map<String, dynamic>;`,

  'elixir:default': `# Runs "creds config", which asks the VS Code window holding your vault for this config
# and prints it. The key names WHICH config; it is not the secret itself.
#
# The key goes to creds in its ENVIRONMENT, as CREDSFORDEVS_KEY — never on a command line,
# which other processes on this machine can read. (The other snippets write it to stdin, but
# System.cmd cannot write to a child's stdin, and a Port cannot close stdin on its own.)
defmodule VaultConfig do
  def read!(key) do
    # System.cmd takes arguments as a list and starts no shell.
    case System.cmd("creds", ["config"], env: [{"CREDSFORDEVS_KEY", key}]) do
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
use IPC::Open2;
use JSON::PP;

# Runs "creds config -", which asks the VS Code window holding your vault for this config
# and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
# on STDIN — never on a command line, which other processes on this machine can read.
sub read_from_vault {
    my ($key) = @_;
    # The LIST form, never a single string: no shell is involved.
    my $pid = open2(my $out, my $in, 'creds', 'config', '-');
    print {$in} "$key\\n";
    close($in);
    local $/;
    my $text = <$out>;
    waitpid($pid, 0);
    # Loudly. A silently empty configuration starts against the wrong database.
    die "creds config exited " . ($? >> 8) if $? != 0;
    return $text;
}

my $vault_key = $ENV{'__ENV__'} or die "__ENV__ is not set.";
my $config = decode_json(read_from_vault($vault_key));`,

  'bash:default': `# Runs "creds config -", which asks the VS Code window holding your vault for this config
# and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
# on STDIN: printf is a shell builtin, so the key is on no process's command line.
set -euo pipefail

: "\${__ENV__:?__ENV__ is not set}"

# Captured FIRST, written second. creds exits non-zero on failure and set -e stops here —
# loudly, because a silently empty config starts against the wrong database. Because the
# redirect happens only after creds succeeded, a failed read never truncates a good file.
config=$(printf '%s\\n' "\${__ENV__}" | creds config -)
printf '%s' "\${config}" > '__FILE__'

# Or keep it off the filesystem entirely and read straight from the variable:
#   echo "\${config}" | jq -r .ConnectionStrings.Default`,

  'powershell:default': `# Runs "creds config -", which asks the VS Code window holding your vault for this config
# and prints it. The key names WHICH config; it is not the secret itself. It goes to creds
# on STDIN, through the pipeline — never on a command line, which other processes can read.
$ErrorActionPreference = 'Stop'

if (-not $env:__ENV__) { throw '__ENV__ is not set.' }

$configText = $env:__ENV__ | & creds config -
# Loudly. A silently empty configuration starts against the wrong database.
if ($LASTEXITCODE -ne 0) { throw "creds config exited $LASTEXITCODE" }

# As an object to read from...
$config = $configText | ConvertFrom-Json
$connection = $config.ConnectionStrings.Default

# ...or straight to the file your program already reads. Written only after creds
# succeeded, so a failed read never truncates a good file. $configText is one string per
# LINE (PowerShell splits what a command prints), and Set-Content writes them as lines;
# -NoNewline would glue them into one line with every newline gone.
Set-Content -Path '__FILE__' -Value $configText`,
};
