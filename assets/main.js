// Shell: router, nav + wallet button, preview bar, footer (address, live stats), ASCII band scramble.
import { CONFIG } from './config.js';
import * as chain from './chain.js';
import { $, $$, esc, toast, copyText, logoLockup, scrambleIn, onVisible, fmt, gsapReady } from './ui.js';
import { formatDay } from './logic.js';
import { renderHome } from './home.js';
import { renderToday, renderSetup, renderExplore, renderProfile, myProfile } from './app.js';

const BASE = window.SHIPLOG_BASE || '/';
const view = $('#view');
let cleanup = [];
export const addCleanup = (fn) => cleanup.push(fn);

// ------------------------------------------------------------------ routing
export const routePath = () => decodeURIComponent(location.pathname.slice(BASE.length - 1)).replace(/\/+$/, '') || '/';

export function go(href, { replace = false } = {}) {
  const url = new URL(href, document.baseURI);
  if (url.origin !== location.origin) { location.href = href; return; }
  if (url.pathname + url.search === location.pathname + location.search && url.hash) {
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    scrollToHash(url.hash);
    return;
  }
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  render();
}
function scrollToHash(hash) {
  const el = hash && document.getElementById(hash.slice(1));
  if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

async function render() {
  cleanup.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  cleanup = [];
  if (window.ScrollTrigger) ScrollTrigger.getAll().forEach((t) => t.kill());
  closeMenu();
  const path = routePath();
  const inApp = path.startsWith('/app') || path.startsWith('/@');
  document.body.classList.toggle('in-app', inApp);
  $$('[data-nav]').forEach((a) => a.removeAttribute('aria-current'));
  view.innerHTML = '';
  window.scrollTo(0, 0);

  let m;
  if (path === '/') { document.title = 'Ship Log — build in public, one day at a time'; await renderHome(view); }
  else if (path === '/app') { mark('today'); document.title = 'Today · Ship Log'; await renderToday(view); }
  else if (path === '/app/explore') { mark('explore'); document.title = 'Explore · Ship Log'; await renderExplore(view); }
  else if (path === '/app/profile' || path === '/app/setup') { mark('profile'); document.title = 'Your profile · Ship Log'; await renderSetup(view); }
  else if ((m = path.match(/^\/@([A-Za-z0-9_]{1,40})$/))) { document.title = `@${m[1].toLowerCase()} · Ship Log`; await renderProfile(view, m[1].toLowerCase()); }
  else {
    document.title = 'Not found · Ship Log';
    view.innerHTML = `<section class="nf wrap"><h1>Nothing logged here.</h1><p class="muted">That page doesn’t exist.</p><p style="margin-top:24px"><a class="btn btn-primary" href="./" data-link>Back home</a></p></section>`;
  }
  if (location.hash) setTimeout(() => scrollToHash(location.hash), 60);
  bindBands(view);
}
const mark = (key) => $(`[data-nav="${key}"]`)?.setAttribute('aria-current', 'page');

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target === '_blank') return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
addEventListener('popstate', render);

// ------------------------------------------------------------------ nav
function closeMenu() { $('#nav').classList.remove('open'); $('#navMenu').setAttribute('aria-expanded', 'false'); }
$('#navMenu').addEventListener('click', () => {
  const open = !$('#nav').classList.contains('open');
  $('#nav').classList.toggle('open', open);
  $('#navMenu').setAttribute('aria-expanded', String(open));
});
// theme toggle (dark by default; the choice is remembered in this browser)
function paintTheme() {
  const dark = document.documentElement.dataset.theme !== 'light';
  $('#themeBtn').textContent = dark ? '☀' : '☾';
  $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  $('#themeColor')?.setAttribute('content', dark ? '#09090B' : '#F6F3EC');
}
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('shiplog.theme', next); } catch { /* ignore */ }
  paintTheme();
});
paintTheme();

// full-width nav at the top → floating pill once you scroll (like save.design)
const pill = () => $('#nav').classList.toggle('pill', window.scrollY > 40);
addEventListener('scroll', pill, { passive: true });
pill();
$('#navLogo').innerHTML = logoLockup();
$('#footLogo').innerHTML = logoLockup();

async function paintWallet() {
  const btn = $('#walletBtn');
  const w = chain.wallet;
  btn.classList.remove('warn');
  if (chain.MODE === 'live' && !w.hasWallet) { btn.textContent = 'Install MetaMask'; btn.dataset.act = 'install'; return; }
  if (!w.account) { btn.textContent = 'Connect wallet'; btn.dataset.act = 'connect'; return; }
  if (!w.chainOk) { btn.textContent = 'Switch to BOT Chain'; btn.classList.add('warn'); btn.dataset.act = 'switch'; return; }
  btn.innerHTML = `<span class="dot" aria-hidden="true"></span>${esc(chain.short(w.account))}`;
  btn.dataset.act = 'profile';
  try {
    const p = await myProfile();
    if (p?.handle) btn.innerHTML = `<span class="dot" aria-hidden="true"></span>@${esc(p.handle)}`;
    $('#navProfile').setAttribute('href', p?.handle ? `@${p.handle}` : 'app/profile');
  } catch { /* ignore */ }
}
$('#walletBtn').addEventListener('click', async () => {
  const act = $('#walletBtn').dataset.act;
  try {
    if (act === 'install') window.open('https://metamask.io/download/', '_blank', 'noopener');
    else if (act === 'connect') await chain.connect();
    else if (act === 'switch') await chain.switchNetwork();
    else if (act === 'profile') { const p = await myProfile(); go(p?.handle ? `@${p.handle}` : 'app/profile'); }
  } catch (e) { toast(e.message, 'error'); }
});

// ------------------------------------------------------------------ preview bar
function paintPreviewBar() {
  const bar = $('#previewBar');
  if (chain.MODE !== 'preview') { bar.hidden = true; return; }
  const off = chain.previewOffset();
  bar.hidden = false;
  bar.innerHTML = `<span><b>Preview mode</b> — no contract set yet, so transactions are simulated in this browser and Explore shows <b>sample builders</b>.</span>
    <span>Clock: ${esc(formatDay(chain.today(), { weekday: 'short' }))} UTC${off ? ` (+${off}d)` : ''}</span>
    <button type="button" data-pv="skip">Skip a day →</button><button type="button" data-pv="reset">Reset preview</button>${chain.wallet.account ? '<button type="button" data-pv="out">Disconnect</button>' : ''}`;
}
$('#previewBar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pv]');
  if (!b) return;
  if (b.dataset.pv === 'skip') { chain.skipPreviewDay(); toast('Skipped to the next day (preview only).'); }
  if (b.dataset.pv === 'reset') { chain.resetPreview(); toast('Preview reset.'); }
  if (b.dataset.pv === 'out') chain.disconnectPreview();
});

// ------------------------------------------------------------------ footer
const addr = chain.NET.contract;
$('#footAddr').textContent = `chain ID ${chain.NET.chainId} · ${addr ? chain.short(addr) : 'not deployed yet'}`;
$('#footCopy').hidden = !addr;
$('#footCopy').addEventListener('click', () => copyText(addr, 'Contract address copied'));
$('#footExplorer').href = addr ? chain.explorerAddress(addr) : chain.NET.explorer;
$('#footX').href = CONFIG.links.x;
$('#footGh').href = CONFIG.links.github;
$('#footDate').textContent = formatDay(chain.today(), { weekday: 'short', year: true }).toUpperCase();
async function paintStats() {
  try {
    const s = await chain.stats();
    $('#footStats').textContent = `BUILDERS ${fmt(s.builders)} · DAYS LOGGED ${fmt(s.entries)}`;
  } catch { $('#footStats').textContent = 'BUILDERS — · DAYS LOGGED —'; }
}

// ------------------------------------------------------------------ ASCII bands scramble in when visible
export function bindBands(root = document) {
  $$('[data-ascii]', root).forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    const text = el.textContent;
    if (!gsapReady()) return;
    onVisible(el, () => scrambleIn(el, text, 1.4), 0.1);
  });
}

// ------------------------------------------------------------------ boot
function boot() {
  if (window.gsap) {
    const plugins = [window.ScrollTrigger, window.SplitText, window.Flip, window.ScrambleTextPlugin].filter(Boolean);
    gsap.registerPlugin(...plugins);
  }
  chain.onChange((what) => {
    paintWallet(); paintPreviewBar();
    if (what === 'data' || what === 'clock') { paintStats(); $('#footDate').textContent = formatDay(chain.today(), { weekday: 'short', year: true }).toUpperCase(); }
  });
  paintPreviewBar();
  paintWallet();
  paintStats();
  chain.initWallet().finally(render);
  bindBands(document);
}
// GSAP loads with `defer`, modules run after deferred scripts in document order — but be safe.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
