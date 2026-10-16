// 取得した各ページから共通の試合モデルを組み立てる
import { parseHTML, lines } from '../html.js';
import {
  mainContent, parseLinescore, parseBoxTables, parseDecisions, parseHomeRuns, parseSummary,
  parseStatus, parsePlays, parsePitchTable, parseLiveState, inferStateFromPlays,
} from './common.js';
import { teamInfo, teamByCode } from './teams.js';
import { parseYahooHeader, parseYahooTop, parseYahooText, yahooStatus } from './yahooGame.js';

/**
 * @param pages { top?: html, box?: html, text?: html, live?: html }
 * @param hint  スケジュール由来の情報 (away/home のチームコード等)
 */
export function buildGame({ id, source, url, pages, hint = {} }) {
  const doc = {};
  for (const [k, html] of Object.entries(pages)) {
    if (html) doc[k] = mainContent(parseHTML(html, { mainOnly: true }));
  }
  // 行への分解は汎用パーサーに頼るときだけ行う (CPU 時間の節約)
  const lsCache = {};
  const L = (k) => (lsCache[k] ??= doc[k] ? lines(doc[k]) : []);

  // スポーツナビの画面上部 (どのページにも同じものがある)
  const header = parseYahooHeader(doc.top) || parseYahooHeader(doc.box) || parseYahooHeader(doc.text);

  const linescore = (doc.top && parseLinescore(doc.top)) || (doc.box && parseLinescore(doc.box)) || (doc.live && parseLinescore(doc.live)) || null;
  const pick = (code, team, name) => teamInfo(team || teamByCode(code), name);
  const away = linescore && linescore.away.code ? linescore.away : pick(hint.away, header && header.away, (header && header.awayName) || hint.awayName);
  const home = linescore && linescore.home.code ? linescore.home : pick(hint.home, header && header.home, (header && header.homeName) || hint.homeName);
  if (linescore) {
    away.score ??= linescore.away.score; away.hits ??= linescore.away.hits; away.errors ??= linescore.away.errors;
    home.score ??= linescore.home.score; home.hits ??= linescore.home.hits; home.errors ??= linescore.home.errors;
  }
  if (header) {
    if (header.awayScore !== null) away.score = header.awayScore;
    if (header.homeScore !== null) home.score = header.homeScore;
  }
  if (away.score === undefined || away.score === null) away.score = hint.awayScore ?? null;
  if (home.score === undefined || home.score === null) home.score = hint.homeScore ?? null;
  const teams = { away, home };

  const plays = (doc.text && parseYahooText(doc.text)) || (doc.text ? parsePlays(L('text')) : []);
  let st = (header && yahooStatus(header.state)) || parseStatus(doc.top ? L('top') : L('live'));
  if (st.status === 'pre' && linescore && linescore.innings.some((i) => i.away !== null) && !header) st = { status: 'live', text: '試合中' };
  if (hint.status === 'final' && st.status !== 'final') st = { status: 'final', text: '試合終了' };

  const box = parseBoxTables(doc.box || doc.top || { children: [] }, teams);
  const top = parseYahooTop(doc.top, teams);

  const pitchersNow = assignPitchers(plays, top.lineups, teams);

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
      batter: (live.batter && live.batter.name) ? live.batter : (inferred.batterName ? { name: inferred.batterName, info: [] } : null),
      pitcher: (live.pitcher && live.pitcher.name) ? live.pitcher : null,
      pitches,
      lastPlay: live.lastPlay || null,
    };
    // 一球速報の画面が取れないとき (試合中の /score が文字速報になる) は、
    // 先発と「投手交代」から今の投手を割り出す
    if (!current.pitcher && current.half) {
      const name = pitchersNow[current.half === 'top' ? 'home' : 'away'];
      if (name) current.pitcher = { name, info: [] };
    }
    if (!current.lastPlay) {
      const abs = plays.flatMap((h) => h.atBats);
      for (let i = abs.length - 1; i >= 0 && !current.lastPlay; i--) {
        const ev = [...abs[i].events].reverse().find((e) => !e.change) || abs[i].events[abs[i].events.length - 1];
        if (ev) current.lastPlay = `${abs[i].batter}: ${ev.text}`;
      }
    }
    if (current.inning) st.text = `${current.inning}回${current.half === 'top' ? '表' : '裏'}`;
  }

  const meta = header ? {} : parseMeta((doc.top ? L('top') : L('box')).slice(0, 60));
  let date = hint.date || meta.date || null;
  if (header && header.month) {
    const y = (date || '').slice(0, 4) || String(new Date().getFullYear());
    date = `${y}-${String(header.month).padStart(2, '0')}-${String(header.day).padStart(2, '0')}`;
  }

  return {
    id,
    league: 'NPB',
    source,
    url,
    status: st.status,
    statusText: st.text,
    title: `${home.name} vs ${away.name}`,
    series: (header && header.series) || hint.series || '',
    date,
    startTime: (header && header.time) || hint.time || meta.time || null,
    venue: (header && header.venue) || hint.venue || meta.venue || null,
    away,
    home,
    linescore: linescore ? { innings: linescore.innings } : null,
    current,
    decisions: top.decisions || parseDecisions(L('top')),
    homeRuns: top.homeRuns || parseHomeRuns(L('top'), teams),
    summary: top.summary || parseSummary(L('top')),
    scoringPlays: top.scoringPlays || null,
    batteries: top.batteries || null,
    highlights: top.highlights || null,
    lineups: top.lineups || null,
    info: top.info || [],
    plays,
    box,
    notes: hint.notes || [],
  };
}

const nk = (s) => String(s || '').replace(/[\s　]/g, '');
const sameName = (a, b) => { a = nk(a); b = nk(b); return !!a && !!b && (a.startsWith(b) || b.startsWith(a)); };

/**
 * 各打席に投手を入れる。先発 (オーダーの P) から始めて「投手交代: A → B」で入れ替える。
 * @returns その時点の投手 { home, away }
 */
export function assignPitchers(plays, lineups, teams) {
  const cur = { home: null, away: null };
  for (const side of ['home', 'away']) {
    const p = lineups && (lineups[side] || []).find((x) => x.order === 'P' || x.pos === '投');
    if (p) cur[side] = p.name;
  }
  // オーダーが無いときは試合前の「先発ピッチャーは阪神が 髙橋 、DeNAが 尾形」から
  const pre = (plays || []).find((h) => h.half === 'pre');
  for (const e of (pre ? pre.events : [])) {
    const m = /先発ピッチャーは(.+?)が\s*(\S+?)\s*[、,]\s*(.+?)が\s*(\S+)/.exec(e.text);
    if (!m || !teams) continue;
    for (const [tn, pn] of [[m[1], m[2]], [m[3], m[4]]]) {
      const side = ['home', 'away'].find((sd) => teams[sd] && [teams[sd].name, teams[sd].short, teams[sd].fullName].some((n) => n && (nk(n).includes(nk(tn)) || nk(tn).includes(nk(n)))));
      if (side && !cur[side]) cur[side] = pn;
    }
  }
  const apply = (text, fielding) => {
    const m = /投手交代[:：]\s*(\S+)\s*→\s*(\S+)/.exec(text || '');
    if (!m) return;
    // 交代できるのは守っている側。両チームの投手が同じ名字のこともあるので、守っている側から先に見る
    const other = fielding === 'home' ? 'away' : 'home';
    const side = [fielding, other].find((sd) => sameName(cur[sd], m[1])) || fielding;
    cur[side] = m[2];
  };
  for (const h of plays || []) {
    if (h.half === 'pre') continue;
    const fielding = h.half === 'top' ? 'home' : 'away';
    for (const e of h.events) apply(e.text, fielding);
    for (const ab of h.atBats) {
      const ri = ab.events.findIndex((e) => e.result);
      ab.events.forEach((e, i) => { if (ri < 0 || i < ri) apply(e.text, fielding); });
      if (!ab.pitcher && cur[fielding]) ab.pitcher = cur[fielding];
      ab.events.forEach((e, i) => { if (ri >= 0 && i > ri) apply(e.text, fielding); });
    }
  }
  return cur;
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
