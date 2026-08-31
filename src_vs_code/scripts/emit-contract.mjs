#!/usr/bin/env node
// Emit the broker's wire contract as JSON, from the TypeScript that already defines it.
//
// The moment a second implementation of this protocol exists in another language, the
// contract stops being a shared module and becomes a specification with two implementations.
// This is the half that stops them drifting: `brokerProtocol.ts` remains the single source,
// this writes what it says into `contract/broker-v1.json`, and a test on each side asserts its
// own table matches that file. A divergence then fails a build instead of surfacing as a
// puzzling exit code in somebody's terminal.
//
// Run it from the extension folder: `node scripts/emit-contract.mjs`. It reads the COMPILED
// module, so `npm run compile` first — importing the .ts directly would need a loader and give
// the generator its own opinion about what the source means.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(here, '..');
const repoRoot = resolve(extensionRoot, '..');

const protocol = await import(pathToFileURL(join(extensionRoot, 'out', 'brokerProtocol.js')).href);
const outcome = await import(pathToFileURL(join(extensionRoot, 'out', 'agentCliOutcome.js')).href);

// Every error code the broker can answer with, and the HTTP status it rides on. Taken by
// asking the real function rather than by copying its table, so a code added without a status
// cannot silently emit `undefined` here.
const ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'denied',
  'not_found',
  'not_supported',
  'no_credential',
  'payload_too_large',
  'too_many_requests',
  'consent_timeout',
  'tool_missing',
  'internal',
];

const errors = {};
for (const code of ERROR_CODES) {
  const status = protocol.statusForErrorCode(code);
  if (typeof status !== 'number') {
    throw new Error(`no HTTP status for error code "${code}" — brokerProtocol.ts is out of step`);
  }
  errors[code] = status;
}

// The verbs a client may send, and the route each one posts to. This is the table `agentCli.ts`
// holds; a second client needs the same one or its `vpn-up` goes nowhere.
const routes = {
  exec: '/v1/use/exec',
  terminal: '/v1/use/terminal',
  db: '/v1/use/query',
  run: '/v1/use/run',
  script: '/v1/use/run',
  env: '/v1/use/exportEnv',
  'vpn-up': '/v1/use/up',
  'vpn-down': '/v1/use/down',
};

// The GET routes: they perform nothing, raise nothing, and carry no token. Until now the one
// that existed was spelled out in the C# by hand, which was affordable while there was one of
// it. There are four now — and one of them is read by a binary that has no other way to learn
// its path — so they travel in the contract like everything else both sides have to agree on.
//
// Each states its METHOD, and that is not decoration. Until 0.91.0 a read was a bare path and
// the verb was left to be inferred, so `mcpFolders` could be filed here — where every client
// therefore GETs it — while the window served it under POST alone. It answered 404 for five
// releases. Both sides had a test asserting they meant the same PATH; neither could assert the
// verb, because there was no field for one. `health` and `configRead` had carried theirs from
// the start, which made the omission here an inconsistency rather than a decision.
const read = (path) => ({ method: 'GET', path, authenticated: false });

const reads = {
  aliases: read('/v1/aliases'),
  mcpEntries: read('/v1/mcp/entries'),
  // Added to the JSON when the config snippet shipped and never added HERE — so the next
  // regeneration silently dropped it, and the C# that reads the route by this name would have
  // fallen back to a hard-coded path. Found by the contract test, which is what it is for.
  mcpConfigSnippet: read('/v1/mcp/config-snippet'),
  // The folder listing belongs with them by the same definition: a GET that performs nothing,
  // raises no prompt and carries no token.
  mcpFolders: read('/v1/mcp/folders'),
};

// The one authenticated route here that is not a use, and the only POST that reads. It is NOT in
// `reads` above: everything there answers without a token and performs nothing, while this checks
// a key against a stored hash and returns a config file entire. A POST for something that reads
// because a GET is the shape caches, proxies and shell histories treat as safe to record — and
// the key would be in it. The second implementation cannot guess any of that, so it travels here.
const configRead = { method: 'POST', path: '/v1/config/read', authenticated: true, bearer: 'config key' };

// The rest of the surface is POSTed, and stays a bare path here because there is nothing to
// choose: a use, a deletion, a creation and a folder verb all carry a body and all perform
// something, which is what makes them not reads. The half that was missing is not a `method`
// field on each of them but a check that the two groups stay apart — `brokerContract.test.ts`
// now asserts that every route under `reads` IS answered by the read router and that none of
// the POST routes below is, which catches the mistake in both directions.

// A route of its own rather than another verb under the use prefix, because deleting is not a
// use of a credential: nothing is connected to, nothing is run, no secret is touched. It carries
// the same body — an `entry` id — and the same gate one rung higher.
const mcpDeleteRoute = '/v1/mcp/delete';

// The only MCP route whose body does not name an entry, because there is not one yet. It names a
// folder instead — and only one somebody opened to creation.
const mcpCreateRoute = '/v1/mcp/create';

// The second object on the agent surface. A listing that performs nothing and raises no prompt,
// and a prefix plus a verb for the three that do — the same shape as the use routes, and for the
// same reason: one vocabulary rather than a route written out per verb.
const mcpFolderPrefix = '/v1/mcp/folder/';

// What a folder verb may be. Written out because a word here that no handler serves would 404 at
// the far end and read to a person as "the folder is gone".
const mcpFolderActions = ['create', 'edit', 'delete'];

// The prefix an MCP client posts an action to. A prefix rather than a route per verb, because
// the verb vocabulary is the `routes` table above and repeating it here would be two lists to
// keep in step; what a second implementation cannot guess is where the prefix lives.
const mcpUsePrefix = '/v1/mcp/use/';

// The actions the MCP prefix serves. NOT the same set as `routes` above, and the difference is
// the point: `routes` is the CLI's verb table, and the CLI has no `rotate` — rotation is a thing
// an agent asks for with a placeholder, which is not a shape a terminal command has. Every one
// of these is a `(kind, action)` the broker's registry answers; a name here that nothing
// registers would 404 at the far end and read to a person as "the entry is gone".
const mcpActions = [
  ...new Set(Object.values(routes).map((route) => route.replace('/v1/use/', ''))),
  'rotate',
];

const contract = {
  $comment:
    'GENERATED by src_vs_code/scripts/emit-contract.mjs from brokerProtocol.ts and ' +
    'agentCliOutcome.ts. Do not edit by hand: a test on each side asserts its own tables ' +
    'match this file, so an edit here without the code change turns both of them red.',
  // The WIRE's version, not the file's serialisation. It stays 1 through the 0.91.0 change that
  // gave each read a `method`: no path moved, no verb changed, no status changed — the same
  // protocol is described more completely. The shape of `reads` did change, and that is safe
  // because a reader never meets a foreign copy: `broker-v1.json` is an embedded resource, so
  // every binary carries the file its own parser was written against.
  version: 1,
  service: protocol.SERVICE_NAME,
  health: { method: 'GET', path: '/v1/health', authenticated: false },
  limits: {
    maxRequestBodyBytes: protocol.MAX_REQUEST_BODY_BYTES,
    maxStreamBytes: protocol.MAX_STREAM_BYTES,
    maxConcurrentExecs: protocol.MAX_CONCURRENT_EXECS,
    defaultExecTimeoutMs: protocol.DEFAULT_EXEC_TIMEOUT_MS,
    minExecTimeoutMs: protocol.MIN_EXEC_TIMEOUT_MS,
    maxExecTimeoutMs: protocol.MAX_EXEC_TIMEOUT_MS,
  },
  routes,
  reads,
  configRead,
  mcpUsePrefix,
  mcpDeleteRoute,
  mcpCreateRoute,
  mcpActions,
  mcpFolderPrefix,
  mcpFolderActions,
  errors,
  // The band a client uses to report failures of the mechanism itself. A remote command's own
  // code passes through untouched, so these are deliberately high and documented as reserved.
  exitCodes: { ...outcome.EXIT },
};

const target = join(repoRoot, 'contract', 'broker-v1.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(contract, null, 2)}\n`);
process.stdout.write(`wrote ${target}\n`);
