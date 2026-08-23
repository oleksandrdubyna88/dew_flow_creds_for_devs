/**
 * Copying a secret to the clipboard is this extension's main output path, and the
 * clipboard is the least private place on the machine: every process can poll it, the
 * OS keeps a history of it (Win+V), and several platforms sync it to other devices.
 * A password copied once and never overwritten therefore outlives the vault's own
 * protections indefinitely.
 *
 * So every secret copy is written with an expiry. When it fires we clear the clipboard
 * ONLY if it still holds exactly what we put there — otherwise the user has copied
 * something else since and wiping it would destroy their work.
 *
 * Deliberately free of any `vscode` import (it takes the clipboard as a parameter), so
 * the decision below is a plain unit test rather than a hopeful comment.
 */

/** The subset of `vscode.env.clipboard` this module needs. */
export interface Clipboard {
  readText(): Thenable<string>;
  writeText(value: string): Thenable<void>;
}

/** Long enough to paste into another window, short enough to matter. */
export const SECRET_CLIPBOARD_TTL_MS = 45_000;

/**
 * Clear only what we wrote, and only if it is still there.
 *
 * An empty `written` is never cleared: it would mean "wipe whatever is on the clipboard
 * now", which is somebody else's data.
 */
export function shouldClear(current: string, written: string): boolean {
  return written.length > 0 && current === written;
}

/** Clears the clipboard if it still holds `written`. Returns whether it did. */
export async function clearIfUnchanged(clipboard: Clipboard, written: string): Promise<boolean> {
  const current = await clipboard.readText();
  if (!shouldClear(current, written)) {
    return false;
  }
  await clipboard.writeText('');
  return true;
}

/**
 * Copies a secret and schedules its removal.
 *
 * The timer is `unref`ed so a pending clear never holds the extension host open; if the
 * window closes first the clipboard keeps the value, which is no worse than today's
 * behaviour and better than blocking shutdown.
 */
export async function copySecret(
  clipboard: Clipboard,
  value: string,
  ttlMs: number = SECRET_CLIPBOARD_TTL_MS,
): Promise<void> {
  await clipboard.writeText(value);
  if (value.length === 0) {
    return;
  }
  const timer = setTimeout(() => {
    void clearIfUnchanged(clipboard, value);
  }, ttlMs);
  (timer as unknown as { unref?: () => void }).unref?.();
}

/** "…copied." plus the promise we just made the user, so the UI never has to spell it out twice. */
export function copiedMessage(what: string, ttlMs: number = SECRET_CLIPBOARD_TTL_MS): string {
  return `${what} copied — the clipboard clears in ${Math.round(ttlMs / 1000)}s.`;
}
