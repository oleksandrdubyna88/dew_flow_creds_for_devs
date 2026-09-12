import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_RELEASE_PAGES,
  RELEASE_PER_PAGE,
  RELEASE_RETRY_MS,
  RELEASE_TTL_MS,
  SERVER_TAG_PREFIX,
  latestRelease,
  ReleaseFetch,
  newestOf,
  rememberedLatestRelease,
} from '../githubReleases';

/**
 * What is published, asked of GitHub — the one outbound call this extension makes to a host that
 * is not the person's own server.
 *
 * <p>The functions were private inside `binaryInstaller.ts`, which imports `vscode` and is
 * therefore untestable; the Server section needed the same answer for `server-v*`, so they were
 * EXTRACTED rather than copied. `fetch` is an argument here for the same reason it is one in
 * `corpApiClient.ts`: a test can then drive every branch without a network.</p>
 *
 * <p>Two things are measured rather than assumed, and both are the reason paging exists. Four tag
 * lines publish into ONE release list, and the extension ships far more often than the server —
 * 72 `extension-v*` tags against 13 `server-v*` on this checkout. A single page of 30 works today
 * and closes silently after one quiet quarter on the server, answering "up to date" for a server
 * that is a year behind.</p>
 */

interface Release {
  tag_name?: unknown;
}

/** A fetcher over fixed pages, recording every URL it was asked for. */
function pages(...byPage: Release[][]): {
  fetcher: (url: string, init: RequestInit) => Promise<Response>;
  urls: string[];
  inits: RequestInit[];
} {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  return {
    urls,
    inits,
    fetcher: (url: string, init: RequestInit): Promise<Response> => {
      urls.push(url);
      inits.push(init);
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      const body = byPage[page - 1] ?? [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: (): Promise<unknown> => Promise.resolve(body),
      } as unknown as Response);
    },
  };
}

/** `n` releases of a prefix this caller does not want — a FULL page, so the walk goes on. */
function filler(n: number, tag: string): Release[] {
  return Array.from({ length: n }, (_unused, at) => ({ tag_name: `${tag}${at}.0.0` }));
}

test('the newest is chosen NUMERICALLY, even when the older one is listed first', () => {
  // The list is newest-first by PUBLICATION, which is nearly always version order and is not
  // guaranteed to be: a patch cut for an older line publishes last. And '0.10.0' < '0.9.0' as
  // strings, which is the comparison that would offer a downgrade as an update.
  const newest = newestOf(SERVER_TAG_PREFIX, [
    { tag_name: 'server-v0.9.0' },
    { tag_name: 'server-v0.10.0' },
  ]);

  assert.equal(newest, '0.10.0');
});

test('tags from the other three lines are not this line', () => {
  // Four tag lines publish into one list. `mcp-v0.5.1` read as a server release would announce an
  // update to a version that server will never have.
  const newest = newestOf(SERVER_TAG_PREFIX, [
    { tag_name: 'extension-v1.6.0' },
    { tag_name: 'cli-v0.1.5' },
    { tag_name: 'mcp-v0.5.1' },
    { tag_name: 'server-v0.6.0' },
  ]);

  assert.equal(newest, '0.6.0');
});

test('a list with none of this line, and a malformed entry, answer nothing rather than guessing', () => {
  assert.equal(newestOf(SERVER_TAG_PREFIX, [{ tag_name: 'cli-v0.1.5' }]), undefined);
  assert.equal(newestOf(SERVER_TAG_PREFIX, [{ tag_name: 42 }, {}]), undefined);
  assert.equal(newestOf(SERVER_TAG_PREFIX, []), undefined);
});

test('the request asks for a hundred, carries the agent, and carries NO Authorization', async () => {
  // Anonymous by construction: no token, no email, no account id, no server location. The whole
  // request is a public repository's public release list.
  const { fetcher, urls, inits } = pages([{ tag_name: 'server-v0.6.0' }]);

  assert.equal(await latestRelease(SERVER_TAG_PREFIX, fetcher), '0.6.0');

  assert.equal(urls.length, 1, 'a hit on the first page ends the walk');
  assert.match(urls[0], /per_page=100/);
  assert.match(urls[0], /page=1/);
  const headers = inits[0].headers as Record<string, string>;
  assert.equal(headers['User-Agent'], 'creds-for-devs');
  assert.equal(headers.Accept, 'application/vnd.github+json');
  assert.equal(
    Object.keys(headers).some((name) => name.toLowerCase() === 'authorization'),
    false,
    'the check must not be able to identify the person making it',
  );
});

test('it walks past FULL pages that hold only other tag lines, and finds the release on page three', async () => {
  // The measured trap: 72 extension tags against 13 server ones. A hundred mixed releases can hold
  // zero `server-v*` ones once the server has been quiet long enough, and a single page would then
  // answer "up to date" for a server that is a year behind.
  const { fetcher, urls } = pages(
    filler(RELEASE_PER_PAGE, 'extension-v'),
    filler(RELEASE_PER_PAGE, 'extension-v'),
    [{ tag_name: 'server-v0.6.0' }],
  );

  assert.equal(await latestRelease(SERVER_TAG_PREFIX, fetcher), '0.6.0');
  assert.deepEqual(
    urls.map((url) => new URL(url).searchParams.get('page')),
    ['1', '2', '3'],
  );
});

test('a SHORT page is the last page, so the walk stops there rather than asking for more', async () => {
  const { fetcher, urls } = pages(filler(3, 'extension-v'));

  assert.equal(await latestRelease(SERVER_TAG_PREFIX, fetcher), undefined);
  assert.equal(urls.length, 1, 'fewer than a full page means there is no next one');
});

test('the walk gives up at the cap rather than paging for ever', async () => {
  // 500 releases is more than every tag line here has published together (97 tags today), so
  // reaching the cap means something is wrong with the question, not with the answer.
  const { fetcher, urls } = pages(...Array.from({ length: 9 }, () => filler(RELEASE_PER_PAGE, 'extension-v')));

  assert.equal(await latestRelease(SERVER_TAG_PREFIX, fetcher), undefined);
  assert.equal(urls.length, MAX_RELEASE_PAGES);
});

test('a refusal and a throw both mean "cannot tell you", and neither reaches the caller', async () => {
  const refusing = (): Promise<Response> =>
    Promise.resolve({ ok: false, status: 403, json: (): Promise<unknown> => Promise.resolve([]) } as unknown as Response);
  const throwing = (): Promise<Response> => Promise.reject(new Error('getaddrinfo ENOTFOUND'));

  assert.equal(await latestRelease(SERVER_TAG_PREFIX, refusing), undefined);
  assert.equal(
    await latestRelease(SERVER_TAG_PREFIX, throwing),
    undefined,
    'offline, rate-limited and behind a refusing proxy all mean the same thing to the person',
  );
});

test('a fresh memo is served without a second fetch — six hours, one entry, in memory', async () => {
  const { fetcher, urls } = pages([{ tag_name: 'server-v0.6.0' }]);

  const first = await rememberedLatestRelease(SERVER_TAG_PREFIX, undefined, 1_000, fetcher);
  assert.deepEqual(first, { version: '0.6.0', at: 1_000 });

  const second = await rememberedLatestRelease(SERVER_TAG_PREFIX, first, 1_000 + RELEASE_TTL_MS - 1, fetcher);

  assert.deepEqual(second, first);
  assert.equal(urls.length, 1, 'an editor left open for a week must not make three hundred requests');
});

test('past the window it asks again', async () => {
  const { fetcher, urls } = pages([{ tag_name: 'server-v0.7.0' }]);
  const stale = { version: '0.6.0', at: 1_000 };

  const next = await rememberedLatestRelease(SERVER_TAG_PREFIX, stale, 1_000 + RELEASE_TTL_MS, fetcher);

  assert.deepEqual(next, { version: '0.7.0', at: 1_000 + RELEASE_TTL_MS });
  assert.equal(urls.length, 1);
});

test('a check that could NOT tell keeps the previous answer and does not start a six-hour silence', async () => {
  // Remembering a failure as a full TTL would mean one moment offline costs the update hint for the
  // rest of the day. Remembering NOTHING was the other extreme, and it is the one the code round
  // caught: the next readiness tick walked every page again, and there is a tick on activation, on
  // unlock and on lock. So a failure waits RELEASE_RETRY_MS — minutes, not hours.
  const throwing = (): Promise<Response> => Promise.reject(new Error('offline'));
  const known = { version: '0.6.0', at: 1_000 };

  const kept = await rememberedLatestRelease(SERVER_TAG_PREFIX, known, 1_000 + RELEASE_TTL_MS, throwing);
  assert.equal(kept.version, '0.6.0', 'the version survives');
  assert.equal(kept.at, known.at, 'and is not restamped as though it were fresh');

  const nothing = await rememberedLatestRelease(SERVER_TAG_PREFIX, undefined, 5_000, throwing);
  assert.equal(nothing.version, '', 'with nothing to keep, it is simply unknown');

  const { fetcher, urls } = pages([{ tag_name: 'server-v0.6.0' }]);
  await rememberedLatestRelease(SERVER_TAG_PREFIX, nothing, 5_000 + RELEASE_RETRY_MS + 1, fetcher);
  assert.equal(urls.length, 1, 'and once the short window passes, the next cycle asks again');
  assert.ok(RELEASE_RETRY_MS < RELEASE_TTL_MS, 'a failure waits far less than a success');
});

/**
 * The code round's findings, each as the test that would have caught it.
 */

test('the newest release is the newest across every page, not the first page that has one', () => {
  // GitHub pages are newest-first by PUBLICATION, which is not version order — a patch cut for an
  // older line publishes last. The walk stopped at the first page holding any match, so a page-one
  // backport hid a higher version on page two and the Version row called the deployment current.
  const page1 = Array.from({ length: RELEASE_PER_PAGE }, (_unused, i) =>
    (i === 0 ? { tag_name: 'server-v0.9.1' } : { tag_name: `extension-v1.${i}.0` }));
  const page2 = [{ tag_name: 'server-v0.10.0' }];

  return latestRelease('server-v', pagedFetcher([page1, page2])).then((found) => {
    assert.equal(found, '0.10.0', 'the higher version is on the second page');
  });
});

test('a check that could not tell waits before asking again, and keeps what it had', async () => {
  // An unstamped failure made the next readiness tick walk every page again — and there is a tick
  // on activation, on unlock and on lock. That is an anonymous quota of sixty an hour spent in a
  // minute, after which nothing can be asked at all.
  let calls = 0;
  const refusing = (): Promise<Response> => {
    calls += 1;
    return Promise.reject(new Error('offline'));
  };

  const first = await rememberedLatestRelease('server-v', { version: '0.6.0', at: 1 }, 1 + RELEASE_TTL_MS + 1, refusing);
  assert.equal(first.version, '0.6.0', 'the previous answer is kept');
  assert.ok((first.failedAt ?? 0) > 0, 'and the attempt is remembered');

  const second = await rememberedLatestRelease('server-v', first, (first.failedAt ?? 0) + 1, refusing);
  assert.equal(calls, 1, 'the next tick does not ask again inside the retry window');
  assert.equal(second.version, '0.6.0');

  const later = await rememberedLatestRelease('server-v', first, (first.failedAt ?? 0) + RELEASE_RETRY_MS + 1, refusing);
  assert.equal(calls, 2, 'and it does ask once the window has passed');
  assert.equal(later.version, '0.6.0', 'still keeping what it had');
});

test('every release request carries a deadline, so a socket held open cannot stop the repaint', async () => {
  const seen: (RequestInit | undefined)[] = [];
  const noting = (_url: string, init: RequestInit): Promise<Response> => {
    seen.push(init);
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as unknown as Response);
  };

  await latestRelease('server-v', noting);

  assert.equal(seen.length, 1);
  assert.ok(seen[0]?.signal !== undefined, 'a request with no deadline can never return');
});

/** Pages handed out in order, then empty — the shape `walk` reads. */
function pagedFetcher(pages: readonly (readonly { tag_name: string }[])[]): ReleaseFetch {
  let at = 0;
  return () => {
    const page = pages[at] ?? [];
    at += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(page) } as unknown as Response);
  };
}
