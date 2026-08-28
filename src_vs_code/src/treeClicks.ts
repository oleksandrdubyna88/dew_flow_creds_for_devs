/**
 * What a click on an entity row means, and what a double-click must put back (tails T11).
 *
 * <p>The row carries a `command` (open the viewer) AND, when the entry keeps versions or is
 * depended on, a twisty. VS Code suppresses the label-click toggle for rows with a command, but
 * a DOUBLE click is the workbench's own toggle gesture and no API turns it off — so the owner
 * saw the sub-tree flip open and shut every time he opened an entry. The handler here already
 * told a double click apart by timing; what it now also does is remember, on the FIRST click,
 * whether the row was open, and — once the viewer has been opened — put that state back if
 * the workbench flipped it.</p>
 *
 * <p>Pure: the two decisions are functions of numbers and booleans, so the click window and the
 * restore rule are tests rather than something to verify with a mouse.</p>
 */

export const DOUBLE_CLICK_MS = 500;

export interface LastClick {
  readonly id: string;
  readonly time: number;
  /** Whether the row was expanded when the first click landed — what a double click restores. */
  readonly wasOpen: boolean;
}

/** A second click on the same row within the window is a double click. */
export function isDoubleClick(last: LastClick, id: string, now: number): boolean {
  return last.id === id && now - last.time < DOUBLE_CLICK_MS;
}

/**
 * After the viewer opened: does the row need its expansion put back? Only when the workbench's
 * toggle actually changed it — restoring an unchanged row would be a needless repaint (and,
 * on a row that was never collapsible, a lie).
 */
export function restoreNeeded(wasOpen: boolean, nowOpen: boolean, collapsible: boolean): boolean {
  return collapsible && wasOpen !== nowOpen;
}
