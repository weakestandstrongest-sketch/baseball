// NPB データ取得の入口。Yahoo! を優先し、失敗したら npb.jp を使う。
import { parseHTML, tables, precedingText, precedingHeading, quickLinks } from '../html.js';
import { fetchText, addDays } from '../http.js';
import { yahooSchedule, yahooGame } from './yahoo.js';
import { npbjpSchedule, npbjpGame, npbjpMonth, npbjpStandingsPages, standingsKey } from './npbjp.js';
import { teamFromText, teamInfo, teamByCode } from './teams.js';
import { mainContent, npbTables } from './common.js';

export async function npbSchedule(date) {
  const errors = [];
  try {
    const games = await yahooSchedule(date);
    if (games.length) return { source: 'yahoo', games };
  } catch (e) { errors.push(String(e.message || e)); }
  try {
    const games = await npbjpSchedule(date);
    return { source: 'npb.jp', games, errors };
  } catch (e) { errors.push(String(e.message || e)); }
  if (errors.length >= 2) throw new Error(errors.join(' / '));
  return { source: 'yahoo', games: [], errors };
}

export async function npbGame(id, hint, parts = null) {
  if (/^y\d+$/.test(id)) return yahooGame(id.slice(1), hint, parts);
  if (/^n\d{8}-/.test(id)) return npbjpGame(id, hint);
  throw new Error('invalid id');
}

// ---------------- カレンダー ----------------

/** チーム (npb.jp の略号) の月間日程と勝敗 */
export async function npbCalendar(code, month) {
  const team = teamByCode(code);
  if (!team || !/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid params');
  let source = 'npb.jp';
  let games = [];
  try { games = await npbjpMonth(month); } catch { games = []; }
  if (!games.length) {
    // npb.jp が使えない時は Yahoo! の日別日程を月の日数分まとめて取得
    source = 'yahoo';
    const days = [];
    for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) days.push(d);
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    games = (await mapLimit(days, 8, (d) => yahooSchedule(d, { ttl: d < today ? 3600 : 60 }).catch(() => []))).flat();
  }
  const mine = games
    .filter((g) => g.home.code === code || g.away.code === code)
    .map((g) => withResult(g, g.home.code === code ? 'home' : 'away'))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  return { league: 'NPB', team: teamInfo(team), month, source, games: mine };
}

export function withResult(g, side) {
  const opp = side === 'home' ? 'away' : 'home';
  let result = null;
  if (g.status === 'postponed') result = 'postponed';
  else if (g.status === 'final' && g[side].score !== null && g[opp].score !== null) {
    result = g[side].score > g[opp].score ? 'win' : g[side].score < g[opp].score ? 'loss' : 'draw';
  }
  return { ...g, side, result };
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// ---------------- 順位表 ----------------

export const KEYS = ['C', 'P', 'IL', 'OP'];
const YAHOO_STANDINGS = 'https://baseball.yahoo.co.jp/npb/standings/';

/**
 * セ・パ・交流戦・オープン戦の順位表。
 * 各ページのタブのリンクを「文字」で探してたどるので URL 変更に強い。
 */
export async function npbStandings(year, only = null) {
  const keys = only ? [only] : KEYS;
  const res = Object.fromEntries(keys.map((k) => [k, null]));
  const seen = new Set();
  const ingest = (html, pageKey) => {
    for (const t of parseStandingsPage(html)) {
      let key = t.leagues.length === 1 ? t.leagues[0] : standingsKey(t.heading) || (['IL', 'OP'].includes(pageKey) ? pageKey : null);
      if (t.leagues.length === 1 && ['IL', 'OP'].includes(pageKey)) key = null; // 交流戦ページのリーグ別表は除く
      if (!key || !res.hasOwnProperty(key)) continue;
      const sig = key + JSON.stringify(t.rows.map((r) => r.cells));
      if (seen.has(sig)) continue;
      seen.add(sig);
      const bucket = (res[key] ||= { tables: [] });
      // 順位表・対戦表は 1 つだけ (列の多い = 詳しい方を残す)。それ以外の詳細表はすべて残す
      const same = t.kind === 'detail' ? -1 : bucket.tables.findIndex((x) => x.kind === t.kind);
      if (same >= 0) { if (t.headers.length > bucket.tables[same].headers.length) bucket.tables[same] = t; continue; }
      if (t.kind === 'detail' && bucket.tables.some((x) => x.title === t.title && JSON.stringify(x.headers) === JSON.stringify(t.headers))) continue;
      bucket.tables.push(t);
    }
  };

  // Yahoo! (タブのリンクは全体を解析せずに正規表現で拾い、必要なリーグのページだけ解析する)
  try {
    const top = await fetchText(YAHOO_STANDINGS, { ttl: 300 });
    const urls = tabLinks(top, YAHOO_STANDINGS, /\/npb\/standings/);
    const jobs = keys.flatMap((k) => (urls[k] || []).slice(0, 1).map((u) => [k, u]));
    const pages = await Promise.allSettled(jobs.map(([, u]) => fetchText(u, { ttl: 300 })));
    pages.forEach((p, i) => { if (p.status === 'fulfilled') ingest(p.value, jobs[i][0]); });
    if (keys.some((k) => !res[k])) ingest(top, null); // タブのページが取れなければトップの表を使う
  } catch { /* npb.jp へ */ }

  // 足りない分は npb.jp
  const missing = keys.filter((k) => !res[k]);
  if (missing.length) {
    try {
      const pages = await npbjpStandingsPages(year);
      const jobs = missing.flatMap((k) => pages[k].slice(0, 2).map((u) => [k, u]));
      const got = await Promise.allSettled(jobs.map(([, u]) => fetchText(u, { ttl: 300 })));
      got.forEach((p, i) => { if (p.status === 'fulfilled') ingest(p.value, jobs[i][0]); });
    } catch { /* ignore */ }
  }
  for (const k of keys) if (res[k]) res[k].tables.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  for (const k of Object.keys(res)) if (!keys.includes(k)) delete res[k];
  return res;
}

/** タブのリンク (セ・リーグ / パ・リーグ / 交流戦 / オープン戦) を文字で探す */
export function tabLinks(html, base, pathRe) {
  const urls = {};
  for (const l of quickLinks(html)) {
    const key = standingsKey(l.text);
    if (!key || /2軍|ファーム|一覧/.test(l.text) || !pathRe.test(l.href)) continue;
    const u = new URL(l.href, base).toString();
    if (u === base) continue;
    (urls[key] ||= []).includes(u) || urls[key].push(u);
  }
  return urls;
}

const KIND_ORDER = { standings: 0, matrix: 1, detail: 2 };

const rowTeam = (r) => {
  // チーム名が 3 つ以上並ぶ行は対戦表の見出し行
  if (r.filter((c) => c && c.length <= 8 && teamFromText(c)).length >= 3) return null;
  for (const c of r.slice(0, 3)) {
    if (c.length > 14) continue;
    const t = teamFromText(c, { anywhere: false }) || teamFromText(c);
    if (t) return t;
  }
  return null;
};

/** 1 ページ内の順位系テーブルを取り出す */
export function parseStandingsPage(html) {
  const out = [];
  for (const { node, rows } of npbTables(mainContent(parseHTML(html)))) {
    const teamRows = [];
    rows.forEach((r, i) => { const team = rowTeam(r); if (team) teamRows.push({ i, r, team }); });
    if (teamRows.length < 6) continue;
    // 見出し行 = 最初のチーム行の直前の行 (対戦表ではチーム名が列見出しになる)
    // 縦書きの見出し (「勝<br>利」) は空白を詰める
    const headers = teamRows[0].i > 0 ? rows[teamRows[0].i - 1].map((h) => h.replace(/\s+/g, '')) : null;
    if (!headers) continue;
    const headerTeams = headers.filter((c) => c && c.length <= 8 && teamFromText(c)).length;
    const kind = headerTeams >= 5 ? 'matrix' : headers.some((c) => /^(勝|勝利|勝数)$/.test(c)) && headers.some((c) => /勝率|差/.test(c)) ? 'standings' : 'detail';
    const heading = precedingHeading(node) || precedingText(node, 60);
    const leagues = [...new Set(teamRows.map((x) => x.team.league))];
    const teamCol = Math.max(0, teamRows[0].r.findIndex((c) => rowTeam([c])));
    out.push({
      kind,
      title: kind === 'standings' ? '順位表' : cleanTitle(heading) || (kind === 'matrix' ? '対戦成績' : '詳細'),
      heading,
      leagues,
      teamCol,
      headers,
      rows: teamRows.map((x) => ({ team: teamInfo(x.team), cells: x.r })),
    });
  }
  return out;
}

function cleanTitle(s) {
  return (s || '')
    .replace(/\d{4}\/\d{1,2}\/\d{1,2}.*$/, '') // 「2026/10/8 21:07 更新」
    .replace(/^(セ・リーグ|パ・リーグ)\s*/, '')
    .trim()
    .slice(0, 30);
}
