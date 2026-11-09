// A small SVG heatmap like GitHub's: weeks as columns (Mon→Sun), darker = more commits that day.
import { heatmapWeeks, dayToDate, formatDay, TAGS } from './logic.js';
import { esc, gsapReady, onVisible } from './ui.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function heatmapSVG(entries, { today, weeks = 52, cell = 12, gap = 3, labels = true } = {}) {
  const cols = heatmapWeeks(entries, today, weeks);
  const step = cell + gap;
  const left = labels ? 28 : 0;
  const top = labels ? 18 : 0;
  const w = left + cols.length * step - gap;
  const h = top + 7 * step - gap;
  let out = `<svg class="heatmap" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Activity over the last ${weeks} weeks">`;
  if (labels) {
    let lastMonth = -1;
    cols.forEach((col, x) => {
      const m = dayToDate(col[0].day).getUTCMonth();
      if (m !== lastMonth && dayToDate(col[0].day).getUTCDate() <= 7) {
        out += `<text class="hm-label" x="${left + x * step}" y="11">${MONTHS[m]}</text>`;
        lastMonth = m;
      }
    });
    [['Mon', 0], ['Wed', 2], ['Fri', 4]].forEach(([d, y]) => { out += `<text class="hm-label" x="0" y="${top + y * step + cell - 2}">${d}</text>`; });
  }
  cols.forEach((col, x) => col.forEach((c, y) => {
    if (c.future) return;
    const tip = c.entry
      ? `${formatDay(c.day, { year: true })} · ${c.entry.commits} commit${c.entry.commits === 1 ? '' : 's'} · ${TAGS[c.entry.tag]?.label} — ${c.entry.shipped}`
      : `${formatDay(c.day, { year: true })} · no entry`;
    out += `<rect class="hm hm-${c.level}${c.day === today ? ' hm-today' : ''}" data-d="${x + y}" x="${left + x * step}" y="${top + y * step}" width="${cell}" height="${cell}" rx="2"><title>${esc(tip)}</title></rect>`;
  }));
  return out + '</svg>';
}

/** Squares fill with a diagonal stagger when the heatmap scrolls into view. */
export function animateHeatmap(root) {
  const svg = root?.querySelector('.heatmap');
  if (!svg || !gsapReady()) return;
  const rects = [...svg.querySelectorAll('rect.hm')];
  gsap.set(rects, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%', transformBox: 'fill-box' });
  onVisible(svg, () => {
    gsap.to(rects, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)', delay: (i, el) => Number(el.dataset.d) * 0.012 });
  }, 0.15);
}

export const LEGEND = `<div class="hm-legend"><span>less</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hm-${l}"></i>`).join('')}<span>more commits</span></div>`;
