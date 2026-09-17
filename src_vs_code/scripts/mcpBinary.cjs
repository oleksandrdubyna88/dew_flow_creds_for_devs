// Where the built `creds-mcp` is, and whether it is newer than the C# it embodies.
//
// WHY THIS IS ITS OWN FILE. Two scripts drive that executable — `creds-mcp-itest.cjs`, which talks
// to it over stdio, and `emit-mcp-tools.mjs`, which asks it for the tool surface and writes
// `contract/mcp-tools-v1.json` from the answer. Each had its own copy of the path, and only the
// first had the freshness check. That asymmetry cost real work: `dotnet build
// dew_flow_creds_for_devs.slnx` does NOT build `src_mcp` — the solution file lists the
// minimal-API server and its tests and nothing else — so a `Program.cs` edit followed by that
// command reports *Build succeeded, 0 Warning(s)* and leaves the binary exactly as it was. The
// emitter then regenerated the contract from yesterday's executable and printed
// `wrote … — 16 tools`, and `--check` agreed with it, because both had asked the same stale
// process. The itest would have caught it and the contract step would not.
//
// CJS rather than ESM because the itest is `.cjs` and cannot `require` an ES module; the emitter
// is `.mjs` and imports this fine. The dependency runs the way that works, rather than the copy
// running twice.
const fs = require('node:fs');
const path = require('node:path');

/** The debug build the scripts drive. Both of them, from here, so a moved output path moves once. */
const EXE = path.join(
  __dirname,
  '..',
  '..',
  'src_mcp',
  'src',
  'bin',
  'Debug',
  'net10.0',
  process.platform === 'win32' ? 'creds-mcp.exe' : 'creds-mcp',
);

/** The one command that actually rebuilds it — named in every failure, because the obvious one does not. */
const BUILD = 'dotnet build src_mcp/src/CredsMcp.csproj';

/**
 * Is the executable at least as new as the newest source it is built from?
 *
 * <p>`bin` and `obj` are skipped: they are the build's own output, so comparing the binary against
 * them is comparing it against itself and would pass for any binary that exists.</p>
 */
function binaryIsFresherThanItsSource() {
  const root = path.join(__dirname, '..', '..', 'src_mcp', 'src');
  if (!fs.existsSync(EXE) || !fs.existsSync(root)) {
    return { fresh: false, why: `missing: ${fs.existsSync(EXE) ? root : EXE} — run: ${BUILD}` };
  }
  const built = fs.statSync(EXE).mtimeMs;
  let newest = 0;
  let newestPath = '';
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'bin' && entry.name !== 'obj') walk(full);
        continue;
      }
      if (!/\.(cs|csproj|json)$/.test(entry.name)) continue;
      const at = fs.statSync(full).mtimeMs;
      if (at > newest) {
        newest = at;
        newestPath = full;
      }
    }
  };
  walk(root);
  const hours = (built - newest) / 3_600_000;
  return {
    fresh: built >= newest,
    why: `built ${age(hours)} ${path.basename(newestPath)} — run: ${BUILD}`,
  };
}

/** How far the binary is from the source, said in the direction that matters. */
function age(hours) {
  return hours >= 0 ? `${hours.toFixed(1)}h after` : `${(-hours).toFixed(1)}h BEFORE`;
}

module.exports = { EXE, BUILD, binaryIsFresherThanItsSource };
