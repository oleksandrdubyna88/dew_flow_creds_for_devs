import { EntityMetadata } from './types';
import { OS_LABELS, OS_NAMES, OsName, asOsName, osLabel } from './hostShell';
import { KeyCandidate, LauncherCandidate } from './entityFormShape';
import { escapeHtml } from './webviewHtml';

/**
 * The form's four controls — what a Terminal entry is written for and which Terminal entry starts a VPN
 * (issue #103), which SSH entry a Terminal entry runs over (E1.S1 of `PLAN_terminal_command_over_ssh.md`), and
 * whether an entry runs its dependencies first.
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
    <p class="hint">Your default terminal is used when it is a shell of that system; otherwise the system's own — PowerShell (7 when installed) on Windows, bash on macOS and Linux. On any other system it is refused. "Not set" always uses your default terminal, as before. With an SSH connection chosen below, this is the remote system.</p>`;
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

/** What one entry picker is made of: its element id, its label, the choice that stores nothing, and a hint paragraph (markup). */
interface PickerText {
  readonly id: string;
  readonly label: string;
  readonly none: string;
  readonly hintHtml: string;
}

/**
 * A `<select>` that points at another entity, in the shape both pickers share: "none" first, then what is offered, then —
 * when the stored choice is no longer offered — the stored id shown as missing, so a save does not drop it silently.
 */
function entityPicker(text: PickerText, selected: string, offered: readonly { readonly id: string; readonly label: string }[]): string {
  const options = offered.map((c) => option(c.id, c.label, selected));
  const dangling = selected !== '' && !offered.some((c) => c.id === selected) ? [option(selected, '(missing entry)', selected)] : [];
  return `<label for="${text.id}">${text.label}</label>
    <select id="${text.id}">${[option('', text.none, selected), ...options, ...dangling].join('')}</select>
    <p class="hint">${text.hintHtml}</p>`;
}

/** The launcher picker in the VPN section — a `<select>`, the way an SSH entry picks its key. */
export function vpnLauncherField(d: EntityMetadata | undefined, candidates: readonly LauncherCandidate[]): string {
  const text: PickerText = {
    id: 'vpnLauncherEntityId',
    label: 'Started by',
    none: '— built-in (detected) —',
    hintHtml: 'A Terminal entry whose command starts this VPN. Write <code>{config}</code> where the path to the stored config file goes.',
  };
  return entityPicker(text, d?.vpnLauncherEntityId ?? '', candidates.map((c) => ({ id: c.id, label: launcherLabel(c) })));
}

function launcherLabel(c: LauncherCandidate): string {
  return c.os === undefined ? c.name : `${c.name} · ${osLabel(c.os)}`;
}

/**
 * The SSH-link picker in the Terminal section — the shape of `vpnLauncherField`. It starts on "Do not use", and a
 * stored link that is no longer offered stays selectable (shown as missing) so a save does not drop it silently.
 */
export function sshLinkField(d: EntityMetadata | undefined, candidates: readonly KeyCandidate[]): string {
  const text: PickerText = {
    id: 'sshEntityId',
    label: 'Runs over SSH',
    none: '— Do not use —',
    hintHtml: 'One of your SSH entries. This version saves the choice but cannot run a command over SSH yet: while one is chosen, every way of running this entry refuses and says why.',
  };
  return entityPicker(text, d?.sshEntityId ?? '', candidates.map((c) => ({ id: c.id, label: c.name })));
}

/** Inside the Depends-on body, so it is shown exactly while a dependency can be chosen. */
export function runDependenciesField(d: EntityMetadata | undefined): string {
  return `<div class="check">
        <input id="runDependencies" type="checkbox" ${d?.runDependencies === true ? 'checked' : ''}>
        <label for="runDependencies">Execute what is executable first</label>
      </div>
      <p class="hint">Before Run in Terminal, Run Script, Run with Secrets or Start VPN, this entry's Terminal dependencies run in order, each waiting for the one before — and theirs too, where they ask for the same. Other dependencies stay notes; SSH connect does not run them.</p>`;
}

/** The four fields as the save writes them — the host half of the controls above. */
type ExecDetails = Pick<EntityMetadata, 'terminalOs' | 'sshEntityId' | 'vpnLauncherEntityId' | 'runDependencies'>;

/**
 * Read the four fields from a posted form, scrubbed by kind the way every field around them in
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
    sshEntityId: kind === 'terminal' ? otherEntityId(text(data.sshEntityId), selfId) : undefined,
    vpnLauncherEntityId: kind === 'vpn' ? otherEntityId(text(data.vpnLauncherEntityId), selfId) : undefined,
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

/** The id of ANOTHER entity — never itself (the self-reference guard `jumpHostEntityId` applies too), and not empty. */
function otherEntityId(value: string, selfId: string | undefined): string | undefined {
  return value === '' || value === selfId ? undefined : value;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}
