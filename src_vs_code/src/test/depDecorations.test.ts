import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';

/**
 * The only API that can colour a tree row's LABEL.
 *
 * <p>The case that matters most here is the one that looks like an optimisation and is not: a
 * `FileDecorationProvider` is registered against the whole workbench, not against one view, so
 * VS Code asks this object about every file in the person's workspace on every repaint. If the
 * scheme check ever stops being the first thing it does, this extension starts charging an
 * editor it has nothing to do with.</p>
 */

class FakeThemeColor {
  constructor(readonly id: string) {}
}
class FakeFileDecoration {
  constructor(
    readonly badge?: string,
    readonly tooltip?: string,
    readonly color?: unknown,
  ) {}
}
class FakeEmitter {
  fired = 0;
  event = (): void => {};
  fire(): void {
    this.fired += 1;
  }
  dispose(): void {}
}

interface FakeUri {
  scheme: string;
  path: string;
}

const loaded = ((): {
  DepDecorationProvider: new (source: unknown) => {
    provideFileDecoration(uri: FakeUri): FakeFileDecoration | undefined;
    refresh(): void;
    dispose(): void;
  };
  depUri: (accountId: string, entityId: string) => FakeUri;
  parseDepUri: (uri: FakeUri) => { accountId: string; entityId: string } | undefined;
} => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        ThemeColor: FakeThemeColor,
        FileDecoration: FakeFileDecoration,
        EventEmitter: FakeEmitter,
        Uri: { from: (parts: FakeUri): FakeUri => parts },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    return require('../depDecorations') as never;
  } finally {
    loader._load = original;
  }
})();

const { DepDecorationProvider, depUri, parseDepUri } = loaded;

function sourceFor(
  answers: Record<string, { badge: string; tooltip: string; color?: string }>,
): {
  tintColorKey: (a: string, e: string) => string | undefined;
  relationLabel: (a: string, e: string) => { badge: string; tooltip: string } | undefined;
  asked: string[];
} {
  const asked: string[] = [];
  return {
    asked,
    tintColorKey: (a, e) => {
      asked.push(`tint:${a}:${e}`);
      return answers[e]?.color;
    },
    relationLabel: (a, e) => {
      asked.push(`label:${a}:${e}`);
      const answer = answers[e];
      return answer === undefined ? undefined : { badge: answer.badge, tooltip: answer.tooltip };
    },
  };
}

test('a row address survives the round trip, including characters that need escaping', () => {
  const uri = depUri('acc/one', 'e 1');
  assert.deepEqual(parseDepUri(uri), { accountId: 'acc/one', entityId: 'e 1' });
});

test('a foreign scheme is refused BEFORE anything is asked of the graph', () => {
  // Not a nicety: this provider is asked about every file in the workspace, on every repaint.
  const source = sourceFor({});
  const provider = new DepDecorationProvider(source);

  assert.equal(provider.provideFileDecoration({ scheme: 'file', path: '/src/index.ts' }), undefined);
  assert.equal(provider.provideFileDecoration({ scheme: 'git', path: '/x' }), undefined);
  assert.deepEqual(source.asked, [], 'the graph was consulted for a file that is not ours');
});

test('a path of the wrong shape is refused too', () => {
  const provider = new DepDecorationProvider(sourceFor({}));
  assert.equal(provider.provideFileDecoration({ scheme: 'credsdep', path: '/only-one' }), undefined);
});

test('a target carries its count and its colour', () => {
  const provider = new DepDecorationProvider(
    sourceFor({ v1: { badge: '2', tooltip: 'Depended on by 2: a, b', color: 'depColor7' } }),
  );
  const decoration = provider.provideFileDecoration(depUri('a1', 'v1'));

  assert.equal(decoration?.badge, '2');
  assert.equal(decoration?.tooltip, 'Depended on by 2: a, b');
  assert.equal((decoration?.color as FakeThemeColor).id, 'credSshManager.depColor7');
});

test('an entity in no relationship gets no decoration, not an empty one', () => {
  // An empty decoration still occupies the badge column; `undefined` is what leaves the row
  // exactly as it was.
  const provider = new DepDecorationProvider(sourceFor({}));
  assert.equal(provider.provideFileDecoration(depUri('a1', 'e1')), undefined);
});

test('a relationship whose colour has not been stamped still marks the row', () => {
  // The half-written state after a crash between the two saves: the dependency exists, the
  // target has no colour yet. The badge must still appear, or the relationship looks lost.
  const provider = new DepDecorationProvider(
    sourceFor({ e1: { badge: '●', tooltip: 'Depends on org meter' } }),
  );
  const decoration = provider.provideFileDecoration(depUri('a1', 'e1'));

  assert.equal(decoration?.badge, '●');
  assert.equal(decoration?.color, undefined);
});

test('a refresh asks VS Code to come back for every row, not for a list we would have to keep', () => {
  // One edit can move the colour of an arbitrary number of OTHER rows — everything depending
  // on the target whose colour changed — so enumerating them would be the index walk, twice.
  const provider = new DepDecorationProvider(sourceFor({}));
  provider.refresh();
  provider.refresh();
  const emitter = (provider as unknown as { emitter: FakeEmitter }).emitter;
  assert.equal(emitter.fired, 2);
});
