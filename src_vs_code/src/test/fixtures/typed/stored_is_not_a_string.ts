// expect TS2322 at line 7
// A stored secret is not text: handing one to a string must not compile — the whole point of the phantom.
import { StoredSecret, stored } from '../../../storedSecret';

export const held: StoredSecret = stored('as the keychain holds it');

export const text: string = held;
