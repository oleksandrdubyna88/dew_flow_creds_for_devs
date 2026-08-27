/**
 * The open form webviews, so that locking the vaults can reach them.
 *
 * <p>Forms keep their contents across being hidden — `retainContextWhenHidden` on both panels.
 * That fixes losing your typing, and it moves something else at the same time: a password typed
 * into a hidden form used to die with the page, and now it lives in the webview's memory until
 * the tab is closed. Nobody chose that lifetime. It was a side effect of the defect, and the
 * defect is gone.</p>
 *
 * <p>So a lock closes the open forms. `lockState.ts` defines a lock as "refuse the stored secret
 * until a person says otherwise"; leaving a filled-in form alive behind the editor tab would make
 * that true everywhere except the one place a plaintext secret is actually sitting.</p>
 *
 * <p>State lives in a closure rather than at module scope, the shape `idempotentStart.ts` uses
 * and for its reason: the rule is then a unit test over a fresh registry, independent of the one
 * shared instance the extension happens to run. Free of `vscode` for the same reason — a panel
 * here is anything with a `dispose`, which is all this ever needs to know about one.</p>
 */

/**
 * How a form webview is created — the same answer for both forms.
 *
 * <p>`retainContextWhenHidden` is the whole of the fix this module was written for. Without it VS
 * Code destroys the page the moment its tab goes to the background of its editor group and
 * rebuilds it from the options it was opened with when it returns — so opening a file to look up
 * the password you were about to paste emptied every field you had already filled in. It reads
 * as the form clearing itself on focus change, and that is how it was reported; no handler in
 * this codebase ever ran.</p>
 *
 * <p>One constant rather than the flag written out at each panel, because the two forms drifting
 * apart on this is precisely the failure — one of them quietly going back to losing your typing
 * while the other does not. The cost is the page staying in memory while hidden, which is why a
 * lock closes it: see the registry below.</p>
 */
export const FORM_WEBVIEW_OPTIONS = {
  enableScripts: true,
  localResourceRoots: [],
  retainContextWhenHidden: true,
} as const;

/** Anything the registry can close: a webview panel, or a test's stub. */
export interface ClosableFormPanel {
  dispose(): void;
}

export interface FormPanelRegistry {
  /** Remember an open form, and hand back the way to forget it. */
  register(panel: ClosableFormPanel): () => void;
  /** Close every open form; returns how many there were, so a caller can say so out loud. */
  closeAll(): number;
  /** How many forms are open right now. */
  count(): number;
}

/**
 * Close one panel, and let the sweep continue if it will not go.
 *
 * <p>Not a swallowed error but a stated decision: a lock must not be abortable by one
 * misbehaving webview, because every panel BEHIND the failing one is a form that may have a
 * typed-in password on screen. There is nothing a person could do with "panel 2 of 3 refused to
 * dispose" anyway, and the alternative — the throw escaping into the auto-lock timer, leaving
 * the remaining forms open — is the outcome this registry exists to prevent.</p>
 */
function closeOne(panel: ClosableFormPanel): void {
  try {
    panel.dispose();
  } catch {
    // Already gone, or gone wrong. Either way it is not open any more, which is what was wanted.
  }
}

export function createFormPanelRegistry(): FormPanelRegistry {
  const open = new Set<ClosableFormPanel>();
  return {
    register(panel) {
      open.add(panel);
      return () => {
        open.delete(panel);
      };
    },
    closeAll() {
      // Snapshot and clear BEFORE disposing: `dispose()` fires the panel's own `onDidDispose`,
      // which unregisters, and clearing first means the registry is left correct however that
      // goes. (The tempting worry — that unregistering mid-sweep makes a live-set iteration
      // skip panels — is NOT real: a JS Set iterator copes with the element it is on being
      // deleted. That was measured rather than assumed, by breaking this on purpose.)
      const panels = [...open];
      open.clear();
      for (const panel of panels) {
        closeOne(panel);
      }
      return panels.length;
    },
    count: () => open.size,
  };
}

/**
 * A lock notice that names the forms it closed.
 *
 * <p>Said out loud rather than done quietly, because losing typed input without being told is
 * the complaint this whole change began as. Auto-lock measures IDLE time against vault activity,
 * and typing into a webview is not vault activity — so a form can be filled in, left open beside
 * an hour of other work, and closed by the timer. A person who reads only "Vaults locked" and
 * finds their half-written entry gone has met the original bug wearing a different hat.</p>
 */
export function lockNotice(notice: string, closedForms: number): string {
  if (closedForms === 0) {
    return notice;
  }
  const what = closedForms === 1 ? 'An open form was' : `${closedForms} open forms were`;
  return `${notice} ${what} closed — anything typed into it was not saved.`;
}

/**
 * The one registry the extension shares.
 *
 * <p>A module-level instance rather than something threaded through options: the two panels that
 * fill it and the lock that empties it have no call path between them, and inventing one — a
 * registry argument on `showEntityForm`, passed at each of its call sites — would be four places
 * to keep in step for a value that is the same every time.</p>
 */
export const formPanels = createFormPanelRegistry();
