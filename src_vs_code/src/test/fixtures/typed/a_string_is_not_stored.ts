// expect TS2322 at line 7
// Text is not a stored secret: only the mint makes one, so plaintext cannot pose as a keychain value.
import { StoredSecret } from '../../../storedSecret';

export const plaintext = 'hunter2';

export const posing: StoredSecret = plaintext;
