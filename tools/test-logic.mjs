// Checks the pure app logic in assets/logic.js (shared with the Worker).
// Usage (from the project root): node tools/test-logic.mjs
import assert from 'node:assert/strict';
import {
  utcDay, weekOf, weekday, isoDay, replayStreak, liveStreak, nextStreak, handleIssue, cleanHandle, parseRepos, repoIssue,
  cleanLink, flagged, entryIssues, heatmapWeeks, level, templatePost, templateRecap, chars, xIntent, LIMITS,
} from '../assets/logic.js';

let checks = 0;
const ok = (label) => { checks++; console.log(`  ✓ ${label}`); };
console.log('Ship Log logic');

// days + weeks (UTC, Monday-start like the contract)
const mon = utcDay(Date.parse('2026-11-09T23:59:59Z'));
assert.equal(isoDay(mon), '2026-11-09');
assert.equal(utcDay(Date.parse('2026-11-10T00:00:00Z')), mon + 1);
assert.equal(weekday(mon), 1);
assert.equal(weekOf(mon), weekOf(mon + 6)); // Mon..Sun same week
assert.notEqual(weekOf(mon + 6), weekOf(mon + 7));
assert.notEqual(weekOf(mon - 1), weekOf(mon));
ok('UTC days, weekdays and Monday-start weeks');

// streak replay = contract rules
assert.deepEqual(replayStreak([mon, mon + 1, mon + 2]).streak, 3);
let r = replayStreak([mon, mon + 1, mon + 3]); // skip Wed → freeze
assert.equal(r.streak, 3); assert.equal(r.freezeWeek, weekOf(mon + 2) + 1);
assert.equal(replayStreak([mon, mon + 1, mon + 3, mon + 5]).streak, 1); // second miss same week
assert.equal(replayStreak([mon, mon + 3]).streak, 1); // two missed days
r = replayStreak([mon, mon + 1, mon + 3, mon + 4, mon + 5, mon + 6, mon + 8]); // missed Wed (wk1) and Mon (wk2)
assert.equal(r.streak, 7); assert.equal(r.best, 7);
ok('replayStreak: +1 per day, one freeze per week, two missed days reset');

// live streak + next streak
const p = { lastDay: mon, streak: 5, freezeWeek: 0 };
assert.deepEqual(liveStreak(p, mon), { value: 5, state: 'today' });
assert.deepEqual(liveStreak(p, mon + 1), { value: 5, state: 'alive' });
assert.deepEqual(liveStreak(p, mon + 2), { value: 5, state: 'freeze' });
assert.deepEqual(liveStreak({ ...p, freezeWeek: weekOf(mon + 1) + 1 }, mon + 2), { value: 0, state: 'broken' });
assert.deepEqual(liveStreak(p, mon + 3), { value: 0, state: 'broken' });
assert.equal(liveStreak({ lastDay: 0 }, mon).state, 'none');
assert.equal(nextStreak(p, mon + 1).value, 6);
assert.equal(nextStreak(p, mon + 2).freeze, true);
assert.equal(nextStreak(p, mon + 3).broke, true);
assert.equal(nextStreak(p, mon).update, true);
ok('liveStreak / nextStreak: today, alive, freeze, broken, update');

// validation
assert.equal(cleanHandle(' @Mika_Builds '), 'mika_builds');
assert.equal(handleIssue('ab'), 'At least 3 characters.');
assert.equal(handleIssue('a-b-c'), 'Only a–z, 0–9 and _.');
assert.equal(handleIssue('good_name1'), '');
assert.deepEqual(parseRepos('https://github.com/a/b.git, c/d\nC/D  e/f/tree/main'), ['a/b', 'c/d', 'e/f']);
assert.equal(repoIssue(['a/b', 'c/d', 'e/f', 'g/h', 'i/j', 'k/l']), 'Up to 5 repos.');
assert.match(repoIssue(['not a repo']), /isn't owner\/repo/);
assert.equal(cleanLink('example.com/x'), 'https://example.com/x');
assert.equal(cleanLink('javascript:alert(1)'), null);
assert.equal(cleanLink(''), '');
assert.ok(flagged('you r3tard')); assert.ok(!flagged('Fixed the grape scraper')); assert.ok(!flagged('Added therapist search'));
const ok1 = { shipped: 'Shipped it', blocked: '', next: '', link: '', tag: 0, energy: 1, commits: 3 };
assert.deepEqual(entryIssues(ok1), {});
assert.ok(entryIssues({ ...ok1, shipped: '' }).shipped);
assert.ok(entryIssues({ ...ok1, shipped: 'x'.repeat(141) }).shipped);
assert.ok(!entryIssues({ ...ok1, shipped: '🚀'.repeat(140) }).shipped); // counts characters, not bytes
assert.ok(entryIssues({ ...ok1, tag: 6 }).tag);
assert.ok(entryIssues({ ...ok1, link: 'not a link' }).link);
ok('handles, repos, links, word filter and entry checks');

// heatmap
const cols = heatmapWeeks([{ day: mon, commits: 4 }, { day: mon - 1, commits: 0 }], mon + 2, 52);
assert.equal(cols.length, 52);
assert.ok(cols.every((c) => c.length === 7 && weekday(c[0].day) === 1));
const last = cols[51];
assert.equal(last[0].day, mon); assert.equal(last[0].level, 3); assert.equal(last[3].future, true);
assert.equal(cols[50][6].level, 1); // logged with 0 commits still shows
assert.deepEqual([null, { commits: 0 }, { commits: 2 }, { commits: 6 }, { commits: 30 }].map(level), [0, 1, 2, 3, 4]);
ok('heatmap: 52 Monday-start weeks ending this week, levels by commits');

// templates stay under limits and only use the entry
const long = { shipped: 'x '.repeat(70).trim(), blocked: 'b '.repeat(50).trim(), next: 'n '.repeat(50).trim(), tag: 0 };
for (const tone of ['casual', 'proud', 'funny', 'minimal']) {
  const t = templatePost(long, { tone, streak: 12, commits: 5, repoNames: ['pixel-pals'], mention: true });
  assert.ok(chars(t.post) <= LIMITS.post, tone);
  assert.ok(t.post.includes('#buildinpublic') && t.post.includes('@BOTChain_ai'));
  assert.equal(t.thread.length, 3);
  t.thread.forEach((x) => assert.ok(chars(x) <= LIMITS.post));
}
const rc = templateRecap(Array.from({ length: 7 }, (_, i) => ({ day: mon + i, shipped: 'Did thing number ' + i + ' '.repeat(3) + 'y'.repeat(90), commits: i })), { streak: 9 });
assert.ok(rc.thread.length >= 3);
rc.thread.forEach((x) => assert.ok(chars(x) <= LIMITS.post));
assert.ok(xIntent('a b #c').startsWith('https://x.com/intent/post?text=a%20b%20%23c'));
ok('template posts, threads and recaps stay ≤ 280 and include hashtags');

console.log(`\n${checks} checks passed`);
