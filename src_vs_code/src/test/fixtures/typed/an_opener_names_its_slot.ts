// expect TS2554 at line 9
// Code round 3, finding 5 (PLAN_waiting_rotation_visible): every reader says which rotation slot it read, or
// `undefined` for any other — a reader that leaves it out would be handed the value a waiting rotation replaced.
import type { SecretOpener } from '../../../secretOpener';
import type { StoredSecret } from '../../../storedSecret';

/** A new automatic reader that forgot the slot. */
export function read(open: SecretOpener, stored: StoredSecret | undefined): Promise<unknown> {
  return open({ id: 'entry', name: 'entry' }, stored);
}
