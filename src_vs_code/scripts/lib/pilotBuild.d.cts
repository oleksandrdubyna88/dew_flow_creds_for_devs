export function switchOn(bundle: string): string;
export function pilotManifest<T extends { displayName?: string; activationEvents?: unknown; scripts?: Record<string, string> }>(manifest: T): T & { activationEvents: string[] };
export function pilotVersion(released: string, sha: string): string;
export function pilotVsixName(version: string, sha: string): string;
export const PILOT_LABEL: string;
