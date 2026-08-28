import { trackedArgv } from './configFile';
import { runBounded } from './sshExecRunner';

/** Exit 0 from `git ls-files --error-unmatch`. Anything else — including no git — is "no". */
export async function isTrackedHere(fileName: string, cwd: string): Promise<boolean> {
  const outcome = await runBounded('git', [...trackedArgv(fileName)], false, {
    cwd,
    env: process.env,
    timeoutMs: 10_000,
  });
  return outcome.exitCode === 0;
}
