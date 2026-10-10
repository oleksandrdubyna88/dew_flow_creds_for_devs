import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';

/**
 * The install offer, and the request it may serve (`PLAN_wsl_bridge_outlives_its_client.md` §5.7,
 * story E4.S3).
 *
 * <p>The offer is a modal; its Install sends the platform's recipe to a terminal. Raised for an agent's
 * request — a VPN with no client on PATH, an SSH terminal with no ssh — it used to install for a client
 * that had left while the modal was open. Nothing here installs anything: the terminal is a stub.</p>
 */

type Offer = (tool: string, startGate?: AbortSignal) => Promise<void>;

interface World {
  offerToInstall: Offer;
  sent: string[];
  /** Answers the open modal; resolves once the modal has been raised. */
  modal: Promise<(button: string | undefined) => void>;
}

function world(): World {
  const sent: string[] = [];
  let raised: (answer: (button: string | undefined) => void) => void = () => undefined;
  const modal = new Promise<(button: string | undefined) => void>((resolve) => {
    raised = resolve;
  });
  const { offerToInstall } = loadWithVscode<{ offerToInstall: Offer }>(
    '../toolEnsure',
    {
      window: {
        showWarningMessage: () => new Promise<string | undefined>((resolve) => raised(resolve)),
        showErrorMessage: () => Promise.resolve(undefined),
      },
    },
    {
      './toolCheck': { installRecipe: () => ({ display: 'WireGuard', command: 'install-wireguard', note: '' }) },
      './installFlow': { onPath: () => false },
      './pinnedTerminal': {
        pinnedRefusal: () => undefined,
        sendPinned: (_name: string, line: string) => {
          sent.push(line);
          return true;
        },
      },
    },
  );
  return { offerToInstall, sent, modal };
}

test('Install clicked after the request it was offered for has gone installs nothing', async () => {
  const w = world();
  const request = new AbortController();
  const offered = w.offerToInstall('wg-quick', request.signal);
  const answer = await w.modal;

  request.abort();
  answer('Install');
  await offered;

  assert.deepEqual(w.sent, [], 'the installer ran for a request whose client had gone');
});

test('a request already gone is not even offered the install', async () => {
  const w = world();
  const request = new AbortController();
  request.abort();
  let asked = false;
  void w.modal.then((answer) => {
    asked = true;
    answer('Install');
  });

  await w.offerToInstall('wg-quick', request.signal);
  await Promise.resolve();

  assert.deepEqual(w.sent, [], 'the installer ran for a request whose client had already gone');
  assert.equal(asked, false, 'a modal was raised for a request whose client had gone');
});

test('Install for a live request, or for the person\'s own click, sends the recipe as before', async () => {
  for (const gate of [new AbortController().signal, undefined]) {
    const w = world();
    const offered = w.offerToInstall('wg-quick', gate);
    (await w.modal)('Install');
    await offered;

    assert.deepEqual(w.sent, ['install-wireguard']);
  }
});
