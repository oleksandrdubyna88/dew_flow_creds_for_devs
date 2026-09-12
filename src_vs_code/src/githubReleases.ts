import { compareVersions, versionFromTag } from './credsInstall';

/**
 * What is published, asked of GitHub's release list.
 *
 * <p>Extracted from `binaryInstaller.ts` (2026-09-12), where `latestVersion` and `newestOf` were
 * private inside a module that imports `vscode` — untestable, and unreusable by the Server section
 * that needs exactly the same answer for `server-v*`. A second copy would have started identical
 * and drifted at the first fix, which is the argument `credsInstall.ts` already makes about its own
 * half.</p>
 *
 * <p>`vscode`-free, so every branch below is a unit test (repository rule 3), and `fetch` is an
 * argument for the same reason it is one in `corpApiClient.ts`: a fake fetcher is what lets a test
 * drive the paging, the cap and the refusals without a network.</p>
 *
 * <p><b>It carries nothing that identifies anybody.</b> A `GET` to a public repository's public
 * release list, with an `Accept` and a `User-Agent`: no token, no email, no account id, no server
 * location. Unauthenticated, and therefore subject to GitHub's per-IP anonymous limit — which is
 * what the memo below is sized against.</p>
 */

/** The release tag line the vault server publishes under. */
export const SERVER_TAG_PREFIX = 'server-v';

/** The public list. The only host this extension asks that is not the person's own server. */
const RELEASES_URL = 'https://api.github.com/repos/oleksandrdubyna88/dew_flow_creds_for_devs/releases';

/**
 * A hundred per page, not thirty.
 *
 * <p>Four tag lines publish into ONE list, and the extension ships far more often than the server:
 * 72 `extension-v*` tags against 13 `server-v*` on this checkout, with `server-v0.6.0` the fourth
 * newest and eleven releases between it and the one before it. Thirty works today with real
 * headroom — and closes silently after a single quiet quarter on the server, answering "up to
 * date" for a deployment that is a year behind.</p>
 */
export const RELEASE_PER_PAGE = 100;

/**
 * How far the walk goes before giving up.
 *
 * <p>A hundred mixed releases can still hold zero of one line once that line has been quiet long
 * enough, so a single page is not enough either. Five pages is 500 releases — more than every tag
 * line here has published together (97 tags today) — and reaching the cap means something is wrong
 * with the question rather than with the answer.</p>
 */
export const MAX_RELEASE_PAGES = 5;

/** How long one answer about what is published is reused. */
export const RELEASE_TTL_MS = 6 * 60 * 60 * 1000;

/** The `fetch` this module calls, as an argument — the shape `corpApiClient.ts` already uses. */
export interface ReleaseFetch {
  (url: string, init: RequestInit): Promise<Response>;
}

/** One release, as much of it as this module reads. */
interface ReleaseRow {
  tag_name?: unknown;
}

/**
 * The newest published version for one tag line, or nothing when this list holds none of it.
 *
 * <p>The list is newest-first by PUBLICATION, which is nearly always version order and is not
 * guaranteed to be: a patch cut for an older line publishes last. Compared numerically through
 * `compareVersions` for the same reason that function exists — `'0.10.0' < '0.9.0'` as strings,
 * which offers a downgrade as an update exactly once the tenth minor ships.</p>
 */
export function newestOf(tagPrefix: string, releases: readonly ReleaseRow[]): string | undefined {
  const versions = releases.flatMap((release) => {
    const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
    const version = versionFromTag({ tagPrefix }, tag);
    return version === undefined ? [] : [version];
  });
  return versions.length === 0 ? undefined : versions.sort((a, b) => compareVersions(b, a))[0];
}

/**
 * The newest published version of one tag line, or nothing when it cannot be told.
 *
 * <p>Offline, rate-limited, or behind a proxy that refuses: all of them mean the same thing to the
 * person — "cannot tell you what is published" — and none is worth a stack trace. The caller draws
 * nothing rather than an error.</p>
 */
export async function latestRelease(
  tagPrefix: string,
  fetcher: ReleaseFetch = fetch,
): Promise<string | undefined> {
  try {
    return await walk(tagPrefix, fetcher);
  } catch {
    return undefined;
  }
}

/** Page until this line is found, until a short page says there are no more, or until the cap. */
async function walk(tagPrefix: string, fetcher: ReleaseFetch): Promise<string | undefined> {
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const releases = await pageOf(fetcher, page);
    const found = newestOf(tagPrefix, releases);
    if (found !== undefined || releases.length < RELEASE_PER_PAGE) {
      return found;
    }
  }
  return undefined;
}

/** One page, or an empty one — which a refused request and the end of the list both are. */
async function pageOf(fetcher: ReleaseFetch, page: number): Promise<readonly ReleaseRow[]> {
  const response = await fetcher(
    `${RELEASES_URL}?per_page=${RELEASE_PER_PAGE}&page=${page}`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'creds-for-devs' } },
  );
  if (!response.ok) {
    return [];
  }
  const body: unknown = await response.json();
  return Array.isArray(body) ? (body as ReleaseRow[]) : [];
}

/**
 * One remembered answer about what is published.
 *
 * <p>In memory, for a session, and ONE entry rather than one per account — the repository is the
 * same for everybody. Never `globalState`: nothing here is worth surviving a reload, and a memo
 * that outlives the window is a memo that accumulates.</p>
 */
export interface ReleaseMemo {
  /** The newest published version, or `''` when nobody has managed to ask yet. */
  readonly version: string;
  /** When this answer was READ. `0` means it is not an answer, so the next cycle may ask. */
  readonly at: number;
}

/** Nothing known yet, and nothing stopping the next cycle from finding out. */
const NOTHING_KNOWN: ReleaseMemo = { version: '', at: 0 };

/**
 * The published version, from the memo while it is fresh and from GitHub otherwise.
 *
 * <p>Six hours, because a release cadence of days does not need a tighter answer and an editor left
 * open for a week would otherwise make three hundred requests. <b>A check that could not tell keeps
 * the previous answer</b> and does not stamp itself: one moment offline must not cost the update
 * hint for the rest of the day.</p>
 */
export async function rememberedLatestRelease(
  tagPrefix: string,
  memo: ReleaseMemo | undefined,
  now: number,
  fetcher?: ReleaseFetch,
): Promise<ReleaseMemo> {
  if (isFresh(memo, now)) {
    return memo;
  }
  const version = await latestRelease(tagPrefix, fetcher);
  return version === undefined ? (memo ?? NOTHING_KNOWN) : { version, at: now };
}

function isFresh(memo: ReleaseMemo | undefined, now: number): memo is ReleaseMemo {
  return memo !== undefined && memo.at > 0 && now - memo.at < RELEASE_TTL_MS;
}
