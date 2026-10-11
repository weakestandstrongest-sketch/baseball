// NPB 公式サイト (npb.jp) から取得 — Yahoo! が取得できない時の予備
import { parseHTML, links, text, closest, byTag, lines } from '../html.js';
import { fetchText } from '../http.js';
import { teamByCode, teamInfo } from './teams.js';
import { buildGame, VENUE_RE } from './build.js';
import { groupOf } from './yahoo.js';

const BASE = 'https://npb.jp';
const SCORE_RE = /\/scores\/(\d{4})\/(\d{4})\/([a-z]+)-([a-z]+)-(\d{2})\/?/;

function schedulePages(y, mo) {
  return [
    `${BASE}/games/${y}/schedule_${mo}_detail.html`,
    `${BASE}/cs/${y}/schedule_detail.html`,
    `${BASE}/nippons/${y}/schedule_detail.html`,
  ];
}

async function fetchGames(urls, pick, ttl) {
  const results = await Promise.allSettled(urls.map((u) => fetchText(u, { ttl })));
  const games = new Map();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const i = results.indexOf(r);
    const group = /\/cs\//.test(urls[i]) ? 'CS' : /\/nippons\//.test(urls[i]) ? 'JS' : null;
    for (const g of parseNpbjpGames(r.value, pick, group)) if (!games.has(g.id)) games.set(g.id, g);
  }
  if (!games.size && results.every((r) => r.status === 'rejected')) throw results[0].reason;
  return [...games.values()];
}

export async function npbjpSchedule(date) {
  const [y, mo, d] = date.split('-');
  return fetchGames([...schedulePages(y, mo), `${BASE}/`], (yy, mmdd) => yy === y && mmdd === mo + d, 30);
}

/** 月 (YYYY-MM) の全試合 */
export async function npbjpMonth(month) {
  const [y, mo] = month.split('-');
  return fetchGames(schedulePages(y, mo), (yy, mmdd) => yy === y && mmdd.slice(0, 2) === mo, 300);
}

export function parseNpbjpSchedule(html, date) {
  const [y, mo, d] = date.split('-');
  return parseNpbjpGames(html, (yy, mmdd) => yy === y && mmdd === mo + d);
}

export function parseNpbjpGames(html, pick, group = null) {
  const root = parseHTML(html);
  const out = [];
  const seen = new Set();
  for (const a of links(root)) {
    const m = SCORE_RE.exec(a.href);
    if (!m || !pick(m[1], m[2])) continue;
    const [, y, mmdd] = m;
    const slug = `${m[3]}-${m[4]}-${m[5]}`;
    if (seen.has(y + mmdd + slug)) continue;
    seen.add(y + mmdd + slug);
    const home = teamByCode(m[3]);
    const away = teamByCode(m[4]);
    const row = closest(a.node, byTag('tr')) || a.node.parent || a.node;
    // 日付 (10/10) などを除いてからスコアを探す
    const t = text(row).replace(/\d{1,2}\/\d{1,2}/g, ' ');
    let status = 'pre';
    let statusText = '試合前';
    let homeScore = null;
    let awayScore = null;
    const sm = /(\d{1,2})\s*[-－–]\s*(\d{1,2})/.exec(t);
    const inning = /(\d{1,2}) ?回 ?(表|裏)/.exec(t);
    if (/中止|ノーゲーム|順延/.test(t)) { status = 'postponed'; statusText = '中止'; }
    else if (inning) { status = 'live'; statusText = `${inning[1]}回${inning[2]}`; }
    else if (sm) { status = /試合中/.test(t) ? 'live' : 'final'; statusText = status === 'live' ? '試合中' : '試合終了'; }
    if (sm && status !== 'pre' && status !== 'postponed') { homeScore = Number(sm[1]); awayScore = Number(sm[2]); }
    out.push({
      id: `n${y}${mmdd}-${slug}`,
      league: 'NPB',
      leagueGroup: group || groupOf(home, away, t),
      date: `${y}-${mmdd.slice(0, 2)}-${mmdd.slice(2)}`,
      startTime: (/(\d{1,2}:\d{2})/.exec(t) || [])[1] || null,
      venue: (VENUE_RE.exec(t) || [])[1] || null,
      status,
      statusText,
      away: { ...teamInfo(away), score: awayScore },
      home: { ...teamInfo(home), score: homeScore },
      notes: lines(row).filter((l) => /^[勝敗S][\s:：]|投手/.test(l)).slice(0, 3),
    });
  }
  return out;
}

/** id 例: n20251010-g-db-01 */
export async function npbjpGame(id, hint = {}) {
  const m = /^n(\d{4})(\d{4})-([a-z]+)-([a-z]+)-(\d{2})$/.exec(id);
  if (!m) throw new Error('invalid id');
  const base = `${BASE}/scores/${m[1]}/${m[2]}/${m[3]}-${m[4]}-${m[5]}/`;
  const [top, box, pbp] = await Promise.allSettled([
    fetchText(base, { ttl: 10 }),
    fetchText(base + 'box.html', { ttl: 10 }),
    fetchText(base + 'playbyplay.html', { ttl: 10 }),
  ]);
  if (top.status === 'rejected') throw top.reason;
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  return buildGame({
    id,
    source: 'npb.jp',
    url: base,
    pages: { top: val(top), box: val(box), text: val(pbp) },
    hint: { home: m[3], away: m[4], date: `${m[1]}-${m[2].slice(0, 2)}-${m[2].slice(2)}`, ...hint },
  });
}

/** 順位表ページ群 (npb.jp): 一覧ページのリンクを文字で探す */
export async function npbjpStandingsPages(year) {
  const idx = `${BASE}/bis/${year}/stats/`;
  const pages = { C: [`${idx}std_c.html`], P: [`${idx}std_p.html`], IL: [], OP: [] };
  try {
    const root = parseHTML(await fetchText(idx, { ttl: 3600 }));
    for (const l of links(root)) {
      const key = standingsKey(l.text);
      if (key && /std|stand|順位/i.test(l.href + l.text)) pages[key].unshift(new URL(l.href, idx).toString());
    }
  } catch { /* 一覧が取れなければ既定の URL のみ */ }
  return pages;
}

/** テキスト中で「最後に」出てくるリーグ名 (直前の見出しに一番近いもの) */
export function standingsKey(t) {
  let best = null;
  let pos = -1;
  for (const [key, re] of [['IL', /交流戦/g], ['OP', /オープン戦/g], ['C', /セ・?リーグ|セントラル/g], ['P', /パ・?リーグ|パシフィック/g]]) {
    for (const m of (t || '').matchAll(re)) if (m.index > pos) { pos = m.index; best = key; }
  }
  return best;
}
