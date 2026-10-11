// MLB 公式 Stats API (statsapi.mlb.com) から取得して日本語の試合モデルに変換する
import { fetchJSON, addDays, toJST } from './http.js';

const API = 'https://statsapi.mlb.com';

export const MLB_TEAMS = {
  108: { ja: 'エンゼルス', ab: 'LAA', color: '#BA0021', lg: 'AL' },
  109: { ja: 'Dバックス', ab: 'AZ', color: '#A71930', lg: 'NL' },
  110: { ja: 'オリオールズ', ab: 'BAL', color: '#DF4601', lg: 'AL' },
  111: { ja: 'レッドソックス', ab: 'BOS', color: '#BD3039', lg: 'AL' },
  112: { ja: 'カブス', ab: 'CHC', color: '#0E3386', lg: 'NL' },
  113: { ja: 'レッズ', ab: 'CIN', color: '#C6011F', lg: 'NL' },
  114: { ja: 'ガーディアンズ', ab: 'CLE', color: '#00385D', lg: 'AL' },
  115: { ja: 'ロッキーズ', ab: 'COL', color: '#333366', lg: 'NL' },
  116: { ja: 'タイガース', ab: 'DET', color: '#0C2340', lg: 'AL' },
  117: { ja: 'アストロズ', ab: 'HOU', color: '#EB6E1F', lg: 'AL' },
  118: { ja: 'ロイヤルズ', ab: 'KC', color: '#004687', lg: 'AL' },
  119: { ja: 'ドジャース', ab: 'LAD', color: '#005A9C', lg: 'NL' },
  120: { ja: 'ナショナルズ', ab: 'WSH', color: '#AB0003', lg: 'NL' },
  121: { ja: 'メッツ', ab: 'NYM', color: '#FF5910', lg: 'NL' },
  133: { ja: 'アスレチックス', ab: 'ATH', color: '#003831', lg: 'AL' },
  134: { ja: 'パイレーツ', ab: 'PIT', color: '#FDB827', fg: '#000', lg: 'NL' },
  135: { ja: 'パドレス', ab: 'SD', color: '#2F241D', lg: 'NL' },
  136: { ja: 'マリナーズ', ab: 'SEA', color: '#0C2C56', lg: 'AL' },
  137: { ja: 'ジャイアンツ', ab: 'SF', color: '#FD5A1E', lg: 'NL' },
  138: { ja: 'カージナルス', ab: 'STL', color: '#C41E3A', lg: 'NL' },
  139: { ja: 'レイズ', ab: 'TB', color: '#092C5C', lg: 'AL' },
  140: { ja: 'レンジャーズ', ab: 'TEX', color: '#003278', lg: 'AL' },
  141: { ja: 'ブルージェイズ', ab: 'TOR', color: '#134A8E', lg: 'AL' },
  142: { ja: 'ツインズ', ab: 'MIN', color: '#002B5C', lg: 'AL' },
  143: { ja: 'フィリーズ', ab: 'PHI', color: '#E81828', lg: 'NL' },
  144: { ja: 'ブレーブス', ab: 'ATL', color: '#CE1141', lg: 'NL' },
  145: { ja: 'ホワイトソックス', ab: 'CWS', color: '#27251F', lg: 'AL' },
  146: { ja: 'マーリンズ', ab: 'MIA', color: '#00A3E0', lg: 'NL' },
  147: { ja: 'ヤンキース', ab: 'NYY', color: '#0C2340', lg: 'AL' },
  158: { ja: 'ブルワーズ', ab: 'MIL', color: '#12284B', lg: 'NL' },
};

// 日本人選手は日本語表記にする
export const JA_NAMES = {
  'Shohei Ohtani': '大谷 翔平',
  'Yoshinobu Yamamoto': '山本 由伸',
  'Roki Sasaki': '佐々木 朗希',
  'Seiya Suzuki': '鈴木 誠也',
  'Shota Imanaga': '今永 昇太',
  'Yu Darvish': 'ダルビッシュ 有',
  'Masataka Yoshida': '吉田 正尚',
  'Yusei Kikuchi': '菊池 雄星',
  'Kodai Senga': '千賀 滉大',
  'Yuki Matsui': '松井 裕樹',
  'Kenta Maeda': '前田 健太',
  'Tomoyuki Sugano': '菅野 智之',
  'Shintaro Fujinami': '藤浪 晋太郎',
  'Munetaka Murakami': '村上 宗隆',
  'Kazuma Okamoto': '岡本 和真',
  'Tatsuya Imai': '今井 達也',
  'Shinnosuke Ogasawara': '小笠原 慎之介',
};

export const jaName = (n) => (n && JA_NAMES[n]) || n || '';
export const isJapanese = (n) => !!(n && JA_NAMES[n]);

const PITCH_TYPES = {
  FF: 'フォーシーム', FA: 'ストレート', SI: 'シンカー', FT: 'ツーシーム', FC: 'カッター', SL: 'スライダー',
  ST: 'スイーパー', SV: 'スラーブ', CU: 'カーブ', KC: 'ナックルカーブ', CS: 'スローカーブ', CH: 'チェンジアップ',
  FS: 'スプリット', FO: 'フォーク', SC: 'スクリュー', KN: 'ナックル', EP: 'イーファス', PO: 'ピッチアウト', IN: '敬遠',
};

const CALLS = {
  B: 'ボール', '*B': 'ボール', C: '見逃しストライク', S: '空振り', W: '空振り', F: 'ファウル', T: 'ファウルチップ',
  L: 'バントファウル', M: 'バント空振り', O: 'ファウルチップ', X: 'インプレー', D: 'インプレー', E: 'インプレー',
  H: '死球', I: '敬遠', P: 'ピッチアウト', Q: '空振り', R: 'ファウル', V: 'ボール(違反)', A: 'ボール(違反)',
  AC: 'ストライク(違反)', VB: 'ボール(違反)', VS: 'ストライク(違反)',
};

const EVENT_TYPES = {
  single: 'ヒット', double: 'ツーベース', triple: 'スリーベース', home_run: 'ホームラン',
  walk: '四球', intent_walk: '敬遠', hit_by_pitch: '死球', strikeout: '三振',
  strikeout_double_play: '三振併殺', grounded_into_double_play: '併殺打', double_play: '併殺',
  triple_play: 'トリプルプレー', force_out: 'ゴロ(封殺)', fielders_choice: 'フィルダースチョイス',
  fielders_choice_out: 'フィルダースチョイス', sac_fly: '犠牲フライ', sac_fly_double_play: '犠牲フライ併殺',
  sac_bunt: '犠打', sac_bunt_double_play: '犠打併殺', field_error: 'エラー', catcher_interf: '打撃妨害',
  fan_interference: '観客の妨害', batter_interference: '打撃妨害', runner_double_play: '併殺',
  other_out: 'アウト', wild_pitch: '暴投', passed_ball: '捕逸', balk: 'ボーク',
};
const FIELD_OUTS = {
  Groundout: 'ゴロ', Flyout: 'フライ', Lineout: 'ライナー', 'Pop Out': '内野フライ',
  'Bunt Groundout': 'バントゴロ', 'Bunt Pop Out': 'バント小フライ', 'Bunt Lineout': 'バントライナー',
};

const POS = {
  P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右',
  DH: '指', PH: '打', PR: '走', TWP: '投',
};

const SERIES = {
  'Regular Season': '', 'Wild Card': 'ワイルドカードシリーズ', 'Wild Card Game': 'ワイルドカード',
  'Division Series': '地区シリーズ', 'League Championship Series': 'リーグ優勝決定シリーズ',
  'World Series': 'ワールドシリーズ', 'Spring Training': 'オープン戦', Exhibition: 'エキシビション',
  'All-Star Game': 'オールスター',
};

function seriesJa(desc, num) {
  if (!desc) return '';
  let ja = SERIES[desc];
  if (ja === undefined) {
    const key = Object.keys(SERIES).find((k) => k && desc.includes(k));
    ja = key ? SERIES[key] : desc;
    if (/^AL|American/.test(desc)) ja = 'ア・リーグ' + ja;
    if (/^NL|National/.test(desc)) ja = 'ナ・リーグ' + ja;
  }
  if (!ja) return '';
  return num ? `${ja} 第${num}戦` : ja;
}

function team(t, extra = {}) {
  const m = MLB_TEAMS[t.id] || { ja: t.teamName || t.name, color: '#444', lg: '' };
  return {
    id: t.id,
    name: m.ja,
    full: t.name,
    short: t.abbreviation || (t.teamName || t.name || '').slice(0, 3),
    code: t.abbreviation,
    league: m.lg,
    color: m.color,
    fg: m.fg || '#fff',
    ...extra,
  };
}

function statusOf(st, ls) {
  const code = st.codedGameState;
  const det = st.detailedState || '';
  if (['D', 'C'].includes(code) || /Postponed|Cancelled/.test(det)) return { status: 'postponed', text: /Cancelled/.test(det) ? '中止' : '延期' };
  if (['T', 'U'].includes(code) || /Suspended/.test(det)) return { status: 'postponed', text: 'サスペンデッド' };
  if (st.abstractGameState === 'Final') return { status: 'final', text: '試合終了' };
  if (st.abstractGameState === 'Live') {
    if (/Delayed/.test(det)) return { status: 'live', text: '中断中' };
    if (ls && ls.currentInning) {
      const state = ls.inningState || ls.inningHalf;
      if (state === 'Middle') return { status: 'live', text: `${ls.currentInning}回表終了` };
      if (state === 'End') return { status: 'live', text: `${ls.currentInning}回裏終了` };
      return { status: 'live', text: `${ls.currentInning}回${ls.isTopInning ? '表' : '裏'}` };
    }
    return { status: 'live', text: /Warmup/.test(det) ? '試合前練習' : '試合中' };
  }
  if (/Delayed/.test(det)) return { status: 'pre', text: '開始遅延' };
  return { status: 'pre', text: '試合前' };
}

const groupOf = (g) => (['F', 'D', 'L', 'W'].includes(g.gameType) ? 'PS' : (MLB_TEAMS[g.teams.home.team.id] || {}).lg || 'MLB');

// ---------------- 日程 ----------------

/** 日本時間の日付 (YYYY-MM-DD) に開始する試合を返す */
export async function mlbSchedule(dateJST) {
  const url = `${API}/api/v1/schedule?sportId=1&startDate=${addDays(dateJST, -1)}&endDate=${dateJST}` +
    '&hydrate=linescore,team,decisions,probablePitcher,seriesStatus';
  const data = await fetchJSON(url, { ttl: 10 });
  const games = [];
  for (const d of data.dates || []) {
    for (const g of d.games || []) {
      const jst = toJST(g.gameDate);
      if (jst.date !== dateJST) continue;
      games.push(scheduleCard(g, jst));
    }
  }
  games.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  return games;
}

function scheduleCard(g, jst) {
  const ls = g.linescore || {};
  const st = statusOf(g.status, ls);
  const side = (k) => team(g.teams[k].team, {
    score: st.status === 'pre' ? null : g.teams[k].score ?? ls.teams?.[k]?.runs ?? null,
    record: g.teams[k].leagueRecord ? `${g.teams[k].leagueRecord.wins}-${g.teams[k].leagueRecord.losses}` : '',
  });
  const notes = [];
  const dec = g.decisions || {};
  if (dec.winner) notes.push(`勝 ${jaName(dec.winner.fullName)}`);
  if (dec.loser) notes.push(`敗 ${jaName(dec.loser.fullName)}`);
  if (dec.save) notes.push(`S ${jaName(dec.save.fullName)}`);
  if (st.status === 'pre') {
    const pa = g.teams.away.probablePitcher;
    const ph = g.teams.home.probablePitcher;
    if (pa || ph) notes.push(`予告先発 ${jaName(pa?.fullName) || '未定'} - ${jaName(ph?.fullName) || '未定'}`);
  }
  const series = seriesJa(g.seriesDescription, g.gameType !== 'R' ? g.seriesGameNumber : null);
  const seriesResult = g.seriesStatus?.result || '';
  return {
    id: String(g.gamePk),
    league: 'MLB',
    leagueGroup: groupOf(g),
    date: jst.date,
    startTime: jst.time,
    venue: g.venue?.name || '',
    status: st.status,
    statusText: st.text,
    series,
    seriesResult,
    outs: st.status === 'live' ? ls.outs ?? null : null,
    away: side('away'),
    home: side('home'),
    notes,
  };
}

// ---------------- 試合詳細 ----------------

export async function mlbGame(pk) {
  const data = await fetchJSON(`${API}/api/v1.1/game/${pk}/feed/live`, { ttl: 5 });
  return convertFeed(data);
}

const kmh = (mph) => (mph ? Math.round(mph * 1.609344) : null);
const meters = (ft) => (ft ? Math.round(ft * 0.3048) : null);

function basesText(r) {
  const on = [r.first && '一', r.second && '二', r.third && '三'].filter(Boolean);
  if (!on.length) return '走者なし';
  if (on.length === 3) return '満塁';
  return on.join('・') + '塁';
}
const OUTS = ['無死', '一死', '二死', '三死'];

function pitchFrom(ev) {
  const d = ev.details || {};
  const pd = ev.pitchData || {};
  const code = d.call?.code || d.code || '';
  return {
    num: ev.pitchNumber ?? null,
    type: PITCH_TYPES[d.type?.code] || d.type?.description || '',
    typeCode: d.type?.code || '',
    speed: kmh(pd.startSpeed),
    call: CALLS[code] || d.call?.description || d.description || '',
    callCode: code,
    kind: d.isInPlay ? 'inplay' : d.isStrike ? 'strike' : d.isBall ? 'ball' : 'other',
    px: pd.coordinates?.pX ?? null,
    pz: pd.coordinates?.pZ ?? null,
    szTop: pd.strikeZoneTop ?? null,
    szBot: pd.strikeZoneBottom ?? null,
    balls: ev.count?.balls ?? null,
    strikes: ev.count?.strikes ?? null,
  };
}

function resultJa(play) {
  const r = play.result || {};
  if (r.eventType === 'strikeout') {
    const last = [...(play.playEvents || [])].reverse().find((e) => e.isPitch);
    const c = last?.details?.call?.code;
    return c === 'C' ? '見逃し三振' : c === 'S' || c === 'W' ? '空振り三振' : '三振';
  }
  if (r.eventType === 'field_out') return FIELD_OUTS[r.event] || 'アウト';
  return EVENT_TYPES[r.eventType] || r.event || '';
}

export function convertFeed(data) {
  const gd = data.gameData;
  const ld = data.liveData;
  const ls = ld.linescore || {};
  const bx = ld.boxscore || { teams: { away: {}, home: {} } };
  const st = statusOf(gd.status, ls);
  const jst = toJST(gd.datetime.dateTime);
  const players = { ...(bx.teams.away.players || {}), ...(bx.teams.home.players || {}) };
  const pl = (id) => players['ID' + id] || null;
  const nameOf = (p) => jaName(p?.fullName || p?.person?.fullName);

  const side = (k) => team(gd.teams[k], {
    score: st.status === 'pre' ? null : ls.teams?.[k]?.runs ?? 0,
    hits: ls.teams?.[k]?.hits ?? null,
    errors: ls.teams?.[k]?.errors ?? null,
    lob: ls.teams?.[k]?.leftOnBase ?? null,
    record: gd.teams[k].record ? `${gd.teams[k].record.wins}-${gd.teams[k].record.losses}` : '',
  });
  const away = side('away');
  const home = side('home');

  // スコアボード
  const nInn = Math.max(9, (ls.innings || []).length);
  const innings = [];
  for (let i = 1; i <= nInn; i++) {
    const inn = (ls.innings || []).find((x) => x.num === i);
    const a = inn?.away?.runs;
    let h = inn?.home?.runs;
    // 9 回裏不要の「X」
    if (inn && h === undefined && st.status === 'final' && i >= 9 && inn.away) h = 'X';
    innings.push({ num: i, away: a ?? null, home: h ?? null });
  }

  // 責任投手 (シーズン成績つき)
  const decisions = {};
  for (const [k, key] of [['win', 'winner'], ['loss', 'loser'], ['save', 'save']]) {
    const p = ld.decisions?.[key];
    if (!p) continue;
    const s = pl(p.id)?.seasonStats?.pitching || {};
    decisions[k] = {
      name: nameOf(p),
      record: s.wins !== undefined ? `${s.wins}勝${s.losses}敗${s.saves}S` : '',
    };
  }

  // 打順スロット (経過の「◯番」表示用)
  const slot = {};
  for (const p of Object.values(players)) if (p.battingOrder) slot[p.person.id] = Math.floor(Number(p.battingOrder) / 100);

  // 経過
  const allPlays = ld.plays?.allPlays || [];
  const halves = [];
  const homeRuns = [];
  const paByBatter = {}; // 打者ごとの打席結果 (成績表のイニング欄)
  let half = null;
  let prev = null;
  for (const play of allPlays) {
    const ab = play.about || {};
    const isTop = ab.halfInning === 'top';
    if (!half || half.inning !== ab.inning || half.half !== ab.halfInning) {
      const bat = isTop ? away : home;
      half = { inning: ab.inning, half: ab.halfInning, label: `${ab.inning}回${isTop ? '表' : '裏'} ${bat.name}の攻撃`, events: [], atBats: [] };
      halves.push(half);
      prev = null;
    }
    const before = prev
      ? { outs: prev.count?.outs ?? 0, first: !!prev.matchup?.postOnFirst, second: !!prev.matchup?.postOnSecond, third: !!prev.matchup?.postOnThird }
      : { outs: 0 };
    const events = [];
    const pitches = [];
    for (const ev of play.playEvents || []) {
      if (ev.isPitch) {
        const p = pitchFrom(ev);
        pitches.push(p);
        events.push({ pitch: p.num, text: `${p.call}  ${p.type}${p.speed ? ' ' + p.speed + 'km/h' : ''}`, kind: p.kind });
      } else if (ev.details?.description) {
        events.push({ text: ev.details.description, change: ev.type === 'action' && /Substitution|Defensive Switch|Pitching Change|Offensive Sub/i.test(ev.details.event || ''), scoring: !!ev.details.isScoringPlay });
      }
    }
    const r = play.result || {};
    const resJa = resultJa(play);
    let resText = resJa;
    if (r.isOut && play.count) resText += `  ${play.count.outs}アウト`;
    if (r.rbi) resText += `  ${r.rbi}打点`;
    const hd = [...(play.playEvents || [])].reverse().find((e) => e.hitData)?.hitData;
    const hitInfo = hd ? [hd.launchSpeed && `打球速度 ${kmh(hd.launchSpeed)}km/h`, hd.launchAngle !== undefined && `角度 ${hd.launchAngle}°`, hd.totalDistance && `飛距離 ${meters(hd.totalDistance)}m`].filter(Boolean).join(' / ') : '';
    if (play.about?.isComplete !== false && r.type === 'atBat') {
      events.push({ result: true, text: resText, desc: r.description || '', scoring: !!ab.isScoringPlay, hit: hitInfo, score: ab.isScoringPlay ? `${r.awayScore}-${r.homeScore}` : '' });
    }
    half.atBats.push({
      order: slot[play.matchup?.batter?.id] || null,
      batter: nameOf(play.matchup?.batter),
      pitcher: nameOf(play.matchup?.pitcher),
      situation: `${OUTS[Math.min(before.outs, 3)]}${basesText(before)}`,
      result: play.about?.isComplete === false ? '' : resJa,
      scoring: !!ab.isScoringPlay,
      events,
      pitches,
    });

    if (play.about?.isComplete !== false && r.type === 'atBat' && play.matchup?.batter?.id) {
      (paByBatter[play.matchup.batter.id] ||= []).push({ inning: ab.inning, text: shortResult(play, hd) });
    }

    if (r.eventType === 'home_run') {
      const num = (/\((\d+)\)/.exec(r.description || '') || [])[1];
      const kind = r.rbi === 4 ? '満塁' : r.rbi > 1 ? `${r.rbi}ラン` : 'ソロ';
      homeRuns.push({
        side: isTop ? 'away' : 'home',
        name: nameOf(play.matchup?.batter),
        jp: isJapanese(play.matchup?.batter?.fullName),
        number: num ? Number(num) : null,
        detail: `${ab.inning}回${isTop ? '表' : '裏'}${kind}${hd?.totalDistance ? ' ' + meters(hd.totalDistance) + 'm' : ''}`,
      });
    }
    prev = play;
  }

  const playedInn = Math.max((ls.innings || []).length, ...Object.values(paByBatter).flat().map((x) => x.inning), 0);

  // 現在の状況
  let current = null;
  if (st.status === 'live') {
    const cp = ld.plays?.currentPlay || {};
    const off = ls.offense || {};
    const def = ls.defense || {};
    const bId = off.batter?.id || cp.matchup?.batter?.id;
    const pId = def.pitcher?.id || cp.matchup?.pitcher?.id;
    const bp = pl(bId);
    const pp = pl(pId);
    const bToday = bp?.stats?.batting || {};
    const bSeason = bp?.seasonStats?.batting || {};
    const pToday = pp?.stats?.pitching || {};
    const pSeason = pp?.seasonStats?.pitching || {};
    const lastDone = [...allPlays].reverse().find((p) => p.about?.isComplete);
    current = {
      inning: ls.currentInning ?? null,
      half: ls.isTopInning ? 'top' : 'bottom',
      balls: ls.balls ?? cp.count?.balls ?? 0,
      strikes: ls.strikes ?? cp.count?.strikes ?? 0,
      outs: ls.outs ?? cp.count?.outs ?? 0,
      runners: {
        first: off.first ? nameOf(off.first) : null,
        second: off.second ? nameOf(off.second) : null,
        third: off.third ? nameOf(off.third) : null,
      },
      batter: bId ? {
        name: nameOf(bp?.person || off.batter || cp.matchup?.batter),
        jp: isJapanese((bp?.person || off.batter)?.fullName),
        hand: cp.matchup?.batSide?.code === 'L' ? '左打' : cp.matchup?.batSide?.code === 'S' ? '両打' : '右打',
        info: [
          bToday.atBats !== undefined ? `今日 ${bToday.atBats}打数${bToday.hits}安打` : '',
          bSeason.avg ? `打率${bSeason.avg} ${bSeason.homeRuns ?? 0}本 OPS${bSeason.ops ?? '-'}` : '',
        ].filter(Boolean),
      } : null,
      pitcher: pId ? {
        name: nameOf(pp?.person || def.pitcher || cp.matchup?.pitcher),
        jp: isJapanese((pp?.person || def.pitcher)?.fullName),
        hand: cp.matchup?.pitchHand?.code === 'L' ? '左投' : '右投',
        info: [
          pToday.numberOfPitches !== undefined ? `今日 ${pToday.numberOfPitches}球 ${pToday.inningsPitched}回 ${pToday.strikeOuts}奪三振` : '',
          pSeason.era ? `防御率${pSeason.era} ${pSeason.wins ?? 0}勝${pSeason.losses ?? 0}敗` : '',
        ].filter(Boolean),
      } : null,
      onDeck: off.onDeck ? nameOf(off.onDeck) : null,
      pitches: (cp.playEvents || []).filter((e) => e.isPitch).map(pitchFrom),
      lastPlay: lastDone ? `${resultJa(lastDone)}: ${lastDone.result?.description || ''}` : null,
      defense: Object.fromEntries(['pitcher', 'catcher', 'first', 'second', 'third', 'shortstop', 'left', 'center', 'right']
        .filter((k) => def[k]).map((k) => [k, nameOf(def[k])])),
    };
  }

  const probables = {};
  for (const k of ['away', 'home']) {
    const p = gd.probablePitchers?.[k];
    if (p) {
      const s = pl(p.id)?.seasonStats?.pitching;
      probables[k] = { name: nameOf(p), info: s?.era ? `${s.wins}勝${s.losses}敗 防御率${s.era}` : '' };
    }
  }

  return {
    id: String(gd.game.pk),
    league: 'MLB',
    source: 'mlb',
    url: `https://www.mlb.com/gameday/${gd.game.pk}`,
    status: st.status,
    statusText: st.text,
    title: `${away.name} vs ${home.name}`,
    series: seriesJa(gd.game.seriesDescription, gd.game.type !== 'R' ? gd.game.seriesGameNumber : null),
    date: jst.date,
    startTime: jst.time,
    venue: gd.venue?.name || '',
    weather: gd.weather?.condition ? `${gd.weather.condition} ${gd.weather.temp ? Math.round((gd.weather.temp - 32) * 5 / 9) + '℃' : ''}`.trim() : '',
    away,
    home,
    linescore: { innings },
    current,
    decisions,
    homeRuns,
    probables,
    summary: '',
    plays: halves,
    box: { away: boxFor(bx.teams.away, paByBatter, playedInn), home: boxFor(bx.teams.home, paByBatter, playedInn) },
    notes: [],
  };
}

// 新聞の成績表と同じ「打球方向 + 結果」の短い表記 (例: 左安 / 遊ゴ / 中飛 / 見三振)
const FIELD_POS = { 1: '投', 2: '捕', 3: '一', 4: '二', 5: '三', 6: '遊', 7: '左', 8: '中', 9: '右' };
const SHORT = {
  single: '安', double: '二', triple: '三', home_run: '本', grounded_into_double_play: '併殺', double_play: '併殺',
  triple_play: '三重殺', force_out: 'ゴ', fielders_choice: '野選', fielders_choice_out: '野選', sac_fly: '犠飛',
  sac_bunt: '犠打', field_error: '失', sac_fly_double_play: '犠飛', sac_bunt_double_play: '犠打',
};
const NO_DIR = { walk: '四球', intent_walk: '敬遠', hit_by_pitch: '死球', catcher_interf: '打妨', strikeout_double_play: '三振' };

export function shortResult(play, hd) {
  const r = play.result || {};
  const et = r.eventType;
  if (et === 'strikeout' || et === 'strikeout_double_play') {
    const last = [...(play.playEvents || [])].reverse().find((e) => e.isPitch);
    const c = last?.details?.call?.code;
    return c === 'C' ? '見三振' : '空三振';
  }
  if (NO_DIR[et]) return NO_DIR[et];
  const batterId = play.matchup?.batter?.id;
  const credit = (play.runners || []).find((x) => x.details?.runner?.id === batterId)?.credits?.[0]?.position?.code;
  const dir = FIELD_POS[hd?.location] || FIELD_POS[credit] || '';
  if (et === 'field_out') {
    const k = { Groundout: 'ゴ', 'Bunt Groundout': 'ゴ', Flyout: '飛', 'Pop Out': '飛', 'Bunt Pop Out': '飛', Lineout: '直', 'Bunt Lineout': '直' }[r.event] || 'アウト';
    return dir + k;
  }
  if (SHORT[et]) return dir + SHORT[et];
  return EVENT_TYPES[et] || r.event || '';
}

function boxFor(t, paByBatter = {}, nInn = 9) {
  if (!t || !t.players) return { batting: [], pitching: [] };
  const players = t.players;
  const batters = Object.values(players)
    .filter((p) => p.battingOrder)
    .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder));
  const bRows = batters.map((p) => {
    const s = p.stats?.batting || {};
    const ss = p.seasonStats?.batting || {};
    const sub = Number(p.battingOrder) % 100 !== 0;
    const positions = (p.allPositions || [p.position]).filter(Boolean).map((x) => POS[x.abbreviation] || x.abbreviation);
    const pos = sub ? positions.join('') : `(${positions[0] || ''})${positions.slice(1).join('')}`;
    const pa = paByBatter[p.person.id] || [];
    const byInn = Array.from({ length: nInn }, (_, i) => pa.filter((x) => x.inning === i + 1).map((x) => x.text).join('/'));
    return [pos, jaName(p.person.fullName), ss.avg || '-', s.atBats ?? 0, s.runs ?? 0, s.hits ?? 0, s.rbi ?? 0, s.homeRuns ?? 0, s.baseOnBalls ?? 0, s.strikeOuts ?? 0, s.stolenBases ?? 0, ...byInn].map(String);
  });
  const tb = t.teamStats?.batting;
  if (tb && bRows.length) bRows.push(['', '合計', '', tb.atBats, tb.runs, tb.hits, tb.rbi, tb.homeRuns, tb.baseOnBalls, tb.strikeOuts, tb.stolenBases, ...Array(nInn).fill('')].map((v) => String(v ?? '')));

  const NOTE = { W: '勝', L: '敗', S: 'S', H: 'H', BS: 'BS' };
  const pRows = (t.pitchers || []).map((id) => players['ID' + id]).filter(Boolean).map((p) => {
    const s = p.stats?.pitching || {};
    const ss = p.seasonStats?.pitching || {};
    const note = (/\((\w+)/.exec(s.note || '') || [])[1];
    return [NOTE[note] || '', jaName(p.person.fullName), s.inningsPitched ?? '0.0', s.battersFaced ?? 0, s.numberOfPitches ?? s.pitchesThrown ?? 0, s.hits ?? 0, s.homeRuns ?? 0, s.baseOnBalls ?? 0, s.strikeOuts ?? 0, s.runs ?? 0, s.earnedRuns ?? 0, ss.era ?? '-'].map(String);
  });
  return {
    batting: bRows.length ? [{ headers: ['位置', '選手名', '打率', '打', '得', '安', '点', '本', '四', '振', '盗', ...Array.from({ length: nInn }, (_, i) => `${i + 1}回`)], rows: bRows }] : [],
    pitching: pRows.length ? [{ headers: ['', '選手名', '回', '打者', '球数', '安', '本', '四', '振', '失', '責', '防御率'], rows: pRows }] : [],
  };
}

// ---------------- カレンダー ----------------

/** チームの月間日程 (日本時間の日付で振り分け) */
export async function mlbCalendar(teamId, month) {
  if (!MLB_TEAMS[teamId] || !/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid params');
  const last = addDays(addDays(`${month}-01`, 32).slice(0, 8) + '01', -1);
  const url = `${API}/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${addDays(`${month}-01`, -1)}&endDate=${last}` +
    '&hydrate=linescore,team,decisions,seriesStatus';
  const data = await fetchJSON(url, { ttl: 120 });
  const games = [];
  for (const d of data.dates || []) {
    for (const g of d.games || []) {
      const jst = toJST(g.gameDate);
      if (!jst.date.startsWith(month)) continue;
      const card = scheduleCard(g, jst);
      const side = card.home.id === Number(teamId) ? 'home' : 'away';
      const opp = side === 'home' ? 'away' : 'home';
      let result = null;
      if (card.status === 'postponed') result = 'postponed';
      else if (card.status === 'final') result = card[side].score > card[opp].score ? 'win' : card[side].score < card[opp].score ? 'loss' : 'draw';
      games.push({ ...card, side, result });
    }
  }
  games.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const t = MLB_TEAMS[teamId];
  return { league: 'MLB', team: { id: Number(teamId), name: t.ja, short: t.ab, color: t.color, fg: t.fg || '#fff' }, month, source: 'mlb', games };
}

// ---------------- 順位表 ----------------

const DIVISIONS = {
  201: 'ア・リーグ東地区', 202: 'ア・リーグ中地区', 200: 'ア・リーグ西地区',
  204: 'ナ・リーグ東地区', 205: 'ナ・リーグ中地区', 203: 'ナ・リーグ西地区',
};
const DIV_ORDER = [201, 202, 200, 204, 205, 203];

const streakJa = (c) => (c ? c.replace(/^W(\d+)/, '$1連勝').replace(/^L(\d+)/, '$1連敗') : '-');

function standRow(tr, wc) {
  const l10 = tr.records?.splitRecords?.find((x) => x.type === 'lastTen');
  return {
    team: team(tr.team),
    cells: [
      String(wc ? tr.wildCardRank ?? '' : tr.divisionRank ?? ''),
      (MLB_TEAMS[tr.team.id] || {}).ja || tr.team.name,
      tr.wins, tr.losses, tr.winningPercentage,
      wc ? tr.wildCardGamesBack ?? '-' : tr.gamesBack,
      ...(wc ? [] : [tr.wildCardGamesBack ?? '-']),
      l10 ? `${l10.wins}-${l10.losses}` : '-', streakJa(tr.streak?.streakCode),
      tr.runDifferential > 0 ? `+${tr.runDifferential}` : String(tr.runDifferential ?? '-'),
    ].map(String),
    clinched: tr.clinchIndicator || '',
  };
}

/** { AL: [地区...], NL: [地区...], WC: [ア・ナ] } */
export async function mlbStandings(season) {
  const base = `${API}/api/v1/standings?leagueId=103,104&season=${season}&hydrate=team`;
  const [reg, wc] = await Promise.all([
    fetchJSON(`${base}&standingsTypes=regularSeason`, { ttl: 300 }),
    fetchJSON(`${base}&standingsTypes=wildCard`, { ttl: 300 }).catch(() => ({ records: [] })),
  ]);
  const divs = (reg.records || []).map((r) => ({
    id: r.division?.id,
    lg: r.division?.id <= 202 ? 'AL' : 'NL',
    name: DIVISIONS[r.division?.id] || r.division?.name || '',
    teamCol: 1,
    headers: ['順位', 'チーム', '勝', '敗', '勝率', '差', 'WC差', '直近10', '連続', '得失点'],
    rows: (r.teamRecords || []).map((tr) => standRow(tr, false)),
  }));
  divs.sort((a, b) => DIV_ORDER.indexOf(a.id) - DIV_ORDER.indexOf(b.id));
  const wcs = (wc.records || []).map((r) => ({
    id: r.league?.id,
    name: r.league?.id === 103 ? 'ア・リーグ ワイルドカード' : 'ナ・リーグ ワイルドカード',
    teamCol: 1,
    headers: ['順位', 'チーム', '勝', '敗', '勝率', '差', '直近10', '連続', '得失点'],
    rows: (r.teamRecords || []).map((tr) => standRow(tr, true)),
  })).sort((a, b) => a.id - b.id);
  return { AL: divs.filter((d) => d.lg === 'AL'), NL: divs.filter((d) => d.lg === 'NL'), WC: wcs };
}
