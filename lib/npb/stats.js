// NPB 個人成績 (スポーツナビ)。リーダーボードと「◯◯成績一覧」の詳しい表。
import { parseHTML, tables, links, precedingHeading, followingLink } from '../html.js';
import { fetchText } from '../http.js';
import { mainContent } from './common.js';
import { teamFromText, teamInfo } from './teams.js';
import { standingsKey } from './npbjp.js';

const BASE = 'https://baseball.yahoo.co.jp';
const STATS_TOP = `${BASE}/npb/stats/`;
const KEYS = ['C', 'P', 'IL', 'OP'];

// 投手成績の項目
const PITCH_RE = /防御率|勝利|勝数|敗戦|セーブ|ホールド|奪三振|勝率|投球回|完投|完封|被安打|与四球|WHIP|HP/;

const norm = (h) => h.replace(/\s+/g, '');
const colOf = (headers, re) => headers.findIndex((h) => re.test(h));

/** リーダーボード: { C: { batting: [...], pitching: [...] }, P: ..., IL, OP } */
export async function npbLeaders() {
  const res = {};
  const add = (key, board) => {
    const b = (res[key] ||= { batting: [], pitching: [] });
    const list = b[board.group];
    if (!list.some((x) => x.title === board.title)) list.push(board);
  };
  const ingest = (html, pageKey, pageUrl) => {
    for (const board of parseLeaderPage(html, pageUrl)) {
      const lgs = [...new Set(board.rows.map((r) => r.team.league).filter(Boolean))];
      const key = ['IL', 'OP'].includes(pageKey) ? pageKey : lgs.length === 1 ? lgs[0] : pageKey;
      if (key) add(key, board);
    }
  };
  const top = await fetchText(STATS_TOP, { ttl: 600 });
  ingest(top, null, STATS_TOP);
  const urls = {};
  for (const l of links(parseHTML(top))) {
    const key = standingsKey(l.text);
    if (!key || /2軍|ファーム/.test(l.text) || !/\/npb\/stats/.test(l.href) || /一覧/.test(l.text)) continue;
    const u = new URL(l.href, STATS_TOP).toString();
    if (u !== STATS_TOP) (urls[key] ||= []).includes(u) || urls[key].push(u);
  }
  const jobs = KEYS.flatMap((k) => (urls[k] || []).slice(0, 1).map((u) => [k, u]));
  const pages = await Promise.allSettled(jobs.map(([, u]) => fetchText(u, { ttl: 600 })));
  pages.forEach((p, i) => { if (p.status === 'fulfilled') ingest(p.value, jobs[i][0], jobs[i][1]); });
  return res;
}

/** 1 ページ内の「順位 / 選手名 / チーム名 / 値」の表を取り出す */
export function parseLeaderPage(html, pageUrl = STATS_TOP) {
  const out = [];
  for (const { node, rows } of tables(mainContent(parseHTML(html)))) {
    const hi = rows.findIndex((r) => r.some((c) => /選手/.test(c)) && r.some((c) => /チーム|球団/.test(c)));
    if (hi < 0) continue;
    const headers = rows[hi].map(norm);
    const nameCol = colOf(headers, /選手/);
    const teamCol = colOf(headers, /チーム|球団/);
    const valueCol = headers.length - 1;
    const body = rows.slice(hi + 1).filter((r) => r.length > valueCol && r[nameCol]);
    if (!body.length || body.length > 30) continue; // 長い表は一覧ページ
    const title = (precedingHeading(node) || headers[valueCol]).replace(/^(セ・リーグ|パ・リーグ)/, '').trim();
    const more = followingLink(node, /一覧/);
    out.push({
      title,
      group: PITCH_RE.test(title + headers[valueCol]) ? 'pitching' : 'batting',
      valueLabel: headers[valueCol],
      rows: body.map((r) => ({
        rank: r[0],
        name: r[nameCol],
        team: teamInfo(teamFromText(r[teamCol] || ''), r[teamCol]),
        value: r[valueCol],
      })),
      more: more ? new URL(more.href, pageUrl).toString() : null,
    });
  }
  return out;
}

/** 「◯◯成績一覧」ページの大きな表 */
export async function npbStatsList(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('invalid url'); }
  if (u.hostname !== 'baseball.yahoo.co.jp' || !u.pathname.startsWith('/npb/stats')) throw new Error('invalid url');
  return parseStatsList(await fetchText(u.toString(), { ttl: 600 }));
}

export function parseStatsList(html) {
  const root = mainContent(parseHTML(html));
  let best = null;
  for (const { node, rows } of tables(root)) {
    const hi = rows.findIndex((r) => r.some((c) => /選手/.test(c)));
    if (hi < 0) continue;
    const body = rows.slice(hi + 1).filter((r) => r.length >= rows[hi].length - 1 && r.some(Boolean));
    if (!best || body.length * rows[hi].length > best.body.length * best.headers.length) {
      best = { node, headers: rows[hi].map(norm), body };
    }
  }
  if (!best) return { title: '', headers: [], rows: [] };
  const nameCol = colOf(best.headers, /選手/);
  const teamCol = colOf(best.headers, /チーム|球団/);
  return {
    title: precedingHeading(best.node).replace(/\d{4}\/\d{1,2}\/\d{1,2}.*$/, '').trim(),
    headers: best.headers,
    nameCol,
    teamCol,
    rows: best.body.map((r) => ({ team: teamInfo(teamFromText(r[teamCol] || ''), r[teamCol]), cells: r })),
  };
}
