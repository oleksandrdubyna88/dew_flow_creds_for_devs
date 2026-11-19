// Types for `dbCandidates.cjs` (the candidate table of the harnesses, E1.7 spec §S7.7), read by the unit test DP20.
import type { DbProfileRow } from '../../src/bridgedDbProfile';

export function tableWith(rows: readonly DbProfileRow[], platform: string, family: string, build: { version: string; tag: string; driver?: string }): { rows: readonly DbProfileRow[]; mode: 'CANDIDATE' | 'PRODUCTION' };
export function verdictFor(client: { family: string; exe: string; name?: string }, rig: { dir: string; home: string }): Promise<{ ok: boolean; verdict?: unknown; mode?: string; line?: string; why?: string }>;
export function say(leg: string, under: { line: string }): void;
export const FAMILIES: Record<string, { client: string; word: string; vendor: string; args: string[] }>;
