/**
 * What a click on an entity row opens (the owner's model, 2026-08-28 — the editor's own):
 * ONE click selects the row and shows the entry in the shared PREVIEW tab, which the next
 * single click reuses; a DOUBLE click pins that preview into a tab of its own, as a
 * double-clicked file becomes a real editor. Ten single clicks on ten entries leave one tab.
 *
 * <p>The workbench's own double-click toggle on a row with a twisty is left alone: the earlier
 * attempt to undo it (0.80.1/0.80.2) cost seconds per open and worked every other time.</p>
 *
 * <p>Loading an entry is asynchronous (secrets come from the keychain), and clicks are not, so
 * the decisions are a small state machine: a second click can land while the first one's
 * preview is still loading, and a later single click can supersede an earlier one that has not
 * arrived. Pure: the panel work is injected.</p>
 */

/** Two clicks on the same row within this window are one double click. */
export const DOUBLE_CLICK_MS = 500;

/** Where a loaded entry goes: the shared preview tab, or a tab of its own. */
export type ViewerTab = 'preview' | 'pinned';

interface LastClick {
  readonly key: string;
  readonly time: number;
}

export class ViewerClicks {
  private last: LastClick = { key: '', time: 0 };
  /** The entry whose preview is still loading, if any. */
  private loading: string | undefined;
  private pinOnArrival = false;

  /**
   * What THIS click asks for: `load` — start loading the entry for the preview; `pin` — the
   * preview already shows it (or nothing does), so pin it or open a pinned tab; `wait` — the
   * second click landed while the first one's preview is still loading, and it will arrive pinned.
   */
  click(key: string, now: number): 'load' | 'pin' | 'wait' {
    const isDouble = this.last.key === key && now - this.last.time < DOUBLE_CLICK_MS;
    this.last = { key, time: now };
    if (!isDouble) {
      this.loading = key;
      this.pinOnArrival = false;
      return 'load';
    }
    if (this.loading === key) {
      this.pinOnArrival = true;
      return 'wait';
    }
    return 'pin';
  }

  /**
   * The load for `key` finished: show it as the preview, as a pinned tab, or not at all — a
   * later click superseded it, and the tab already shows (or is about to show) that one.
   */
  arrived(key: string): ViewerTab | 'stale' {
    if (this.loading !== key) {
      return 'stale';
    }
    this.loading = undefined;
    const pinned = this.pinOnArrival;
    this.pinOnArrival = false;
    return pinned ? 'pinned' : 'preview';
  }
}

/**
 * One click, end to end. `pin` pins the preview if it shows this entry (true) — otherwise a
 * double click opens a pinned tab of its own; `open` loads the entry and asks, once loaded,
 * where it goes.
 */
export async function clickToView(
  clicks: ViewerClicks,
  key: string,
  now: number,
  pin: () => boolean,
  open: (tab: () => ViewerTab | 'stale') => Promise<void>,
): Promise<void> {
  const verdict = clicks.click(key, now);
  if (verdict === 'wait') {
    return;
  }
  if (verdict === 'pin') {
    if (!pin()) {
      await open(() => 'pinned');
    }
    return;
  }
  await open(() => clicks.arrived(key));
}
