// 共通ユーティリティ・アイコン・小さな UI 部品

export const $app = document.getElementById('app');

const API = (() => { try { return localStorage.getItem('apiBase') || '/api'; } catch { return '/api'; } })();

export async function api(path) {
  const res = await fetch(API + path, { cache: 'no-store' });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hasJa = (s) => /[぀-ヿ一-龯]/.test(s || '');

// ---------------- 日付 ----------------
export const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const dow = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();
export function fmtDate(ymd, { year = false, wd = true } = {}) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00Z');
  return `${year ? d.getUTCFullYear() + '年' : ''}${d.getUTCMonth() + 1}月${d.getUTCDate()}日${wd ? `(${WD[d.getUTCDay()]})` : ''}`;
}
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

// ---------------- 設定 ----------------
const DEFAULTS = { favorites: [], refresh: 15, leagues: { C: true, P: true, MLB: true }, calTeam: null };
export const settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') }; } catch { return { ...DEFAULTS }; }
})();
export function saveSettings() {
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch { /* private mode */ }
}
export const favKey = (league, t) => (league === 'MLB' ? `mlb:${t.id}` : `npb:${t.code}`);
export const isFav = (league, t) => !!t && (t.id || t.code) && settings.favorites.includes(favKey(league, t));

// ---------------- 部品 ----------------

/** チームのバッジ (色付きの角丸スクエア) */
export function badge(t, size = '') {
  if (!t) return '';
  const label = t.short || (t.name || '').slice(0, 1);
  const len = [...label].length;
  return `<span class="tb ${size} ${len >= 3 ? 'tb-3' : len === 2 ? 'tb-2' : ''}" style="--c:${esc(t.color || '#555')};--fg:${esc(t.fg || '#fff')}">${esc(label)}</span>`;
}

export function skeleton(n = 3, cls = 'sk-card') {
  return Array.from({ length: n }, () => `<div class="sk ${cls}"></div>`).join('');
}

export function emptyState(text, sub = '') {
  return `<div class="empty"><div class="empty-ic">${icon('ball', 34)}</div><p>${esc(text)}</p>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

export function errorBox(msg) {
  return `<div class="err">${icon('alert', 16)}<span>${esc(msg)}</span></div>`;
}

const ICONS = {
  ball: '<circle cx="12" cy="12" r="9"/><path d="M7.5 4.6c1.6 2 2.4 4.5 2.4 7.4s-.8 5.4-2.4 7.4M16.5 4.6c-1.6 2-2.4 4.5-2.4 7.4s.8 5.4 2.4 7.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="12" cy="14.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="14.5" r=".9" fill="currentColor"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M9.5 17h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  stadium: '<path d="M3 10c3-2 6-3 9-3s6 1 9 3v7c-3 1.5-6 2.2-9 2.2S6 18.5 3 17z"/><path d="M3 10c3 1.6 6 2.4 9 2.4s6-.8 9-2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};
export function icon(name, size = 22) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** 試合状況の小さなピル */
export function statusPill(g, { big = false } = {}) {
  const cls = big ? 'pill big' : 'pill';
  if (g.status === 'live') return `<span class="${cls} live"><i class="dot"></i>${esc(g.statusText)}</span>`;
  if (g.status === 'final') return `<span class="${cls} final">${esc(g.statusText || '試合終了')}</span>`;
  if (g.status === 'postponed') return `<span class="${cls} off">${esc(g.statusText || '中止')}</span>`;
  return `<span class="${cls} pre">${esc(g.startTime || '試合前')}</span>`;
}

export const sourceName = (s) => ({ yahoo: 'スポーツナビ', 'npb.jp': 'NPB.jp', mlb: 'MLB.com' }[s] || s);
