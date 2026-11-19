// Types for `dbAssert.cjs` (the assertion engine of legs (u), (v) and (w), E1.7 spec §S7.12), read by the unit tests T81 and T82.
import type { DbProfileRow } from '../../src/bridgedDbProfile';
import type { Expectation } from './dbAssertRules.cjs';

export type Status = 'pass' | 'FAIL' | 'not shown' | 'not run' | 'n/a';
export interface Result {
  id: string;
  status: Status;
  why: string;
}
export type Entry = { kind: 'record' | 'unmeasured' | 'stop' | 'rig'; leg?: string; text: string } | { kind: 'table'; mode: string; client: string; vendor: string; version: string; tag: string; platform: string; driver?: string; name: string };
export interface ClientAssessment {
  vendor: string;
  name: string;
  version: string;
  tag: string;
  driver?: string;
  served: boolean;
  results: Result[];
  failed: Result[];
  blocking: Result[];
}
export interface Assessment {
  clients: ClientAssessment[];
  rig: Entry[];
  failed: boolean;
}

export function parseLine(line: string): Entry | undefined;
export function ledgerOf(lines: string[]): Entry[];
export function tapped<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }>;
export function judge(rule: Expectation, ledger: Entry[], statusOf: (id: string) => string): Result;
export function judgeAll(rules: Expectation[], ledger: Entry[]): Result[];
export function assessFamily(family: string, ledger: Entry[]): Assessment;
export function lockCheck(parts: {
  family: string;
  platform: string;
  job: string | undefined;
  ci: boolean;
  rows: readonly DbProfileRow[];
  jobs?: Record<string, unknown[]>;
  assessed: Assessment;
  ledger: Entry[];
}): string[];
export function shadowProblems(ledger: Entry[], rows: readonly DbProfileRow[], ci: boolean): string[];
export function report(family: string, assessed: Assessment, lock: string[], log?: (line: string) => void): number;
export function legsOf(family: string, vendor: string): string[];
export function keyOf(build: unknown): string;
