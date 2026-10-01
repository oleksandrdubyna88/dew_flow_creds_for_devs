// expect TS2345 at line 8
// sealValue seals a STORED form and answers a stored form (E3 code round, finding 0): text a writer is
// about to store goes through sealText, which answers text. One function serving both shapes had to test
// `typeof value === 'string'` — always true at run time, a StoredSecret is a string — and claimed `string`
// for text while handing back a minted stored form.
import { sealValue } from '../../../sealValue';

export const sealed = sealValue('typed by a person', 'account', '2468');
