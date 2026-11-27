// Types for `containerLegs.cjs` (change 11.1, S3 part 2), read by the unit test of the road's own checks.
export const ISOLATION_SCRIPT: string;
export function factsOf(stdout: string): { uid: string; caps: string; names: string[]; tickets: number; mounts: string[] };
export interface RecordedRun {
  argv: string[];
  query: boolean;
  mode: string | undefined;
  values: string[];
}
export function legRoad(name: string, runs: RecordedRun[], left: number[]): void;
