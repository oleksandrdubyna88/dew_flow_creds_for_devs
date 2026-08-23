/**
 * One place for PIN strength. The PIN is the sole barrier protecting vault
 * ciphertext that deliberately lives in shared/offline locations (NAS, vault
 * server, other users' share inboxes), so a short PIN is offline-brute-forceable.
 * Pure — unit-testable, no vscode.
 */
export const MIN_PIN_LENGTH = 8;

/** Returns an error message for a too-weak PIN, or undefined when acceptable. */
export function validatePin(value: string): string | undefined {
  if (value.length === 0) {
    return 'PIN must not be empty.';
  }
  if (value.length < MIN_PIN_LENGTH) {
    return `Use at least ${MIN_PIN_LENGTH} characters — this PIN guards data stored off your machine.`;
  }
  return undefined;
}
