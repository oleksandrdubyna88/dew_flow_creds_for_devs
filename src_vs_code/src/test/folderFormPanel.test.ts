import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configStub, loadWithVscode, settingsVscode } from './vscodeStub';
import { runFragment } from './miniDom';
import { HOST_CHK, chooseAsk, mcpPage } from './mcpFormFixture';
import { mcpSwitchScript } from '../mcpSwitchScript';
import type { McpAccess } from '../mcpAccess';
import { scalePx, zoomStyle } from '../zoomControl';

/**
 * The folder form's host half — the wiring that makes it a T28 page like every other (#53).
 *
 * <p>It rendered with no scale, hooked nothing, and understood two message types. The entity form
 * beside it has done all three since T28, which is the whole complaint: two forms, one of them
 * following the text-size setting and one of them not, with nothing in the code saying which.</p>
 *
 * <p>Asserted through the panel rather than the page, because every part of this lives on the host
 * side: reading the setting at render time, pushing the value to the webview, and turning a press
 * back into a write. A page test can only see the markup, and the markup is the half that already
 * worked.</p>
 */

type Panel = typeof import('../folderFormPanel');
type Host = typeof import('../uiScaleHost');

interface FakeWebview {
  html: string;
  posted: unknown[];
  handler?: (message: unknown) => void;
  onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void };
  postMessage(message: unknown): Promise<boolean>;
}

interface FakePanel {
  webview: FakeWebview;
  disposeListener?: () => void;
  onDidDispose(listener: () => void): { dispose(): void };
  dispose(): void;
}

function fakePanel(): FakePanel {
  const webview: FakeWebview = {
    html: '',
    posted: [],
    onDidReceiveMessage(listener): { dispose(): void } {
      webview.handler = listener;
      return { dispose: (): void => undefined };
    },
    postMessage(message): Promise<boolean> {
      webview.posted.push(message);
      return Promise.resolve(true);
    },
  };
  const panel: FakePanel = {
    webview,
    onDidDispose(listener): { dispose(): void } {
      panel.disposeListener = listener;
      return { dispose: (): void => undefined };
    },
    dispose(): void {
      panel.disposeListener?.();
    },
  };
  return panel;
}

function world(offset: number): { panel: FakePanel; folder: Panel; config: ReturnType<typeof configStub> } {
  const config = configStub({ uiScale: offset });
  const panel = fakePanel();
  const folder = loadWithVscode<Panel>('../folderFormPanel', {
    ...settingsVscode(config),
    window: { createWebviewPanel: (): FakePanel => panel },
    ViewColumn: { Active: 1 },
  });
  return { panel, folder, config };
}

const OPTIONS = { name: 'Databases', entryCount: 3, inTrash: false };

test('the folder form opens at the size the setting says, like every other page (T28)', () => {
  const { panel, folder } = world(3);

  void folder.showFolderForm(OPTIONS);

  assert.ok(
    panel.webview.html.includes(zoomStyle(3)),
    `the page was rendered at the base size, not at the stored offset: expected ${zoomStyle(3)}`,
  );
});

test('an open folder form is pushed the new size, so two pages never show two sizes', () => {
  const { panel, folder } = world(0);

  void folder.showFolderForm(OPTIONS);

  assert.deepEqual(panel.webview.posted, [{ type: 'uiScale', px: scalePx(0), label: '' }]);
});

test('pressing + on the folder form writes the shared setting', async () => {
  const { panel, folder, config } = world(1);
  void folder.showFolderForm(OPTIONS);
  assert.notEqual(panel.webview.handler, undefined, 'the panel never registered a message handler');

  panel.webview.handler?.({ type: 'zoom', delta: 1 });
  await Promise.resolve();

  assert.deepEqual(config.updates, [{ key: 'uiScale', value: 2, target: 1 }]);
});

test('a zoom press that names no delta writes nothing at all', async () => {
  // `{type:'zoom'}` with no delta is a malformed press, and the call site used to spell it
  // `message.delta ?? 0` — which is a real WRITE of the size already stored. The setting then
  // raises `onDidChangeConfiguration`, so every open page is pushed a `uiScale` it already has,
  // for a press that said nothing. A message with no delta is not a press.
  const { panel, folder, config } = world(2);
  void folder.showFolderForm(OPTIONS);

  panel.webview.handler?.({ type: 'zoom' });
  await Promise.resolve();

  assert.deepEqual(config.updates, [], 'a zoom message with no delta wrote the setting');
  assert.equal(config.values.uiScale, 2, 'the stored size was rewritten by a press that said nothing');
});

test('a zoom press is not a save — the form stays open and settles nothing', async () => {
  // The two other message types dispose the panel. A press that fell through to them would close
  // the form somebody was filling in, which is a far worse bug than a size that does not change.
  const { panel, folder, config } = world(0);
  let disposed = 0;
  panel.dispose = (): void => {
    disposed += 1;
  };

  void folder.showFolderForm(OPTIONS);
  panel.webview.handler?.({ type: 'zoom', delta: -1 });
  await Promise.resolve();

  assert.equal(disposed, 0, 'the form was closed by a text-size press');
  assert.equal(config.values.uiScale, -1);
});

test('a malformed press never resets the size to the base', async () => {
  // `Math.sign(NaN)` is NaN and `clampScale(NaN)` is 0, so a delta that is not a number used to
  // WRITE the base size — silently undoing five presses. Any page can send this message, so the
  // guard belongs in the host half that all four of them share, not in one page script.
  const config = configStub({ uiScale: 4 });
  const host = loadWithVscode<Host>('../uiScaleHost', settingsVscode(config));

  await host.applyZoomDelta(Number.NaN);
  await host.applyZoomDelta(Number.POSITIVE_INFINITY);
  // No cast: the guard takes `unknown`, so a page's message reaches it exactly as it was sent —
  // absent, or a value that was never a number at all.
  await host.applyZoomDelta(undefined);
  await host.applyZoomDelta('1');

  assert.deepEqual(config.updates, [], 'a delta that is not a finite number wrote the setting');
  assert.equal(config.values.uiScale, 4, 'the size somebody set was lost');
});

/**
 * The round trip (#95, S3.1): what the page posts, read back the way the panel reads it.
 *
 * <p>The page script's own tests assert what it POSTS; these assert what that becomes after
 * `readValues` — which is the shape written to the vault, and the only place the §2 regression is
 * visible. A folder handed an all-off ladder because somebody chose a cadence is a folder whose
 * children have stopped inheriting rights from above, and nothing on screen would say so.</p>
 */
function saved(mcp: McpAccess | undefined, pick: string): unknown {
  const document = mcpPage(mcp);
  const lifted = runFragment(`${HOST_CHK}\n${mcpSwitchScript(mcp)}`, document, ['collectMcp']);
  chooseAsk(document, pick);
  // The wire is JSON, and JSON is where an `undefined` would vanish — so the round trip goes
  // through it rather than handing the object over in-process.
  const { readValues } = loadWithVscode<Panel>('../folderFormPanel', { window: {} });
  return readValues(JSON.parse(JSON.stringify({ name: 'Databases', mcp: lifted.collectMcp() }))).mcp;
}

test('a save that only chose a cadence leaves the ladder ABSENT, so children still inherit from above', () => {
  // The regression the whole per-axis model exists for, observed at the point of storage.
  const stored = saved(undefined, 'never');

  assert.deepEqual(stored, { ask: 'never' });
  assert.equal((stored as { view?: unknown }).view, undefined, 'an all-off ladder was written');
});

test('choosing Inherit on a folder that had a cadence clears it back to nothing at all', () => {
  // `ask: null` is what survives the wire; the reader turns it into no record, which is what
  // "inherit" means. A folder left holding `{ }` would be one that has decided nothing HERE —
  // a different state, and the wrong one.
  const stored = saved({ ask: 'never' }, 'inherit');

  assert.equal(stored, undefined);
});

test('a folder with a ladder keeps it when its cadence is taken back', () => {
  const stored = saved({ view: true, use: true, ask: 'never' }, 'inherit');

  assert.equal((stored as { view?: unknown } | undefined)?.view, true, 'the ladder went with the cadence');
  assert.equal((stored as { ask?: unknown } | undefined)?.ask, undefined, 'and the cadence stayed');
});
