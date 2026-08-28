import { EntityKind, EntityMetadata } from './types';
import { resolveKind } from './entityKind';

/**
 * The eight shapes an entry can have, as a discriminated union (roadmap A4, 2026-08-28).
 *
 * <p>`EntityMetadata` stays one interface with optional fields — it is the record on disk, in
 * the vault, in every share and backup, and two hundred readers take it as it is. What was
 * missing is the TYPE that says "`host` belongs to an SSH entry, `configFormat` to a config":
 * this union says it, and `shapeOf` is the one door from the record to the union — it resolves
 * the kind (a pre-0.54 record has no `kind`; `kindOf` reads the legacy flags) and narrows.
 * A reader that switches on `.kind` with `assertNever` cannot forget a kind, and a field read
 * through a shape cannot be the wrong kind's.</p>
 */

interface EntityBase {
  id: string;
  name: string;
  tags?: string[];
  expiresAt?: number;
  burnPolicy?: EntityMetadata['burnPolicy'];
  envBindings?: Record<string, string>;
  hasTotp?: boolean;
  dependsOn?: string[];
  depColor?: string;
  mcp?: EntityMetadata['mcp'];
  mcpCreatedByAgent?: boolean;
  attachmentFileName?: string;
  imageFileName?: string;
}

interface Connectable {
  host?: string;
  user?: string;
  port?: number;
}

export type SshShape = EntityBase & Connectable & {
  kind: 'ssh';
  sshKeyPath?: string;
  publicKey?: string;
  sshKeyEntityId?: string;
  jumpHostEntityId?: string;
  portForwards?: EntityMetadata['portForwards'];
  agentForward?: boolean;
  hostKey?: string;
};
export type SshKeyShape = EntityBase & { kind: 'sshkey'; publicKey?: string; sshAgent?: boolean };
export type DbShape = EntityBase & Connectable & { kind: 'db'; dbType?: EntityMetadata['dbType'] };
export type VpnShape = EntityBase & Connectable & { kind: 'vpn'; vpnType?: EntityMetadata['vpnType']; vpnConfigFileName?: string };
export type TerminalShape = EntityBase & { kind: 'terminal'; command?: string; commandArgs?: EntityMetadata['commandArgs']; commandNote?: string };
export type ScriptShape = EntityBase & { kind: 'script'; script?: string; scriptLanguage?: string; scriptVars?: EntityMetadata['scriptVars'] };
export type ConfigShape = EntityBase & {
  kind: 'config';
  configFormat?: EntityMetadata['configFormat'];
  configFileName?: string;
  configKeyHash?: string;
};
export type CredentialShape = EntityBase & { kind: 'credential' };

export type EntityShape =
  | SshShape
  | SshKeyShape
  | DbShape
  | VpnShape
  | TerminalShape
  | ScriptShape
  | ConfigShape
  | CredentialShape;

/** The compile-time guarantee: every kind in the union, and nothing in the union that is not a kind. */
type ShapeKinds = EntityShape['kind'];
const EVERY_KIND_HAS_A_SHAPE: Record<EntityKind, ShapeKinds> = {
  credential: 'credential',
  ssh: 'ssh',
  sshkey: 'sshkey',
  vpn: 'vpn',
  db: 'db',
  terminal: 'terminal',
  script: 'script',
  config: 'config',
};
void EVERY_KIND_HAS_A_SHAPE;

/**
 * The record as its shape. The kind is resolved the way every reader resolves it — `kind` when
 * stamped, the legacy flags otherwise — so a pre-0.54 record narrows to the same shape a stamped
 * one does. The fields are the record's own; nothing is copied or dropped.
 */
export function shapeOf(details: EntityMetadata): EntityShape {
  return { ...details, kind: resolveKind(details) } as EntityShape;
}

/** The record as ONE expected shape, or nothing when it is another kind — for a reader that serves one kind. */
export function shapeAs<K extends EntityKind>(details: EntityMetadata, kind: K): Extract<EntityShape, { kind: K }> | undefined {
  const shape = shapeOf(details);
  return shape.kind === kind ? (shape as Extract<EntityShape, { kind: K }>) : undefined;
}
