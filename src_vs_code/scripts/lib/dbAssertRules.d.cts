// Types for `dbAssertRules.cjs` (the expectations of legs (u), (v) and (w), E1.7 spec §S7.12).
export interface Expectation {
  id: string;
  leg: string;
  match: RegExp;
  mode?: 'any' | 'all';
  min?: number;
  after?: string;
  na?: string;
  noStop?: boolean;
  pending?: string;
  u?: RegExp;
}

export function rulesFor(family: string, vendor: string, name: string): Expectation[];
export function legsOf(family: string, vendor: string): string[];
export function recordOnlyWhy(client: string, vendor: string, platform: string): string | undefined;
export const RECORD_ONLY: ReadonlyArray<{ client: string; vendor: string; platform: string; why: string }>;
