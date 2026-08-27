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
}

/**
 * Attach the filter behaviour to a box and show it.
 *
 * <p>Escape restores `before` — a cancelled search is not a lost one. Enter keeps what was
 * typed. Focus moving to the tree does NEITHER: the box stays open and the filter stays
 * applied, which is what lets a person actually use what they found.</p>
 */
export function wireSearchBox(box: SearchBoxLike, wiring: SearchWiring): void {
  // The whole fix is this line; everything below it was always right.
  box.ignoreFocusOut = true;
  box.title = 'Filter credentials';
  box.value = wiring.before;
  box.placeholder = 'name, host, user, command…';
  box.prompt = 'Filters as you type. Secrets are never searched.';

  let accepted = false;
  box.onDidChangeValue((value) => wiring.apply(value));
  box.onDidAccept(() => {
    accepted = true;
    box.hide();
  });
  box.onDidHide(() => {
    if (!accepted) {
      wiring.apply(wiring.before);
    }
    box.dispose();
  });
  box.show();
}
