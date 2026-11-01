import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { FakeServer, KEY_ID, keyEntity, keyMaterialLogged, manager, realPrivateKey, world } from './sshAgentWorld';
import { KEY, LOGIN, LONGER } from './sshAgentLongerRig';

/**
 * The idle auto-lock setting (#197, E3.3): ONE reader of it, and its default. It is what bounds a long login window, so
 * a repository's `.vscode/settings.json` must not be able to raise it — that scope is guarded in `manifest.test.ts`,
 * with the other settings a repository must not set (one list, not two).
 */

type Setting = typeof import('../autoLockSetting');
type Wiring = typeof import('../sshAgentWiring');

test("W6 the manifest default of credSshManager.autoLockMinutes is the reader's default", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    contributes: { configuration: { properties: Record<string, { default?: number }> } };
  };

  const [setting] = world({ also: ['../autoLockSetting'] }).modules as [Setting];

  assert.equal(manifest.contributes.configuration.properties['credSshManager.autoLockMinutes'].default, setting.AUTO_LOCK_DEFAULT_MINUTES);
});

test('W7 the reader: unset reads 60, 0 reads 0, a negative value is returned as it is (and reads as off)', () => {
  const w = world({ also: ['../autoLockSetting'] });
  const [setting] = w.modules as [Setting];

  assert.equal(setting.autoLockMinutesSetting(), 60, 'unset: the documented default');
  w.settings.autoLockMinutes = 0;
  assert.equal(setting.autoLockMinutesSetting(), 0);
  w.settings.autoLockMinutes = -5;
  assert.equal(setting.autoLockMinutesSetting(), -5);
});

test('W7b the listener ends login windows at -5 and at a value that is not a number as at 0, and a positive value ends nothing', async () => {
  const w = world({ also: ['../autoLockSetting', '../sshAgentWiring'], answers: [LONGER, LONGER, LONGER, LONGER] });
  const [, wiring] = w.modules as [Setting, Wiring];
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const link = wiring.connectAgentToSettings({ isLocked: () => false, dueForAutoLock: () => false }, instance);

  // 'x' is what a hand-edited settings.json can hold: not a number is off, as `scopesFor` and `longerOffer` read it.
  for (const minutes of [0, -5, 'x']) {
    w.settings.autoLockMinutes = 60;
    w.pickAnswers.push('4 hours');
    await gate.confirm(KEY, LOGIN);
    assert.notDeepEqual(instance.windowsFor('a1', KEY_ID), {}, `${minutes}: the control: a login window is open`);

    w.changeSetting('autoLockMinutes', minutes);

    assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, `${minutes}: the login window is not shown`);
    w.settings.autoLockMinutes = 60; // no event: the row reads the setting, so it hid the window; this shows whether it ENDED
    assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, `${minutes}: the login window ended, not merely hidden`);
  }
  assert.equal(w.infos.length, 3, 'told each time a login window was ended');

  w.settings.autoLockMinutes = 60;
  w.pickAnswers.push('4 hours');
  await gate.confirm(KEY, LOGIN);
  w.changeSetting('autoLockMinutes', 90);
  assert.notDeepEqual(instance.windowsFor('a1', KEY_ID), {}, 'a positive value ends nothing');
  link.dispose();
  w.changeSetting('autoLockMinutes', 0);
  w.settings.autoLockMinutes = 60; // no event: it only makes the reader answer 60 again (the row hides a window while it is 0)
  assert.notDeepEqual(instance.windowsFor('a1', KEY_ID), {}, 'a disposed link listens to nothing: the window was not ended');
  instance.dispose();
});

test('nothing this suite logged carries key material', () => {
  assert.deepEqual(keyMaterialLogged(), [], 'a log line carries key material');
});
