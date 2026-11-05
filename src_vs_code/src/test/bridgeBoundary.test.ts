import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { socketPathFor } from '../brokerListeners';
import { share, world } from './brokerWorld';

/**
 * The scenarios that hold for the whole of epic E1, written in E1.2 and kept to the end
 * (todo/PLAN_remote_bridge_scoped_E1.md, "Scenarios that hold for the whole epic").
 *
 * <p>R3 was written FIRST and watched GREEN on untouched code: the expected answers below are
 * literals recorded from the broker before the third door existed, and no later story edits them.</p>
 */

const repoRoot = path.join(__dirname, '..', '..', '..');
const sourceDir = path.join(__dirname, '..', '..', 'src');

interface Seen {
  readonly status: number | 'closed';
  readonly body: string;
}

type Target = { readonly port: number } | { readonly socketPath: string };

/** One request over real HTTP, `Host` included — `fetch` would silently replace it. */
function send(target: Target, method: string, route: string, headers: Record<string, string>): Promise<Seen> {
  const payload = method === 'POST' ? '{}' : undefined;
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      ...('port' in target ? { host: '127.0.0.1', port: target.port } : { socketPath: target.socketPath }),
      path: route,
      method,
      headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    };
    const request = http.request(options, (response) => {
      let text = '';
      response.on('data', (chunk) => {
        text += String(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: withoutDuration(text) }));
    });
    request.on('error', (error: NodeJS.ErrnoException) => {
      const hungUp = error.code === 'EPIPE' || error.code === 'ECONNRESET';
      return hungUp ? resolve({ status: 'closed', body: '' }) : reject(error);
    });
    request.setTimeout(5_000, () => request.destroy(new Error(`no answer for ${method} ${route}`)));
    request.end(payload);
  });
}

/** `durationMs` is the one value that differs between runs. */
function withoutDuration(text: string): string {
  return text.replace(/"durationMs":\d+/g, '"durationMs":0');
}

interface Contract {
  health: Route;
  reads: Record<string, Route>;
  configRead: Route;
  routes: Record<string, string>;
  mcpDeleteRoute: string;
  mcpCreateRoute: string;
  mcpUsePrefix: string;
  mcpActions: string[];
  mcpFolderPrefix: string;
  mcpFolderActions: string[];
}
type Route = { method: string; path: string };

/** Every route the contract names, once: the surface R3 puts through both doors. */
function contractRequests(): readonly string[] {
  const c = JSON.parse(fs.readFileSync(path.join(repoRoot, 'contract', 'broker-v1.json'), 'utf8')) as Contract;
  const get = (r: Route): string => `${r.method} ${r.path}`;
  const post = (route: string): string => `POST ${route}`;
  return [
    ...new Set([
      get(c.health),
      ...Object.values(c.reads).map(get),
      get(c.configRead),
      ...Object.values(c.routes).map(post),
      post(c.mcpDeleteRoute),
      post(c.mcpCreateRoute),
      ...c.mcpActions.map((a) => post(`${c.mcpUsePrefix}${a}`)),
      ...c.mcpFolderActions.map((a) => post(`${c.mcpFolderPrefix}${a}`)),
      post('/v1/alias/exec'),
    ]),
  ];
}

test('R3: the two existing doors answer as they did before the third existed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-r3-'));
  const w = world({ storageDir: dir });
  try {
    const { port } = await share(w);
    const address = socketPathFor(dir, process.pid, process.platform) as string;
    const seen: Record<string, Seen> = {};
    for (const request of contractRequests()) {
      const [method, route] = request.split(' ');
      seen[`port ${request}`] = await send({ port }, method, route, { Host: `127.0.0.1:${port}` });
      seen[`socket ${request}`] = await send({ socketPath: address }, method, route, {});
    }
    seen['port browser'] = await send({ port }, 'GET', '/v1/health', { Host: `127.0.0.1:${port}`, Origin: 'http://evil.example' });
    seen['port wrong Host'] = await send({ port }, 'GET', '/v1/health', { Host: 'evil.example' });
    seen['socket wrong Host'] = await send({ socketPath: address }, 'GET', '/v1/health', { Host: 'evil.example' });
    // The answers recorded from the broker BEFORE the third door existed. Whole-object equality, so
    // a request that was added, dropped or answered differently fails; nothing is derived from the code.
    const recorded = JSON.parse(fs.readFileSync(path.join(sourceDir, 'test', 'fixtures', 'bridgeBoundary.r3.json'), 'utf8'));
    assert.deepEqual(seen, recorded);
  } finally {
    w.server.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('R3 has teeth: the recorded answers include the refusals and the socket that has no Host to check', () => {
  const recorded = JSON.parse(fs.readFileSync(path.join(sourceDir, 'test', 'fixtures', 'bridgeBoundary.r3.json'), 'utf8')) as Record<string, Seen>;
  assert.equal(recorded['port browser'].status, 403);
  assert.equal(recorded['port wrong Host'].status, 403);
  assert.equal(recorded['socket wrong Host'].status, 200, 'a socket cannot name a port, so no Host is wrong there');
  assert.equal(recorded['port POST /v1/use/exec'].status, 401);
  assert.equal(recorded['port GET /v1/health'].status, 200);
});

/** Source lines that are code: comment lines blanked, so prose naming a thing is not a use of it. */
function codeOf(file: string): string[] {
  return fs
    .readFileSync(path.join(sourceDir, file), 'utf8')
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line));
}

/** Every non-test source under `src/`, relative to it — the whole of what ships, not the places a caller is expected to be. */
function shippedSources(dir = ''): string[] {
  return fs.readdirSync(path.join(sourceDir, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : shippedSources(relative);
    }
    return relative.endsWith('.ts') ? [relative] : [];
  });
}

/** The module that DEFINES `openBridgeListener`: the one place its name belongs. R1 has a companion that counts it there. */
const DEFINES_IT = 'credsAgentServer.ts';

test('R1: nothing in the shipped sources opens a bridge door or hands the broker a wall', () => {
  const callers = shippedSources().filter((file) => file !== DEFINES_IT);
  assert.ok(callers.length > 400, `the scan walked every source (${callers.length}), not a short list`);
  assert.ok(callers.includes('extension.ts'), 'it includes extension.ts');
  assert.ok(callers.some((file) => file.startsWith('commands')), 'and the commands folder');
  assert.ok(!callers.some((file) => file.startsWith('test')), 'and no test');
  for (const file of callers) {
    const hits = codeOf(file).filter((line) => /openBridgeListener|bridgeWall/.test(line));
    assert.deepEqual(hits, [], `${file} must not open a Remote Bridge listener yet`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src_vs_code', 'package.json'), 'utf8')) as {
    contributes: { commands: { command: string }[] };
  };
  const bridgey = manifest.contributes.commands.map((c) => c.command).filter((c) => /bridge/i.test(c));
  assert.deepEqual(bridgey.sort(), ['credSshManager.closeRemoteBridge', 'credSshManager.openRemoteBridge'], 'no new command');
});

test('R1 has teeth: the scan sees the one place the name lives', () => {
  const hits = codeOf('credsAgentServer.ts').filter((line) => /openBridgeListener/.test(line));
  assert.equal(hits.length, 1, 'credsAgentServer.ts defines openBridgeListener exactly once, and nothing calls it');
});

/** The two ways a module reaches the editor: an `import ... from 'vscode'` and a `require('vscode')`. */
const IMPORTS_VSCODE = /from\s+['"]vscode['"]/;
const REQUIRES_VSCODE = /require\(\s*['"]vscode['"]/;
const reachesVscode = (source: string): boolean => IMPORTS_VSCODE.test(source) || REQUIRES_VSCODE.test(source);

test('R2: the bridge modules are pure', () => {
  for (const file of ['bridgeContext.ts', 'bridgeNote.ts', 'brokerBridgeListeners.ts', 'bridgeAllowList.ts', 'brokerOrigin.ts']) {
    const source = fs.readFileSync(path.join(sourceDir, file), 'utf8');
    assert.ok(!IMPORTS_VSCODE.test(source), `${file} must not import vscode`);
    assert.ok(!REQUIRES_VSCODE.test(source), `${file} must not require vscode`);
  }
});

test('R2 has teeth: the patterns match every spelling of a vscode import, and a real file that has one', () => {
  for (const line of [
    "import * as vscode from 'vscode';",
    'import * as vscode from "vscode";',
    "import type { Uri } from 'vscode';",
    "import {\n  window,\n} from   'vscode';",
    "const vscode = require('vscode');",
    'const vscode = require( "vscode" );',
  ]) {
    assert.ok(reachesVscode(line), line);
  }
  for (const line of ["import * as uri from 'vscode-uri';", "import { x } from './vscodeStub';", "const a = require('node:fs');"]) {
    assert.ok(!reachesVscode(line), `${line} is not a vscode import`);
  }
  assert.ok(reachesVscode(fs.readFileSync(path.join(sourceDir, 'credsAgentServer.ts'), 'utf8')), 'the broker itself imports vscode, and the scan sees it');
});
