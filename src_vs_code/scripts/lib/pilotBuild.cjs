'use strict';
// The Remote Bridge pilot's build (change 11.1, S5; the plan's E2.4 "switch-on build for measuring"): the two changes that make a
// pilot VSIX out of the shipped one. Pure: `scripts/build-pilot.mjs` reads and writes the files, `test/pilotBuild.test.ts` holds these.
// The pilot is never released: the switch stays off in the source and in every published build (`src/bridgeFlowSwitch.ts`).

/** The one line of the esbuild bundle that sets the switch, as `tsc` and esbuild write it: `exports<N>.BRIDGE_FLOW_ENABLED = false;`. */
const SWITCH_OFF = /\bexports\d*\.BRIDGE_FLOW_ENABLED = false;/g;

/** The bundle with the switch on. Refuses unless the line is there exactly once: a bundle that changed shape is not guessed at. */
function switchOn(bundle) {
  const found = bundle.match(SWITCH_OFF) ?? [];
  if (found.length !== 1) {
    throw new Error(`the bundle sets BRIDGE_FLOW_ENABLED = false ${found.length} times, not once: the pilot build does not know what to change`);
  }
  return bundle.replace(SWITCH_OFF, (line) => line.replace('= false;', '= true;'));
}

/** The pilot's display name: a person who installs it sees it is not a release. */
const PILOT_LABEL = ' (Remote Bridge pilot)';

/**
 * The pilot's manifest, a new object: `onStartupFinished` (the restore needs every window to activate; D13, D19), no
 * `vscode:prepublish` (the bundle is built, and changed, before packaging; a prepublish would rebuild it with the switch off), and the
 * display name marked. Everything else is the shipped manifest's. Refuses a manifest that already declares `activationEvents`: the
 * switch's test holds that the shipped one does not, so one that does is not the manifest this build expects.
 */
function pilotManifest(manifest) {
  if (manifest.activationEvents !== undefined) {
    throw new Error('the manifest already declares activationEvents: not the shipped manifest this build expects');
  }
  const { 'vscode:prepublish': _dropped, ...scripts } = manifest.scripts ?? {};
  return { ...manifest, displayName: `${manifest.displayName}${PILOT_LABEL}`, activationEvents: ['onStartupFinished'], scripts };
}

/** The version the pilot's clients report: the released version of each, marked as the pilot of one commit. */
const pilotVersion = (released, sha) => `${released}-pilot.${sha.slice(0, 7)}`;

/** The pilot VSIX's file name: the extension's version, marked, and the commit. */
const pilotVsixName = (version, sha) => `creds-for-devs-${version}-bridge-pilot-${sha.slice(0, 7)}.vsix`;

module.exports = { switchOn, pilotManifest, pilotVersion, pilotVsixName, PILOT_LABEL };
