import assert from 'node:assert/strict';
import { isLinkTarget } from '../remoteLaunch';
import { resolveJumpChain } from '../sshOptions';
import type { SshRoad } from '../sshRoad';
import type { PreparedSsh, ReadySsh } from '../sshSession';
import type { EntityMetadata, TreeNode } from '../types';
import type { World } from './vpnWorld';

/**
 * The world of the SSH roads (E2.S1 of `PLAN_terminal_command_over_ssh.md`): an SSH entry that passes the real link
 * validator, and a FAKE `SshRoad` that records what a road asked of it and what it was asked to take back.
 *
 * <p>The fake stands in for `prepareSshSession` only; everything a road does with the answer (the trust line, the typed
 * line, the owner's cleanup) is the real code. Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** An SSH entry as a tree node. `extra` overrides the details (and `extra.name` the node's name). */
export function sshNode(id: string, extra: Partial<EntityMetadata> = {}): TreeNode {
  const details = { id, name: 'prod box', isSshEnabled: true, host: 'prod.example', user: 'deploy', ...extra } as EntityMetadata;
  return { id, name: details.name, type: 'entity', details, parentId: null };
}

// testing.md: a fixture the code REJECTS proves nothing — build it against the real validator, once, at load.
assert.equal(isLinkTarget(sshNode('s1'), () => undefined), true, 'sshNode() is not a link target: every test of this world would run on a refused link');

/** What a script answers for the n-th preparation of an SSH entry: stop, refuse, or ready (with the askpass environment of a password). */
export type RoadAnswer = 'stopped' | 'refused' | { readonly password?: true };

export type RoadScript = (ssh: EntityMetadata, n: number) => RoadAnswer;

export interface FakeRoad extends SshRoad {
  /** Each `prepare`, with the SSH entry exactly as the road handed it, and the entry's own count from 1. */
  readonly calls: { readonly ssh: EntityMetadata; readonly n: number }[];
  /** How many times `sayRefused` was called. */
  refusedShown: number;
  /** Every ready answer, in order: what `r1`, `r2` of a test's expectations are. */
  readonly readies: ReadySsh[];
  /** One `'<sshId>#<n>'` per `cleanup()` call that did something (the real one is idempotent). */
  readonly cleaned: string[];
  /** Shared with the test: `prepare <sshId>#<n>` is pushed here, beside whatever the test pushes. */
  readonly events: string[];
}

/** The `ReadySsh` of one preparation. The explicit return type is the compile-time pin: a drift of `ReadySsh` fails here. */
function readyOf(ssh: EntityMetadata, n: number, jump: string | undefined, password: boolean, cleanup: () => void): ReadySsh {
  const key = `/keys/${ssh.id}-${n}.key`;
  return {
    kind: 'ready',
    snapshot: ssh,
    entity: { ...ssh, sshKeyPath: key },
    options: { jump, knownHostsFile: `/keys/known_hosts-${ssh.id}-${n}` },
    platform: process.platform,
    prefix: undefined,
    env: password ? { SSH_ASKPASS: '/keys/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_ASKPASS_PASSWORD: `pw-${n}` } : undefined,
    acceptNew: false,
    jump,
    target: 'deploy@prod.example',
    materializedKeyPath: key,
    cleanup,
  };
}

const assignable: ReadySsh = readyOf({ id: 'x', name: 'x', isSshEnabled: true } as EntityMetadata, 1, undefined, false, () => undefined);
void assignable;

/** The jump chain as `connectionOptions` resolves it: from the vault as it is AT CALL TIME. */
function jumpOf(ssh: EntityMetadata, lookup: ((id: string) => TreeNode | undefined) | undefined): string | undefined {
  if (lookup === undefined) {
    return undefined;
  }
  const chain = resolveJumpChain(ssh, (id) => lookup(id)?.details);
  return chain.ok ? chain.value : undefined;
}

/** A road that answers by `script` (ready, for every call, when none is given). */
export function fakeRoad(script: RoadScript = () => ({}), lookup?: (id: string) => TreeNode | undefined, events: string[] = []): FakeRoad {
  const counts = new Map<string, number>();
  const road: FakeRoad = {
    calls: [],
    refusedShown: 0,
    cleaned: [],
    readies: [],
    events,
    prepare: (_accountId, ssh): Promise<PreparedSsh> => {
      const n = (counts.get(ssh.id) ?? 0) + 1;
      counts.set(ssh.id, n);
      road.calls.push({ ssh, n });
      events.push(`prepare ${ssh.id}#${n}`);
      return Promise.resolve(answered(road, ssh, n, script(ssh, n), jumpOf(ssh, lookup)));
    },
    sayRefused: (): Promise<void> => {
      road.refusedShown += 1;
      return Promise.resolve();
    },
  };
  return road;
}

function answered(road: FakeRoad, ssh: EntityMetadata, n: number, answer: RoadAnswer, jump: string | undefined): PreparedSsh {
  if (answer === 'stopped') {
    return { kind: 'stopped', why: 'no-host' };
  }
  if (answer === 'refused') {
    return { kind: 'refused', reasons: [], retryable: false };
  }
  let done = false;
  const cleanup = (): void => {
    if (!done) {
      done = true;
      road.cleaned.push(`${ssh.id}#${n}`);
    }
  };
  const ready = readyOf(ssh, n, jump, answer.password === true, cleanup);
  road.readies.push(ready);
  return ready;
}

/** Every dialog the world shows is pushed to `events` as `dialog: <text>`, in order with the road's own events. */
export function recordDialogs(w: World, events: string[]): void {
  const window = w.vscode.window as Record<string, (text: string, ...rest: unknown[]) => unknown>;
  for (const name of ['showWarningMessage', 'showInformationMessage']) {
    const original = window[name];
    window[name] = (text: string, ...rest: unknown[]): unknown => {
      events.push(`dialog: ${text}`);
      return original(text, ...rest);
    };
  }
}
