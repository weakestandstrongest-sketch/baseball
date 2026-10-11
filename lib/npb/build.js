// 取得した各ページから共通の試合モデルを組み立てる
import { parseHTML, lines } from '../html.js';
import {
  mainContent, parseLinescore, parseBoxTables, parseDecisions, parseHomeRuns, parseSummary,
  parseStatus, parsePlays, parsePitchTable, parseLiveState, inferStateFromPlays,
} from './common.js';
import { teamInfo, teamByCode } from './teams.js';

/**
 * @param pages { top?: html, box?: html, text?: html, live?: html }
 * @param hint  スケジュール由来の情報 (away/home のチームコード等)
 */
export function buildGame({ id, source, url, pages, hint = {} }) {
  const doc = {};
  const ls = {};
  for (const [k, html] of Object.entries(pages)) {
    if (!html) continue;
    doc[k] = mainContent(parseHTML(html));
    ls[k] = lines(doc[k]);
  }
  const topLines = ls.top || [];
  const meta = parseMeta((topLines.length ? topLines : ls.box || []).slice(0, 60));

  const linescore = (doc.top && parseLinescore(doc.top)) || (doc.box && parseLinescore(doc.box)) || (doc.live && parseLinescore(doc.live)) || null;
  const away = linescore ? linescore.away : teamInfo(teamByCode(hint.away), hint.awayName);
  const home = linescore ? linescore.home : teamInfo(teamByCode(hint.home), hint.homeName);
  if (!linescore) {
    away.score = hint.awayScore ?? null;
    home.score = hint.homeScore ?? null;
  }
  const teams = { away, home };

  const plays = ls.text ? parsePlays(ls.text) : [];
  let st = parseStatus(topLines.length ? topLines : ls.live || []);
  if (st.status === 'pre' && linescore && linescore.innings.some((i) => i.away !== null)) st = { status: 'live', text: '試合中' };
  if (hint.status === 'final' && st.status !== 'final') st = { status: 'final', text: '試合終了' };

  const box = parseBoxTables(doc.box || doc.top || { children: [] }, teams);

  let current = null;
  if (st.status === 'live') {
    const inferred = inferStateFromPlays(plays);
    const live = doc.live ? parseLiveState(doc.live) : {};
    const pitches = doc.live ? parsePitchTable(doc.live) : [];
    const m = /(\d{1,2}) ?回 ?(表|裏)/.exec(st.text || '');
    current = {
      inning: m ? Number(m[1]) : inferred.inning ?? null,
      half: m ? (m[2] === '表' ? 'top' : 'bottom') : inferred.half ?? null,
      balls: live.balls ?? null,
      strikes: live.strikes ?? null,
      outs: live.outs ?? inferred.outs ?? null,
      runners: live.runners || {},
      batter: live.batter || (inferred.batterName ? { name: inferred.batterName, info: [] } : null),
      pitcher: live.pitcher || null,
      pitches,
      lastPlay: live.lastPlay || null,
    };
    if (current.inning) st.text = `${current.inning}回${current.half === 'top' ? '表' : '裏'}`;
  }

  return {
    id,
    league: 'NPB',
    source,
    url,
    status: st.status,
    statusText: st.text,
    title: `${home.name} vs ${away.name}`,
    date: hint.date || meta.date || null,
    startTime: hint.time || meta.time || null,
    venue: hint.venue || meta.venue || null,
    away,
    home,
    linescore: linescore ? { innings: linescore.innings } : null,
    current,
    decisions: parseDecisions(topLines),
    homeRuns: parseHomeRuns(topLines, teams),
    summary: parseSummary(topLines),
    plays,
    box,
    notes: hint.notes || [],
  };
}

export const VENUE_RE = /(東京ドーム|甲子園|阪神甲子園球場|横浜スタジアム|ハマスタ|明治神宮野球場|神宮|マツダスタジアム|MAZDA Zoom-Zoom スタジアム広島|バンテリンドーム(?: ナゴヤ)?|ナゴヤドーム|みずほPayPayドーム(?:福岡)?|PayPayドーム|エスコンフィールド(?:HOKKAIDO)?|ZOZOマリン(?:スタジアム)?|楽天モバイル(?: 最強)?パーク(?:宮城)?|京セラD大阪|京セラドーム(?:大阪)?|ほっと神戸|ほっともっとフィールド神戸|ベルーナドーム|[^\s]{1,8}(?:球場|スタジアム|ドーム|フィールド))/;

export function parseMeta(ls) {
  const joined = ls.join(' ');
  const out = {};
  const d = /(?:(\d{4})年)?\s*(\d{1,2})月(\d{1,2})日/.exec(joined);
  if (d) {
    const y = d[1] || String(new Date().getFullYear());
    out.date = `${y}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
  }
  const t = /(\d{1,2}:\d{2})\s*(?:開始|試合開始)?/.exec(joined);
  if (t) out.time = t[1].padStart(5, '0');
  const v = VENUE_RE.exec(joined);
  if (v) out.venue = v[1];
  return out;
}
