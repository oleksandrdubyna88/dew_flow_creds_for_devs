// The shared-rules mount's path and the shipped Node guard's load, in ONE place (E2.5 S2.4).
//
// Three test files read the SHIPPED leftovers guard (`<mount>/tools/leftovers-check.mjs`): `dockerSmokeLeftovers`, `acmeRunLeftovers` and
// `leftoversGuardFixtures`. The guard reads workflows through `yaml`, which lives in the mount's own `node_modules`. Where the modules are
// missing a person's `npm test` SKIPS those tests with the reason, as before. Where a CI job installed the modules on purpose it sets
// `CREDS_GUARD_TESTS_REQUIRED=1`, and then a guard that cannot load FAILS the test with the same reason: a skip there would be green and
// would hide a lost install or a renamed mount. `workflowMount.test.ts` pins that every job that runs the whole unit suite installs and sets it.
//
// The mount path is ONE constant, so a rename of the mount is one line here (and the janitor fixture of `acmeRunLeftovers`, which takes it
// from here too). This file makes no temp folder and holds no temp site.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { describeError } from '../describeError';
import { REPO } from './repoFiles';

/** Where the shared-rules mount lies, relative to the repository root, with forward slashes. */
export const MOUNT = '.claude/rules/shared';

/** The environment variable a CI job sets where the guard-reading tests must RUN. */
export const GUARD_REQUIRED_VARIABLE = 'CREDS_GUARD_TESTS_REQUIRED';

/** A path inside the mount, absolute. */
export const mountPath = (...parts: string[]): string => path.join(REPO, ...MOUNT.split('/'), ...parts);

/** The shipped Node guard's file. */
export const guardPath = mountPath('tools', 'leftovers-check.mjs');

export interface GuardFinding {
  readonly cls: string;
  readonly line: number;
  readonly text: string;
}

/** What the tests use of the mounted guard: its `scanText` (a file's path and text in, the findings out) and `isScanned` (does a profile read this path). */
export interface MountedGuard {
  readonly scanText: (file: string, text: string) => GuardFinding[];
  readonly isScanned: (file: string, profile?: string) => boolean;
}

interface GuardModule extends MountedGuard {
  readonly loadYaml: (repo: undefined) => unknown;
}

/** Is the flag of a CI job that installed the modules on purpose set? */
export const guardRequired = (env: NodeJS.ProcessEnv = process.env): boolean => env[GUARD_REQUIRED_VARIABLE] === '1';

/** The mounted guard, or the reason it cannot be had: the mount is absent, or the load failed (`loadFailureReason`). */
export async function loadMountedGuard(file: string = guardPath): Promise<MountedGuard | string> {
  if (!fs.existsSync(file)) return `the shared rules are not mounted (${MOUNT})`;
  let module: GuardModule;
  try {
    module = (await import(pathToFileURL(file).href)) as GuardModule;
    module.loadYaml(undefined);
  } catch (error) {
    return loadFailureReason(error);
  }
  return module;
}

/** Is this error the guard's own "yaml is missing" (`YamlMissingError`), or Node's not-found for the package `yaml`? Any other failure is not. */
const isMissingYaml = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'YamlMissingError' || ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' && /package 'yaml'/.test(error.message)));

/** The reason a failed load gives: the error's own message always, and the words "yaml module" and the install command only when it is the missing yaml. */
export function loadFailureReason(error: unknown): string {
  const message = describeError(error).split('\n')[0];
  return isMissingYaml(error)
    ? `the mounted guard cannot load its yaml module (run npm ci --ignore-scripts --prefix ${MOUNT}): ${message}`
    : `the mounted guard cannot be loaded: ${message}`;
}

/**
 * What a test does with the answer of `loadMountedGuard`: the guard, or `undefined` after the test was skipped with the reason. Under
 * `CREDS_GUARD_TESTS_REQUIRED=1` a guard that cannot be had THROWS the same reason instead, so the test fails: where the modules were
 * installed on purpose, a skip is a lost install.
 */
export function judgeGuard(guard: MountedGuard | string, t: Pick<TestContext, 'skip'>, env: NodeJS.ProcessEnv): MountedGuard | undefined {
  if (typeof guard !== 'string') return guard;
  if (guardRequired(env)) throw new Error(`${guard} — ${GUARD_REQUIRED_VARIABLE}=1: a guard-reading test must run here, never skip`);
  t.skip(guard);
  return undefined;
}

/** The guard for a test, or `undefined` after the skip (a failure under the flag): see `judgeGuard`. */
export async function guardOrSkip(t: TestContext, env: NodeJS.ProcessEnv = process.env): Promise<MountedGuard | undefined> {
  return judgeGuard(await loadMountedGuard(), t, env);
}
