import { DEFAULT_SSH_PORT, isSafeSshHost, isSafeSshTarget } from './sshCommand';
import { EntityMetadata, PortForward } from './types';

/**
 * The connection-manager half of an SSH entity: a jump host, port forwards, agent forwarding
 * and tags (audit 2026-08-25, **D7**).
 *
 * <p>Pure and `vscode`-free, and shared by BOTH command builders — `buildSshCommand` for the
 * human terminal and `buildSshExecArgv` for the agent. That is deliberate and it is the same
 * argument `sshCredential.ts` makes: two renderings of the same decision drift, and the first
 * time they do, one surface reaches a host through a bastion and the other does not.</p>
 *
 * <p><b>Everything here is untrusted input.</b> `sshCommand.ts`'s header explains why for `host`
 * and `user`: entities arrive by sync and by Accept Share, so a writer of a shared vault chooses
 * these strings. Each field below is another path into ssh's own argv parser — where a leading
 * `-` is a FLAG and `-oProxyCommand=…` runs a local command before authenticating anything — so
 * each is REFUSED at composition rather than escaped. Escaping answers a shell; it does not
 * answer getopt.</p>
 */

/** Deeper than this and the chain is a mistake, not a network. */
export const MAX_JUMP_DEPTH = 4;

const MIN_PORT = 1;
const MAX_PORT = 65_535;

function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}

/** A bind address is a host, or `*` for "every interface" — ssh's own spelling. */
function isSafeBindAddress(value: string): boolean {
  return value === '*' || isSafeSshHost(value);
}

function hasValidPorts(forward: PortForward): boolean {
  return isPort(forward.bindPort) && isPort(forward.hostPort);
}

function hasValidAddresses(forward: PortForward): boolean {
  const bindOk = forward.bindAddress === undefined || isSafeBindAddress(forward.bindAddress);
  return isSafeSshHost(forward.host) && bindOk;
}

export function isValidForward(forward: PortForward): boolean {
  const kindOk = forward.kind === 'local' || forward.kind === 'remote';
  return kindOk && hasValidPorts(forward) && hasValidAddresses(forward);
}

/** The three or four colon-separated fields, or nothing when it is neither shape. */
function forwardFields(text: string): { bindAddress?: string; ports: string[] } | undefined {
  const parts = text.trim().split(':');
  if (parts.length !== 3 && parts.length !== 4) {
    return undefined;
  }
  return parts.length === 4 ? { bindAddress: parts[0], ports: parts.slice(1) } : { ports: parts };
}

/**
 * Read the compact `[bind:]port:host:hostport` form.
 *
 * <p>It is the form people already have in their heads and in their `~/.ssh/config`, so the form
 * offers it as one field rather than four. `undefined` means "not a forward" — refused, never
 * half-read into something that would silently forward the wrong port.</p>
 */
// eslint-disable-next-line complexity -- a flat list of independent field checks (one clause per field of a forwarding rule); splitting reads worse
export function parseForward(kind: PortForward['kind'], text: string): PortForward | undefined {
  const fields = forwardFields(text);
  if (fields === undefined) {
    return undefined;
  }
  const [bindPort, host, hostPort] = fields.ports;
  if (!/^\d+$/.test(bindPort) || !/^\d+$/.test(hostPort)) {
    return undefined;
  }
  const forward: PortForward = {
    kind,
    ...(fields.bindAddress === undefined ? {} : { bindAddress: fields.bindAddress }),
    bindPort: Number(bindPort),
    host,
    hostPort: Number(hostPort),
  };
  return isValidForward(forward) ? forward : undefined;
}

/** The `-L`/`-R` pair for one forward. Callers pass only forwards that already validated. */
export function renderForward(forward: PortForward): string[] {
  const flag = forward.kind === 'local' ? '-L' : '-R';
  const bind = forward.bindAddress === undefined ? '' : `${forward.bindAddress}:`;
  return [flag, `${bind}${forward.bindPort}:${forward.host}:${forward.hostPort}`];
}

/**
 * The forwards that will actually be used: enabled, and still valid.
 *
 * <p>A disabled row is kept and skipped, exactly as a disabled command argument is — it is there
 * to be switched back on. An INVALID row is skipped too rather than refusing the whole
 * connection: the rows arrive by sync, and one bad forward should not make a host unreachable.</p>
 */
export function normalizeForwards(forwards: readonly PortForward[] | undefined): PortForward[] {
  return (forwards ?? []).filter((f) => f.disabled !== true && isValidForward(f)).map((f) => ({ ...f }));
}

export type JumpChain = { ok: true; value: string | undefined } | { ok: false; reason: string };

/** `user@host` or `user@host:port` — one hop of a `-J` value. */
function hopOf(entity: EntityMetadata): string {
  const base = entity.user ? `${entity.user}@${entity.host}` : (entity.host as string);
  return entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT ? `${base}:${entity.port}` : base;
}

type Refusal = { ok: false; reason: string } | undefined;

/**
 * The `-J` value from the hops as walked.
 *
 * <p>ssh reads `-J` left to right — the first named is contacted first — and the walk found them
 * nearest-first, so the order is reversed here rather than at every call site.</p>
 */
function joinHops(hops: readonly string[]): string | undefined {
  return hops.length === 0 ? undefined : [...hops].reverse().join(',');
}

/** A reference that is actually set: absent and empty-string both mean no jump host. */
function isSet(id: string | undefined): id is string {
  return id !== undefined && id.length > 0;
}

/** Why the WALK cannot continue: it has looped, or it has gone too deep. */
function refuseWalk(entity: EntityMetadata, current: string, seen: ReadonlySet<string>, depth: number): Refusal {
  if (seen.has(current)) {
    return { ok: false, reason: `The jump hosts of "${entity.name}" lead in a circle.` };
  }
  if (depth >= MAX_JUMP_DEPTH) {
    return {
      ok: false,
      reason: `"${entity.name}" chains more than ${MAX_JUMP_DEPTH} jump hosts, which is a mistake rather than a network.`,
    };
  }
  return undefined;
}

/** Why this HOP cannot be used: it is gone, or its address is not one ssh may be given. */
function refuseHop(entity: EntityMetadata, hop: EntityMetadata | undefined): Refusal {
  if (hop === undefined) {
    return {
      ok: false,
      reason: `The jump host referenced by "${entity.name}" no longer exists in this vault.`,
    };
  }
  return isSafeSshTarget(hop)
    ? undefined
    : { ok: false, reason: `The jump host "${hop.name}" cannot be used: its address is not a valid host.` };
}

/**
 * Walk `jumpHostEntityId` and produce the `-J` value, or say why it cannot be produced.
 *
 * <p><b>A typed reference, never a `ProxyCommand`.</b> The roadmap is explicit that
 * `-oProxyCommand=` through a hostname stays blocked; a jump host is a pointer to another entity
 * in the same vault, so what reaches ssh is composed here from fields that were themselves
 * validated — not a string anybody typed.</p>
 *
 * <p>The walk is cycle-bounded and depth-capped for the reason the tree's own walk is: `parentId`
 * and this id are DATA, arriving by sync and import, so a loop is a thing that happens rather
 * than a thing that cannot. An unbounded walk would hang the extension host.</p>
 */
export function resolveJumpChain(
  entity: EntityMetadata,
  byId: (id: string) => EntityMetadata | undefined,
): JumpChain {
  const hops: string[] = [];
  const seen = new Set<string>([entity.id]);
  let current = entity.jumpHostEntityId;
  while (isSet(current)) {
    const refusal = refuseWalk(entity, current, seen, hops.length) ?? refuseHop(entity, byId(current));
    if (refusal !== undefined) {
      return refusal;
    }
    seen.add(current);
    const hop = byId(current) as EntityMetadata;
    hops.push(hopOf(hop));
    current = hop.jumpHostEntityId;
  }
  return { ok: true, value: joinHops(hops) };
}

/**
 * Every option both builders share, in one order.
 *
 * <p>The jump value is passed in rather than resolved here because resolving needs the vault and
 * this module must not: the caller that has a `StorageManager` does the lookup, and what arrives
 * here is a string already proven.</p>
 */
export function sshOptionArgv(entity: EntityMetadata, jump: string | undefined): string[] {
  const jumpArgv = jump !== undefined && jump.length > 0 ? ['-J', jump] : [];
  const agentArgv = entity.agentForward === true ? ['-A'] : [];
  const forwardArgv = normalizeForwards(entity.portForwards).flatMap((f) => renderForward(f));
  return [...jumpArgv, ...agentArgv, ...forwardArgv];
}

/**
 * A tag is a label and nothing else.
 *
 * <p>Tags are rendered into the tree row and into the viewer, and they arrive from other people's
 * vaults — so the character set is the one a label needs and stops there.</p>
 */
export function isSafeTag(tag: string): boolean {
  return tag.length > 0 && tag.length <= 24 && /^[A-Za-z0-9 ._-]+$/.test(tag);
}

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  const clean = (tags ?? []).map((t) => t.trim()).filter((t) => isSafeTag(t));
  return [...new Set(clean)];
}
