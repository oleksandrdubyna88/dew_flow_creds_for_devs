// expect TS2345 at line 7
// E3.S1 (round 2, B1): an argv run names its OWN working folder. Left out, the masked run would start in the workspace folder, and on
// Windows a repository's own ssh.exe would be found before PATH (CWE-426). The type is the fix, so the compiler refuses the call.
import { runInMaskedTerminal } from '../../../maskedTerminal';

/** An argv run that forgot its folder. */
export const forgot = (): unknown => runInMaskedTerminal({ name: 't', argv: ['ssh'], env: {}, secrets: [], banner: '' });
