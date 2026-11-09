// Small DOM helpers shared by the website and the app.
import { TAGS, ENERGY } from './logic.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const gsapReady = () => !!window.gsap && !reducedMotion();

export function toast(msg, kind = 'info', ms = 4200) {
  const box = $('#toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

export async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`${label} ✓`); return true; } catch { toast('Couldn’t copy — select and copy by hand.', 'error'); return false; }
}

// ------------------------------------------------------------------ ASCII divider bands
export const ASCII = '.+.--..:*:';
export function divider(extra = '') {
  return `<div class="ascii ${extra}" aria-hidden="true"><span data-ascii>${ASCII.repeat(24)}</span></div>`;
}

// ------------------------------------------------------------------ brand
export const LOGO = `<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
  <rect x="5" y="9" width="24" height="27" rx="2" style="fill:var(--card)" stroke="currentColor" stroke-width="2"/>
  <path d="M10 9v27" stroke="currentColor" stroke-width="2"/>
  <path d="M14 17h10M14 22h10M14 27h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <g transform="rotate(40 30 12)"><path d="M30 2c3.6 2.8 5 6.6 4.6 11.6H25.4C25 8.6 26.4 4.8 30 2Z" fill="#FF5A36" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="30" cy="8.6" r="1.6" style="fill:var(--card)" stroke="currentColor" stroke-width="1.2"/>
  <path d="M27 16.6l3 3.6 3-3.6" fill="#FFC53D" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></g>
</svg>`;
export const logoLockup = () => `${LOGO}<span class="logo-word">Ship Log</span>`;

// ------------------------------------------------------------------ bits
export function tagChip(tag, extra = '') {
  const t = TAGS[tag] || TAGS[0];
  return `<span class="tag tag-${t.key} ${extra}" style="--tag:${t.color}">${t.emoji} ${t.label}</span>`;
}
export const energyIcon = (e) => `<span class="energy" title="Energy: ${ENERGY[e]?.label || ''}">${ENERGY[e]?.icon || ''}</span>`;
export const flame = (n, cls = '') => `<span class="flame ${cls}" aria-label="${n}-day streak"><span class="flame-icon" aria-hidden="true">🔥</span><b>${n}</b></span>`;

export function timeAgo(sec, now = Date.now()) {
  const s = Math.max(0, Math.floor(now / 1000 - sec));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
export const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** Runs fn once when el scrolls into view (or right away without IntersectionObserver). */
export function onVisible(el, fn, threshold = 0.25) {
  if (!el) return;
  if (!('IntersectionObserver' in window)) return fn();
  const io = new IntersectionObserver((list) => {
    if (list.some((x) => x.isIntersecting)) { io.disconnect(); fn(); }
  }, { threshold });
  io.observe(el);
}

/** Scramble-in for ASCII bands and mono counters (GSAP ScrambleText when loaded). */
export function scrambleIn(el, text = el.textContent, duration = 1.2) {
  if (!gsapReady() || !window.ScrambleTextPlugin) { el.textContent = text; return; }
  gsap.to(el, { duration, scrambleText: { text, chars: '.+-:*', speed: 0.6, revealDelay: 0.15 }, ease: 'none' });
}
