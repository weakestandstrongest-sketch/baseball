// NPB ページ共通のパーサー。
// サイトごとのクラス名に依存しないよう、表の見出しや「1回表」「◯号」などの
// テキストパターンで情報を拾う。npb.jp / Yahoo! どちらのページにも使う。
import { find, findAll, byTag, lines as pageLines, tables, precedingText, precedingHeading, norm, text, byIdRe, byClassRe } from '../html.js';
import { teamFromText, teamsInText, teamInfo, NPB_TEAMS } from './teams.js';

export function mainContent(root) {
  return (
    find(root, byTag('main')) ||
    find(root, byIdRe(/^(contents?|main|wrapper)$/i)) ||
    find(root, byTag('body')) ||
    root
  );
}

const isNum = (s) => /^\d+$/.test(s);

// ---------------- スコアボード ----------------

/**
 * ページ内の表。左右に分割された表 (チーム名の固定列 + 横スクロールする数字の表、
 * スコアボードの「チーム / 1〜9回 / 計・安・失」など) は 1 つにつなげて返す。
 */
export function npbTables(root) {
  const list = tables(root);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const cur = { node: list[i].node, rows: list[i].rows.map((r) => r.slice()) };
    while (i + 1 < list.length && canMerge(cur, list[i + 1])) {
      const nx = list[++i];
      cur.rows = cur.rows.map((r, k) => [...r, ...nx.rows[k]]);
    }
    out.push(cur);
  }
  return out;
}

const hasTeamCell = (r) => r.some((c) => c && c.length <= 8 && teamFromText(c, { anywhere: false }));

function canMerge(a, b) {
  if (a.rows.length !== b.rows.length || a.rows.length < 2) return false;
  if (b.rows.slice(1).some(hasTeamCell)) return false; // 右側にチーム名があれば別の表
  const id = (n) => n.attrs.id || '';
  const cls = (n) => n.attrs.class || '';
  if (/scrollFix/i.test(cls(a.node)) || /^gameScore_head$/.test(id(a.node)) || /^gameScore_foot$/.test(id(b.node))) return true;
  const width = (t) => Math.max(...t.rows.map((r) => r.length));
  return width(a) <= 2 && width(b) >= 3 && a.rows.slice(1).some(hasTeamCell);
}

export function parseLinescore(root) {
  for (const { node, rows } of npbTables(root)) {
    const hi = rows.findIndex((r) => {
      const i1 = r.indexOf('1');
      return i1 >= 0 && r[i1 + 1] === '2' && r[i1 + 2] === '3' && r.some((c) => /^(計|R|合計)$/.test(c));
    });
    if (hi < 0) continue;
    const head = rows[hi];
    const first = head.indexOf('1');
    const totalIdx = head.findIndex((c) => /^(計|R|合計)$/.test(c));
    const hitIdx = head.findIndex((c) => /^(安|H|安打)$/.test(c));
    const errIdx = head.findIndex((c) => /^(失|E|失策)$/.test(c));
    const teamRows = rows.slice(hi + 1).filter((r) => r.length >= totalIdx && r.slice(first, totalIdx).some((c) => c !== ''));
    if (teamRows.length < 2) continue;
    const [a, h] = teamRows;
    const teamName = (r) => r.slice(0, first).filter(Boolean).join(' ') || precedingText(node, 30);
    // 数字・X（サヨナラなど）以外はスコアとして使わない（ページの文字をそのまま画面に出さないため）
    const cell = (v) => (v === undefined || v === '' || v === '-' || !/^(\d{1,2}|[Xx×])$/.test(String(v).trim()) ? null : String(v).trim());
    const innings = [];
    for (let c = first; c < totalIdx; c++) {
      if (!isNum(head[c])) continue;
      innings.push({ num: Number(head[c]), away: cell(a[c]), home: cell(h[c]) });
    }
    const side = (r) => {
      const team = teamFromText(teamName(r));
      return {
        ...teamInfo(team, teamName(r)),
        score: toInt(r[totalIdx]),
        hits: hitIdx >= 0 ? toInt(r[hitIdx]) : null,
        errors: errIdx >= 0 ? toInt(r[errIdx]) : null,
      };
    };
    return { innings, away: side(a), home: side(h) };
  }
  return null;
}

const toInt = (v) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);

// ---------------- 打撃・投手成績の表 ----------------

const BAT_RE = /^(打率|打数|打|安打|安)$/;
const PIT_RE = /^(投球回|回|投球数|球数|球|防御率|自責点|自責|奪三振|振|被安打|与四球|四|失点|失)$/;
const isPitchHead = (r) => r.some((c) => /^(投球回|回)$/.test(c)) && r.filter((c) => PIT_RE.test(c)).length >= 3;
const isBatHead = (r) => r.some((c) => /^(打率|打数)$/.test(c)) || r.filter((c) => BAT_RE.test(c)).length >= 2;

export function parseBoxTables(root, teams) {
  const out = { away: { batting: [], pitching: [] }, home: { batting: [], pitching: [] } };
  const seen = new Set();
  const order = { batting: 0, pitching: 0 };
  for (const { node, rows } of tables(root)) {
    const hi = rows.findIndex((r) => isPitchHead(r) || isBatHead(r));
    if (hi < 0) continue;
    const head = rows[hi];
    const kind = isPitchHead(head) ? 'pitching' : 'batting';
    const body = rows.slice(hi + 1).filter((r) => r.length >= Math.min(head.length, 4) && r.some(Boolean));
    if (!body.length) continue;
    const key = JSON.stringify([head, body]);
    if (seen.has(key)) continue;
    seen.add(key);

    // どちらのチームの表か: 直前の見出しテキスト → 表の中のチーム名 → 出現順 (先攻→後攻)
    const label = precedingHeading(node) || precedingText(node, 80);
    let side = null;
    const t = teamsInText(label).pop(); // 一番近い (最後に出てきた) チーム名
    if (t && teams) side = t.code === teams.away.code ? 'away' : t.code === teams.home.code ? 'home' : null;
    if (!side) side = order[kind] % 2 === 0 ? 'away' : 'home';
    order[kind]++;
    out[side][kind].push({ headers: head, rows: body });
  }
  return out;
}

// ---------------- 責任投手・本塁打・戦評 ----------------

const DEC_LABEL = { 勝: 'win', 勝利: 'win', 勝利投手: 'win', 勝投手: 'win', 敗: 'loss', 敗戦: 'loss', 敗戦投手: 'loss', 敗投手: 'loss', S: 'save', セーブ: 'save' };

export function parseDecisions(ls) {
  const res = {};
  const start = ls.findIndex((l) => /責任投手/.test(l));
  const scope = start >= 0 ? ls.slice(start, start + 12) : ls;
  const joined = scope.join(' ');
  const re = /(勝利投手|勝投手|敗戦投手|敗投手|セーブ|勝利|敗戦|勝|敗|S)\s*[:：]?\s*([^\s()（）:：\d][^()（）:：]{0,20}?)\s*[（(]([^)）]{1,20})[)）]/g;
  let m;
  while ((m = re.exec(joined))) {
    const k = DEC_LABEL[m[1]];
    if (k && !res[k]) res[k] = splitTeam({ name: m[2].trim(), record: m[3].trim() });
  }
  if (!res.win && start < 0) {
    // 「勝 浜地」のように成績表記がない形式
    for (const l of ls) {
      const mm = /^(勝利投手|勝投手|敗戦投手|敗投手|セーブ)\s*[:：]?\s*(\S+(?: \S+)?)$/.exec(l);
      if (mm && !res[DEC_LABEL[mm[1]]]) res[DEC_LABEL[mm[1]]] = { name: mm[2], record: '' };
    }
  }
  return res;
}

// 「DeNA 石田裕」→ チームと名前に分ける
function splitTeam(d) {
  const parts = d.name.split(' ');
  if (parts.length > 1) {
    const t = teamFromText(parts[0], { anywhere: false });
    if (t && t.aliases.includes(parts[0].normalize('NFKC'))) return { ...d, name: parts.slice(1).join(' '), team: t.code };
  }
  return d;
}

export function parseHomeRuns(ls, teams) {
  const out = [];
  const seen = new Set();
  const start = ls.findIndex((l) => /^(本塁打|ホームラン)$/.test(l) || /^本塁打\s/.test(l));
  const scope = start >= 0 ? ls.slice(start, start + 20) : ls;
  let curTeam = null;
  for (const l of scope) {
    const lead = teamFromText(l.split(' ')[0], { anywhere: false }) || (l.length <= 6 ? teamFromText(l) : null);
    if (lead) curTeam = lead;
    const re = /([^\s\d()（）、,:：]+(?: [^\s\d()（）、,:：]+)?)\s*(\d+)\s*号\s*(?:[（(]([^)）]+)[)）])?/g;
    let m;
    while ((m = re.exec(l))) {
      let name = m[1];
      // 行頭のチーム略号 (「デ 牧」) を名前から外す
      const parts = name.split(' ');
      if (parts.length > 1 && teamFromText(parts[0], { anywhere: false }) === lead && lead) name = parts.slice(1).join(' ');
      const key = name + m[2];
      if (seen.has(key)) continue;
      seen.add(key);
      let side = null;
      if (curTeam && teams) side = curTeam.code === teams.away.code ? 'away' : curTeam.code === teams.home.code ? 'home' : null;
      out.push({ side, name, number: Number(m[2]), detail: m[3] || '' });
    }
    if (start >= 0 && /^(戦評|試合経過|責任投手|動画|スタメン|ベンチ入り)/.test(l) && l !== scope[0]) break;
  }
  return out;
}

export function parseSummary(ls) {
  const i = ls.findIndex((l) => /^(戦評|試合の見どころ|見どころ|試合概要|戦況)$/.test(l));
  if (i < 0) return '';
  const out = [];
  for (const l of ls.slice(i + 1, i + 6)) {
    if (l.length < 8 && out.length) break;
    out.push(l);
    if (out.join('').length > 400) break;
  }
  return out.join('\n');
}

// ---------------- 試合状況 ----------------

export function parseStatus(ls) {
  const top = ls.slice(0, 80).join('\n');
  if (/ノーゲーム|試合中止|中止|順延/.test(top)) return { status: 'postponed', text: (/(ノーゲーム|試合中止|中止|順延)/.exec(top) || [])[1] };
  if (/試合終了|コールド/.test(top)) return { status: 'final', text: /コールド/.test(top) ? 'コールド' : '試合終了' };
  const m = /(\d{1,2}) ?回 ?(表|裏)/.exec(top);
  if (/試合中|速報中/.test(top) || (m && !/試合前|予告先発/.test(top))) return { status: 'live', text: m ? `${m[1]}回${m[2]}` : '試合中' };
  return { status: 'pre', text: '試合前' };
}

// ---------------- 経過 (テキスト速報) ----------------

export function parsePlays(ls) {
  const halves = [];
  let half = null;
  let ab = null;
  for (let l of ls) {
    const hm = /^(\d{1,2}) ?回 ?(表|裏)(.*)$/.exec(l);
    if (hm && l.length <= 30) {
      half = { inning: Number(hm[1]), half: hm[2] === '表' ? 'top' : 'bottom', label: l, events: [], atBats: [] };
      halves.push(half);
      ab = null;
      continue;
    }
    if (/^試合前情報$/.test(l) && !halves.length) {
      half = { inning: 0, half: 'pre', label: '試合前情報', events: [], atBats: [] };
      halves.push(half);
      continue;
    }
    if (!half) continue;
    if (/^\d+$/.test(l)) continue; // 打席番号だけの行
    const bm = /^(?:\d+\s+)?(\d)番\s*[:：]?\s*(.+)$/.exec(l);
    if (bm) {
      const rest = bm[2];
      const sit = /(無死|一死|二死)(.*)$/.exec(rest);
      ab = {
        order: Number(bm[1]),
        batter: sit ? rest.slice(0, sit.index).trim() : rest,
        situation: sit ? (sit[1] + sit[2]).trim() : '',
        events: [],
      };
      half.atBats.push(ab);
      continue;
    }
    const em = /^(\d{1,2})\s+(.+)$/.exec(l);
    const ev = { pitch: em ? Number(em[1]) : null, text: em ? em[2] : l };
    ev.scoring = /ホームイン|タイムリー|ホームラン|本塁打|犠牲フライ|押し出し|得点|生還/.test(ev.text);
    ev.change = /交代|代打|代走|守備変更|に代わり|に代わって/.test(ev.text);
    if (ab && !ev.change) ab.events.push(ev);
    else if (ab && ev.change) ab.events.push(ev);
    else half.events.push(ev);
  }
  return halves.filter((h) => h.atBats.length || h.events.length);
}

// ---------------- 一球速報 (現在の打席) ----------------

export function parsePitchTable(root) {
  for (const { rows } of tables(root)) {
    const hi = rows.findIndex((r) => r.some((c) => /球種/.test(c)) && r.some((c) => /球速|結果/.test(c)));
    if (hi < 0) continue;
    const headers = rows[hi];
    const body = rows.slice(hi + 1).filter((r) => r.some(Boolean));
    const col = (re) => headers.findIndex((c) => re.test(c));
    const iNum = col(/投球数|球数|^No|^$/);
    const iType = col(/球種/);
    const iSpeed = col(/球速/);
    const iRes = col(/結果/);
    return body.map((r, k) => ({
      num: iNum >= 0 && /^\d+$/.test(r[iNum]) ? Number(r[iNum]) : k + 1,
      type: iType >= 0 ? r[iType] : '',
      speed: iSpeed >= 0 ? r[iSpeed].replace(/km\/h/i, '').trim() : '',
      result: iRes >= 0 ? r[iRes] : r.filter(Boolean).slice(-1)[0] || '',
    }));
  }
  return [];
}

function countFrom(textValue, letter) {
  const re = new RegExp(letter + '\\s*([●○◯◉\\s]+|\\d)');
  const m = re.exec(textValue);
  if (!m) return null;
  if (/\d/.test(m[1])) return Number(m[1]);
  return (m[1].match(/[●◉]/g) || []).length;
}

export function parseLiveState(root) {
  const state = {};
  const box = find(root, byIdRe(/^(sbo|bso|count)$/i)) || find(root, byClassRe(/(^|[\s_-])(sbo|bso)([\s_-]|$)/i));
  if (box) {
    const t = text(box);
    for (const [k, letter] of [['balls', 'B'], ['strikes', 'S'], ['outs', 'O']]) {
      let v = countFrom(t, letter);
      if (v === null || v === 0) {
        // ドットが要素の class で点灯表現されている場合
        const row = findAll(box, (n) => n.children && norm(text(n)).startsWith(letter) && text(n).length < 12)[0];
        if (row) {
          const on = findAll(row, byClassRe(/(--|-|_|\s)(on|active|lit|is-on|is-active)\b/i)).length;
          if (on) v = on;
        }
      }
      if (v !== null) state[k] = v;
    }
  }
  const runners = {};
  for (const [k, n] of [['first', 1], ['second', 2], ['third', 3]]) {
    const el = find(root, (x) => (x.attrs.id && new RegExp(`^base${n}$`, 'i').test(x.attrs.id)) ||
      (x.attrs.class && new RegExp(`base(--|_|-)?(${n}|${k})\\b`, 'i').test(x.attrs.class)));
    if (!el) continue;
    const t = text(el);
    const active = /\b(on|active|is-on|runner)\b/i.test(el.className);
    if (t || active) runners[k] = t || true;
  }
  if (Object.keys(runners).length || box) state.runners = runners;

  const person = (re, cre) => {
    const el = find(root, byIdRe(re)) || find(root, byClassRe(cre));
    if (!el) return null;
    const ls = pageLines(el, { skipTags: [] });
    const a = find(el, (n) => n.tag === 'a' && text(n));
    const name = a ? text(a) : ls[0] || '';
    return name ? { name: name.replace(/^(打者|投手)\s*/, ''), info: ls.filter((l) => l !== name && !/^(打者|投手)$/.test(l)).slice(0, 4) } : null;
  };
  const batter = person(/^(batt|batter)$/i, /(^|\s)[\w-]*batter(\s|$)/i);
  const pitcher = person(/^(pit|pitcher|pitcherr|pitcherl)$/i, /(^|\s)[\w-]*pitcher(\s|$)/i);
  if (batter) state.batter = batter;
  if (pitcher) state.pitcher = pitcher;
  const res = find(root, byIdRe(/^result$/i));
  if (res && text(res)) state.lastPlay = text(res);
  return state;
}

/** 経過の最後の半イニングから現在のイニングとアウト数を推定する */
export function inferStateFromPlays(plays) {
  const real = plays.filter((h) => h.inning > 0);
  const last = real[real.length - 1];
  if (!last) return {};
  const st = { inning: last.inning, half: last.half };
  const ab = last.atBats[last.atBats.length - 1];
  const evs = ab ? ab.events : last.events;
  for (let k = evs.length - 1; k >= 0; k--) {
    const m = [...String(evs[k].text).matchAll(/(\d)アウト/g)].pop(); // 「2アウト二塁から…ライトフライ 3アウト」は最後の数
    if (m) { st.outs = Number(m[1]); break; }
  }
  if (ab) st.batterName = ab.batter;
  return st;
}

export { NPB_TEAMS };
