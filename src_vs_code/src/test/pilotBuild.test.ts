import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { pilotManifest, pilotVersion, pilotVsixName, switchOn, PILOT_LABEL } from '../../scripts/lib/pilotBuild.cjs';

/**
 * The Remote Bridge pilot's build (change 11.1, S5; `scripts/build-pilot.mjs`): the switch on in the bundle's copy, `onStartupFinished` in
 * the manifest's copy, and nothing that ships ever runs it. The source keeps the switch off (`bridgeFlowSwitch.test.ts`).
 */

const EXTENSION = path.join(__dirname, '..', '..');
const REPO = path.join(EXTENSION, '..');

test('PB1: the switch is turned on in the one line that sets it, and a bundle with none or two such lines is refused', () => {
  const compiled = fs.readFileSync(path.join(EXTENSION, 'out', 'bridgeFlowSwitch.js'), 'utf8');
  const on = switchOn(compiled);
  assert.match(on, /\bexports\.BRIDGE_FLOW_ENABLED = true;/);
  assert.doesNotMatch(on, /BRIDGE_FLOW_ENABLED = false;/);
  assert.equal(on.length, compiled.length + 'true'.length - 'false'.length, 'nothing else changed');
  const bundled = 'a;\n    exports2.BRIDGE_FLOW_ENABLED = false;\n    b;';
  assert.equal(switchOn(bundled), 'a;\n    exports2.BRIDGE_FLOW_ENABLED = true;\n    b;', 'esbuild names it exports2');
  assert.throws(() => switchOn('nothing here'), /0 times, not once/);
  assert.throws(() => switchOn(`${bundled}\n${bundled}`), /2 times, not once/);
});

test('PB2: the pilot manifest adds onStartupFinished, drops the prepublish and marks the name; the rest is the shipped manifest, which is not changed', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'package.json'), 'utf8')) as Record<string, unknown> & { displayName: string; scripts: Record<string, string> };
  const before = JSON.stringify(shipped);
  const pilot = pilotManifest(shipped);
  assert.deepEqual(pilot.activationEvents, ['onStartupFinished']);
  assert.equal(pilot.displayName, `${shipped.displayName}${PILOT_LABEL}`);
  assert.equal(pilot.scripts?.['vscode:prepublish'], undefined, 'a prepublish would rebuild the bundle with the switch off');
  assert.ok(shipped.scripts['vscode:prepublish'] !== undefined, 'control: the shipped manifest has one');
  const { activationEvents: _a, displayName: _d, scripts: pilotScripts, ...pilotRest } = pilot;
  const { displayName: _s, scripts: shippedScripts, ...shippedRest } = shipped;
  assert.deepEqual(pilotRest, shippedRest, 'every other field is the shipped one (version, contributes, engines, ...)');
  assert.deepEqual(Object.keys(pilotScripts ?? {}).sort(), Object.keys(shippedScripts).filter((name) => name !== 'vscode:prepublish').sort());
  assert.equal(JSON.stringify(shipped), before, 'the shipped manifest object is not changed');
  assert.throws(() => pilotManifest({ ...shipped, activationEvents: ['*'] }), /already declares activationEvents/);
});

test('PB3: the names carry the commit, and the clients\' versions are the released ones marked as its pilot', () => {
  assert.equal(pilotVersion('0.11.0', '9a90f84c1234'), '0.11.0-pilot.9a90f84');
  assert.equal(pilotVsixName('1.23.0', '9a90f84c1234'), 'creds-for-devs-1.23.0-bridge-pilot-9a90f84.vsix');
});

test('PB4: nothing that releases or packages runs the pilot build', () => {
  const workflows = path.join(REPO, '.github', 'workflows');
  const naming = fs.readdirSync(workflows).filter((file) => /pilot/i.test(fs.readFileSync(path.join(workflows, file), 'utf8')));
  assert.deepEqual(naming, [], 'no workflow names the pilot');
  const scripts = (JSON.parse(fs.readFileSync(path.join(EXTENSION, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
  assert.deepEqual(Object.entries(scripts).filter(([, command]) => /pilot/i.test(command)), [], 'no npm script runs it: it is run by hand, by its path');
  const ignored = fs.readFileSync(path.join(EXTENSION, '.vscodeignore'), 'utf8');
  assert.match(ignored, /^scripts\/\*\*$/m, 'the builder and the server script are not in any VSIX');
});
