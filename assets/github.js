// Today's commits from public GitHub repos (no login). Unauthenticated API: 60 requests / hour / IP,
// so results are cached for 5 minutes per repo + day. Only the count goes on-chain.
import { DAY_MS } from './logic.js';

const TTL = 5 * 60 * 1000;
const cacheKey = (repo, day, author) => `shiplog.gh.${repo}.${day}.${author || ''}`.toLowerCase();

export class GitHubError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Commits pushed to `repo` during the UTC `day` (same day as the chain). */
export async function commitsFor(repo, day, author = '') {
  const key = cacheKey(repo, day, author);
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.t < TTL) return hit.list;
  } catch { /* ignore */ }

  const since = new Date(day * DAY_MS).toISOString();
  const until = new Date((day + 1) * DAY_MS - 1000).toISOString();
  const q = new URLSearchParams({ since, until, per_page: '100' });
  if (author) q.set('author', author);
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/commits?${q}`, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new GitHubError('network', 'Commits unavailable right now — enter a number.');
  }
  if (res.status === 403 || res.status === 429) throw new GitHubError('rate', 'Commits unavailable right now — enter a number.');
  if (res.status === 404) throw new GitHubError('missing', `${repo} wasn’t found (is it public?)`);
  if (res.status === 409) return []; // empty repo
  if (!res.ok) throw new GitHubError('error', 'Commits unavailable right now — enter a number.');
  const data = await res.json();
  const list = (Array.isArray(data) ? data : []).map((c) => ({
    sha: c.sha,
    message: String(c.commit?.message || '').split('\n')[0].slice(0, 120),
    url: c.html_url,
  }));
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), list })); } catch { /* ignore */ }
  return list;
}

/** Fetches every repo; never throws — each result is { repo, list } or { repo, error }. */
export async function commitsToday(repos, day, author) {
  return Promise.all(repos.map(async (repo) => {
    try { return { repo, list: await commitsFor(repo, day, author) }; } catch (e) { return { repo, error: e }; }
  }));
}
