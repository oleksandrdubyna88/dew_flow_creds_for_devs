// expect TS2554 at line 7
// What a person is told about a host key is asked WITH the exit code of the run (G1, E3.S1, C19): a run that ended with 0 is told
// nothing. A call that hands no exit code does not compile, so no caller can leave the question out, and the parameter cannot be
// made optional without this file turning red.
import { hostKeyTold } from '../../../hostKeyPin';

export const told = hostKeyTold(undefined, 'Host key verification failed.\n', 'box');
