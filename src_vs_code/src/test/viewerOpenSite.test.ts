import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import type { EntityViewOptions } from '../entityViewPage';

/**
 * Issue #104 through the REAL viewer panel: the page's Open button posts `{type: 'open', field:
 * 'url'}`, and what the browser receives must be the URL of the entry the panel shows — never a
 * value the message carries. A source-text match could not catch the branch moving below the
 * copy-only return; this drives the message loop itself.
 */

interface World {
  send: (message: Record<string, unknown>) => Promise<void>;
  opened: string[];
  warnings: string[];
}

function world(options: Partial<EntityViewOptions>): World {
  const opened: string[] = [];
  const warnings: string[] = [];
  let handler: ((message: unknown) => Promise<void>) | undefined;
  const webview = {
    html: '',
    cspSource: 'vscode-resource:',
    postMessage: () => Promise.resolve(true),
    onDidReceiveMessage: (h: (message: unknown) => Promise<void>) => {
      handler = h;
      return { dispose: () => undefined };
    },
    asWebviewUri: (u: unknown) => u,
  };
  const vscode = {
    env: {
      openExternal: (uri: { value: string }) => {
        opened.push(uri.value);
        return Promise.resolve(true);
      },
      clipboard: { writeText: () => Promise.resolve() },
    },
    Uri: { parse: (value: string) => ({ value }) },
    ViewColumn: { Active: -1, Beside: -2, One: 1 },
    window: {
      createWebviewPanel: () => ({
        webview,
        title: '',
        reveal: () => undefined,
        dispose: () => undefined,
        onDidDispose: () => ({ dispose: () => undefined }),
        onDidChangeViewState: () => ({ dispose: () => undefined }),
      }),
      showWarningMessage: (text: string) => {
        warnings.push(text);
        return Promise.resolve(undefined);
      },
      showInformationMessage: () => Promise.resolve(undefined),
    },
    workspace: {
      getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }),
      onDidChangeConfiguration: () => ({ dispose: () => undefined }),
    },
  };
  const panel = loadWithVscode<typeof import('../entityViewPanel')>('../entityViewPanel', vscode);
  // The same shape entityViewPage.test.ts renders with; the cast is for the callbacks this path
  // never reaches (the copy/env/download branches), not for anything the open branch reads.
  panel.showEntityView({
    details: { id: 'e1', name: 'godaddy', isSshEnabled: false, kind: 'credential' },
    hasPassword: false,
    hasPrivateKey: false,
    hasVpnConfig: false,
    hasDbConnection: false,
    dbPortIsDefault: false,
    dbHasPassword: false,
    hasAttachment: false,
    history: [],
    resolveSecret: async () => undefined,
    copyAllText: async () => '',
    saveVpnConfig: async () => {},
    saveAttachment: async () => {},
    setEnv: async () => true,
    checkEnv: () => {},
    ...options,
  } as EntityViewOptions);
  return {
    send: async (message) => {
      assert.ok(handler, 'the panel registered its message loop');
      await handler(message);
    },
    opened,
    warnings,
  };
}

test('Open in the viewer opens the STORED url — a url in the message is ignored', async () => {
  const w = world({ fields: { url: 'www.godaddy.com' } });

  await w.send({ type: 'open', field: 'url', url: 'javascript:alert(1)', value: 'file:///etc/passwd' });

  assert.deepEqual(w.opened, ['https://www.godaddy.com/']);
  assert.deepEqual(w.warnings, []);
});

test('a stored URL with a refused scheme opens nothing, and the viewer says so', async () => {
  const w = world({ fields: { url: 'vscode://settings/foo' } });

  await w.send({ type: 'open', field: 'url' });

  assert.deepEqual(w.opened, []);
  assert.match(w.warnings[0] ?? '', /"godaddy": "vscode:" addresses are not opened/);
});

test('open is answered only for the url field — no other field reaches the browser', async () => {
  const w = world({ fields: { login: 'https://looks-like-a-url.example', url: 'https://real.example' } });

  await w.send({ type: 'open', field: 'login' });

  assert.deepEqual(w.opened, []);
});
