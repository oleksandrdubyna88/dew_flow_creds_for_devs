import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEP_COLOR_KEYS, depColorThemeId } from '../depColors';
import { loadWithVscode } from './vscodeStub';

/**
 * The one place a terminal gets a folder's colour: a key in, the `color` property of the creation options out.
 * `ThemeColor` is the stub's, which keeps the id it was built with.
 */

class ThemeColor {
  constructor(readonly id: string) {}
}

type Helper = typeof import('../terminalColor');

const { folderColorOption } = loadWithVscode<Helper>('../terminalColor', { ThemeColor });

test('each_key_gives_its_theme_colour', () => {
  for (const key of DEP_COLOR_KEYS) {
    const option = folderColorOption(key);
    assert.ok(option.color instanceof ThemeColor, `${key} gives a ThemeColor`);
    assert.equal((option.color as unknown as ThemeColor).id, depColorThemeId(key));
  }
});

test('no_key_gives_no_color_property', () => {
  const option = folderColorOption(undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(option, 'color'), false, 'the property is left out, not set to undefined');
  assert.deepEqual({ name: 'n', ...option }, { name: 'n' }, 'spread into creation options it adds nothing');
});
