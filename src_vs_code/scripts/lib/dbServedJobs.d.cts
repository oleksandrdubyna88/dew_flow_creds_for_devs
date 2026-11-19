// Types for `dbServedJobs.cjs` (the CI lock of E1.7, spec §S7.7), read by the unit test DP21.
import type { DbProfileRow } from '../../src/bridgedDbProfile';

/** A served build a job must find, with the ids of the legs it must run. */
export interface ServedJobBuild {
  client: string;
  platform: string;
  vendor: string;
  version: string;
  tag: string;
  driver?: string;
  legs: string[];
}

export const SERVED_JOBS: Record<string, ServedJobBuild[]>;
export const HARNESS_OF: Record<string, string>;
export function servedBuilds(rows: readonly DbProfileRow[]): Omit<ServedJobBuild, 'legs'>[];
export function keyOf(build: Omit<ServedJobBuild, 'legs'>): string;
export function wordsOf(build: Omit<ServedJobBuild, 'legs'>): string;
export function hasJobStep(workflow: string, job: string, harness: string): boolean;
export function lockProblems(parts: { rows: readonly DbProfileRow[]; jobs: Record<string, unknown[]>; workflow: string; legsOf: (client: string, vendor: string) => string[] }): string[];
