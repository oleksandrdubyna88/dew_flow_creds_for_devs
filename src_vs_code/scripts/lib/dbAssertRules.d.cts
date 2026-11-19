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
}

export function rulesFor(family: string, vendor: string, name: string): Expectation[];
export function legsOf(family: string, vendor: string): string[];
