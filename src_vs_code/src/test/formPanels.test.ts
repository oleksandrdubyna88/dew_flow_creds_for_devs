import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClosableFormPanel, createFormPanelRegistry, formPanels, lockNotice } from '../formPanels';

/**
 * The registry of open form webviews, and why locking has to reach them.
 *
 * <p>Forms keep their contents now — `retainContextWhenHidden` on both panels, pinned in
 * `webviewHtml.test.ts`. That fixes losing your typing, and it changes something else at the same
 * time: a password typed into a hidden form used to be destroyed with the page, and now it lives
 * in the webview's memory until the tab is closed. Nobody chose that lifetime; it was a side
 * effect of the defect.</p>
 *
 * <p>So locking the vaults closes the open forms. That is the only reading under which the lock
 * still means what `lockState.ts` says it means — "refuse the stored secret until a person says
 * otherwise" — rather than "refuse it, except in the editor tab behind this one".</p>
 *
 * <p>Each test builds its OWN registry, which is the point of the factory: the shared instance is
 * one line at the bottom of the module, and none of the rules below depend on it.</p>
 */

interface FakePanel extends ClosableFormPanel {
  disposed: number;
}

/** A panel that unregisters itself on dispose — the wiring both real panels use. */
function selfUnregisteringPanel(registry: { register(p: ClosableFormPanel): () => void }): FakePanel {
  const panel: FakePanel = { disposed: 0, dispose: () => {} };
  const unregister = registry.register(panel);
  panel.dispose = (): void => {
    panel.disposed += 1;
    unregister();
  };
  return panel;
}

test('locking closes every open form, and says how many it closed', () => {
  const registry = createFormPanelRegistry();
  const first = selfUnregisteringPanel(registry);
  const second = selfUnregisteringPanel(registry);
  assert.equal(registry.count(), 2);

  assert.equal(registry.closeAll(), 2, 'the count is what the lock notice needs to name');
  assert.equal(first.disposed, 1);
  assert.equal(second.disposed, 1);
  assert.equal(registry.count(), 0, 'a closed panel is gone from the registry');
});

test('a panel that closes on its own leaves nothing behind', () => {
  // The ordinary path: Save or Cancel disposes the panel, and no lock is involved. A registry
  // that only emptied on lock would grow by one for every form opened in a session.
  const registry = createFormPanelRegistry();
  const panel = selfUnregisteringPanel(registry);
  assert.equal(registry.count(), 1);

  panel.dispose();

  assert.equal(registry.count(), 0);
  assert.equal(registry.closeAll(), 0, 'and locking afterwards finds nothing to close');
});

test('the sweep closes every panel even when one of them fails to close', () => {
  // A lock must not be abortable by one misbehaving webview. `dispose()` is a VS Code call at
  // the far end of this interface, and the panels behind the failing one are the whole point:
  // each is a form that may be holding a typed-in password on screen.
  //
  // This is the assertion that actually separates the implementations. The obvious worry —
  // that unregistering mid-sweep would make a live-set iteration skip elements — is not real:
  // a JS Set iterator handles deletion of the element it is on, so both shapes pass that. A
  // throwing dispose is where they differ, and it is also the case that matters.
  const registry = createFormPanelRegistry();
  const first = selfUnregisteringPanel(registry);
  const rogue: FakePanel = { disposed: 0, dispose: () => {} };
  registry.register(rogue);
  rogue.dispose = (): void => {
    rogue.disposed += 1;
    throw new Error('the webview was already gone');
  };
  const last = selfUnregisteringPanel(registry);

  assert.equal(registry.closeAll(), 3, 'all three were open, so all three are reported');

  assert.equal(first.disposed, 1);
  assert.equal(rogue.disposed, 1, 'the failing panel was still asked');
  assert.equal(last.disposed, 1, 'and the one behind it was closed anyway');
  assert.equal(registry.count(), 0, 'a failed close must not leave the registry holding it');
});

test('locking twice closes nothing the second time', () => {
  // Auto-lock is idempotent by design — the timer and the command both call it — so the
  // registry must not double-dispose a panel that is already gone.
  const registry = createFormPanelRegistry();
  const panel = selfUnregisteringPanel(registry);

  assert.equal(registry.closeAll(), 1);
  assert.equal(registry.closeAll(), 0);
  assert.equal(panel.disposed, 1, 'the panel was disposed a second time');
});

test('the shared instance is a registry like any other', () => {
  // The one the extension actually runs. Asserted so that the singleton cannot quietly become
  // something else — an empty object, a second copy — while every test above still passes.
  const panel = selfUnregisteringPanel(formPanels);

  assert.equal(formPanels.count(), 1);
  assert.equal(formPanels.closeAll(), 1);
  assert.equal(panel.disposed, 1);
  assert.equal(formPanels.count(), 0, 'the shared registry is left clean for the next test');
});

test('the lock notice names the forms it closed, and stays quiet when there were none', () => {
  // Auto-lock measures idle time against VAULT activity, and typing into a webview is not vault
  // activity — so a filled-in form can be closed by the timer after an hour of work elsewhere.
  // Telling the person is the difference between a lock and the bug this change started as.
  const locked = 'Vaults locked after 60 minutes idle.';

  assert.equal(lockNotice(locked, 0), locked, 'nothing was closed, so nothing is claimed');
  assert.equal(
    lockNotice(locked, 1),
    `${locked} An open form was closed — anything typed into it was not saved.`,
  );
  assert.equal(
    lockNotice(locked, 3),
    `${locked} 3 open forms were closed — anything typed into it was not saved.`,
  );
});
