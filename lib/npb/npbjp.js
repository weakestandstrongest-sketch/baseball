// NPB 公式サイト (npb.jp) から取得 — Yahoo! が取得できない時の予備
import { parseHTML, links, text, closest, byTag, lines } from '../html.js';
import { fetchText } from '../http.js';
import { teamByCode, teamInfo } from './teams.js';
import { buildGame, VENUE_RE } from './build.js';
import { groupOf } from './yahoo.js';

const BASE = 'https://npb.jp';
const SCORE_RE = /\/scores\/(\d{4})\/(\d{4})\/([a-z]+)-([a-z]+)-(\d{2})\/?/;

export async function npbjpSchedule(date) {
  const [y, mo, d] = date.split('-');
  const pages = [
    `${BASE}/games/${y}/schedule_${mo}_detail.html`,
    `${BASE}/`,
    `${BASE}/cs/${y}/schedule_detail.html`,
    `${BASE}/nippons/${y}/schedule_detail.html`,
  ];
  const results = await Promise.allSettled(pages.map((u) => fetchText(u, { ttl: 30 })));
  const games = new Map();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const g of parseNpbjpSchedule(r.value, date)) if (!games.has(g.id)) games.set(g.id, g);
  }
  if (!games.size && results.every((r) => r.status === 'rejected')) throw results[0].reason;
  return [...games.values()];
}

export function parseNpbjpSchedule(html, date) {
  const [y, mo, d] = date.split('-');
  const root = parseHTML(html);
  const out = [];
  const seen = new Set();
  for (const a of links(root)) {
    const m = SCORE_RE.exec(a.href);
    if (!m || m[1] !== y || m[2] !== mo + d) continue;
    const slug = `${m[3]}-${m[4]}-${m[5]}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const home = teamByCode(m[3]);
    const away = teamByCode(m[4]);
    const row = closest(a.node, byTag('tr')) || a.node.parent || a.node;
    const t = text(row);
    let status = 'pre';
    let statusText = '試合前';
    let homeScore = null;
    let awayScore = null;
    const sm = /(\d{1,2})\s*[-－–]\s*(\d{1,2})/.exec(t);
    const inning = /(\d{1,2}) ?回 ?(表|裏)/.exec(t);
    if (/中止|ノーゲーム|順延/.test(t)) { status = 'postponed'; statusText = '中止'; }
    else if (inning) { status = 'live'; statusText = `${inning[1]}回${inning[2]}`; }
    else if (sm) { status = /試合中/.test(t) ? 'live' : 'final'; statusText = status === 'live' ? '試合中' : '試合終了'; }
    if (sm && status !== 'pre') { homeScore = Number(sm[1]); awayScore = Number(sm[2]); }
    out.push({
      id: `n${y}${mo}${d}-${slug}`,
      league: 'NPB',
      leagueGroup: groupOf(home, away, t),
      date,
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

export async function npbjpStandings(year) {
  const pages = await Promise.allSettled([
    fetchText(`${BASE}/bis/${year}/stats/std_c.html`, { ttl: 300 }),
    fetchText(`${BASE}/bis/${year}/stats/std_p.html`, { ttl: 300 }),
  ]);
  return pages.filter((p) => p.status === 'fulfilled').map((p) => p.value);
}
