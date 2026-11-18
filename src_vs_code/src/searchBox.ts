/**
 * The filter box's wiring, testable (tails T15).
 *
 * <p>The defect this module exists to hold down: the box did not set `ignoreFocusOut`, so
 * CLICKING A RESULT hid it, `onDidHide` found `accepted === false`, and the handler restored
 * the previous filter — usually empty. Every click on a row the search had just found was read
 * as "never mind", and the owner's report was exact: *"ищет хорошо, но если я нажимаю — поиск
 * исчезает, и всё"*. The restore-on-Escape rule itself was right; `onDidHide` just could not
 * tell Escape from focus landing on the thing being searched for. With `ignoreFocusOut` set,
 * hide means Escape or Accept — and only then is the accepted flag a meaningful discriminator.</p>
 */

/** Exactly the slice of `vscode.InputBox` this wiring touches, so a test can supply one. */
export interface SearchBoxLike {
  ignoreFocusOut: boolean;
  title: string | undefined;
  value: string;
  placeholder: string | undefined;
  prompt: string | undefined;
  onDidChangeValue(handler: (value: string) => void): unknown;
  onDidAccept(handler: () => void): unknown;
  onDidHide(handler: () => void): unknown;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface SearchWiring {
  /** The filter as it stood when the box opened — what Escape puts back. */
  readonly before: string;
  /** Applies a term to the tree, live, as typed. */
  readonly apply: (term: string) => void;
  /** The tree's filter right now — read on hide, to tell whether anything but this box changed it. */
  readonly current: () => string;
}

/**
 * Attach the filter behaviour to a box and show it.
 *
 * <p>Escape restores `before` — a cancelled search is not a lost one — unless the tree's filter
 * is no longer the term this box applied last: the box stays open (`ignoreFocusOut`), so the filter
 * can be changed from outside (title-bar Clear Filter, goToOriginalFolder, revealById), and Escape
 * must not bring back the filter the person just cleared. Enter keeps what was typed. Focus moving to the tree does NEITHER: the box stays open and the filter stays
 * applied, which is what lets a person actually use what they found.</p>
 */
export function wireSearchBox(box: SearchBoxLike, wiring: SearchWiring, onClosed: () => void = () => {}): void {
  // The whole fix is this line; everything below it was always right.
  box.ignoreFocusOut = true;
  box.title = 'Filter credentials';
  box.value = wiring.before;
  box.placeholder = 'name, host, user, command…';
  box.prompt = 'Filters as you type. Secrets are never searched.';

  let accepted = false;
  let lastApplied = wiring.before; // the term the tree holds because of THIS box
  box.onDidChangeValue((value) => {
    wiring.apply(value);
    lastApplied = value;
  });
  box.onDidAccept(() => {
    accepted = true;
    box.hide();
  });
  box.onDidHide(() => {
    // Escape puts `before` back only over the box's own term: a Clear Filter (or a jump that
    // clears it) done while the box was open is a newer decision, and restoring would undo it.
    if (!accepted && wiring.current() === lastApplied) {
      wiring.apply(wiring.before);
    }
    onClosed();
    box.dispose();
  });
  box.show();
}

/**
 * Make "Search": a second run while the box is open shows THAT box again, it does not make another.
 *
 * <p>A second `InputBox` hides the first, and the first one's `onDidHide` cannot tell that from
 * Escape — it would put `before` back, so the live filter is reverted under the term still typed
 * in the new box. The open box is held privately by the returned function and forgotten when the
 * box hides (Enter or Escape), so the next run starts a fresh one.</p>
 */
export function searchBoxOpener(create: () => SearchBoxLike): (wiring: SearchWiring) => void {
  let open: SearchBoxLike | undefined;
  return (wiring) => {
    if (open !== undefined) {
      open.show();
      return;
    }
    const box = create();
    open = box;
    wireSearchBox(box, wiring, () => {
      open = undefined;
    });
  };
}
