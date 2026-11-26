// Types for `itestHiddenSsh.cjs`: the stat-only record and its comparison, which the unit test drives in-process.

/** The stat-only record of a folder: name -> `lstat` facts, for the folder, each entry and each entry of a subfolder. */
export function record(dir: string): Map<string, string>;
/** The lines that differ between two records. */
export function difference(before: Map<string, string>, after: Map<string, string>): string[];
/** The check line, and whether the two records were the same. */
export function verdict(before: Map<string, string>, after: Map<string, string>): { ok: boolean; line: string };
