// The website at "/", laid out after save.design: quiet left-aligned hero → a wide stage with a pinned
// browser window where the welcome story plays → a pinned "scattered cards → one log" scene → a ruled
// feature strip → text + window demo rows → builders card row "01 / 04" → "Free. Just gas." with a toggle
// → Answers → closing CTA. ASCII appears as faint texture fields and divider bands.
import * as chain from './chain.js';
import { $, $$, esc, tagChip, flame, gsapReady, onVisible, reducedMotion, timeAgo, ASCII } from './ui.js';
import { heatmapSVG } from './heatmap.js';
import { formatDay, liveStreak, TAGS, utcDay, oneLine } from './logic.js';
import { addCleanup } from './main.js';

// a deterministic sample year for the illustrations (clearly illustrative — not anyone's data)
function sampleEntries(days = 364, density = 0.72, seed = 3) {
  let r = seed;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const t = utcDay();
  const out = [];
  for (let d = t - days; d <= t; d++) if (rand() < density || d > t - 12) out.push({ day: d, commits: Math.floor(rand() * rand() * 14), tag: Math.floor(rand() * 5), shipped: '' });
  return out;
}

/** A field of ASCII rows, each shifted by one character — used as a faint texture or a divider band. */
export function asciiField(rows = 24, cls = '') {
  let out = '';
  for (let i = 0; i < rows; i++) {
    const shift = i % ASCII.length;
    out += (ASCII.slice(shift) + ASCII.repeat(30) + ASCII.slice(0, shift)) + '\n';
  }
  return `<div class="ascii-field ${cls}" aria-hidden="true"><pre data-field>${out}</pre></div>`;
}

/** Browser-window chrome around a demo. */
const win = (title, inner, cls = '') => `<div class="win ${cls}"><div class="win-bar"><i></i><i></i><i></i><span>${esc(title)}</span></div><div class="win-body">${inner}</div></div>`;

const COMMITS = [
  ['a3f9c21', 'feat: wallet connect + switch network'],
  ['7be04d2', 'fix: RPC timeout retry'],
  ['c19e8aa', 'style: tomato buttons'],
  ['0d4b7f3', 'feat: heatmap svg'],
  ['e88a1b9', 'chore: deploy script'],
];

export async function renderHome(view) {
  const t = chain.today();
  view.innerHTML = `
  <div class="site">
  <section class="s-hero wrap" id="top">
    <h1 id="heroTitle">Build in public,<br>one day at a time.</h1>
    <p class="s-lede">Log what you shipped today, turn it into an X post in one click, and keep a streak — every day recorded on BOT Chain.</p>
    <div class="s-ctas">
      <a class="sbtn sbtn-primary" href="app" data-link>Start my log</a>
      <a class="sbtn" href="app/explore" data-link>Explore builders</a>
    </div>
  </section>

  <section class="s-stage" id="stage">
    <div class="stage-pane">
      <div class="terrain" aria-hidden="true"><div class="terrain-plane">${heatmapSVG(sampleEntries(420, 0.7, 5), { today: t, weeks: 60, cell: 16, gap: 4, labels: false })}</div></div>
      <div class="floaters" aria-hidden="true">
        <div class="fl fl-log" data-depth="1.3"><span class="mono">${esc(formatDay(t, { weekday: 'short' }).toUpperCase())}</span><b>🚀 wallet connect + switch network</b>${tagChip(0)}</div>
        <div class="fl fl-flame" data-depth="1.8">🔥 12</div>
        <div class="fl fl-chip" data-depth="1">+3 commits</div>
        <div class="fl fl-post" data-depth="1.5">Day 12 🔥 of building in public. <span>#buildinpublic</span></div>
      </div>
      ${win('shiplog.app', `
        <div class="story">
          <div class="slide is-on"><p class="st-small">Welcome to</p><p class="st-big">Ship Log</p></div>
          <div class="slide"><p class="st-small">the daily log for</p><div class="marquee"><span>builders ::: makers ::: indie hackers ::: designers ::: builders ::: makers ::: indie hackers ::: designers ::: </span><span aria-hidden="true">builders ::: makers ::: indie hackers ::: designers ::: builders ::: makers ::: indie hackers ::: designers ::: </span></div></div>
          <div class="slide"><p class="st-mid">and everyone who ships<br><em>one day at a time.</em></p></div>
          <div class="slide"><p class="st-mid">We all share the same problem…</p></div>
        </div>`, 'stage-win')}
    </div>
  </section>

  <div class="band">${asciiField(10)}</div>

  <section class="s-problem" id="problem">
    <div class="problem-stage">
      ${asciiField(40, 'faint')}
      <h2 class="pb-title" id="pbA">Your progress is scattered<br>across commits, chats and screenshots.</h2>
      <h2 class="pb-title pb-b" id="pbB">Time to log it.</h2>
      <div class="cloud" id="cloud">
        <div class="cc cc-1"><p class="mono muted">git log --oneline</p>${COMMITS.slice(0, 3).map(([s, m]) => `<div class="commit-row"><span class="sha">${s}</span><span>${esc(m)}</span></div>`).join('')}</div>
        <div class="cc cc-2"><div class="slack-msg"><span class="av">🙂</span><div><b>you</b> <span class="mono muted">11:42 PM</span><br>finally got the network switch working!!</div></div></div>
        <div class="cc cc-3 mini-post"><div class="who"><span class="av">✍️</span>Draft</div>Day 9? 10? of building in public. Today I<span class="caret"></span></div>
        <div class="cc cc-4 todo note-yellow"><ul><li><s>wallet connect</s></li><li><s>switch network</s></li><li>post update on X</li><li>deploy to mainnet</li></ul></div>
        <div class="cc cc-5"><div class="shot">screenshot_1108.png</div></div>
        <div class="cc cc-6"><p class="mono muted">PR #42</p><b>Add network switch</b><p class="mono" style="color:var(--h3)">✓ merged</p></div>
        <div class="cc cc-7 note-blue"><b>Blocked:</b> RPC timeouts on testnet</div>
        <div class="cc cc-8"><p class="mono muted">notes.md</p>next: deploy to mainnet, write the launch post…</div>
        <div class="cc cc-9 note-pink">🔥 streak? lost count</div>
        <div class="folder" id="folder"><div class="folder-icon">${heatmapSVG(sampleEntries(40, 0.9, 9), { today: t, weeks: 6, cell: 8, gap: 2, labels: false })}</div><p><b>Today’s log</b><span class="mono muted"><span id="folderN">0</span> things logged</span></p></div>
      </div>
    </div>
  </section>

  <section class="s-strip" id="how">
    <div><span class="ibox" aria-hidden="true">⏱</span><p><b>Log in 60 seconds</b><span>Shipped, blocked, next — a tag and your energy. That’s the whole form.</span></p></div>
    <div><span class="ibox" aria-hidden="true">&lt;/&gt;</span><p><b>Commits pulled for you</b><span>Link up to five public repos. Today’s commits show up on their own.</span></p></div>
    <div><span class="ibox" aria-hidden="true">↗</span><p><b>Posts written for you</b><span>One click turns your entry into an X post and a thread, in your tone.</span></p></div>
  </section>

  <section class="s-rows">
    ${row(1, 'Today’s card, in sixty seconds.', ['A card titled with today’s date and three short fields: what you shipped, what blocked you, what’s next. Pick a tag and your energy.', 'Write it like a note to yourself. One button turns it into a log entry — and a stamp lands on your streak.'], 'Try it', 'app', win('shiplog.app/today', demoToday(t)))}
    ${row(2, 'Commits pulled for you.', ['Link up to five public GitHub repos once. Every day the card shows “3 commits in pixel-pals” with the messages, and you tick which repos count.', 'No GitHub login, no tokens — public repos only. If GitHub is busy, just type the number.'], 'See how', 'app/profile', win('shiplog.app/today · commits', demoCommits()))}
    ${row(3, 'Posts and threads, written for you.', ['Pick a tone — Casual, Proud, Funny or Minimal — and get an X post under 280 characters plus a 3-post thread.', 'It only uses what you wrote and your commit messages. No invented numbers. Edit, copy, or open it straight in X.'], 'Make a post', 'app', win('shiplog.app/today · share', demoPost()))}
    ${row(4, 'A heatmap that fills in, square by square.', ['Your public profile shows the last 52 weeks. Darker days mean more commits; your current and best streak sit right above.', 'Missed a day? One rest-day freeze a week keeps your streak alive.'], 'See a profile', 'app/explore#leaders', win('shiplog.app/@you', demoHeat(t)))}
    ${row(5, 'See what everyone shipped today.', ['Explore shows the latest logs from every builder, newest first. Filter by tag, follow people you like, and see who’s launching today.', 'A streak leaderboard keeps it friendly.'], 'Explore', 'app/explore', win('shiplog.app/explore', demoExplore()))}
    ${row(6, 'Proof, on BOT Chain.', ['Every entry is a transaction on BOT Chain — a public, timestamped record of showing up that can’t be backdated.', 'Your streak is computed by the contract, not by us.'], 'Why on-chain?', './#faq', win('scan.botchain.ai', demoChain(t)))}
  </section>

  <section class="s-builders" id="builders">
    ${asciiField(26, 'faint')}
    <div class="sec-head wrap">
      <h2 class="px">Builders</h2>
      <div class="car-ctl"><span class="counter mono" aria-live="polite"><span class="roll" id="carNow"><span>01</span></span> / <span id="carTotal">04</span></span><button type="button" id="carPrev" aria-label="Previous builder">←</button><button type="button" id="carNext" aria-label="Next builder">→</button></div>
    </div>
    <div class="car-view"><div class="car-track" id="carTrack">${'<article class="bcard"><div class="skeleton" style="height:180px"></div></article>'.repeat(3)}</div></div>
  </section>

  <section class="s-free wrap" id="free">
    <div class="sec-head">
      <h2 class="px">Free. Just gas.</h2>
      <div class="seg" role="group" aria-label="Show price"><button type="button" aria-pressed="true" data-per="log">Per log</button><button type="button" aria-pressed="false" data-per="year">Per year</button></div>
    </div>
    <div class="tiers">
      <div class="tier">
        <h3>Notes app</h3><p class="t-desc">Private notes you mean to post later.</p>
        <p class="t-price">$0<small>/ but nobody sees it</small></p>
        <ul>${['Write anything', 'No streaks', 'No commits', 'No posts', 'No public proof'].map((x, i) => `<li class="${i ? 'no' : ''}">${x}</li>`).join('')}</ul>
      </div>
      <div class="tier tier-us">
        <span class="t-badge">Ship Log</span>
        <h3>Ship Log</h3><p class="t-desc">The daily log for people who ship.</p>
        <p class="t-price"><span data-price>$0</span><small data-price-sub>+ gas, per log</small></p>
        <a class="sbtn sbtn-primary sbtn-block" href="app" data-link>Start my log</a>
        <ul>${['Shipped · blocked · next in 60 seconds', 'Commits pulled from 5 public repos', 'AI posts, threads and weekly recaps', 'Public profile, heatmap and streaks', 'Explore feed and streak leaderboard', 'Every day on BOT Chain'].map((x) => `<li>${x}</li>`).join('')}</ul>
      </div>
      <div class="tier">
        <h3>Posting manually</h3><p class="t-desc">Remembering, screenshotting, writing it up.</p>
        <p class="t-price">$0<small>/ and your evening</small></p>
        <ul>${['Public', 'No streaks', 'Copy commits by hand', 'Write every post yourself', 'No on-chain proof'].map((x, i) => `<li class="${i ? 'no' : ''}">${x}</li>`).join('')}</ul>
      </div>
    </div>
  </section>

  <section class="s-answers wrap" id="faq">
    <div>
      <h2 class="px">Answers</h2>
      <div class="tips" id="tips">
        <p class="label" style="margin-top:28px">Build-in-public tips</p>
        <ol><li>Log small wins — “fixed one bug” counts.</li><li>Write the blocker down. People love to help.</li><li>Post at the same time every day.</li><li>Rest days are part of the streak. Tag them.</li></ol>
      </div>
    </div>
    <div class="faq-list">
      ${faq('Is it free?', 'Yes. Ship Log has no subscription and no token. Each log is a transaction on BOT Chain, so you pay a small network fee (gas) in BOT.')}
      ${faq('Are my logs public?', 'Yes — that’s the point of building in public. Your handle, bio, linked repos and every entry are public on your profile and on BOT Chain. Don’t log anything private.')}
      ${faq('Does it need my GitHub login?', 'No. Ship Log reads public repos through GitHub’s public API. Private repos and GitHub login aren’t supported. If GitHub is busy, just type your commit count.')}
      ${faq('What goes on-chain?', 'Your handle, bio and repo names, and for each day: shipped, blocked, next, link, tag, energy and the number of commits. Commit messages stay in your browser — only the count is stored. Generated posts are never stored.')}
      ${faq('What if I miss a day?', 'Once a week (Monday–Sunday, UTC), one missed day is bridged automatically — your streak keeps going. Miss two days in a row, or a second day that week, and you start a fresh streak at day 1. Tag rest days as “Resting” so they count.')}
      ${faq('When does a day start?', 'Days follow UTC, the same clock the contract uses. You can update today’s entry as many times as you like until 00:00 UTC.')}
    </div>
  </section>

  <section class="s-closing">
    ${asciiField(30, 'faint')}
    <h2 id="closingTitle">Your work has<br>a log now.</h2>
    <p>One line a day. A streak you can show.</p>
    <a class="sbtn sbtn-primary" href="app" data-link>Start my log</a>
  </section>
  </div>`;

  bindFree();
  loadCarousel();
  animate();
}

const row = (n, title, paras, cta, href, demo) => `
  <div class="srow${n % 2 === 0 ? ' flip' : ''}">
    <div class="srow-copy">
      <span class="mono muted">${String(n).padStart(2, '0')} / 06</span>
      <h2 class="px">${title}</h2>
      ${paras.map((p) => `<p>${p}</p>`).join('')}
      <a class="sbtn" href="${href}" data-link ${href.includes('#') ? `data-anchor="${href.split('#')[1]}"` : ''}>${cta}</a>
    </div>
    <div class="srow-demo">${demo}</div>
  </div>`;
const faq = (q, a) => `<details><summary>${q}</summary><p class="a">${a}</p></details>`;

function bindFree() {
  const seg = $('.seg');
  seg?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-per]');
    if (!b) return;
    $$('[data-per]', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const year = b.dataset.per === 'year';
    const price = $('[data-price]'); const sub = $('[data-price-sub]');
    const swap = () => { price.textContent = '$0'; sub.textContent = year ? '+ gas × days you log, per year' : '+ gas, per log'; };
    if (gsapReady()) gsap.timeline().to([price, sub], { yPercent: -60, opacity: 0, duration: 0.18 }).add(swap).fromTo([price, sub], { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.25 });
    else swap();
  });
}

// ------------------------------------------------------------------ demo window contents
function demoToday(t) {
  return `<div class="demo" data-demo="today"><div class="demo-inner log-card">
    <div class="log-card-head"><span class="pixel" style="font-size:18px">${esc(formatDay(t, { weekday: 'short', year: true }).toUpperCase())}</span><span class="mono muted">DAY 12</span></div>
    <p class="field-mini"><b>🚀 Shipped</b></p><p class="type-line" data-type="Added wallet connect + switch network"></p>
    <p class="field-mini" style="margin-top:10px"><b>🧱 Blocked</b></p><p class="type-line muted" data-type="RPC timeouts on testnet"></p>
    <p class="field-mini" style="margin-top:10px"><b>➡️ Next</b></p><p class="type-line" data-type="Deploy to mainnet"></p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px" class="demo-tags">${[0, 1, 4].map((i) => tagChip(i)).join('')}</div>
    <div class="stamp-drop demo-stamp" style="opacity:0">DAY 12<small>LOGGED</small></div>
  </div></div>`;
}
function demoCommits() {
  return `<div class="demo" data-demo="commits"><div class="demo-inner card" style="padding:20px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px"><span class="mono muted">commits today</span><span class="commit-count" data-count="5">0</span></div>
    <label class="repo-line"><input type="checkbox" checked disabled> <b>you/pixel-pals</b></label>
    ${COMMITS.slice(0, 3).map(([s, m]) => `<div class="commit-row drop"><span class="sha">${s}</span><span>${esc(m)}</span></div>`).join('')}
    <label class="repo-line" style="margin-top:8px"><input type="checkbox" checked disabled> <b>you/ship-log</b></label>
    ${COMMITS.slice(3).map(([s, m]) => `<div class="commit-row drop"><span class="sha">${s}</span><span>${esc(m)}</span></div>`).join('')}
  </div></div>`;
}
const POSTS = {
  Casual: 'Day 12 🔥 of building in public.\nShipped wallet connect + network switching today (5 commits).\nNext up: mainnet.\n\n#buildinpublic #BOTChain',
  Proud: 'Day 12 — shipped it. ✅\nWallet connect + automatic network switching are live.\n📦 5 commits\n➡️ Next: mainnet\n\n#buildinpublic #BOTChain',
  Funny: 'Day 12. Still shipping, somehow.\nWallet connect works. The RPC timed out only twice, which I’m calling a win.\n\n#buildinpublic #BOTChain',
  Minimal: 'Day 12 🔥\n🚀 wallet connect + switch network\n➡️ mainnet\n\n#buildinpublic #BOTChain',
};
function demoPost() {
  return `<div class="demo" data-demo="post"><div class="demo-inner card mini-post" style="padding:20px">
    <div class="tone-row">${Object.keys(POSTS).map((k, i) => `<span class="chip${i === 0 ? ' on' : ''}" data-tone="${k}">${k}</span>`).join('')}</div>
    <div class="who"><span class="av">🚀</span>you <span class="muted" style="font-weight:400">· draft</span></div>
    <p class="post-text" data-post>${esc(POSTS.Casual)}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><span class="mono muted" data-len>0 / 280</span><span class="btn btn-ink btn-sm">Open in X ↗</span></div>
  </div></div>`;
}
function demoHeat(t) {
  return `<div class="demo" data-demo="heat"><div class="demo-inner card" style="padding:20px;max-width:none">
    <div class="hm-scroll">${heatmapSVG(sampleEntries(160, 0.78, 11), { today: t, weeks: 24, cell: 13, gap: 3 })}</div>
    <div class="streak-big"><span class="flame-icon">🔥</span><span data-streak>0</span><span class="mono muted" style="font-size:14px;letter-spacing:0">day streak · best 31</span></div>
  </div></div>`;
}
const EXPLORE = [
  ['mika', 4, 'Launched the public beta 🎉', 23], ['priya', 2, 'Dark mode for the playground', 11], ['devon', 3, 'Read about storage layout', 6], ['lena', 1, 'Fixed rounding on tiny amounts', 2], ['tomas', 0, 'Tilemap collisions', 4],
];
function demoExplore() {
  return `<div class="demo" data-demo="explore"><div class="demo-inner">
    <div class="filter-row" style="margin-top:0">${['All', 'Launching', 'Building'].map((f, i) => `<button type="button" tabindex="-1" aria-pressed="${i === 0}" data-f="${f}">${f}</button>`).join('')}</div>
    <div class="feed-mini">${EXPLORE.map(([h, tag, s, st]) => `<div class="log-card" data-tag="${TAGS[tag].label}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px"><b>@${h}</b>${flame(st)}</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${tagChip(tag)}<span style="font-size:14px">${esc(s)}</span></div></div>`).join('')}</div>
  </div></div>`;
}
function demoChain(t) {
  const rows = [['Status', '<span class="ok">✓ Success</span>'], ['Network', 'BOT Chain · 677'], ['Method', 'logToday(…)'], ['Event', `Logged(you, day ${t}, Building, 5, 12)`], ['Block', '#1,284,551'], ['Tx', '0x9c1e…a47b']];
  return `<div class="demo" data-demo="chain"><div class="demo-inner card receipt" style="padding:20px;position:relative">
    <p class="mono" style="margin-bottom:10px;font-weight:700">TRANSACTION RECEIPT</p>
    ${rows.map(([a, b]) => `<div class="row"><span class="muted">${a}</span><span>${b}</span></div>`).join('')}
    <div class="stamp-drop demo-stamp" style="top:auto;bottom:16px;right:16px;opacity:0;font-size:22px">ON-CHAIN<small>BOT CHAIN</small></div>
  </div></div>`;
}

// ------------------------------------------------------------------ builders card row (real data only)
async function loadCarousel() {
  const track = $('#carTrack');
  let slides = [];
  try {
    const [builders, feed] = await Promise.all([chain.getBuilders(), chain.getFeed(0, 120)]);
    const latest = new Map();
    for (const f of feed) if (!latest.has(f.who.toLowerCase())) latest.set(f.who.toLowerCase(), f.entry);
    const t = chain.today();
    slides = builders
      .filter((b) => !b.hidden && latest.has(b.who.toLowerCase()))
      .map((b) => ({ b, e: latest.get(b.who.toLowerCase()), live: liveStreak(b, t).value }))
      .sort((x, y) => y.live - x.live || y.b.totalDays - x.b.totalDays)
      .slice(0, 4);
  } catch { /* shows the empty state */ }
  if (!track?.isConnected) return;
  const pad = (n) => String(n).padStart(2, '0');
  if (!slides.length) {
    track.innerHTML = `<article class="bcard bcard-empty"><span class="mono muted">00 / 00</span><p class="bq">No builders yet. Be the first log on BOT Chain — your profile shows up right here.</p><a class="sbtn sbtn-primary" href="app" data-link>Start my log</a></article>`;
    $('#carTotal').textContent = '00'; $('#carNow').innerHTML = '<span>00</span>';
    $('#carPrev').disabled = $('#carNext').disabled = true;
    return;
  }
  $('#carTotal').textContent = pad(slides.length);
  track.innerHTML = slides.map(({ b, e, live }, i) => `
    <article class="bcard">
      <div class="bc-top"><span class="mono muted">${pad(i + 1)} / ${pad(slides.length)}</span><span class="bc-mark" aria-hidden="true">”</span></div>
      <p class="bq">“${esc(oneLine(e.shipped))}”</p>
      <p class="bc-meta">${tagChip(e.tag)} <span class="mono muted">${esc(formatDay(e.day, { weekday: 'short' }))} · ${e.commits} commit${e.commits === 1 ? '' : 's'} · ${timeAgo(e.at, chain.nowMs())}</span></p>
      <div class="bc-who">
        <span class="bc-av">${esc(b.handle[0].toUpperCase())}</span>
        <span><a href="@${esc(b.handle)}" data-link>@${esc(b.handle)}</a><small>🔥 ${live}-day streak · best ${b.bestStreak}</small></span>
        <a class="bc-go" href="@${esc(b.handle)}" data-link aria-label="Open @${esc(b.handle)}’s profile">↗</a>
      </div>
    </article>`).join('');
  let i = 0;
  const go = (dir) => {
    i = (i + dir + slides.length) % slides.length;
    const card = track.children[i];
    const x = -card.offsetLeft + track.children[0].offsetLeft;
    const roll = $('#carNow');
    if (gsapReady()) {
      gsap.to(track, { x, duration: 0.6, ease: 'power3.out' });
      const next = document.createElement('span'); next.textContent = pad(i + 1);
      const old = roll.firstElementChild;
      roll.append(next);
      gsap.fromTo(next, { yPercent: 100 * dir }, { yPercent: 0, duration: 0.45, ease: 'power3.out' });
      gsap.to(old, { yPercent: -100 * dir, duration: 0.45, ease: 'power3.out', onComplete: () => old.remove() });
    } else {
      track.style.transform = `translateX(${x}px)`;
      roll.innerHTML = `<span>${pad(i + 1)}</span>`;
    }
  };
  $('#carPrev').onclick = () => go(-1);
  $('#carNext').onclick = () => go(1);
  if (gsapReady()) gsap.from(track.children, { y: 30, opacity: 0, stagger: 0.08, duration: 0.6, ease: 'power3.out', scrollTrigger: { trigger: track, start: 'top 85%' } });
}

// ------------------------------------------------------------------ animation
function animate() {
  const desktop = matchMedia('(min-width: 761px)').matches;
  if (reducedMotion() || !window.gsap || !window.ScrollTrigger) {
    $$('[data-type]').forEach((el) => (el.textContent = el.dataset.type));
    $$('[data-count]').forEach((el) => (el.textContent = el.dataset.count));
    $$('.demo-stamp').forEach((el) => (el.style.opacity = 1));
    $$('[data-len]').forEach((el) => (el.textContent = `${[...$('[data-post]').textContent].length} / 280`));
    const s = $('[data-streak]'); if (s) s.textContent = '12';
    $('#folderN').textContent = '9';
    document.body.classList.add('static-story');
    return;
  }

  // hero: quiet fade-up, like the reference
  if (window.SplitText) {
    const split = new SplitText('#heroTitle', { type: 'lines', linesClass: 'ln' });
    gsap.from(split.lines, { yPercent: 40, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1 });
    addCleanup(() => split.revert());
  }
  gsap.from('.s-lede, .s-ctas', { y: 14, opacity: 0, duration: 0.8, delay: 0.25, stagger: 0.08, ease: 'power3.out' });
  gsap.from('.stage-pane', { y: 60, opacity: 0, duration: 1.1, delay: 0.35, ease: 'power3.out' });

  // stage: the window pins and the welcome story plays as you scroll; the heatmap terrain drifts
  const slides = $$('.story .slide');
  const show = (k) => slides.forEach((s, i) => s.classList.toggle('is-on', i === k));
  const stageTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#stage', start: 'top top+=24', end: '+=' + (desktop ? 2400 : 1600), pin: true, scrub: 0.6,
      onUpdate: (st) => show(Math.min(slides.length - 1, Math.floor(st.progress * slides.length * 0.999))),
    },
  });
  stageTl.fromTo('.stage-win', { scale: 0.86 }, { scale: 1, ease: 'none', duration: 0.3 })
    .to('.terrain-plane', { yPercent: -18, ease: 'none', duration: 1 }, 0)
    .to('.floaters', { opacity: 0, ease: 'none', duration: 0.3 }, 0.7);
  const rects = $$('.terrain rect.hm');
  const lit = rects.filter((r) => !r.classList.contains('hm-0'));
  gsap.set(lit, { opacity: 0.25 });
  gsap.to(lit, { opacity: 1, duration: 0.3, stagger: { each: 2.4 / Math.max(1, lit.length), from: 'start' }, delay: 0.6 });

  // floaters drift with the mouse (parallax)
  const pane = $('.stage-pane');
  const movers = $$('.fl').map((el) => ({ x: gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3.out' }), y: gsap.quickTo(el, 'y', { duration: 0.8, ease: 'power3.out' }), d: Number(el.dataset.depth || 1) }));
  const onMove = (e) => {
    const r = pane.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5; const ny = (e.clientY - r.top) / r.height - 0.5;
    movers.forEach((m) => { m.x(nx * -30 * m.d); m.y(ny * -20 * m.d); });
  };
  pane.addEventListener('mousemove', onMove);
  addCleanup(() => pane.removeEventListener('mousemove', onMove));

  // problem: the scattered cards get pulled into one log as you scroll
  const cards = $$('#cloud .cc');
  const folder = $('#folder');
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const n = { v: 0 };
  const pbTl = gsap.timeline({ scrollTrigger: { trigger: '#problem', start: 'top top', end: '+=' + (desktop ? 1800 : 1200), pin: '.problem-stage', scrub: 0.6, invalidateOnRefresh: true } });
  gsap.from(cards, { scrollTrigger: { trigger: '#problem', start: 'top 70%' }, opacity: 0, scale: 0.6, stagger: 0.05, duration: 0.7, ease: 'back.out(1.6)' });
  pbTl.to(cards, {
      x: (i, el) => { gsap.set(el, { x: 0 }); return center(folder)[0] - center(el)[0]; },
      y: (i, el) => { gsap.set(el, { y: 0 }); return center(folder)[1] - center(el)[1]; },
      scale: 0.15, rotation: 0, opacity: 0, stagger: 0.05, ease: 'power2.in', duration: 0.6,
    }, 0.3)
    .to(n, { v: 9, duration: 0.7, ease: 'none', onUpdate: () => ($('#folderN').textContent = Math.round(n.v)) }, 0.3)
    .fromTo(folder, { scale: 0.9 }, { scale: 1.15, duration: 0.7, ease: 'none' }, 0.3)
    .to('#pbA', { opacity: 0, y: -30, duration: 0.15 }, 0.75)
    .fromTo('#pbB', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.15 }, 0.85);

  // ruled strip + rows + closing
  gsap.from('.s-strip > div', { scrollTrigger: { trigger: '.s-strip', start: 'top 88%' }, y: 24, opacity: 0, stagger: 0.1, duration: 0.6, ease: 'power3.out' });
  $$('.srow').forEach((r) => {
    gsap.from($('.srow-copy', r).children, { scrollTrigger: { trigger: r, start: 'top 75%' }, y: 24, opacity: 0, stagger: 0.07, duration: 0.6, ease: 'power3.out' });
    gsap.from($('.win', r), { scrollTrigger: { trigger: r, start: 'top 80%' }, x: r.classList.contains('flip') ? -60 : 60, opacity: 0, duration: 0.9, ease: 'power3.out' });
  });
  gsap.from('#closingTitle', { scrollTrigger: { trigger: '.s-closing', start: 'top 75%' }, y: 30, opacity: 0, duration: 0.9, ease: 'power3.out' });

  // ASCII texture fields: rows fade in top to bottom; a few rows scramble (cheap — short strings only)
  $$('[data-field]').forEach((el) => {
    const lines = el.textContent.split('\n').filter(Boolean);
    el.innerHTML = lines.map((ln) => `<span>${ln}\n</span>`).join('');
    const spans = [...el.children];
    gsap.set(spans, { opacity: 0 });
    onVisible(el, () => {
      gsap.to(spans, { opacity: 1, duration: 0.4, stagger: 0.025, ease: 'none' });
      if (!window.ScrambleTextPlugin) return;
      spans.filter((_, k) => k % 4 === 1).forEach((s, k) => {
        const text = s.textContent.slice(0, 60);
        const rest = s.textContent.slice(60);
        const head = document.createElement('span'); head.textContent = text;
        s.textContent = rest; s.prepend(head);
        gsap.to(head, { duration: 1, delay: 0.2 + k * 0.08, scrambleText: { text, chars: '.+-:*', speed: 0.6 }, ease: 'none' });
      });
    }, 0.05);
  });

  // the six demos play once each when visible
  $$('[data-demo]').forEach((el) => onVisible(el, () => DEMOS[el.dataset.demo]?.(el), 0.4));
}

function typeInto(el, text, cps = 38) {
  const o = { n: 0 };
  return gsap.to(o, { n: [...text].length, duration: [...text].length / cps, ease: 'none', onUpdate: () => (el.textContent = [...text].slice(0, Math.round(o.n)).join('')) });
}

const DEMOS = {
  today(el) {
    const tl = gsap.timeline();
    $$('[data-type]', el).forEach((line) => tl.add(typeInto(line, line.dataset.type)));
    tl.from($$('.demo-tags .tag', el), { scale: 0, opacity: 0, stagger: 0.08, duration: 0.3, ease: 'back.out(3)' }, '<');
    tl.fromTo($('.demo-stamp', el), { scale: 2.6, opacity: 0, rotation: 8 }, { scale: 1, opacity: 1, rotation: -10, duration: 0.35, ease: 'power4.in' });
    tl.to(el.querySelector('.demo-inner'), { x: 3, duration: 0.05, yoyo: true, repeat: 3 });
  },
  commits(el) {
    gsap.from($$('.drop', el), { y: -30, opacity: 0, duration: 0.45, stagger: 0.18, ease: 'bounce.out' });
    const c = $('[data-count]', el); const o = { n: 0 };
    gsap.to(o, { n: Number(c.dataset.count), duration: 1.1, ease: 'steps(5)', onUpdate: () => (c.textContent = Math.round(o.n)) });
  },
  post(el) {
    const p = $('[data-post]', el); const len = $('[data-len]', el);
    const chips = $$('[data-tone]', el);
    const keys = Object.keys(POSTS);
    let k = 0;
    const play = () => {
      chips.forEach((c, i) => c.classList.toggle('on', i === k));
      const text = POSTS[keys[k]];
      typeInto(p, text, 70).eventCallback('onUpdate', function () {
        const shown = [...text].slice(0, Math.round(this.targets()[0].n)).join('');
        p.textContent = shown; len.textContent = `${[...shown].length} / 280`;
      });
    };
    play();
    const timer = setInterval(() => { k = (k + 1) % keys.length; play(); }, 5200);
    addCleanup(() => clearInterval(timer));
  },
  heat(el) {
    const rects = $$('rect.hm', el).sort((a, b) => Number(a.getAttribute('x')) - Number(b.getAttribute('x')) || Number(a.getAttribute('y')) - Number(b.getAttribute('y')));
    gsap.set(rects, { opacity: 0.15 });
    gsap.to(rects, { opacity: 1, duration: 0.2, stagger: 1.8 / rects.length });
    const s = $('[data-streak]', el); const o = { n: 0 };
    gsap.to(o, { n: 12, duration: 1.8, ease: 'power1.in', onUpdate: () => (s.textContent = Math.round(o.n)) });
    gsap.fromTo($('.flame-icon', el), { scale: 0.6 }, { scale: 1.25, duration: 0.4, delay: 1.8, yoyo: true, repeat: 1, ease: 'power2.out' });
  },
  explore(el) {
    const filters = ['All', 'Launching', 'Building'];
    let k = 0;
    const cards = $$('.feed-mini .log-card', el);
    const tick = () => {
      k = (k + 1) % filters.length;
      const f = filters[k];
      $$('[data-f]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
      const state = window.Flip ? Flip.getState(cards) : null;
      cards.forEach((c) => (c.style.display = f === 'All' || c.dataset.tag === f ? '' : 'none'));
      if (state) Flip.from(state, { duration: 0.5, ease: 'power2.inOut', absolute: true, onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4 }), onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.9, duration: 0.3 }) });
    };
    const timer = setInterval(tick, 2600);
    addCleanup(() => clearInterval(timer));
  },
  chain(el) {
    const tl = gsap.timeline();
    tl.from($$('.row', el), { x: -20, opacity: 0, stagger: 0.14, duration: 0.35 });
    tl.fromTo($('.demo-stamp', el), { scale: 2.4, opacity: 0, rotation: 6 }, { scale: 1, opacity: 1, rotation: -10, duration: 0.35, ease: 'power4.in' });
  },
};
