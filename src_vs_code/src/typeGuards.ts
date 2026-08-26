import { CommandArg, PortForward } from './types';

/**
 * The small shape checks `isEntityMetadata` and `isTreeNode` are built from.
 *
 * <p>Here rather than in `types.ts` for the plainest of reasons: that file reached 835 lines
 * against the 800-line ceiling when the MCP switches were added, and these are the part of it
 * nothing outside ever imported. None of them was exported, so moving them is invisible to every
 * other module.</p>
 *
 * <p>They stay together because they share one discipline: a field a guard does not know about
 * is stripped by every sync, import and sealed-slot read, so each of these is the difference
 * between a stored value and a silently discarded one.</p>
 */


// eslint-disable-next-line complexity -- a flat list of independent field checks (every clause is one field of a forwarding rule); splitting reads worse
export function hasForwardShape(r: Record<string, unknown>): boolean {
  return (
    (r.kind === 'local' || r.kind === 'remote') &&
    typeof r.bindPort === 'number' &&
    typeof r.hostPort === 'number' &&
    typeof r.host === 'string'
  );
}

// eslint-disable-next-line complexity -- a flat list of independent field checks (every clause is one optional field of a forwarding rule); splitting reads worse
export function hasForwardExtras(r: Record<string, unknown>): boolean {
  return (
    (r.bindAddress === undefined || typeof r.bindAddress === 'string') &&
    (r.disabled === undefined || typeof r.disabled === 'boolean') &&
    (r.note === undefined || typeof r.note === 'string')
  );
}

export function isPortForwardRow(row: unknown): boolean {
  if (typeof row !== 'object' || row === null) {
    return false;
  }
  const r = row as Record<string, unknown>;
  return hasForwardShape(r) && hasForwardExtras(r);
}

export function isPortForwardArray(value: unknown): value is PortForward[] {
  return Array.isArray(value) && value.every((row) => isPortForwardRow(row));
}

export function isCommandArgArray(value: unknown): value is CommandArg[] {
  return (
    Array.isArray(value) &&
    // eslint-disable-next-line complexity
    value.every((row) => {
      if (typeof row !== 'object' || row === null) {
        return false;
      }
      const r = row as Record<string, unknown>;
      return (
        typeof r.value === 'string' &&
        (r.name === undefined || typeof r.name === 'string') &&
        (r.note === undefined || typeof r.note === 'string') &&
        (r.disabled === undefined || typeof r.disabled === 'boolean')
      );
    })
  );
}

/**
 * Binding NAMES are refused at the door when they are not variable names. The value
 * side is a name too (the variable), never a secret — secrets never travel here.
 * Rejecting the whole entity is deliberate: a binding name that cannot be a variable
 * has no honest origin, and the import is the last place it can be judged cheaply.
 */
function allStringRecord(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

export function isEnvBindings(value: unknown): value is Record<string, string> {
  if (!allStringRecord(value)) {
    return false;
  }
  return Object.values(value as Record<string, string>).every(
    (name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name),
  );
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * The MCP switches, every field optional.
 *
 * <p>Optional on purpose: a record from a NEWER build carrying a switch this one has never heard
 * of is accepted rather than rejected — the same forward-compatibility rule `kind` follows. The
 * ladder in `mcpAccess.ts` decides what the known ones mean; an unknown delete scope resolves to
 * no deleting there, which is the only safe reading.</p>
 */
// eslint-disable-next-line complexity -- a flat list of independent optional-field checks
export function isMcpAccess(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    (v.view === undefined || typeof v.view === 'boolean') &&
    (v.use === undefined || typeof v.use === 'boolean') &&
    (v.edit === undefined || typeof v.edit === 'boolean') &&
    (v.create === undefined || typeof v.create === 'boolean') &&
    (v.delete === undefined || v.delete === 'any' || v.delete === 'own')
  );
}
