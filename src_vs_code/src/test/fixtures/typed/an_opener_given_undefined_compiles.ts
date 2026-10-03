// expect compiles
// The positive control beside the two slot fixtures: a reader of a slot no rotation holds states `undefined` and
// compiles; a reader of the password states it. If this fails, the two red fixtures are red for another reason.
import type { SecretOpener } from '../../../secretOpener';
import type { StoredSecret } from '../../../storedSecret';

export async function readNotes(open: SecretOpener, stored: StoredSecret | undefined): Promise<unknown> {
  return [await open({ id: 'entry', name: 'entry' }, stored, undefined), await open({ id: 'entry', name: 'entry' }, stored, 'password')];
}
