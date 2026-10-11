// スポーツナビ (Yahoo!プロ野球) から取得
import { parseHTML, links, text, find, findAll, byClassRe, lines } from '../html.js';
import { fetchText } from '../http.js';
import { teamsInText, teamFromText, teamInfo } from './teams.js';
import { buildGame, VENUE_RE } from './build.js';

const BASE = 'https://baseball.yahoo.co.jp';

export async function yahooSchedule(date, { ttl = 15 } = {}) {
  const url = `${BASE}/npb/schedule/?date=${date}`;
  const html = await fetchText(url, { ttl });
  return parseYahooSchedule(html, date);
}

export function parseYahooSchedule(html, date) {
  const root = parseHTML(html);
  const games = new Map();
  for (const a of links(root)) {
    const m = /\/npb\/game\/(\d{6,14})\b/.exec(a.href);
    if (!m || games.has(m[1])) continue;
    // 2 チーム分の名前が入るまで親要素をさかのぼってカードを特定する
    let card = a.node;
    for (let k = 0; k < 6 && card.parent && teamsInText(text(card)).length < 2; k++) {
      if (otherGameLinks(card.parent, m[1])) break;
      card = card.parent;
    }
    if (teamsInText(text(card)).length < 2) continue;
    // 球場名などがリンクの外にあることがあるので、li/tr 単位まで広げる
    for (let k = 0, c = card; k < 4 && c.parent && !otherGameLinks(c.parent, m[1]); k++) {
      c = c.parent;
      if (['li', 'tr', 'article'].includes(c.tag)) { card = c; break; }
    }
    games.set(m[1], parseCard(card, m[1], date));
  }
  return [...games.values()];
}

function otherGameLinks(node, gid) {
  return links(node).some((l) => {
    const m = /\/npb\/game\/(\d{6,14})\b/.exec(l.href);
    return m && m[1] !== gid;
  });
}

function parseCard(card, gid, date) {
  const t = text(card);
  const cardLines = lines(card, { skipTags: [] });
  let home = null;
  let away = null;
  const homeEl = find(card, byClassRe(/home/i));
  const awayEl = find(card, byClassRe(/away|visitor/i));
  if (homeEl && awayEl) {
    home = teamFromText(text(homeEl));
    away = teamFromText(text(awayEl));
  }
  if (!home || !away) {
    // 日本の表記は「ホーム vs ビジター」の順
    [home, away] = teamsInText(t);
  }
  let homeScore = null;
  let awayScore = null;
  const left = find(card, byClassRe(/score--left|score__left|homeScore/i));
  const right = find(card, byClassRe(/score--right|score__right|awayScore/i));
  if (left && right && /^\d+$/.test(text(left)) && /^\d+$/.test(text(right))) {
    homeScore = Number(text(left));
    awayScore = Number(text(right));
  } else {
    const sm = /(\d{1,2})\s*[-－–]\s*(\d{1,2})/.exec(t);
    if (sm) { homeScore = Number(sm[1]); awayScore = Number(sm[2]); }
  }
  let status = 'pre';
  let statusText = '試合前';
  const inning = /(\d{1,2}) ?回 ?(表|裏)/.exec(t);
  if (/中止|ノーゲーム|順延/.test(t)) { status = 'postponed'; statusText = (/(中止|ノーゲーム|順延)/.exec(t) || [])[1]; }
  else if (/試合終了|コールド/.test(t)) { status = 'final'; statusText = '試合終了'; }
  else if (inning) { status = 'live'; statusText = `${inning[1]}回${inning[2]}`; }
  else if (/試合中|速報中/.test(t)) { status = 'live'; statusText = '試合中'; }
  if (status === 'pre') { homeScore = null; awayScore = null; }

  const time = (/(\d{1,2}:\d{2})/.exec(t) || [])[1] || null;
  const venueEl = find(card, byClassRe(/venue|stadium/i));
  const venue = venueEl ? text(venueEl) : ((VENUE_RE.exec(t) || [])[1] || null);
  let notes = cardLines.filter((l) => /^(勝|敗|S|セーブ|予告先発|先発)[\s:：]/.test(l) || /投手|予告/.test(l)).slice(0, 4);
  if (!notes.length) notes = findAll(card, byClassRe(/player|pitcher/i)).map(text).filter(Boolean).slice(0, 4);

  return {
    id: 'y' + gid,
    league: 'NPB',
    leagueGroup: groupOf(home, away, t),
    date,
    startTime: time,
    venue,
    status,
    statusText,
    away: { ...teamInfo(away), score: awayScore },
    home: { ...teamInfo(home), score: homeScore },
    notes,
  };
}

export function groupOf(home, away, t = '') {
  if (/クライマックス|CS/.test(t)) return 'CS';
  if (/日本シリーズ/.test(t)) return 'JS';
  if (!home || !away) return 'other';
  if (home.league !== away.league) return 'IL';
  return home.league; // 'C' or 'P'
}

export async function yahooGame(gid, hint) {
  const base = `${BASE}/npb/game/${gid}`;
  const [top, box, txt, live] = await Promise.allSettled([
    fetchText(`${base}/top`, { ttl: 10 }),
    fetchText(`${base}/stats`, { ttl: 10 }),
    fetchText(`${base}/text`, { ttl: 10 }),
    fetchText(`${base}/score`, { ttl: 5 }),
  ]);
  if (top.status === 'rejected' && box.status === 'rejected') throw top.reason;
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  return buildGame({
    id: 'y' + gid,
    source: 'yahoo',
    url: `${base}/top`,
    pages: { top: val(top), box: val(box), text: val(txt), live: val(live) },
    hint,
  });
}
