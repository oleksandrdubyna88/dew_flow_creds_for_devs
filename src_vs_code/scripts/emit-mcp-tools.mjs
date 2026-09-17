// The MCP surface, as a file you can read and diff.
//
//   node scripts/emit-mcp-tools.mjs           # write contract/mcp-tools-v1.json
//   node scripts/emit-mcp-tools.mjs --check   # fail if the binary and the file disagree
//
// WHY THIS EXISTS. The MCP protocol has no manifest: a server declares its tools at run time in
// its `tools/list` reply, and that reply is built by the SDK from C# delegates. So there was no
// artifact anywhere saying what the surface IS — the catalog lived in three source files plus
// whatever a live process happened to answer, and the only way to review it was to run one.
//
// That is the same argument that produced `contract/broker-v1.json` for the HTTP wire, and it is
// worth restating because the two files are often confused: broker-v1.json describes the routes
// between `creds-mcp` and the VS Code window, and contains the string "creds_" zero times. This
// one describes what an AGENT is offered. Different wire, different readers.
//
// What it captures, and what it deliberately leaves out. The instructions and every tool's name,
// title, description, input schema and behaviour hints — because all of those are text a model
// acts on, and a change to any of them is a change to the product. NOT the assembly version:
// it moves on every build, and a file that churns is a file nobody reads a diff of.
//
// Two failures are worth being loud about, and they are the same failure: a MISSING binary and a
// STALE one. `--check` must not pass because nothing ran, and it must not pass because what ran
// was last week's executable — this script's whole output is whatever that process answers, so an
// exe older than `Program.cs` regenerates the contract from prose nobody wrote any more and the
// check agrees with it. Both exit 2, naming the one command that rebuilds it.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mcpBinary from './mcpBinary.cjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARGET = join(ROOT, 'contract', 'mcp-tools-v1.json');
const { EXE: BINARY, BUILD, binaryIsFresherThanItsSource } = mcpBinary;

const HANDSHAKE = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'emit-mcp-tools', version: '1' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
];

/**
 * Speak to the real binary and collect what it answers.
 *
 * Stdin is held open until the replies arrive: closing it shuts the server down mid-flight, and
 * the symptom is an empty answer that looks exactly like a broken handshake.
 */
function ask() {
  return new Promise((resolve, reject) => {
    // CREDS_RELAYED_FROM_WSL keeps a Linux run from re-executing the Windows binary: this asks
    // the catalog, and the catalog is the same on both sides.
    const child = spawn(BINARY, [], { env: { ...process.env, CREDS_RELAYED_FROM_WSL: '1' } });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', reject);
    let i = 0;
    const next = () => {
      if (i < HANDSHAKE.length) {
        child.stdin.write(`${JSON.stringify(HANDSHAKE[i])}\n`);
        i += 1;
        setTimeout(next, 150);
        return;
      }
      setTimeout(() => {
        child.stdin.end();
        child.kill();
        resolve(replies(out));
      }, 2500);
    };
    next();
  });
}

function replies(text) {
  const byId = new Map();
  for (const line of text.split('\n')) {
    if (!line.includes('"jsonrpc"')) continue;
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined) byId.set(message.id, message);
    } catch {
      // a partial line from the killed process is not a failure
    }
  }
  return byId;
}

/**
 * Every newline as `\n`, whoever generated it.
 *
 * <p>The prose in these strings is a C# raw string literal, so it carries the LINE ENDINGS of
 * `Program.cs` on the machine that built the binary — CRLF on Windows, LF on CI. Without this, a
 * regeneration on the other platform rewrites fifteen strings that nobody touched, and the real
 * change hides inside the churn. It also made `--check` a platform test rather than a contract
 * test: the file could be byte-different from a correct regeneration for no reason at all.</p>
 */
function withUnixNewlines(value) {
  if (typeof value === 'string') {
    return value.replace(/\r\n/g, '\n');
  }
  if (Array.isArray(value)) {
    return value.map(withUnixNewlines);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withUnixNewlines(inner)]));
  }
  return value;
}

/** Sorted by name, so a diff shows what changed rather than how the SDK ordered them today. */
function surfaceOf(byId) {
  const initialize = byId.get(1)?.result;
  const tools = byId.get(2)?.result?.tools;
  if (initialize === undefined || tools === undefined) {
    throw new Error('the binary did not answer initialize and tools/list');
  }
  return {
    $comment:
      'GENERATED by src_vs_code/scripts/emit-mcp-tools.mjs from the built creds-mcp binary. ' +
      'This is what an AGENT is offered; contract/broker-v1.json is the HTTP wire underneath it. ' +
      'Do not edit by hand — run the script.',
    service: initialize.serverInfo?.name,
    protocolVersion: initialize.protocolVersion,
    instructions: initialize.instructions,
    tools: [...tools]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      })),
  };
}

const checking = process.argv.includes('--check');

if (!existsSync(BINARY)) {
  console.error(`creds-mcp is not built: ${BINARY}`);
  console.error(`Run: ${BUILD}`);
  process.exit(2);
}

// A STALE binary is the same failure as a missing one, and quieter: this script's whole output is
// whatever that process answers, so an executable older than `Program.cs` regenerates the contract
// from prose nobody wrote any more — and `--check` then agrees with it, because both asked the same
// stale process. Observed while writing this guard: a `Program.cs` edit followed by
// `dotnet build dew_flow_creds_for_devs.slnx` printed *Build succeeded, 0 Warning(s)* without
// rebuilding anything here, because that solution file lists the minimal-API server alone.
const fresh = binaryIsFresherThanItsSource();
if (!fresh.fresh) {
  console.error(`creds-mcp is older than the C# it answers for — ${fresh.why}`);
  process.exit(2);
}

const surface = withUnixNewlines(surfaceOf(await ask()));
const text = `${JSON.stringify(surface, null, 2)}\n`;

/**
 * The file as CONTENT, not as bytes.
 *
 * <p>Normalising the values was half the job and the half that was visible. The other half is the
 * FILE: this repository sets `core.autocrlf=true` and its `.gitattributes` is deliberately narrow,
 * so every checkout, rebase or branch switch writes `contract/mcp-tools-v1.json` back with CRLF
 * while the generator writes LF. A byte comparison then reports *the MCP surface has changed* after
 * a rebase that touched nothing — which is the same failure the docblock above rejects, one level
 * up: the check becomes a test of which platform materialised the file. Observed, not predicted —
 * `--check` was green, a rebase onto `origin/main` landed, and it went red with an identical
 * surface. Both sides are normalised, so only a real difference is a difference.</p>
 */
const asContent = (value) => value.replace(/\r\n/g, '\n');

if (!checking) {
  writeFileSync(TARGET, text);
  console.log(`wrote ${TARGET} — ${surface.tools.length} tools`);
} else if (!existsSync(TARGET) || asContent(readFileSync(TARGET, 'utf8')) !== text) {
  console.error('the MCP surface has changed and contract/mcp-tools-v1.json was not regenerated.');
  console.error('Run: npm run contract:mcp');
  process.exit(1);
} else {
  console.log(`mcp surface unchanged — ${surface.tools.length} tools`);
}
