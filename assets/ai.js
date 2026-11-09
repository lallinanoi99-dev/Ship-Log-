// AI posts via the shared Worker (/ship/post, /ship/recap), with simple template posts as the fallback.
import { CONFIG } from './config.js';
import { templatePost, templateRecap, clip, LIMITS, chars } from './logic.js';

async function call(path, body) {
  if (!CONFIG.worker) throw new Error('no worker');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(CONFIG.worker.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`worker ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const safe = (s) => (chars(s) <= LIMITS.post ? s : clip(s, LIMITS.post));

/** → { post, thread: [3], source: 'ai' | 'template' } */
export async function makePost({ entry, commits, repoNames, tone, streak, mention }) {
  try {
    const r = await call('/ship/post', {
      entry: { shipped: entry.shipped, blocked: entry.blocked, next: entry.next, link: entry.link, tag: entry.tag, energy: entry.energy, commits: entry.commits },
      commits: commits.slice(0, 30),
      repos: repoNames,
      tone,
      streak,
      mention,
    });
    if (typeof r.post !== 'string' || !Array.isArray(r.thread)) throw new Error('bad reply');
    return { post: safe(r.post), thread: r.thread.slice(0, 3).map(safe), source: 'ai' };
  } catch {
    return { ...templatePost(entry, { tone, streak, commits: entry.commits, repoNames, mention }), source: 'template' };
  }
}

/** → { thread, source } */
export async function makeRecap({ entries, streak, tone, mention }) {
  try {
    const r = await call('/ship/recap', {
      entries: entries.map((e) => ({ day: e.day, shipped: e.shipped, blocked: e.blocked, next: e.next, tag: e.tag, commits: e.commits })),
      streak,
      tone,
      mention,
    });
    if (!Array.isArray(r.thread)) throw new Error('bad reply');
    return { thread: r.thread.slice(0, 8).map(safe), source: 'ai' };
  } catch {
    return { ...templateRecap(entries, { streak, mention }), source: 'template' };
  }
}
