// スポーツナビの試合ページ専用の読み取り (2026 年 10 月の実ページの構造に合わせたもの)。
// 見つからない項目は build.js の汎用パーサーで補う。
import { find, findAll, byClassRe, text, tables, precedingHeading, slimHTML } from '../html.js';
import { teamFromText } from './teams.js';

// 1MB 近いページのうち、使う部分だけを id で切り出す (AI 解説や広告は読まない)
const HEAD_IDS = ['gm_brd', 'async-gameTeam', 'game_scoreTable'];
export const SLIM_IDS = {
  top: [...HEAD_IDS, 'async-starter', 'async-preview', 'async-recap', 'async-resultPitcher', 'async-homerun', 'async-battery',
    'async-scorePlay', 'async-mep', 'async-mvp', 'async-starting', 'async-bench', 'async-umpire', 'async-attendanceAndGameTime'],
  box: [...HEAD_IDS, 'async-stats'],
  text: [...HEAD_IDS, 'async-text'],
  live: [...HEAD_IDS, 'async-score', 'async-pitchesDetail', 'pitchesDetail', 'async-battingResult', 'async-base', 'sbo', 'batt', 'pit', 'dakyu', 'result'],
};

export function slimYahoo(kind, html) {
  if (!html) return html;
  return slimHTML(html, SLIM_IDS[kind] || HEAD_IDS) || html;
}

const cls = (re) => byClassRe(re);
const t = (root, re) => { const n = find(root, cls(re)); return n ? text(n) : ''; };

/** 画面上部: チーム名・スコア・試合状況・大会名・日時・球場 */
export function parseYahooHeader(root) {
  if (!root) return null;
  const homeBox = find(root, cls(/(^|\s)bb-gameTeam__home(\s|$)/));
  const awayBox = find(root, cls(/(^|\s)bb-gameTeam__away(\s|$)/));
  if (!homeBox || !awayBox) return null;
  const nameOf = (box) => { const n = find(box, cls(/bb-gameTeam__name/)); return n ? text(n) : ''; };
  const num = (re) => { const v = t(root, re); return /^\d+$/.test(v) ? Number(v) : null; };
  const desc = find(root, cls(/(^|\s)bb-gameDescription(\s|$)/));
  let venue = '';
  if (desc) {
    const ps = desc.children.filter((c) => c.tag === 'p');
    venue = ps.length ? text(ps[ps.length - 1]) : '';
  }
  const dateText = t(root, /bb-gameDescription__detail--date/);
  const dm = /(\d{1,2})月(\d{1,2})日/.exec(dateText);
  const tm = /(\d{1,2}:\d{2})/.exec(dateText);
  return {
    home: teamFromText(nameOf(homeBox)),
    away: teamFromText(nameOf(awayBox)),
    homeName: nameOf(homeBox),
    awayName: nameOf(awayBox),
    homeScore: num(/bb-gameTeam__score--home/),
    awayScore: num(/bb-gameTeam__score--away/),
    state: t(root, /bb-gameTeam__inning/),
    series: t(root, /bb-gameDescription__detail--classification/),
    month: dm ? Number(dm[1]) : null,
    day: dm ? Number(dm[2]) : null,
    time: tm ? tm[1].padStart(5, '0') : null,
    venue,
  };
}

/** 見出し → 表 の対応 (責任投手・本塁打・バッテリー など) */
function tablesByHeading(root) {
  const map = new Map();
  for (const tb of tables(root)) {
    const h = precedingHeading(tb.node);
    if (h && !map.has(h)) map.set(h, tb);
  }
  return map;
}

const sideOf = (teamText, teams) => {
  const tm = teamFromText(teamText || '');
  if (!tm || !teams) return null;
  return tm.code === teams.away.code ? 'away' : tm.code === teams.home.code ? 'home' : null;
};

const DEC = { 勝利投手: 'win', 勝投手: 'win', 勝: 'win', 敗戦投手: 'loss', 敗投手: 'loss', 敗: 'loss', セーブ: 'save', S: 'save' };
const COND = /\s*(絶好調|好調|普通|不調|絶不調)$/;

/** トップページの各項目 */
export function parseYahooTop(root, teams) {
  if (!root) return {};
  const tb = tablesByHeading(root);
  const out = {};

  const dec = tb.get('責任投手');
  if (dec) {
    const d = {};
    for (const [label, value] of dec.rows) {
      const k = DEC[label];
      const m = /^(?:(\S+)\s+)?(.+?)\s*\(([^)]*)\)\s*$/.exec(value || '');
      if (!k || !m) continue;
      const tm = m[1] && teamFromText(m[1], { anywhere: false });
      d[k] = { name: tm ? m[2] : `${m[1] ? m[1] + ' ' : ''}${m[2]}`, record: m[3] };
      if (tm) d[k].team = tm.code;
    }
    if (Object.keys(d).length) out.decisions = d;
  }

  const hr = tb.get('本塁打');
  if (hr) {
    out.homeRuns = [];
    for (const [team, value] of hr.rows) {
      for (const m of (value || '').matchAll(/([^\s\d()]+(?: [^\s\d()]+)?)\s*(\d+)号\s*(?:\(([^)]*)\))?/g)) {
        out.homeRuns.push({ side: sideOf(team, teams), name: m[1], number: Number(m[2]), detail: m[3] || '' });
      }
    }
  }

  const bat = tb.get('バッテリー');
  if (bat) out.batteries = bat.rows.map(([team, v]) => ({ side: sideOf(team, teams), team, text: v }));

  // スコアプレー (得点シーン)
  const sp = findAll(root, cls(/(^|\s)bb-scorePlay__item(\s|$)/));
  if (sp.length) {
    out.scoringPlays = sp.map((li) => ({
      side: sideOf(t(li, /bb-scorePlay__team/), teams),
      inning: t(li, /bb-scorePlay__inning/),
      player: t(li, /bb-scorePlay__player/),
      situation: t(li, /bb-scorePlay__statusDetail/),
      text: scorePlayText(li),
    }));
  }

  // エキサイティングプレイヤー / みんなの MVP
  const extras = [];
  const mepRoot = find(root, (n) => n.attrs.id === 'mep');
  if (mepRoot) {
    const who = t(mepRoot, /bb-teamSubHead__title/);
    const rows = tables(mepRoot)[0]?.rows || [];
    extras.push({ title: 'エキサイティングプレイヤー', lead: who, rows });
  }
  for (const [h, x] of tb) {
    if (/MVP/.test(h)) extras.push({ title: h, rows: x.rows });
  }
  if (extras.length) out.highlights = extras;

  // スタメン
  const st = tb.get('スターティングメンバー');
  if (st) out.lineups = parseLineups(st.rows, teams);

  // 試合情報 (審判・観客数・試合時間)
  const info = [];
  const ump = tb.get('審判');
  if (ump) {
    const pairs = ump.rows.flatMap((r) => { const o = []; for (let i = 0; i + 1 < r.length; i += 2) if (r[i]) o.push(`${r[i]} ${r[i + 1]}`); return o; });
    if (pairs.length) info.push(['審判', pairs.join(' / ')]);
  }
  for (const [h, x] of tb) if (/観客数|試合時間/.test(h)) for (const [k, v] of x.rows) if (k && v) info.push([k, v]);
  if (info.length) out.info = info;

  const recap = find(root, (n) => n.attrs.id === 'async-recap');
  if (recap) {
    const p = find(recap, (n) => n.tag === 'p');
    if (p && text(p)) out.summary = text(p);
  }
  return out;
}

// 得点シーンの説明: 交代の説明や動画のキャプションは除き、プレーの文だけを使う
function scorePlayText(li) {
  const ps = findAll(li, cls(/bb-scorePlay__detail/)).flatMap((d) => d.children.filter((c) => c.tag === 'p'));
  const texts = ps.map((p) => text(p)).filter((x) => x && !/^(投手交代|守備交代|守備変更|代打|代走)/.test(x));
  return texts.join(' ') || ps.map((p) => text(p)).join(' ');
}

/** スタメン表: 左がホーム、右がビジター。真ん中の列が打順 (先発投手の行は「先発」) */
function parseLineups(rows, teams) {
  const res = { home: [], away: [] };
  for (const r of rows.slice(1)) {
    const mid = r.findIndex((c, i) => i > 0 && /^(\d|先発)$/.test(c));
    if (mid < 0) continue;
    const left = r.slice(0, mid).filter(Boolean);
    const right = r.slice(mid + 1).filter(Boolean);
    const entry = (cells) => {
      const name = (cells.length > 1 ? cells[cells.length - 1] : cells[0] || '').replace(COND, '');
      const cond = (COND.exec(cells[cells.length - 1] || '') || [])[1] || '';
      const pos = cells.length > 1 ? cells[0] : r[mid] === '先発' ? '投' : '';
      return { order: r[mid] === '先発' ? 'P' : r[mid], pos, name, cond };
    };
    if (left.length) res.home.push(entry(left));
    if (right.length) res.away.push(entry(right));
  }
  return res.home.length || res.away.length ? res : null;
}

/** 一球速報テキスト (経過) */
export function parseYahooText(root) {
  if (!root) return null;
  const innings = findAll(root, cls(/(^|\s)bb-liveText__inning(\s|$)/));
  if (!innings.length) return null;
  const halves = [];
  for (const inn of innings) {
    const label = t(inn, /bb-liveText__status/);
    const m = /^(\d{1,2})回(表|裏)\s*(.*)$/.exec(label);
    const half = m
      ? { inning: Number(m[1]), half: m[2] === '表' ? 'top' : 'bottom', label: `${m[1]}回${m[2]} ${m[3]}`.trim(), events: [], atBats: [] }
      : { inning: 0, half: 'pre', label: label || '試合前情報', events: [], atBats: [] };
    for (const item of findAll(inn, cls(/(^|\s)bb-liveText__item(\s|$)/))) {
      const batter = find(item, cls(/bb-liveText__batter/));
      const sums = findAll(item, cls(/(^|\s)bb-liveText__summary(\s|$|--)/));
      const evs = sums.map((p) => {
        const s = text(p);
        return {
          text: s,
          scoring: /summary--point/.test(p.className) || /ホームイン|タイムリー|ホームラン|犠牲フライ|押し出し/.test(s),
          change: /交代|代打|代走|守備位置|守備変更|に代わり|に代わって/.test(s),
        };
      }).filter((e) => e.text);
      if (batter) {
        const order = (/(\d)番/.exec(t(batter, /bb-liveText__order/)) || [])[1];
        const ab = {
          no: Number((/(\d+)/.exec(t(item, /bb-liveText__number/)) || [])[1]) || null,
          order: order ? Number(order) : null,
          batter: t(batter, /bb-liveText__player/),
          situation: t(batter, /bb-liveText__state/),
          events: evs,
        };
        ab.scoring = evs.some((e) => e.scoring);
        // 打席の結果 = 最後のプレー (「試合終了」などの締めの一文は除く)
        // けん制・盗塁・暴投などは打席の途中のできごとなので結果にしない（打席中の速報で結果に見えてしまうため）
        const midPlay = (s) => /けん制|牽制|盗塁|暴投|捕逸|ボーク/.test(s) && !/三振|四球|死球|ヒット|安打|ホームラン|本塁打|ゴロ|フライ|ライナー|犠打|犠飛|併殺|失策|エラー|出塁|打撃妨害|振り逃げ/.test(s);
        const res = [...evs].reverse().find((e) => !/^(試合終了|ゲームセット)/.test(e.text) && !e.change && !midPlay(e.text))
          || (evs.some((e) => midPlay(e.text)) ? null : evs[evs.length - 1]);
        if (res) res.result = true;
        half.atBats.push(ab);
      } else if (evs.length) {
        half.events.push(evs); // 項目ごとにまとめておき、並べ替えのあとで平らにする
      }
    }
    if (half.atBats.length || half.events.length) halves.push(half);
  }
  return halves.length ? orderPlays(halves) : null;
}

// 試合中のページは「新しい順」(7回表 → … → 1回表 → 試合前、回の中も 4: 3: 2: 1:)、
// 試合後のページは「古い順」で並ぶ。どちらでも古い順 (試合前 → 1回表 → …) にそろえる。
function orderPlays(halves) {
  const key = (h) => (h.half === 'pre' ? -1 : h.inning * 2 + (h.half === 'bottom' ? 1 : 0));
  const first = key(halves[0]);
  const last = key(halves[halves.length - 1]);
  const newestFirst = first > last;
  if (newestFirst) halves.reverse();
  for (const h of halves) {
    const nos = h.atBats.map((a) => a.no).filter((n) => n);
    const desc = nos.length > 1 ? nos[0] > nos[nos.length - 1] : newestFirst;
    if (desc) { h.atBats.reverse(); h.events.reverse(); }
    h.events = h.events.flat();
  }
  return halves;
}

/** 状況の文字 → status */
export function yahooStatus(state) {
  const s = (state || '').trim();
  if (!s) return null;
  if (/中止|ノーゲーム|順延|サスペンデッド/.test(s)) return { status: 'postponed', text: s };
  if (/試合終了|コールド/.test(s)) return { status: 'final', text: '試合終了' };
  const m = /(\d{1,2})回(表|裏)/.exec(s);
  if (m) return { status: 'live', text: `${m[1]}回${m[2]}` };
  if (/試合中|中断/.test(s)) return { status: 'live', text: s };
  return { status: 'pre', text: s };
}
