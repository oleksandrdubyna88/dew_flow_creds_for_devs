// expect TS2554 at line 9
// Code round 3, finding 5 (PLAN_waiting_rotation_visible): a click says which rotation slot it read, or `undefined`
// for any other — a click that leaves it out would copy the value the door just replaced.
import { clickedSecret } from '../../../pinClick';
import type { StorageManager } from '../../../storageManager';

/** A new click command that forgot the slot. */
export function copy(storage: StorageManager): Promise<unknown> {
  return clickedSecret(storage, 'account', { id: 'entry', name: 'entry' }, (s, a, e) => s.getPassword(a, e), 'copy its password');
}
