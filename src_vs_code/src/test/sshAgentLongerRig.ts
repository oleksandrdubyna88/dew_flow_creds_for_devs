import { FakeServer, KEY_ID, KeyType, PickAnswer, keyEntity, manager, realPrivateKey, world } from './sshAgentWorld';

/**
 * The rig the *Allow longer…* suites share (#197, E3.3): a manager with one key loaded, the hooks WIRED (vault
 * unlocked, auto-lock 60 and not overdue) unless a test says otherwise, both clocks in the test's hand, and `ask()` —
 * one signing request as the server hands it over. Not named `*.test.ts`: the runner never treats it as a suite.
 */

export const MIN = 60_000;
export const H = 3_600_000;
/** The test's monotonic clock starts here, never at 0. */
export const M = 50_000;
export const W = Date.UTC(2026, 9, 21, 9, 0, 0);
export const KEY = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };
export const LOGIN = { kind: 'ssh-login', user: 'git', service: 'ssh-connection' };
export const GIT = { kind: 'sshsig', namespace: 'git' };
/** Written out, with the one ellipsis character U+2026 — a reorder or a rename in agentConsent.ts must turn the suite red. */
export const LONGER = 'Allow longer…';
/** The fully wired buttons of a login prompt, and of a prompt that cannot offer a longer window. */
export const FOUR_BUTTONS = ['Allow once', 'Allow for 10 minutes', LONGER, 'Deny'];
export const THREE_BUTTONS = ['Allow once', 'Allow for 10 minutes', 'Deny'];

export const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The answer if it comes within half a second, `'slow'` if not — a request queued behind a held modal is slow. */
export async function atOnce<T>(promise: Promise<T>): Promise<T | 'slow'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<'slow'>((resolve) => {
    timer = setTimeout(() => resolve('slow'), 500);
  });
  try {
    return await Promise.race([promise, slow]);
  } finally {
    clearTimeout(timer);
  }
}

/** Both clocks in the test's hand: `at(ms)` moves wall time to `W + ms` and the monotonic clock to `M + ms`. */
export function clocks(): { clock: () => Date; monotonic: () => number; at: (ms: number) => void; now: () => number } {
  let offset = 0;
  return {
    clock: () => new Date(W + offset),
    monotonic: () => M + offset,
    at: (ms) => {
      offset = ms;
    },
    now: () => W + offset,
  };
}

export interface Rig {
  w: ReturnType<typeof world>;
  instance: ReturnType<typeof manager>['instance'];
  gate: FakeServer;
  /** One signing request: a login for `prod` unless the test says otherwise. */
  ask(options?: { purpose?: unknown; signal?: AbortSignal; flags?: number; name?: string }): Promise<boolean>;
}

export async function loaded(options: {
  answers: (string | undefined | Promise<string>)[];
  picks?: PickAnswer[];
  keyType?: KeyType;
  /** `false`: leave the hooks as the manager builds them (fail closed) — a manager nobody wired. */
  wired?: boolean;
  autoLockMinutes?: number;
  locked?: boolean;
  overdue?: boolean;
  consentTimeoutMs?: number;
  clock?: () => Date;
  monotonic?: () => number;
}): Promise<Rig> {
  const w = world({ answers: options.answers });
  w.pickAnswers.push(...(options.picks ?? []));
  const { instance } = manager(w, {
    keys: { [KEY_ID]: realPrivateKey(options.keyType) },
    consentTimeoutMs: options.consentTimeoutMs,
    clock: options.clock,
    monotonic: options.monotonic,
    ...hooksFor(options),
  });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  return { w, instance, gate, ask: (request = {}) => ask(gate, request) };
}

/** Wired by default: unlocked, auto-lock 60, not overdue. What a test names overrides it; `wired: false` names nothing. */
const WIRED = { autoLockMinutes: 60, locked: false, overdue: false };

function hooksFor(options: { wired?: boolean; autoLockMinutes?: number; locked?: boolean; overdue?: boolean }): Partial<typeof WIRED> {
  const given = Object.entries({ autoLockMinutes: options.autoLockMinutes, locked: options.locked, overdue: options.overdue }).filter(
    ([, value]) => value !== undefined,
  );
  return { ...(options.wired === false ? {} : WIRED), ...Object.fromEntries(given) };
}

function ask(gate: FakeServer, request: { purpose?: unknown; signal?: AbortSignal; flags?: number; name?: string }): Promise<boolean> {
  const key = request.name === undefined ? KEY : { ...KEY, name: request.name };
  return gate.confirm(key, request.purpose ?? LOGIN, undefined, request.signal, request.flags);
}
