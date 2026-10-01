// expect compiles
// The positive control: `carried()` strips the phantom for the raw carriers, and what it returns is
// text. If this fixture fails, the harness is not building or resolving programs — every red fixture
// beside it would then be red for the wrong reason.
import { StoredSecret, carried, stored } from '../../../storedSecret';

export const wire: string = carried(stored('as the keychain holds it'));

export const maybe: StoredSecret | undefined = stored(undefined as string | undefined);
