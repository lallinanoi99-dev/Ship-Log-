// Pure Ship Log logic — no DOM, no network. Shared by the app, the Worker and the tests.

export const DAY_MS = 86_400_000;

export const TAGS = [
  { id: 0, key: 'building', label: 'Building', emoji: '🔨', color: '#3B82F6' },
  { id: 1, key: 'fixing', label: 'Fixing', emoji: '🩹', color: '#F59E0B' },
  { id: 2, key: 'designing', label: 'Designing', emoji: '🎨', color: '#EC4899' },
  { id: 3, key: 'learning', label: 'Learning', emoji: '📚', color: '#8B5CF6' },
  { id: 4, key: 'launching', label: 'Launching', emoji: '🚀', color: '#FF5A36' },
  { id: 5, key: 'resting', label: 'Resting', emoji: '🌙', color: '#9A958C' },
];
export const RESTING = 5;
export const LAUNCHING = 4;
export const ENERGY = [
  { id: 0, label: 'low', icon: '🪫' },
  { id: 1, label: 'mid', icon: '🔋' },
  { id: 2, label: 'high', icon: '⚡' },
];
export const TONES = ['casual', 'proud', 'funny', 'minimal'];

export const LIMITS = { shipped: 140, blocked: 100, next: 100, link: 200, bio: 100, repos: 5, post: 280 };

// ------------------------------------------------------------------ days (UTC, like the contract)
export const utcDay = (ms = Date.now()) => Math.floor(ms / DAY_MS);
/** Day 0 (1 Jan 1970) was a Thursday; +3 makes weeks start on Monday — same as the contract. */
export const weekOf = (day) => Math.floor((day + 3) / 7);
export const dayToDate = (day) => new Date(day * DAY_MS);
export const isoDay = (day) => dayToDate(day).toISOString().slice(0, 10);
/** 0 = Sunday … 6 = Saturday */
export const weekday = (day) => (day + 4) % 7;

export function formatDay(day, opts = {}) {
  return dayToDate(day).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: opts.weekday ?? 'long', month: 'short', day: 'numeric', year: opts.year ? 'numeric' : undefined });
}
export function formatTime(sec, tz) {
  try {
    return new Date(sec * 1000).toLocaleTimeString('en-US', { timeZone: tz || undefined, hour: 'numeric', minute: '2-digit' });
  } catch {
    return new Date(sec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

// ------------------------------------------------------------------ streaks
/** Replays the contract's streak rule over a list of logged days (ascending, unique). */
export function replayStreak(days) {
  let streak = 0, best = 0, last = 0, freezeWeek = 0;
  for (const d of days) {
    if (d === last) continue;
    let s = 1;
    if (last && last + 1 === d) s = streak + 1;
    else if (last && last + 2 === d) {
      const w = weekOf(d - 1) + 1;
      if (freezeWeek !== w) { freezeWeek = w; s = streak + 1; }
    }
    streak = s; best = Math.max(best, s); last = d;
  }
  return { streak, best, lastDay: last, freezeWeek };
}

/**
 * The streak as it stands today. The stored streak only changes when you log, so a broken streak still
 * shows its old value on-chain until the next entry — this works out what it is right now.
 * state: 'today' (logged today) · 'alive' (log today to keep it) · 'freeze' (missed yesterday, a freeze will cover it) · 'broken' · 'none'
 */
export function liveStreak(p, today = utcDay()) {
  if (!p || !p.lastDay) return { value: 0, state: 'none' };
  if (p.lastDay === today) return { value: p.streak, state: 'today' };
  if (p.lastDay === today - 1) return { value: p.streak, state: 'alive' };
  if (p.lastDay === today - 2 && p.freezeWeek !== weekOf(today - 1) + 1) return { value: p.streak, state: 'freeze' };
  return { value: 0, state: 'broken' };
}

/** What logging today would do to the streak. */
export function nextStreak(p, today = utcDay()) {
  if (!p || !p.lastDay) return { value: 1, fresh: true, freeze: false };
  if (p.lastDay === today) return { value: p.streak, fresh: false, freeze: false, update: true };
  if (p.lastDay === today - 1) return { value: p.streak + 1, fresh: false, freeze: false };
  if (p.lastDay === today - 2 && p.freezeWeek !== weekOf(today - 1) + 1) return { value: p.streak + 1, fresh: false, freeze: true };
  return { value: 1, fresh: true, freeze: false, broke: p.streak > 0 };
}

// ------------------------------------------------------------------ validation
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const cleanHandle = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();
export function handleIssue(h) {
  if (!h) return 'Pick a handle.';
  if (h.length < 3) return 'At least 3 characters.';
  if (h.length > 20) return '20 characters max.';
  if (!HANDLE_RE.test(h)) return 'Only a–z, 0–9 and _.';
  if (flagged(h)) return 'Pick a different handle.';
  return '';
}

export const chars = (s) => [...String(s || '')].length;
export const byteLength = (s) => new TextEncoder().encode(String(s || '')).length;
export const clip = (s, n) => [...String(s || '')].slice(0, n).join('');
export const oneLine = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
/** "owner/repo, https://github.com/owner/repo" → ['owner/repo', …] */
export function parseRepos(text) {
  const out = [];
  for (let part of String(text || '').split(/[\s,]+/)) {
    part = part.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (!part) continue;
    const [o, r] = part.split('/');
    const repo = o && r ? `${o}/${r}` : part;
    if (!out.some((x) => x.toLowerCase() === repo.toLowerCase())) out.push(repo);
  }
  return out;
}
export const repoIssue = (repos) => {
  if (repos.length > LIMITS.repos) return `Up to ${LIMITS.repos} repos.`;
  const bad = repos.find((r) => !REPO_RE.test(r));
  return bad ? `“${bad}” isn't owner/repo.` : '';
};
export const reposToString = (repos) => repos.join(',');
export const reposFromString = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export function cleanLink(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.href.length <= LIMITS.link ? u.href : null;
  } catch {
    return null;
  }
}

// A small word filter: catches obvious slurs/abuse. Not perfect — curators can hide builders from Explore.
const BAD = ['nigger', 'nigga', 'faggot', 'retard', 'kike', 'spic', 'chink', 'tranny', 'cunt', 'whore', 'rape', 'kys', 'killyourself', 'porn', 'xxx', 'onlyfans'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
export function flagged(text) {
  const t = String(text || '').toLowerCase().replace(/[013457@$]/g, (c) => LEET[c]);
  const words = t.split(/[^a-z]+/).filter(Boolean);
  const squashed = t.replace(/[^a-z]/g, '');
  return BAD.some((b) => words.includes(b) || (b.length >= 5 && squashed.includes(b)));
}

/** Returns { field: message } for anything wrong with an entry draft. */
export function entryIssues(e) {
  const issues = {};
  if (!oneLine(e.shipped)) issues.shipped = 'Write one line about what you shipped.';
  if (chars(e.shipped) > LIMITS.shipped) issues.shipped = `${LIMITS.shipped} characters max.`;
  if (chars(e.blocked) > LIMITS.blocked) issues.blocked = `${LIMITS.blocked} characters max.`;
  if (chars(e.next) > LIMITS.next) issues.next = `${LIMITS.next} characters max.`;
  if (e.link && cleanLink(e.link) === null) issues.link = 'That doesn’t look like a web link.';
  for (const k of ['shipped', 'blocked', 'next']) if (!issues[k] && flagged(e[k])) issues[k] = 'Please keep it friendly — try different words.';
  if (!(e.tag >= 0 && e.tag < TAGS.length)) issues.tag = 'Pick a tag.';
  if (!(e.energy >= 0 && e.energy < ENERGY.length)) issues.energy = 'Pick your energy.';
  if (!(e.commits >= 0 && e.commits <= 65535)) issues.commits = 'Commits must be 0–65535.';
  return issues;
}

// ------------------------------------------------------------------ heatmap
export function level(entry) {
  if (!entry) return 0;
  const c = entry.commits || 0;
  if (c === 0) return 1;
  if (c <= 3) return 2;
  if (c <= 8) return 3;
  return 4;
}
/**
 * Columns of 7 days (Mon→Sun) ending with the week that holds `today`.
 * Each cell: { day, entry|null, level, future }.
 */
export function heatmapWeeks(entries, today = utcDay(), weeks = 52) {
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const thisMonday = today - ((weekday(today) + 6) % 7);
  const start = thisMonday - (weeks - 1) * 7;
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const day = start + w * 7 + i;
      const entry = byDay.get(day) || null;
      col.push({ day, entry, level: level(entry), future: day > today });
    }
    cols.push(col);
  }
  return cols;
}

// ------------------------------------------------------------------ posts (fallback templates + X intent)
export const HASHTAGS = '#buildinpublic #BOTChain';
export const MENTION = '@BOTChain_ai';

const fit = (s, n = LIMITS.post) => (chars(s) <= n ? s : clip(s, n - 1).replace(/\s+\S*$/, '') + '…');

/** A simple post written from the entry alone — used when the AI is off or fails. */
export function templatePost(entry, opts = {}) {
  const { tone = 'casual', streak = 0, commits = 0, repoNames = [], mention = false } = opts;
  const tags = HASHTAGS + (mention ? ` ${MENTION}` : '');
  const dayBit = streak > 1 ? `Day ${streak} 🔥` : 'Day 1 🌱';
  const commitBit = commits ? `${commits} commit${commits === 1 ? '' : 's'}${repoNames.length ? ` in ${repoNames.join(', ')}` : ''}` : '';
  const shipped = oneLine(entry.shipped);
  const lines = {
    casual: [`${dayBit} of building in public.`, `Shipped: ${shipped}`, commitBit && `(${commitBit})`, entry.next && `Next up: ${oneLine(entry.next)}`],
    proud: [`${dayBit} — shipped it.`, `✅ ${shipped}`, commitBit && `📦 ${commitBit}`, entry.next && `➡️ Next: ${oneLine(entry.next)}`],
    funny: [`${dayBit}. Still shipping, somehow.`, `Today’s damage: ${shipped}`, commitBit && `${commitBit}, all of them on purpose.`, entry.blocked && `Boss fight: ${oneLine(entry.blocked)}`],
    minimal: [`${dayBit}`, `🚀 ${shipped}`, entry.next && `➡️ ${oneLine(entry.next)}`],
  }[TONES.includes(tone) ? tone : 'casual'].filter(Boolean);
  let post = lines.join('\n') + '\n\n' + tags;
  if (chars(post) > LIMITS.post) post = fit(lines.slice(0, 2).join('\n'), LIMITS.post - chars(tags) - 2) + '\n\n' + tags;
  const thread = [
    fit(`${dayBit} of building in public. Here’s what happened today 🧵`),
    fit(`🚀 Shipped: ${shipped}${commitBit ? `\n📦 ${commitBit}` : ''}`),
    fit([entry.blocked && `🧱 Blocked: ${oneLine(entry.blocked)}`, entry.next && `➡️ Next: ${oneLine(entry.next)}`, tags].filter(Boolean).join('\n')),
  ];
  return { post, thread };
}

/** A simple weekly recap thread from up to 7 entries — the fallback for /ship/recap. */
export function templateRecap(entries, opts = {}) {
  const { streak = 0, mention = false } = opts;
  const tags = HASHTAGS + (mention ? ` ${MENTION}` : '');
  const list = [...entries].sort((a, b) => a.day - b.day).slice(-7);
  const commits = list.reduce((n, e) => n + (e.commits || 0), 0);
  const head = fit(`My week in public: ${list.length} day${list.length === 1 ? '' : 's'} logged${commits ? `, ${commits} commits` : ''}${streak > 1 ? `, streak at ${streak} 🔥` : ''}. Recap 🧵`);
  const body = [];
  let cur = '';
  for (const e of list) {
    const line = `${formatDay(e.day, { weekday: 'short' }).split(',')[0]}: ${oneLine(e.shipped)}`;
    if (cur && chars(cur + '\n' + line) > LIMITS.post) { body.push(cur); cur = ''; }
    cur = cur ? cur + '\n' + line : fit(line);
  }
  if (cur) body.push(cur);
  const last = list[list.length - 1];
  const tail = fit([last?.next && `Next week: ${oneLine(last.next)}`, tags].filter(Boolean).join('\n\n'));
  return { thread: [head, ...body, tail] };
}

export const xIntent = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
