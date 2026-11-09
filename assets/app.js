// The app: /app (today), /app/profile (set up / edit), /app/explore, /@handle.
import * as chain from './chain.js';
import { CONFIG } from './config.js';
import {
  TAGS, ENERGY, TONES, LIMITS, LAUNCHING, formatDay, formatTime, isoDay, weekday, weekOf, chars, oneLine, cleanLink,
  entryIssues, handleIssue, cleanHandle, parseRepos, repoIssue, reposFromString, liveStreak, nextStreak, xIntent, flagged,
} from './logic.js';
import { commitsToday } from './github.js';
import { makePost, makeRecap } from './ai.js';
import { heatmapSVG, animateHeatmap, LEGEND } from './heatmap.js';
import { $, $$, esc, toast, copyText, tagChip, energyIcon, flame, timeAgo, fmt, gsapReady, reducedMotion } from './ui.js';
import { go, addCleanup } from './main.js';

// ------------------------------------------------------------------ local settings (this browser only)
const store = {
  get(k, d) { try { const v = localStorage.getItem(`${CONFIG.storageKey}.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`${CONFIG.storageKey}.${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(`${CONFIG.storageKey}.${k}`); } catch { /* ignore */ } },
};
const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
const settings = (addr) => ({ tz: localTz(), ghUser: '', tone: 'casual', mention: false, ...store.get(`settings.${(addr || '').toLowerCase()}`, {}) });
const saveSettings = (addr, s) => store.set(`settings.${(addr || '').toLowerCase()}`, { ...settings(addr), ...s });
const following = () => store.get('follow', []);
const toggleFollow = (h) => { const f = following(); const on = !f.includes(h); store.set('follow', on ? [...f, h] : f.filter((x) => x !== h)); return on; };

let mine = { addr: '', p: null, at: 0 };
chain.onChange((w) => { if (w === 'data' || w === 'wallet' || w === 'clock') mine.at = 0; });
export async function myProfile() {
  const a = chain.wallet.account;
  if (!a) return null;
  if (mine.addr === a && Date.now() - mine.at < 15_000) return mine.p;
  const p = await chain.getProfile(a);
  mine = { addr: a, p, at: Date.now() };
  return p;
}

const gateMsg = (title, text, btn) => `<div class="app"><div class="wrap"><div class="panel center-card"><h2>${title}</h2><p>${text}</p>${btn}<p class="mono muted" style="margin-top:22px">Explore and profiles work without a wallet → <a href="app/explore" data-link>Explore</a></p></div></div></div>`;

/** Shows connect / install / switch-network screens. Returns true when the wallet is ready. */
function walletGate(view, rerender) {
  const w = chain.wallet;
  const wire = (fn) => $('#gateBtn', view)?.addEventListener('click', async () => { try { await fn(); rerender(); } catch (e) { toast(e.message, 'error'); } });
  if (chain.MODE === 'live' && !w.hasWallet) {
    view.innerHTML = gateMsg('Install MetaMask', 'Logging is a transaction on BOT Chain, so you’ll need the MetaMask browser extension (or the MetaMask mobile browser).', '<a class="btn btn-primary btn-xl" href="https://metamask.io/download/" target="_blank" rel="noopener">Install MetaMask ↗</a>');
    return false;
  }
  if (!w.account) {
    view.innerHTML = gateMsg('Start your log', 'Connect your wallet to pick a handle and log today. No account, no email — your wallet is your login.', '<button class="btn btn-primary btn-xl" id="gateBtn" type="button">Connect wallet</button>');
    wire(chain.connect);
    return false;
  }
  if (!w.chainOk) {
    view.innerHTML = gateMsg('Switch to BOT Chain', `Ship Log lives on ${esc(chain.NET.name)} (chain ID ${chain.NET.chainId}). MetaMask will add it if it’s missing.`, '<button class="btn btn-primary btn-xl" id="gateBtn" type="button">Switch to BOT Chain</button>');
    wire(chain.switchNetwork);
    return false;
  }
  return true;
}

function subscribe(view, rerender, events = ['wallet', 'clock']) {
  addCleanup(chain.onChange((w) => { if (events.includes(w) && view.isConnected) rerender(); }));
}

// ================================================================== SETUP / EDIT PROFILE
export function renderSetup(view, opts = {}) {
  if (!opts.first) subscribe(view, () => paintSetup(view, opts));
  return paintSetup(view, opts);
}
async function paintSetup(view, { first = false } = {}) {
  const rerender = () => paintSetup(view, { first });
  if (!walletGate(view, rerender)) return;
  const me = chain.wallet.account;
  const p = await chain.getProfile(me);
  const s = settings(me);
  const isNew = !p.handle;
  const tzs = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [s.tz, 'UTC']; } })();
  if (!tzs.includes(s.tz)) tzs.unshift(s.tz);

  view.innerHTML = `<div class="app"><div class="wrap">
    <form class="panel today-card setup-card" id="setupForm" novalidate>
      <div class="today-head"><span class="today-date">${isNew ? 'SET UP YOUR LOG' : 'EDIT PROFILE'}</span><span class="mono muted">${isNew ? 'once · 1 transaction' : esc('@' + p.handle)}</span></div>
      <div class="today-body">
        ${isNew ? '<p class="muted">Pick a handle for your public page. Your logs will live at <b>/@handle</b>.</p>' : ''}
        <div class="field">
          <label for="fHandle">Handle <span class="count" id="cHandle">3–20 · a–z 0–9 _</span></label>
          <div class="handle-wrap"><span class="at">@</span><input class="input big-input" id="fHandle" name="handle" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20" value="${esc(p.handle)}" placeholder="your_handle" required></div>
          <p class="err" id="eHandle" hidden></p>
        </div>
        <div class="field">
          <label for="fBio">Short bio <span class="count" id="cBio">0 / ${LIMITS.bio}</span></label>
          <input class="input" id="fBio" name="bio" value="${esc(p.bio)}" placeholder="Building a habit app in public">
          <p class="err" id="eBio" hidden></p>
        </div>
        <div class="field">
          <label for="fRepos">Public GitHub repos <span class="count">up to ${LIMITS.repos}</span></label>
          <textarea class="textarea" id="fRepos" name="repos" rows="3" placeholder="owner/repo — one per line">${esc(reposFromString(p.repos).join('\n'))}</textarea>
          <p class="hint">Today’s commits are pulled from these (public repos only — no GitHub login).</p>
          <p class="err" id="eRepos" hidden></p>
        </div>
        <div class="row2">
          <div class="field">
            <label for="fGh">GitHub username <span class="count">optional</span></label>
            <input class="input" id="fGh" name="gh" value="${esc(s.ghUser)}" placeholder="only count my commits" autocapitalize="none" spellcheck="false">
          </div>
          <div class="field">
            <label for="fTz">Timezone</label>
            <select class="select" id="fTz" name="tz">${tzs.map((z) => `<option${z === s.tz ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select>
          </div>
        </div>
        <p class="hint mono">Username and timezone stay in this browser. The chain counts days in UTC.</p>
      </div>
      <div class="log-actions">
        <button class="btn btn-primary" type="submit" id="setupBtn">${isNew ? 'Claim my handle' : 'Save profile'}</button>
        <span class="tx-status" id="setupStatus"></span>
      </div>
    </form></div></div>`;

  const f = $('#setupForm');
  const hIn = $('#fHandle'), bio = $('#fBio'), repos = $('#fRepos');
  const showErr = (id, msg) => { const el = $(id); el.hidden = !msg; el.textContent = msg || ''; };
  let checkSeq = 0;
  let taken = false;
  const checkHandle = async () => {
    const h = cleanHandle(hIn.value);
    if (hIn.value !== h) hIn.value = h;
    const issue = handleIssue(h);
    taken = false;
    $('#cHandle').textContent = issue ? '3–20 · a–z 0–9 _' : '';
    showErr('#eHandle', h && issue ? issue : '');
    if (issue || h === p.handle) { if (h === p.handle && h) $('#cHandle').innerHTML = '<span class="handle-ok">✓ yours</span>'; return; }
    const seq = ++checkSeq;
    $('#cHandle').textContent = 'checking…';
    try {
      const owner = await chain.profileByHandle(h);
      if (seq !== checkSeq) return;
      taken = !!owner && !chain.sameAddr(owner.who, me);
      showErr('#eHandle', taken ? 'That handle is taken — try another.' : '');
      $('#cHandle').innerHTML = taken ? '' : '<span class="handle-ok">✓ available</span>';
    } catch { if (seq === checkSeq) $('#cHandle').textContent = ''; }
  };
  let tmr;
  hIn.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(checkHandle, 350); });
  const bioCount = () => { const n = chars(bio.value); $('#cBio').textContent = `${n} / ${LIMITS.bio}`; $('#cBio').classList.toggle('over', n > LIMITS.bio); };
  bio.addEventListener('input', bioCount); bioCount();
  if (p.handle) checkHandle();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const h = cleanHandle(hIn.value);
    const b = oneLine(bio.value);
    const list = parseRepos(repos.value);
    const hi = handleIssue(h) || (taken ? 'That handle is taken — try another.' : '');
    const bi = chars(b) > LIMITS.bio ? `${LIMITS.bio} characters max.` : flagged(b) ? 'Please keep it friendly.' : '';
    const ri = repoIssue(list);
    showErr('#eHandle', hi); showErr('#eBio', bi); showErr('#eRepos', ri);
    if (hi || bi || ri) return;
    saveSettings(me, { tz: $('#fTz').value, ghUser: $('#fGh').value.trim().replace(/^@/, '') });

    const changedHandle = h !== p.handle;
    const changedRest = b !== p.bio || list.join(',') !== p.repos;
    if (!changedHandle && !changedRest) { toast('Saved ✓', 'ok'); go(`@${h}`); return; }
    const btn = $('#setupBtn'); const st = $('#setupStatus');
    btn.disabled = true;
    st.textContent = chain.MODE === 'live' ? 'Confirm in MetaMask…' : 'Simulating the transaction…';
    try {
      const onSent = (hash) => { st.innerHTML = chain.MODE === 'live' ? `Saving on BOT Chain… <a href="${chain.explorerTx(hash)}" target="_blank" rel="noopener">view tx ↗</a>` : 'Saving…'; };
      if (changedHandle) await chain.claimHandle(h, b, list, onSent);
      else await chain.updateProfile(b, list, onSent);
      toast(isNew ? `Welcome, @${h}! 🚀` : 'Profile saved ✓', 'ok');
      go(isNew ? 'app' : `@${h}`);
    } catch (err) {
      btn.disabled = false;
      st.textContent = '';
      if (err.code === 'HandleTaken') showErr('#eHandle', err.message);
      else if (err.code === 'BadHandle') showErr('#eHandle', err.message);
      toast(err.message, 'error');
    }
  });
}

// ================================================================== TODAY
export function renderToday(view) {
  subscribe(view, () => paintToday(view));
  return paintToday(view);
}
async function paintToday(view) {
  const rerender = () => paintToday(view);
  if (!walletGate(view, rerender)) return;
  view.innerHTML = `<div class="app"><div class="wrap"><div class="panel skeleton" style="height:420px"></div></div></div>`;
  const me = chain.wallet.account;
  let [p, entries] = await Promise.all([chain.getProfile(me), chain.getEntries(me)]);
  if (!view.isConnected) return;
  if (!p.handle) return renderSetup(view, { first: true });

  const t = chain.today();
  const s = settings(me);
  const todays = p.lastDay === t ? entries[entries.length - 1] : null;
  const draftKey = `draft.${me.toLowerCase()}.${t}`;
  const draft = todays ? { ...todays } : { shipped: '', blocked: '', next: '', link: '', tag: 0, energy: 1, commits: 0, ...store.get(draftKey, {}) };
  const repos = reposFromString(p.repos);
  const ns = nextStreak(p, t);
  const endOfDay = (t + 1) * 86400 - Math.floor(chain.nowMs() / 1000);
  const hrs = Math.floor(endOfDay / 3600), mins = Math.floor((endOfDay % 3600) / 60);

  view.innerHTML = `<div class="app today"><div class="wrap">
    <div class="app-intro" style="margin-bottom:22px"><h1 class="app-title">Today</h1><p class="muted">Hi <a href="@${esc(p.handle)}" data-link>@${esc(p.handle)}</a> — what did you ship?</p></div>
    <div class="app-grid">
      <div style="display:grid;gap:24px">
        <form class="panel today-card" id="todayForm" novalidate>
          <div class="today-head">
            <span class="today-date">${esc(formatDay(t, { weekday: 'short', year: true }).toUpperCase())}</span>
            <span class="mono" id="dayBadge">${todays ? `✓ logged · day ${p.streak}` : `→ day ${ns.value} ${ns.fresh ? '🌱' : '🔥'}`}</span>
          </div>
          <div class="today-body">
            <p class="mono muted" style="font-size:12px;margin-top:-6px">UTC day · resets in ${hrs}h ${mins}m${todays ? ' · edits update today’s entry' : ''}</p>
            ${ns.freeze && !todays ? '<p class="warn-msg">❄️ You missed yesterday — log today and your weekly freeze keeps the streak.</p>' : ''}
            ${ns.broke && !todays ? '<p class="kind-msg">New streak, day 1 🌱 — every streak starts with one.</p>' : ''}
            ${field('shipped', '🚀 Shipped', LIMITS.shipped, draft.shipped, 'Added wallet connect + switch network', true)}
            <div class="row2">
              ${field('blocked', '🧱 Blocked', LIMITS.blocked, draft.blocked, 'RPC timeouts on testnet')}
              ${field('next', '➡️ Next', LIMITS.next, draft.next, 'Deploy to mainnet')}
            </div>
            <div class="field"><span class="flabel">Tag</span><div class="choice-row" role="radiogroup" aria-label="Tag">${TAGS.map((tg) => `<label class="choice" style="--tag:${tg.color}"><input type="radio" name="tag" value="${tg.id}"${draft.tag === tg.id ? ' checked' : ''}><span>${tg.emoji} ${tg.label}</span></label>`).join('')}</div></div>
            <div class="row2">
              <div class="field"><span class="flabel">Energy</span><div class="choice-row" role="radiogroup" aria-label="Energy">${ENERGY.map((en) => `<label class="choice"><input type="radio" name="energy" value="${en.id}"${draft.energy === en.id ? ' checked' : ''}><span>${en.icon} ${en.label}</span></label>`).join('')}</div></div>
              <div class="field"><label for="f-link">Link <span class="count">optional</span></label><input class="input" id="f-link" name="link" value="${esc(draft.link)}" placeholder="demo, PR, tweet or screenshot URL" inputmode="url"><p class="err" id="e-link" hidden></p></div>
            </div>
            <div class="field">
              <span class="flabel">Commits today <span class="count">${repos.length ? `${repos.length} repo${repos.length === 1 ? '' : 's'} linked` : ''}</span></span>
              <div class="commits-box" id="commitsBox">${repos.length ? '<div class="skeleton" style="height:22px"></div>' : '<p>Link a repo to pull commits — <a href="app/profile" data-link>add repos</a>. Entries work without them.</p>'}</div>
              <div class="commit-total"><label for="f-commits" class="mono">Count on-chain</label><input class="input" type="number" min="0" max="65535" id="f-commits" name="commits" value="${draft.commits || 0}"><span class="hint" id="commitHint"></span></div>
            </div>
          </div>
          <div class="log-actions">
            <button class="btn btn-primary" type="submit" id="logBtn">${todays ? 'Update today' : 'Log today'}</button>
            <span class="tx-status" id="logStatus"></span>
          </div>
        </form>

        <section class="panel share-panel" id="share">
          <div class="panel-head"><h3>✨ Share it</h3><span class="mono muted">X post + thread</span></div>
          <div class="field"><span class="flabel">Tone</span><div class="choice-row">${TONES.map((tn) => `<label class="choice"><input type="radio" name="tone" value="${tn}"${s.tone === tn ? ' checked' : ''}><span>${tn[0].toUpperCase() + tn.slice(1)}</span></label>`).join('')}</div></div>
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:14px">
            <button class="btn btn-ink" type="button" id="postBtn">✨ Make my post</button>
            <label class="switch"><input type="checkbox" id="mention"${s.mention ? ' checked' : ''}> mention @BOTChain_ai</label>
          </div>
          <div id="postOut"></div>
        </section>

        <section class="panel" id="recap">
          <div class="panel-head"><h3>🗓️ Weekly recap</h3><span class="mono muted">${weekday(t) === 0 ? 'it’s Sunday!' : 'Sundays'}</span></div>
          ${weekday(t) === 0
            ? '<p class="muted" style="margin-bottom:14px">Turn this week’s entries into a thread.</p><button class="btn btn-ink" type="button" id="recapBtn">Make my weekly recap</button><div id="recapOut"></div>'
            : `<p class="muted">On Sundays, Ship Log turns your week of entries into a thread. Next one: ${esc(formatDay(t + ((7 - weekday(t)) % 7), { weekday: 'long' }))}.</p>`}
        </section>
      </div>
      <aside class="app-side" id="side"></aside>
    </div></div></div>`;

  const form = $('#todayForm');
  const val = (n) => form.elements[n]?.value ?? '';
  const read = () => ({
    shipped: oneLine(val('shipped')), blocked: oneLine(val('blocked')), next: oneLine(val('next')), link: val('link').trim(),
    tag: Number(form.elements.tag.value), energy: Number(form.elements.energy.value), commits: Math.max(0, Math.min(65535, parseInt(val('commits') || '0', 10) || 0)),
  });

  // counters + draft autosave
  const counters = () => ['shipped', 'blocked', 'next'].forEach((k) => {
    const n = chars(val(k)); const c = $(`#c-${k}`);
    c.textContent = `${n} / ${LIMITS[k]}`; c.classList.toggle('over', n > LIMITS[k]);
  });
  counters();
  form.addEventListener('input', () => { counters(); if (!todays) store.set(draftKey, read()); });

  // commits from GitHub
  let commitMsgs = [];
  let commitRepos = [];
  let manual = !!todays;
  $('#f-commits').addEventListener('input', () => { manual = true; });
  if (repos.length) loadCommits();
  async function loadCommits() {
    const ticked = new Set(store.get(`ticked.${me.toLowerCase()}`, repos));
    const res = await commitsToday(repos, t, s.ghUser);
    if (!view.isConnected) return;
    const box = $('#commitsBox');
    const anyErr = res.find((r) => r.error && r.error.code !== 'missing');
    box.innerHTML = res.map((r, i) => {
      const name = r.repo.split('/')[1];
      if (r.error) return `<div class="repo-line"><input type="checkbox" disabled><div><b>${esc(r.repo)}</b><br><span class="hint">${esc(r.error.message)}</span></div></div>`;
      const n = r.list.length;
      return `<div class="repo-line"><input type="checkbox" data-i="${i}" id="rp${i}"${ticked.has(r.repo) ? ' checked' : ''}><details${n ? '' : ' open'}><summary><label for="rp${i}">${n} commit${n === 1 ? '' : 's'} in <b>${esc(name)}</b></label></summary>${n ? `<ul>${r.list.slice(0, 12).map((c) => `<li>${esc(c.sha.slice(0, 7))} ${esc(c.message)}</li>`).join('')}${n > 12 ? `<li>+${n - 12} more</li>` : ''}</ul>` : '<ul><li>nothing pushed yet today (UTC)</li></ul>'}</details></div>`;
    }).join('');
    $('#commitHint').textContent = anyErr ? 'Commits unavailable right now — enter a number.' : 'auto-filled from ticked repos · you can edit it';
    const sum = () => {
      const on = $$('input[data-i]', box).filter((x) => x.checked).map((x) => res[x.dataset.i]);
      store.set(`ticked.${me.toLowerCase()}`, [...$$('input[data-i]', box)].filter((x) => x.checked).map((x) => res[x.dataset.i].repo).concat(res.filter((r) => r.error).map((r) => r.repo)));
      commitMsgs = on.flatMap((r) => r.list.map((c) => `${r.repo.split('/')[1]}: ${c.message}`));
      commitRepos = on.filter((r) => r.list.length).map((r) => r.repo.split('/')[1]);
      if (!manual && !anyErr) $('#f-commits').value = on.reduce((n, r) => n + r.list.length, 0);
    };
    box.addEventListener('change', (e) => { if (e.target.matches('input[data-i]')) { manual = false; sum(); } });
    sum();
    if (gsapReady()) gsap.from($$('.repo-line', box), { y: -16, opacity: 0, stagger: 0.08, duration: 0.4, ease: 'back.out(2)' });
  }

  // log / update
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entry = read();
    const issues = entryIssues(entry);
    const link = cleanLink(entry.link);
    ['shipped', 'blocked', 'next', 'link'].forEach((k) => { const el = $(`#e-${k}`); if (el) { el.hidden = !issues[k]; el.textContent = issues[k] || ''; } form.elements[k]?.classList.toggle('bad', !!issues[k]); });
    if (Object.keys(issues).length) { form.querySelector('.bad')?.focus(); return; }
    entry.link = link || '';
    const before = await chain.getProfile(me);
    const t2 = chain.today();
    const n2 = nextStreak(before, t2);
    const btn = $('#logBtn'); const st = $('#logStatus');
    btn.disabled = true;
    st.textContent = chain.MODE === 'live' ? 'Confirm in MetaMask…' : 'Simulating the transaction…';
    try {
      const r = await chain.logToday(entry, (hash) => {
        st.innerHTML = chain.MODE === 'live' ? `Logging on BOT Chain… <a href="${chain.explorerTx(hash)}" target="_blank" rel="noopener">view tx ↗</a>` : 'Logging…';
      });
      store.del(draftKey);
      const after = await chain.getProfile(me);
      p = after;
      entries = await chain.getEntries(me);
      st.innerHTML = chain.MODE === 'live' ? `Logged ✓ <a href="${chain.explorerTx(r.hash)}" target="_blank" rel="noopener">view tx ↗</a>` : 'Logged ✓ (preview)';
      btn.textContent = 'Update today';
      btn.disabled = false;
      $('#dayBadge').textContent = `✓ logged · day ${after.streak}`;
      if (!n2.update) stampDay(form, after.streak, n2);
      else toast('Today’s entry updated ✓', 'ok');
      paintSide();
      setTimeout(() => $('#share').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }), n2.update ? 0 : 1300);
    } catch (err) {
      btn.disabled = false;
      st.innerHTML = `${esc(err.message)} <button type="button" class="link-btn" id="retryBtn">Retry</button>`;
      $('#retryBtn')?.addEventListener('click', () => form.requestSubmit());
      if (err.code !== 'rejected') toast(err.message, 'error');
    }
  });

  // AI post
  $('#postBtn').addEventListener('click', async () => {
    const entry = read();
    if (!entry.shipped) { toast('Write what you shipped first.', 'error'); form.elements.shipped.focus(); return; }
    const tone = $('#share input[name=tone]:checked')?.value || 'casual';
    const mention = $('#mention').checked;
    saveSettings(me, { tone, mention });
    const btn = $('#postBtn');
    btn.disabled = true; btn.textContent = '✨ Writing…';
    const streakNow = p.lastDay === chain.today() ? p.streak : nextStreak(p, chain.today()).value;
    const out = await makePost({ entry, commits: commitMsgs, repoNames: commitRepos, tone, streak: streakNow, mention });
    btn.disabled = false; btn.textContent = '✨ Make it again';
    renderPost($('#postOut'), out, { entry, streak: streakNow, handle: p.handle, day: chain.today() });
  });

  // weekly recap
  $('#recapBtn')?.addEventListener('click', async () => {
    const week = entries.filter((e) => e.day > chain.today() - 7);
    if (!week.length) { toast('No entries this week yet — log today first.', 'error'); return; }
    const btn = $('#recapBtn');
    btn.disabled = true; btn.textContent = 'Writing…';
    const out = await makeRecap({ entries: week, streak: p.streak, tone: $('#share input[name=tone]:checked')?.value, mention: $('#mention').checked });
    btn.disabled = false; btn.textContent = 'Make it again';
    renderThread($('#recapOut'), out.thread, out.source);
  });

  function paintSide() {
    const side = $('#side');
    if (!side) return;
    const tt = chain.today();
    const ls = liveStreak(p, tt);
    const msg = { today: 'Logged today ✓', alive: 'Log today to keep it going', freeze: 'Missed yesterday — log today and your weekly freeze covers it ❄️', broken: 'New streak, day 1 🌱 — log today to start', none: 'Your first day starts now' }[ls.state];
    const freezeUsed = p.freezeWeek === weekOf(tt) + 1;
    const last5 = entries.slice(-5).reverse();
    side.innerHTML = `
      <div class="panel streak-panel">
        <p class="label">Current streak</p>
        <div class="big"><span class="flame-icon" id="bigFlame">${ls.value ? '🔥' : '🌱'}</span><span id="bigStreak">${ls.value}</span></div>
        <p class="muted" style="margin-top:8px">${msg}</p>
        <div class="stat-grid">
          <div><b>${p.bestStreak}</b><span>best streak</span></div>
          <div><b>${fmt(p.totalDays)}</b><span>days logged</span></div>
          <div><b>${fmt(p.totalCommits)}</b><span>commits logged</span></div>
          <div><b>${freezeUsed ? '0' : '1'}</b><span>freeze left this week</span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Last 20 weeks</h3><a class="mono" href="@${esc(p.handle)}" data-link>profile →</a></div>
        <div class="hm-scroll" id="miniHeat">${heatmapSVG(entries, { today: tt, weeks: 20, cell: 12, gap: 3 })}</div>
        ${LEGEND}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Recent</h3><span class="mono muted">last 5</span></div>
        <div class="entry-list">${last5.length ? last5.map((e) => entryHTML(e, { compact: true })).join('') : '<p class="muted">Your entries show up here.</p>'}</div>
      </div>`;
    animateHeatmap($('#miniHeat'));
  }
  paintSide();
}

function field(name, label, max, value, placeholder, big = false) {
  const tag = big ? 'textarea' : 'input';
  const attrs = `class="${big ? 'textarea big-input' : 'input'}" id="f-${name}" name="${name}" placeholder="${esc(placeholder)}"${big ? ' rows="2" required' : ''}`;
  return `<div class="field"><label for="f-${name}">${label} <span class="count" id="c-${name}">0 / ${max}</span>${big ? '' : ''}</label>${big ? `<${tag} ${attrs}>${esc(value)}</${tag}>` : `<${tag} ${attrs} value="${esc(value)}">`}${big ? '' : '<span class="sr">optional</span>'}<p class="err" id="e-${name}" hidden></p></div>`;
}

/** The rubber stamp thumps onto the card and the flame grows. */
function stampDay(form, streak, ns) {
  const el = document.createElement('div');
  el.className = 'stamp-drop';
  el.innerHTML = `DAY ${streak}${ns.fresh ? ' 🌱' : ' 🔥'}<small>${ns.freeze ? 'FREEZE USED · LOGGED' : 'LOGGED ON BOT CHAIN'}</small>`;
  form.append(el);
  if (ns.broke) toast('New streak, day 1 🌱 — welcome back.', 'ok');
  else if (ns.freeze) toast('Your weekly freeze covered yesterday ❄️', 'ok');
  else toast(`Day ${streak} logged 🔥`, 'ok');
  if (!gsapReady()) return;
  gsap.timeline()
    .fromTo(el, { scale: 3, opacity: 0, rotation: 6 }, { scale: 1, opacity: 1, rotation: -10, duration: 0.32, ease: 'power4.in' })
    .to(form, { y: 4, duration: 0.06, yoyo: true, repeat: 1 }, '>-0.02')
    .fromTo('#bigFlame', { scale: 0.6 }, { scale: 1.5, duration: 0.35, ease: 'back.out(3)', yoyo: true, repeat: 1, transformOrigin: '50% 90%' }, '<');
}

function renderPost(box, out, ctx) {
  box.innerHTML = `<div class="share-out">
    <p class="mono muted" style="margin-top:6px">${out.source === 'ai' ? 'Written by AI from your entry — check it before posting.' : 'A simple template (AI is offline right now) — edit away.'}</p>
    <div class="field"><label for="postText">Post <span class="count" id="postCount"></span></label><textarea class="textarea" id="postText" rows="6">${esc(out.post)}</textarea></div>
    <div class="share-actions">
      <button class="btn btn-sm" type="button" id="copyPost">Copy</button>
      <a class="btn btn-primary btn-sm" id="openX" href="#" target="_blank" rel="noopener">Open in X ↗</a>
      <button class="btn btn-sm" type="button" id="cardBtn">Download share card</button>
    </div>
    <div id="threadBox"></div>
  </div>`;
  const ta = $('#postText');
  const sync = () => { const n = chars(ta.value); $('#postCount').textContent = `${n} / 280`; $('#postCount').classList.toggle('over', n > 280); $('#openX').href = xIntent(ta.value); };
  ta.addEventListener('input', sync); sync();
  $('#copyPost').onclick = () => copyText(ta.value, 'Post copied');
  $('#cardBtn').onclick = () => shareCard(ctx);
  renderThread($('#threadBox'), out.thread);
  if (gsapReady()) {
    const text = ta.value; const o = { n: 0 };
    gsap.to(o, { n: [...text].length, duration: Math.min(2, [...text].length / 120), ease: 'none', onUpdate: () => { ta.value = [...text].slice(0, Math.round(o.n)).join(''); }, onComplete: sync });
  }
}

function renderThread(box, thread, source) {
  box.innerHTML = `<div class="share-out" style="margin-top:18px">
    <div class="panel-head" style="margin:0"><b>Thread</b>${source ? `<span class="mono muted">${source === 'ai' ? 'AI' : 'template'}</span>` : ''}</div>
    ${thread.map((t, i) => `<div class="thread-item"><span class="n">${i + 1}/${thread.length}</span><textarea class="textarea" data-th="${i}" rows="4">${esc(t)}</textarea></div>`).join('')}
    <div class="share-actions"><button class="btn btn-sm" type="button" data-copy-thread>Copy thread</button><a class="btn btn-sm" data-x-first href="${xIntent(thread[0] || '')}" target="_blank" rel="noopener">Post 1/${thread.length} in X ↗</a></div>
  </div>`;
  const parts = () => $$('[data-th]', box).map((x) => x.value);
  box.querySelector('[data-copy-thread]').onclick = () => copyText(parts().map((p, i) => `${i + 1}/${parts().length}\n${p}`).join('\n\n'), 'Thread copied');
  box.addEventListener('input', () => { box.querySelector('[data-x-first]').href = xIntent(parts()[0] || ''); });
}

let h2iReady;
async function shareCard({ entry, streak, handle, day }) {
  try {
    h2iReady ||= new Promise((res, rej) => {
      if (window.htmlToImage) return res(window.htmlToImage);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
      s.onload = () => res(window.htmlToImage); s.onerror = () => { h2iReady = null; rej(new Error('load')); };
      document.head.append(s);
    });
    const h2i = await h2iReady;
    const el = document.createElement('div');
    el.className = 'share-card';
    el.innerHTML = `<div class="sc-inner">
      <div class="sc-stamp">DAY ${streak}</div>
      <p class="sc-date">${esc(formatDay(day, { weekday: 'short', year: true }).toUpperCase())}</p>
      <div>${tagChip(entry.tag)}</div>
      <p class="sc-shipped">🚀 ${esc(entry.shipped)}</p>
      ${entry.blocked ? `<p class="sc-row">🧱 ${esc(entry.blocked)}</p>` : ''}
      ${entry.next ? `<p class="sc-row">➡️ ${esc(entry.next)}</p>` : ''}
      <div class="sc-foot"><span>@${esc(handle)} · ${entry.commits} commits</span><span style="display:flex;align-items:center;gap:12px">Ship Log · BOT Chain</span></div>
    </div>`;
    document.body.append(el);
    const url = await h2i.toPng(el, { pixelRatio: 1, width: 1080, height: 1080, style: { left: '0', position: 'static' } });
    el.remove();
    const a = Object.assign(document.createElement('a'), { href: url, download: `shiplog-${handle}-${isoDay(day)}.png` });
    a.click();
  } catch {
    toast('Couldn’t make the card image — try again.', 'error');
  }
}

// ================================================================== ENTRY HTML (shared)
function reportHref(handle, day) {
  const base = CONFIG.links.report || '';
  const title = `Report @${handle} (${day ? isoDay(day) : 'profile'})`;
  if (base.startsWith('mailto:')) return `${base}?subject=${encodeURIComponent(title)}`;
  const m = base.match(/^https:\/\/github\.com\/[^/]+\/[^/]+/);
  return m ? `${m[0]}/issues/new?title=${encodeURIComponent(title)}` : base;
}

function entryHTML(e, { compact = false, handle = '', who = '', tz = localTz(), tx = '' } = {}) {
  const link = e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener nofollow ugc">${esc(e.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))} ↗</a>` : '';
  if (compact) {
    return `<div class="entry"><div class="entry-top">${esc(formatDay(e.day, { weekday: 'short' }))} ${tagChip(e.tag)} ${energyIcon(e.energy)}</div><p class="entry-shipped">${esc(e.shipped)}</p><div class="entry-foot"><span>${e.commits} commit${e.commits === 1 ? '' : 's'}</span>${link}</div></div>`;
  }
  return `<article class="entry">
    <div class="entry-date">${esc(formatDay(e.day, { weekday: 'short', year: true }))}<small>${esc(formatTime(e.at, tz))} · your time</small></div>
    <div class="entry-top">${tagChip(e.tag)} ${energyIcon(e.energy)}</div>
    <p class="entry-shipped">🚀 ${esc(e.shipped)}</p>
    ${e.blocked || e.next ? `<p class="entry-sub">${e.blocked ? `🧱 ${esc(e.blocked)}` : ''}${e.blocked && e.next ? ' &nbsp;·&nbsp; ' : ''}${e.next ? `➡️ ${esc(e.next)}` : ''}</p>` : ''}
    <div class="entry-foot"><span>${e.commits} commit${e.commits === 1 ? '' : 's'}</span>${link}${chain.MODE === 'live' ? `<a href="${tx ? chain.explorerTx(tx) : chain.explorerAddress(who)}" target="_blank" rel="noopener" data-day="${e.day}">explorer ↗</a>` : '<span>preview</span>'}<a href="${esc(reportHref(handle, e.day))}" target="_blank" rel="noopener">report</a></div>
  </article>`;
}

// ================================================================== PROFILE
export function renderProfile(view, handle) {
  subscribe(view, () => paintProfile(view, handle), ['wallet', 'clock', 'data']);
  return paintProfile(view, handle);
}
async function paintProfile(view, handle) {
  view.innerHTML = `<div class="app"><div class="wrap"><div class="skeleton" style="height:96px;width:60%;margin-bottom:24px"></div><div class="skeleton" style="height:180px"></div></div></div>`;
  let p;
  try { p = await chain.profileByHandle(handle); } catch { p = undefined; }
  if (!view.isConnected) return;
  if (p === undefined) { view.innerHTML = gateMsg('Couldn’t load', 'BOT Chain didn’t answer — check your connection and try again.', '<button class="btn btn-primary" type="button" onclick="location.reload()">Retry</button>'); return; }
  if (!p) {
    view.innerHTML = `<section class="nf wrap"><h1>Builder not found</h1><p class="muted">Nobody has claimed <b>@${esc(handle)}</b> yet.</p><p style="margin-top:24px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="app/profile" data-link>Claim it</a><a class="btn" href="app/explore" data-link>Explore builders</a></p></section>`;
    return;
  }
  const entries = await chain.getEntries(p.who);
  const t = chain.today();
  const ls = liveStreak(p, t);
  const own = chain.sameAddr(chain.wallet.account, p.who);
  let isCurator = false;
  try { isCurator = !!chain.wallet.account && chain.sameAddr(await chain.curator(), chain.wallet.account); } catch { /* ignore */ }
  const tz = settings(chain.wallet.account).tz;
  const repos = reposFromString(p.repos);
  const followed = following().includes(p.handle);
  const list = [...entries].reverse();

  view.innerHTML = `<div class="app"><div class="wrap">
    <header class="profile-head">
      <div>
        <p class="mono muted">${esc(chain.short(p.who))}${p.hidden ? ' · hidden from Explore' : ''}</p>
        <h1>@${esc(p.handle)}</h1>
        ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
        ${repos.length ? `<div class="repo-chips">${repos.map((r) => `<a class="chip" href="https://github.com/${esc(r)}" target="_blank" rel="noopener">⌥ ${esc(r)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="profile-actions">
        ${own ? '<a class="btn btn-primary" href="app" data-link>Log today</a><a class="btn" href="app/profile" data-link>Edit profile</a>' : `<button class="btn ${followed ? 'btn-ink' : ''}" type="button" id="followBtn" aria-pressed="${followed}">${followed ? 'Following ✓' : '+ Follow'}</button>`}
        <button class="btn" type="button" id="shareProfile">Copy link</button>
        ${isCurator ? `<button class="btn" type="button" id="hideBtn">${p.hidden ? 'Show in Explore' : 'Hide from Explore'}</button>` : ''}
      </div>
    </header>
    <div class="profile-stats">
      <div><b>${ls.value ? '🔥' : ''}${ls.value}</b><span>current streak</span></div>
      <div><b>${p.bestStreak}</b><span>best streak</span></div>
      <div><b>${fmt(p.totalDays)}</b><span>days logged</span></div>
      <div><b>${fmt(p.totalCommits)}</b><span>commits logged</span></div>
    </div>
    <section class="panel">
      <div class="panel-head"><h3>Last 52 weeks</h3><span class="mono muted">darker = more commits</span></div>
      <div class="hm-scroll" id="bigHeat">${heatmapSVG(entries, { today: t, weeks: 52 })}</div>
      ${LEGEND}
    </section>
    <section class="timeline">
      <div class="panel-head"><h3 style="font-size:32px">Timeline</h3><span class="mono muted">${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · newest first</span></div>
      <div class="entry-list" id="timeline">${list.length ? list.slice(0, 30).map((e) => entryHTML(e, { handle: p.handle, who: p.who, tz })).join('') : '<p class="muted">No entries yet.</p>'}</div>
      ${list.length > 30 ? '<p style="margin-top:20px"><button class="btn" type="button" id="moreEntries">Show more</button></p>' : ''}
    </section>
  </div></div>`;

  animateHeatmap($('#bigHeat'));
  const hs = $('#bigHeat'); hs.scrollLeft = hs.scrollWidth;
  let shown = 30;
  $('#moreEntries')?.addEventListener('click', (e) => {
    shown += 30;
    $('#timeline').innerHTML = list.slice(0, shown).map((x) => entryHTML(x, { handle: p.handle, who: p.who, tz })).join('');
    if (shown >= list.length) e.target.remove();
  });
  $('#followBtn')?.addEventListener('click', (e) => {
    const on = toggleFollow(p.handle);
    e.target.textContent = on ? 'Following ✓' : '+ Follow';
    e.target.classList.toggle('btn-ink', on);
    e.target.setAttribute('aria-pressed', String(on));
    toast(on ? `Following @${p.handle} (saved in this browser)` : `Unfollowed @${p.handle}`);
  });
  $('#shareProfile').addEventListener('click', () => copyText(location.origin + (window.SHIPLOG_BASE || '/') + '@' + p.handle, 'Profile link copied'));
  $('#hideBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await chain.setHidden(p.who, !p.hidden); toast('Updated ✓', 'ok'); } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
  });
}

// ================================================================== EXPLORE
export function renderExplore(view) {
  subscribe(view, () => paintExplore(view), ['clock', 'data']);
  return paintExplore(view);
}
async function paintExplore(view) {
  view.innerHTML = `<div class="app"><div class="wrap">
    <h1 class="app-title">Explore</h1>
    <p class="muted">The latest logs from every builder on BOT Chain.</p>
    <div class="explore-grid" style="margin-top:12px">
      <div>
        <div class="filter-row" id="filters">
          <button type="button" data-f="all" aria-pressed="true">All</button>
          <button type="button" data-f="following" aria-pressed="false">Following</button>
          ${TAGS.map((tg) => `<button type="button" data-f="${tg.id}" aria-pressed="false">${tg.emoji} ${tg.label}</button>`).join('')}
        </div>
        <div class="feed" id="feed">${'<div class="panel skeleton" style="height:120px"></div>'.repeat(3)}</div>
        <p style="margin-top:20px"><button class="btn" type="button" id="moreFeed" hidden>Load more</button></p>
      </div>
      <aside class="app-side">
        <section class="panel" id="leaders"><div class="panel-head"><h3>🔥 Longest streaks</h3><span class="mono muted">live</span></div><div id="leaderList"><div class="skeleton" style="height:140px"></div></div></section>
        <section class="panel launch-card"><div class="panel-head"><h3>🚀 Launching today</h3></div><div id="launchList"><div class="skeleton" style="height:60px"></div></div></section>
      </aside>
    </div></div></div>`;

  const t = chain.today();
  let items = [];
  let skip = 0;
  let filter = 'all';
  const PAGE = 40;
  const visible = () => items.filter((x) => !x.hidden);

  const card = (x) => `<article class="panel feed-card" data-tag="${x.entry.tag}" data-handle="${esc(x.handle)}">
    <div class="who"><a href="@${esc(x.handle)}" data-link>@${esc(x.handle)}</a><span style="display:flex;gap:10px;align-items:center">${flame(x.streak)}<span class="mono muted">${esc(x.entry.day === t ? timeAgo(x.entry.at, chain.nowMs()) : formatDay(x.entry.day, { weekday: 'short' }))}</span></span></div>
    <div class="entry-top" style="margin-bottom:8px">${tagChip(x.entry.tag)} ${energyIcon(x.entry.energy)} <span>${x.entry.commits} commit${x.entry.commits === 1 ? '' : 's'}</span></div>
    <p class="entry-shipped">🚀 ${esc(x.entry.shipped)}</p>
    ${x.entry.next ? `<p class="entry-sub" style="margin-top:4px">➡️ ${esc(x.entry.next)}</p>` : ''}
    <div class="entry-foot" style="margin-top:8px">${x.entry.link ? `<a href="${esc(x.entry.link)}" target="_blank" rel="noopener nofollow ugc">link ↗</a>` : ''}<a href="${esc(reportHref(x.handle, x.entry.day))}" target="_blank" rel="noopener">report</a></div>
  </article>`;

  const paintFeed = (animate = false) => {
    const box = $('#feed');
    if (!box) return;
    const fol = following();
    const shown = visible().filter((x) => filter === 'all' || (filter === 'following' ? fol.includes(x.handle) : x.entry.tag === Number(filter)));
    const state = animate && gsapReady() && window.Flip ? Flip.getState($$('.feed-card', box)) : null;
    box.innerHTML = shown.length ? shown.map(card).join('') : `<div class="panel center-card" style="margin:0"><p>${filter === 'following' ? 'You’re not following anyone yet — open a profile and press Follow.' : items.length ? 'No logs with this tag yet.' : 'No logs yet. Be the first!'}</p><a class="btn btn-primary" href="app" data-link>Log today</a></div>`;
    if (state) Flip.from(state, { targets: $$('.feed-card', box), duration: 0.45, ease: 'power2.out', onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.03 }) });
  };

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    $$('#filters [data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    paintFeed(true);
  });

  const loadMore = async () => {
    const page = await chain.getFeed(skip, PAGE);
    skip += page.length;
    items.push(...page);
    $('#moreFeed').hidden = page.length < PAGE;
    paintFeed();
  };
  $('#moreFeed').addEventListener('click', loadMore);

  try {
    const [, builders] = await Promise.all([loadMore(), chain.getBuilders()]);
    if (!view.isConnected) return;
    if (gsapReady()) gsap.from('.feed-card', { y: 24, opacity: 0, stagger: 0.05, duration: 0.45, ease: 'power3.out' });
    const leaders = builders.filter((b) => !b.hidden).map((b) => ({ b, v: liveStreak(b, t).value })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v || b.b.totalDays - a.b.totalDays).slice(0, 10);
    $('#leaderList').innerHTML = leaders.length
      ? leaders.map((x, i) => `<div class="leader"><span class="rank">${String(i + 1).padStart(2, '0')}</span><a href="@${esc(x.b.handle)}" data-link>@${esc(x.b.handle)}</a>${flame(x.v)}</div>`).join('')
      : '<p class="muted">No active streaks yet.</p>';
    const launching = visible().filter((x) => x.entry.tag === LAUNCHING && x.entry.day === t);
    $('#launchList').innerHTML = launching.length
      ? launching.map((x) => `<div class="entry"><a href="@${esc(x.handle)}" data-link style="font-weight:700">@${esc(x.handle)}</a><p class="entry-shipped">${esc(x.entry.shipped)}</p>${x.entry.link ? `<a class="mono" href="${esc(x.entry.link)}" target="_blank" rel="noopener nofollow ugc">see it ↗</a>` : ''}</div>`).join('')
      : '<p class="muted">Nobody is launching today (UTC) yet. Tag your entry “Launching” to show up here.</p>';
  } catch (e) {
    $('#feed').innerHTML = '<div class="panel center-card" style="margin:0"><p>Couldn’t reach BOT Chain right now.</p><button class="btn" type="button" onclick="location.reload()">Retry</button></div>';
    $('#leaderList').innerHTML = $('#launchList').innerHTML = '<p class="muted">—</p>';
  }
}
