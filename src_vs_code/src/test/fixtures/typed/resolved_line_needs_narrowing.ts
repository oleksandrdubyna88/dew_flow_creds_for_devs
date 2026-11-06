// expect TS2339 at line 5
// The line exists only after narrowing: skipping a refusal does not compile.
import { resolveCommand } from '../../../commandLine';

export const skipped: string = resolveCommand({ name: 'a b', command: 'x {name}' }).line;
