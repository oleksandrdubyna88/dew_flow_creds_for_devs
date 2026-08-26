import { DepColorKey } from './depColors';
import { ENTITY_KINDS, EntityKind } from './types';

/**
 * Every bordered section of the entity form, once.
 *
 * <p>Until now a section existed in two places that agreed only by habit: its markup in
 * `entityFormPage.ts` and its show/hide rule in the page script. Adding a third fact about each
 * one — which of the two groups it belongs to, and what colour its border is — would have made
 * that three. So the facts live here, and the page, the script and the tests all read them.</p>
 *
 * <p><b>The colours are the dependency palette, deliberately.</b> It was already contributed with
 * dark, light and both high-contrast variants, and already looked at by a person in both themes.
 * A second list of the same colours under a different name is the duplication that starts
 * identical and ends different.</p>
 *
 * <p><b>Why eleven colours for fifteen sections.</b> The rule is that no two sections VISIBLE AT
 * ONCE may share a colour — not that every section in the file must differ. `VPN`, `Database`,
 * `Terminal command` and `Script` are chosen by the entity's kind and can never appear beside one
 * another, so they reuse the three colours the SSH sections need. `sectionColorsAreDistinct`
 * below is what makes that a checked property rather than a claim, and it checks the WORST case:
 * a section counts as visible for a kind if it CAN be shown for it.</p>
 */

export type SectionGroup = 'main' | 'additional';

export interface FormSection {
  /** The fieldset's element id — also what the visibility switch toggles. */
  id: string;
  legend: string;
  group: SectionGroup;
  color: DepColorKey;
  /** The kinds this section can be shown for. Empty means every kind. */
  kinds: readonly EntityKind[];
  /**
   * An extra condition the generated script ANDs in, for the one section whose visibility is not
   * a function of the kind alone. Kept out of `kinds` on purpose: the colour check must treat the
   * section as visible whenever it COULD be, and a condition it cannot evaluate must not narrow
   * that.
   */
  condition?: string;
  /**
   * This section may not be in the markup at all, whatever the kind.
   *
   * <p>Exactly one is: `Dates` renders only for an entry that HAS dates, because a brand-new
   * entry showing "unknown" and "—" is two rows of noise at the moment they mean least. Flagged
   * rather than left implicit so the "every section is rendered exactly once" check can stay a
   * hard equality for the other fourteen instead of being softened for all of them.</p>
   */
  optional?: boolean;
}

const EVERY_KIND: readonly EntityKind[] = [];

/** Kinds minus the ones named — for the two sections defined by what they are NOT. */
function allBut(...excluded: readonly EntityKind[]): readonly EntityKind[] {
  return ENTITY_KINDS.filter((kind) => !excluded.includes(kind));
}

export const FORM_SECTIONS: readonly FormSection[] = [
  // --- the eight that are on screen for almost every kind, so their colours are their own ---
  { id: 'generalSection', legend: 'General', group: 'main', color: 'depColor1', kinds: EVERY_KIND },
  {
    id: 'lifetimeSection',
    legend: 'Lifetime',
    group: 'additional',
    color: 'depColor2',
    kinds: EVERY_KIND,
  },
  {
    id: 'dependsOnSection',
    legend: 'Depends on',
    group: 'additional',
    color: 'depColor3',
    kinds: EVERY_KIND,
  },
  {
    id: 'passwordSection',
    legend: 'Secret',
    group: 'main',
    color: 'depColor4',
    kinds: allBut('db', 'terminal', 'script'),
  },
  {
    id: 'totpSection',
    legend: 'One-time code (TOTP)',
    group: 'additional',
    color: 'depColor5',
    kinds: allBut('sshkey', 'terminal', 'script'),
  },
  {
    id: 'attachmentsSection',
    legend: 'Attachments',
    group: 'additional',
    color: 'depColor6',
    kinds: EVERY_KIND,
  },
  {
    id: 'datesSection',
    legend: 'Dates',
    group: 'main',
    color: 'depColor7',
    kinds: EVERY_KIND,
    optional: true,
  },
  { id: 'notesSection', legend: 'Notes', group: 'main', color: 'depColor8', kinds: EVERY_KIND },

  // --- the three that appear TOGETHER on an SSH connection, so all three must differ ---
  {
    id: 'connectionSection',
    legend: 'Connection',
    group: 'main',
    color: 'depColor9',
    kinds: ['ssh'],
  },
  {
    id: 'advancedConnectionSection',
    legend: 'Advanced connection',
    group: 'additional',
    color: 'depColor10',
    kinds: ['ssh'],
  },
  {
    id: 'keySection',
    legend: 'SSH key',
    group: 'main',
    color: 'depColor11',
    kinds: ['ssh', 'sshkey'],
    // An SSH connection borrowing another entry's key has no key fields of its own to show.
    condition: "val('sshKeyEntityId') === ''",
  },

  // --- the four the kind selects, never beside each other or the three above: colours reused ---
  { id: 'vpnSection', legend: 'VPN', group: 'main', color: 'depColor9', kinds: ['vpn'] },
  { id: 'dbSection', legend: 'Database', group: 'main', color: 'depColor10', kinds: ['db'] },
  {
    id: 'terminalSection',
    legend: 'Terminal command',
    group: 'main',
    color: 'depColor11',
    kinds: ['terminal'],
  },
  { id: 'scriptSection', legend: 'Script', group: 'main', color: 'depColor9', kinds: ['script'] },
];

/** Can this section be on screen for this kind? The worst case, ignoring `condition`. */
export function isVisibleForKind(section: FormSection, kind: EntityKind): boolean {
  return section.kinds.length === 0 || section.kinds.includes(kind);
}

export function sectionsForKind(kind: EntityKind): FormSection[] {
  return FORM_SECTIONS.filter((section) => isVisibleForKind(section, kind));
}

export function sectionsOf(group: SectionGroup): FormSection[] {
  return FORM_SECTIONS.filter((section) => section.group === group);
}

/**
 * The property the whole colour scheme rests on: for this kind, no two sections that could both
 * be on screen wear the same colour. Returns the colliding pairs, so a failure names them.
 */
export function colorCollisionsForKind(kind: EntityKind): string[] {
  const byColor = new Map<DepColorKey, string[]>();
  for (const section of sectionsForKind(kind)) {
    byColor.set(section.color, [...(byColor.get(section.color) ?? []), section.id]);
  }
  return [...byColor.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([color, ids]) => `${kind}: ${ids.join(' and ')} both use ${color}`);
}
