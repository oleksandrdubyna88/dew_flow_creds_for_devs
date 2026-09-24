/**
 * When an agent's request was made, as the consent modal says it (issue #131):
 * `Requested 2026-09-23 14:05:12 (UTC+03:00).` — the machine's local time with its offset, the
 * form the owner chose. Without it a dialog found on returning to the desk read exactly like one
 * raised a second ago. The broker stops waiting after `CONSENT_TIMEOUT_MS` (five minutes) and the
 * agent is told so, but VS Code cannot close a modal from code — so this line is the only thing on
 * the screen that says a dialog is stale and answering it changes nothing.
 *
 * <p>Pure, and the arithmetic takes the offset as a NUMBER, so the tests do not depend on the zone
 * of the machine that runs them. Only `localRequestTimeLine` reads the zone, from the `Date` itself.</p>
 */

/** The line for an instant in a zone `offsetMinutes` east of UTC (UTC+03:00 is 180). */
export function requestTimeLine(epochMs: number, offsetMinutes: number): string {
  // Shift the instant by the offset and read it as UTC: the fields ARE the local wall clock, and the
  // date rolls over, forward or back across a month and a year, by the calendar's own rules.
  const wall = new Date(epochMs + offsetMinutes * 60_000).toISOString();
  return `Requested ${wall.slice(0, 10)} ${wall.slice(11, 19)} (${formatUtcOffset(offsetMinutes)}).`;
}

/**
 * The line for `date` in this machine's zone, at that instant — so a date either side of a DST change
 * carries the offset that was in force when it happened. `getTimezoneOffset` counts minutes BEHIND
 * UTC, the opposite sign of "UTC+03:00": the one trap in this module.
 */
export function localRequestTimeLine(date: Date): string {
  return requestTimeLine(date.getTime(), -date.getTimezoneOffset());
}

/** `UTC+03:00`, `UTC-03:30`, `UTC+00:00`. */
function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const size = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(size / 60))}:${pad(size % 60)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
