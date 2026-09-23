import { EntityMetadata } from './types';
import { OS_LABELS, OS_NAMES, OsName, asOsName, osLabel } from './hostShell';
import { LauncherCandidate } from './entityFormShape';
import { escapeHtml } from './webviewHtml';

/**
 * The form's three controls for issue #103 — what a Terminal entry is written for, which Terminal
 * entry starts a VPN, and whether an entry runs its dependencies first.
 *
 * <p>Their own module because `entityFormPage.ts` is at its line ceiling; each is one `${…}` there.
 * Pure: markup from data, no `vscode`, so the choices each control offers are unit tests.</p>
 */

/**
 * The OS dropdown in the Terminal section. A stored value wins; a NEW entry starts on this
 * machine's OS; an EXISTING entry that never had one starts on "not set", because silently
 * stamping an OS on it at the next save would change how its command runs.
 */
export function terminalOsField(d: EntityMetadata | undefined, mode: 'create' | 'edit', hostOs: OsName | undefined): string {
  const selected = initialOs(d, mode, hostOs);
  const known = OS_NAMES.map((os) => option(os, OS_LABELS[os], selected));
  // A value a newer build wrote stays selectable — dropping it would rewrite the entry on save.
  const foreign = isForeignOs(selected) ? [option(selected, selected, selected)] : [];
  return `<label for="terminalOs">Runs on</label>
    <select id="terminalOs">${[option('', '— not set (default terminal) —', selected), ...known, ...foreign].join('')}</select>
    <p class="hint">Your default terminal is used when it is a shell of that system; otherwise the system's own — PowerShell (7 when installed) on Windows, bash on macOS and Linux. On any other system it is refused. "Not set" always uses your default terminal, as before.</p>`;
}

function initialOs(d: EntityMetadata | undefined, mode: 'create' | 'edit', hostOs: OsName | undefined): string {
  return d?.terminalOs ?? defaultOs(mode, hostOs);
}

function defaultOs(mode: 'create' | 'edit', hostOs: OsName | undefined): string {
  return mode === 'create' ? (hostOs ?? '') : '';
}

function isForeignOs(value: string): boolean {
  return value !== '' && asOsName(value) === undefined;
}

/** The launcher picker in the VPN section — a `<select>`, the way an SSH entry picks its key. */
export function vpnLauncherField(d: EntityMetadata | undefined, candidates: readonly LauncherCandidate[]): string {
  const selected = d?.vpnLauncherEntityId ?? '';
  const offered = candidates.map((c) => option(c.id, launcherLabel(c), selected));
  // A launcher that no longer exists is shown as such rather than silently dropped on save.
  const dangling = isDangling(selected, candidates) ? [option(selected, '(missing entry)', selected)] : [];
  return `<label for="vpnLauncherEntityId">Started by</label>
    <select id="vpnLauncherEntityId">${[option('', '— built-in (detected) —', selected), ...offered, ...dangling].join('')}</select>
    <p class="hint">A Terminal entry whose command starts this VPN. Write <code>{config}</code> where the path to the stored config file goes.</p>`;
}

function launcherLabel(c: LauncherCandidate): string {
  return c.os === undefined ? c.name : `${c.name} · ${osLabel(c.os)}`;
}

function isDangling(selected: string, candidates: readonly LauncherCandidate[]): boolean {
  return selected !== '' && !candidates.some((c) => c.id === selected);
}

/** Inside the Depends-on body, so it is shown exactly while a dependency can be chosen. */
export function runDependenciesField(d: EntityMetadata | undefined): string {
  return `<div class="check">
        <input id="runDependencies" type="checkbox" ${d?.runDependencies === true ? 'checked' : ''}>
        <label for="runDependencies">Execute what is executable first</label>
      </div>
      <p class="hint">Before Run in Terminal, Run Script, Run with Secrets or Start VPN, this entry's Terminal dependencies run in order, each waiting for the one before — and theirs too, where they ask for the same. Other dependencies stay notes; SSH connect does not run them.</p>`;
}

/** The three fields as the save writes them — the host half of the controls above. */
type ExecDetails = Pick<EntityMetadata, 'terminalOs' | 'vpnLauncherEntityId' | 'runDependencies'>;

/**
 * Read the three fields from a posted form, scrubbed by kind the way every field around them in
 * `toValues` is: an OS only on a Terminal entry, a launcher only on a VPN (and never itself), the
 * execute mark only while there is something to execute.
 *
 * <p>Spread into `toValues`'s literal, because that literal is what a save writes WHOLE — a field
 * absent from it is deleted from the entry on every edit.</p>
 */
export function execDetails(
  data: Record<string, unknown>,
  kind: string,
  dependsOnCount: number,
  selfId: string | undefined,
): ExecDetails {
  return {
    terminalOs: kind === 'terminal' ? nonEmpty(text(data.terminalOs)) : undefined,
    vpnLauncherEntityId: kind === 'vpn' ? launcherId(text(data.vpnLauncherEntityId), selfId) : undefined,
    runDependencies: runMark(dependsOnCount, data.runDependencies),
  };
}

/** Only while there is something to execute — an unchecked or orphaned mark is simply absent. */
function runMark(dependsOnCount: number, value: unknown): true | undefined {
  return dependsOnCount > 0 && value === true ? true : undefined;
}

function nonEmpty(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/** Never itself — the self-reference guard `jumpHostEntityId` applies too. */
function launcherId(value: string, selfId: string | undefined): string | undefined {
  return value === '' || value === selfId ? undefined : value;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}
