import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ENTITY_KINDS, EntityKind, TreeNode } from '../types';

/**
 * What a tree row looks like (audit A3).
 *
 * <p>Two guarantees, one of them security.</p>
 *
 * <p><b>The tooltip must not render markdown it did not write.</b> An entity's name, host, key
 * path and notes can arrive from another person through an accepted share, so a tooltip built
 * with `appendMarkdown` would let a sender embed a link, an image that phones home when the row
 * is hovered, or a command URI. `appendText` escapes every metacharacter and `isTrusted` stays
 * false; the tests below assert the escaping actually happened rather than that the right method
 * was called.</p>
 *
 * <p><b>Every entity kind has an icon.</b> The switch has no `default` on purpose (audit A4), so
 * a kind added to `ENTITY_KINDS` without one is a compile error rather than a padlock that
 * silently stands in for the new type. A compile error is invisible to a test, so what is
 * checked here is the other half: that the mapping is total today, and that no two kinds
 * accidentally share the icon that makes them tellable apart.</p>
 */

type Icons = typeof import('../treeIcons');

interface Markdown {
  value: string;
  isTrusted: boolean;
  supportThemeIcons: boolean;
  appendedAsMarkdown: string[];
}

interface World {
  mod: Icons;
  /** Every MarkdownString built during the test. */
  markdowns: Markdown[];
}

function world(): World {
  const w: World = { mod: undefined as never, markdowns: [] };

  class StubMarkdownString implements Markdown {
    value = '';
    isTrusted = false;
    supportThemeIcons = true;
    readonly appendedAsMarkdown: string[] = [];

    constructor() {
      w.markdowns.push(this);
    }

    /** Escapes, as VS Code's does — that escaping is what the test is about. */
    appendText(text: string): this {
      this.value += text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, (c) => `\\${c}`);
      return this;
    }

    appendMarkdown(text: string): this {
      this.appendedAsMarkdown.push(text);
      this.value += text;
      return this;
    }
  }

  w.mod = loadWithVscode<Icons>('../treeIcons', {
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    ThemeIcon: class {
      constructor(
        readonly id: string,
        readonly color?: { id: string },
      ) {}
    },
    MarkdownString: StubMarkdownString,
  });
  return w;
}

const node = (name: string, details: Record<string, unknown> = {}): TreeNode =>
  ({ id: 'e1', name, type: 'entity', details: { id: 'e1', name, ...details } }) as unknown as TreeNode;

test('every entity kind has an icon, and none is left to a fallback', () => {
  const w = world();

  for (const kind of ENTITY_KINDS) {
    const icon = w.mod.kindIcon(kind);
    assert.ok(icon.length > 0, `${kind} has no icon`);
  }
});

test('no two kinds share an icon — the icon is what tells a row apart at a glance', () => {
  const w = world();

  const icons = ENTITY_KINDS.map((k) => w.mod.kindIcon(k));

  assert.equal(new Set(icons).size, icons.length, icons.join());
});

test('an unknown kind throws rather than quietly painting a padlock', () => {
  // The `assertNever` default. A kind this build does not know is a bug in this build, and a
  // silent fallback is what made a script entity look like a credential once already.
  const w = world();

  assert.throws(() => w.mod.kindIcon('not-a-kind' as EntityKind), /kindIcon/);
});

test('a folder of each type gets that type’s icon, always coloured', () => {
  // The colour is what stops a folder blending into the items inside it — and the ICON is what
  // the title of this test always promised and never checked. It asserted the colour alone, so
  // `script` and `config` folders fell through to the generic fallback and passed: the two types
  // `defaultFolders.ts` SEEDS, which is why every vault this product ever created had two
  // folders with no icon on them.
  const w = world();

  for (const kind of ENTITY_KINDS) {
    const icon = w.mod.folderIcon(kind) as unknown as { id: string; color?: { id: string } };
    assert.equal(icon.color?.id, 'credSshManager.folderIcon', `${kind} folder is uncoloured`);
    assert.equal(icon.id, w.mod.kindIcon(kind), `a ${kind} folder does not wear the ${kind} icon`);
  }
});

test('a folder with NO type, or a type this build does not know, still gets a folder icon', () => {
  // Unlike an entity kind, an unknown folder type is ordinary: a vault written by a newer build
  // can carry one, and refusing to draw the row would hide its contents entirely.
  const w = world();

  const untyped = w.mod.folderIcon(undefined) as unknown as { id: string };
  const unknown = w.mod.folderIcon('from-a-newer-build' as never) as unknown as { id: string };

  assert.equal(untyped.id, 'folder');
  assert.equal(unknown.id, 'folder');
});

test('the tooltip is never trusted, and never renders theme icons', () => {
  // `isTrusted` gates command URIs. A shared entity whose name is a `command:` link would
  // otherwise run something when the row is hovered.
  const w = world();

  w.mod.buildTooltip(node('prod'));

  assert.equal(w.markdowns[0].isTrusted, false);
  assert.equal(w.markdowns[0].supportThemeIcons, false);
});

test('a shared entity’s NAME cannot inject markdown into the tooltip', () => {
  // Names arrive from other people through accepted shares.
  const w = world();

  w.mod.buildTooltip(node('[click me](https://evil.example/steal)'));

  assert.deepEqual(w.markdowns[0].appendedAsMarkdown, [], 'nothing was appended as markdown');
  assert.ok(!w.markdowns[0].value.includes('](https'), w.markdowns[0].value);
});

test('a shared entity’s NOTES cannot embed an image that phones home on hover', () => {
  // The worst version: `![](https://attacker/…)` fetches on render, so merely hovering the row
  // would tell a sender that a recipient still holds their entry — and from which IP.
  const w = world();

  w.mod.buildTooltip(node('prod', { notes: '![x](https://attacker.example/beacon.png)' }));

  assert.deepEqual(w.markdowns[0].appendedAsMarkdown, []);
  assert.ok(!w.markdowns[0].value.includes('![x]('), w.markdowns[0].value);
});

test('a host and user that look like markdown are shown as text', () => {
  const w = world();

  w.mod.buildTooltip(node('prod', { host: '**bold.example**', user: '`whoami`' }));

  const value = w.markdowns[0].value;
  // Read back the way a person sees it: the escaping is what the test is about, so the
  // assertion strips the backslashes rather than pretending they are not there.
  const rendered = value.replace(/\\(.)/g, '$1');
  assert.ok(rendered.includes('bold.example'), `the host is unreadable: ${value}`);
  assert.ok(!value.includes('**bold.example**'), `the asterisks were left live: ${value}`);
  assert.ok(!value.includes('`whoami`'), 'and so were the backticks');
});

test('the tooltip says what a click will do, and it differs with a host', () => {
  // An entity with a host connects on the play button; one without opens details. The line is
  // the only place that distinction is stated.
  const w = world();

  w.mod.buildTooltip(node('with-host', { host: 'h' }));
  w.mod.buildTooltip(node('no-host'));

  assert.match(w.markdowns[0].value, /connects SSH/);
  assert.ok(!w.markdowns[1].value.includes('connects SSH'));
});

test('a field that is absent contributes no empty row', () => {
  // "Host: " with nothing after it reads as a broken entity rather than an unset field.
  const w = world();

  w.mod.buildTooltip(node('bare'));

  assert.ok(!w.markdowns[0].value.includes('Host'), w.markdowns[0].value);
  assert.ok(!w.markdowns[0].value.includes('User'), w.markdowns[0].value);
});

test('port 0 is shown — a numeric field must not be dropped for being falsy', () => {
  // `if (port)` would hide it; the code checks for undefined, and this is what holds it there.
  const w = world();

  w.mod.buildTooltip(node('odd', { port: 0 }));

  assert.match(w.markdowns[0].value, /Port/);
});
