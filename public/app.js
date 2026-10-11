// 野球速報 — 自分専用の広告なし速報アプリ (PWA)
import { NPB_TEAM_LIST, MLB_TEAM_LIST } from './teams.js';

const $app = document.getElementById('app');
const API = (() => { try { return localStorage.getItem('apiBase') || '/api'; } catch { return '/api'; } })();

// ---------------- 設定 ----------------
const DEFAULTS = { favorites: [], refresh: 15, leagues: { C: true, P: true, MLB: true } };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}
let settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch { /* private mode */ }
}
const favKey = (league, t) => (league === 'MLB' ? `mlb:${t.id}` : `npb:${t.code}`);
const isFav = (league, t) => !!t && settings.favorites.includes(favKey(league, t));

// ---------------- ユーティリティ ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function jstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fmtDate(ymd, withYear = false) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00Z');
  return `${withYear ? d.getUTCFullYear() + '年' : ''}${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WD[d.getUTCDay()]})`;
}
const hasJa = (s) => /[぀-ヿ一-龯]/.test(s || '');

async function api(path) {
  const res = await fetch(API + path, { cache: 'no-store' });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

// 試合一覧で取得したカードを詳細画面の補完に使う
const cardCache = new Map();

// ---------------- ルーター ----------------
let view = null; // { name, cleanup }
let timer = null;

function stopTimer() { if (timer) { clearTimeout(timer); timer = null; } }

function route() {
  stopTimer();
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = hash.split('?');
  const q = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.remove('on'));
  document.body.classList.toggle('in-game', parts[0] === 'game');
  if (parts[0] === 'game') return gameView(parts[1], decodeURIComponent(parts[2] || ''), parts[3] || 'top');
  if (parts[0] === 'standings') { setNav('standings'); return standingsView(q.get('lg') || 'C'); }
  if (parts[0] === 'settings') { setNav('settings'); return settingsView(); }
  setNav('games');
  return gamesView(q.get('d') || sessionDate || jstToday(), q.get('f') || sessionFilter || 'all');
}
function setNav(n) { const a = document.querySelector(`#tabbar a[data-nav="${n}"]`); if (a) a.classList.add('on'); }
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && view && view.refresh) view.refresh(); });

let sessionDate = null;
let sessionFilter = null;

// ================= 試合一覧 =================

const GROUPS = [
  { key: 'fav', label: '★ お気に入り' },
  { key: 'JS', label: '日本シリーズ' },
  { key: 'CS', label: 'クライマックスシリーズ' },
  { key: 'C', label: 'セ・リーグ' },
  { key: 'P', label: 'パ・リーグ' },
  { key: 'IL', label: '交流戦' },
  { key: 'other', label: 'NPB その他' },
  { key: 'PS', label: 'MLB ポストシーズン' },
  { key: 'AL', label: 'MLB ア・リーグ' },
  { key: 'NL', label: 'MLB ナ・リーグ' },
  { key: 'MLB', label: 'MLB' },
];
const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'C', label: 'セ' },
  { key: 'P', label: 'パ' },
  { key: 'MLB', label: 'MLB' },
  { key: 'fav', label: '★' },
];

function gamesView(date, filter) {
  sessionDate = date === jstToday() ? null : date;
  sessionFilter = filter === 'all' ? null : filter;
  const state = { npb: null, mlb: null, npbErr: null, mlbErr: null };
  const href = (d, f) => `#/?d=${d}&f=${f}`;

  const render = () => {
    const today = jstToday();
    const all = [...(state.npb || []), ...(state.mlb || [])];
    const loading = (state.npb === null && !state.npbErr) || (state.mlb === null && !state.mlbErr);
    const sections = new Map();
    for (const g of all) {
      cardCache.set(g.league + ':' + g.id, g);
      const fav = isFav(g.league, g.home) || isFav(g.league, g.away);
      if (filter === 'fav' && !fav) continue;
      if (filter === 'C' && !(g.league === 'NPB' && (g.home.league === 'C' || g.away.league === 'C'))) continue;
      if (filter === 'P' && !(g.league === 'NPB' && (g.home.league === 'P' || g.away.league === 'P'))) continue;
      if (filter === 'MLB' && g.league !== 'MLB') continue;
      if (filter === 'all' && g.league === 'NPB' && !settings.leagues[g.home.league] && !settings.leagues[g.away.league]) continue;
      if (filter === 'all' && g.league === 'MLB' && !settings.leagues.MLB) continue;
      const key = fav && filter === 'all' ? 'fav' : g.leagueGroup || (g.league === 'MLB' ? 'MLB' : 'other');
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key).push(g);
    }
    let body = '';
    for (const grp of GROUPS) {
      const list = sections.get(grp.key);
      if (!list || !list.length) continue;
      body += `<section class="sec"><h2 class="sec-h">${esc(grp.label)}</h2>${list.map(gameCard).join('')}</section>`;
    }
    if (!body && !loading) body = `<p class="empty">この日の試合はありません</p>`;
    const errs = [state.npbErr && `NPB: ${state.npbErr}`, state.mlbErr && `MLB: ${state.mlbErr}`].filter(Boolean);
    $app.innerHTML = `
      <header class="top">
        <div class="datebar">
          <a class="circle" href="${href(addDays(date, -1), filter)}" aria-label="前の日">‹</a>
          <button class="date" id="pickdate">${esc(fmtDate(date))}${date === today ? ' <small>今日</small>' : ''}</button>
          <a class="circle" href="${href(addDays(date, 1), filter)}" aria-label="次の日">›</a>
        </div>
        <input type="date" id="dateinput" value="${date}" class="hidden-date">
        <div class="chips">
          ${FILTERS.map((f) => `<a class="chip ${f.key === filter ? 'on' : ''}" href="${href(date, f.key)}">${f.label}</a>`).join('')}
          ${date !== today ? `<a class="chip today" href="${href(today, filter)}">今日へ</a>` : ''}
        </div>
      </header>
      <main class="list">
        ${errs.map((e) => `<p class="err">${esc(e)}</p>`).join('')}
        ${body}
        ${loading ? '<p class="loading">読み込み中…</p>' : ''}
      </main>`;
    const input = document.getElementById('dateinput');
    document.getElementById('pickdate').onclick = () => { input.showPicker ? input.showPicker() : input.click(); };
    input.onchange = () => { if (input.value) location.hash = href(input.value, filter); };
  };

  const load = async () => {
    const [npb, mlb] = await Promise.allSettled([api(`/npb/schedule?date=${date}`), api(`/mlb/schedule?date=${date}`)]);
    if (npb.status === 'fulfilled') { state.npb = npb.value.games || []; state.npbErr = null; } else state.npbErr = npb.reason.message;
    if (mlb.status === 'fulfilled') { state.mlb = mlb.value.games || []; state.mlbErr = null; } else state.mlbErr = mlb.reason.message;
    if (view !== self) return;
    render();
    const live = [...(state.npb || []), ...(state.mlb || [])].some((g) => g.status === 'live');
    stopTimer();
    if (live) timer = setTimeout(load, Math.max(settings.refresh, 15) * 1000);
  };
  const self = { name: 'games', refresh: load };
  view = self;
  render();
  load();
}

function gameCard(g) {
  const lg = g.league === 'MLB' ? 'mlb' : 'npb';
  const live = g.status === 'live';
  const score = (t) => (t.score === null || t.score === undefined ? '' : t.score);
  const winH = g.status === 'final' && g.home.score > g.away.score;
  const winA = g.status === 'final' && g.away.score > g.home.score;
  const status = g.status === 'pre' ? (g.startTime || '試合前') : g.statusText;
  return `
  <a class="card ${live ? 'live' : ''}" href="#/game/${lg}/${encodeURIComponent(g.id)}">
    ${g.series ? `<div class="series">${esc(g.series)}${g.seriesResult ? ' · ' + esc(g.seriesResult) : ''}</div>` : ''}
    <div class="row">
      <div class="team home">${teamBadge(g.home)}<span class="tn">${esc(g.home.name)}</span>${isFav(g.league, g.home) ? '<i class="star">★</i>' : ''}</div>
      <div class="sc">
        ${g.status === 'pre' || g.status === 'postponed' ? '<span class="vs">vs</span>' : `<b class="${winH ? 'w' : ''}">${score(g.home)}</b><span class="dash">-</span><b class="${winA ? 'w' : ''}">${score(g.away)}</b>`}
      </div>
      <div class="team away">${isFav(g.league, g.away) ? '<i class="star">★</i>' : ''}<span class="tn">${esc(g.away.name)}</span>${teamBadge(g.away)}</div>
    </div>
    <div class="meta">
      <span class="st st-${g.status}">${esc(status)}${live && g.outs !== null && g.outs !== undefined ? ` <span class="outs">${'●'.repeat(g.outs)}${'○'.repeat(Math.max(0, 2 - g.outs))}</span>` : ''}</span>
      <span class="venue">${esc(g.venue || '')}</span>
    </div>
    ${g.notes && g.notes.length ? `<div class="notes">${g.notes.map(esc).join('<span class="sep">/</span>')}</div>` : ''}
  </a>`;
}

function teamBadge(t) {
  return `<span class="badge" style="background:${esc(t.color || '#555')};color:${esc(t.fg || '#fff')}">${esc(t.short || '')}</span>`;
}

// ================= 試合詳細 =================

const TABS = [['top', 'トップ'], ['live', '速報'], ['plays', '経過'], ['box', '成績']];

function gameView(lg, id, tab) {
  const card = cardCache.get((lg === 'mlb' ? 'MLB' : 'NPB') + ':' + id);
  const ui = { boxTab: 'bat', expanded: new Set(), order: null, liveAb: null };
  let game = null;
  let error = null;
  let lastUpdated = null;

  const self = { name: 'game', refresh: () => load(true) };
  view = self;

  const header = () => {
    const g = game || card;
    const title = g ? `${g.home.name} vs ${g.away.name}` : '試合';
    const sub = g ? [fmtDate(g.date), g.startTime, g.venue].filter(Boolean).join(' ') : '';
    return `
      <header class="gh">
        <a class="circle" href="${backHref()}" aria-label="戻る">‹</a>
        <div class="gt"><div class="t1">${esc(title)}</div><div class="t2">${esc(sub)}</div></div>
        <button class="circle" id="reload" aria-label="更新">↻</button>
      </header>
      <nav class="gtabs">${TABS.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" href="#/game/${lg}/${encodeURIComponent(id)}/${k}" data-replace>${l}</a>`).join('')}</nav>`;
  };

  const render = () => {
    if (view !== self) return;
    const y = window.scrollY;
    const g = game;
    let content = '';
    if (!g) content = error ? `<p class="err">${esc(error)}</p>` : '<p class="loading">読み込み中…</p>';
    else if (tab === 'top') content = topTab(g);
    else if (tab === 'live') content = liveTab(g, ui);
    else if (tab === 'plays') content = playsTab(g, ui);
    else if (tab === 'box') content = boxTab(g, ui);
    $app.innerHTML = `${header()}
      <div class="lsw">${linescore(g || card)}</div>
      <main class="gbody">${g && error ? `<p class="err small">更新に失敗: ${esc(error)}</p>` : ''}${content}
        ${g ? `<p class="foot">${lastUpdated ? `更新 ${lastUpdated}` : ''} · <a href="${esc(g.url)}" target="_blank" rel="noopener">データ元 (${esc(sourceName(g.source))})</a></p>` : ''}
      </main>`;
    window.scrollTo(0, y);
    document.getElementById('reload').onclick = () => load(true);
    bindGame();
  };

  const bindGame = () => {
    $app.querySelectorAll('[data-replace]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      history.replaceState(null, '', a.getAttribute('href'));
      tab = a.getAttribute('href').split('/').pop();
      render();
      window.scrollTo(0, 0);
    }));
    $app.querySelectorAll('[data-ab]').forEach((el) => el.addEventListener('click', () => {
      const k = el.getAttribute('data-ab');
      ui.expanded.has(k) ? ui.expanded.delete(k) : ui.expanded.add(k);
      render();
    }));
    $app.querySelectorAll('[data-boxtab]').forEach((el) => el.addEventListener('click', () => { ui.boxTab = el.getAttribute('data-boxtab'); render(); }));
    $app.querySelectorAll('[data-order]').forEach((el) => el.addEventListener('click', () => { ui.order = el.getAttribute('data-order'); render(); }));
    $app.querySelectorAll('[data-liveab]').forEach((el) => el.addEventListener('click', () => {
      const v = el.getAttribute('data-liveab');
      ui.liveAb = v === 'now' ? null : v;
      render();
    }));
  };

  async function load(manual) {
    stopTimer();
    if (manual) { const b = document.getElementById('reload'); if (b) b.classList.add('spin'); }
    try {
      game = await api(`/${lg}/game?id=${encodeURIComponent(id)}`);
      if (card) {
        for (const k of ['date', 'startTime', 'venue', 'series']) if (!game[k] && card[k]) game[k] = card[k];
      }
      error = null;
      lastUpdated = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      error = e.message;
    }
    render();
    if (view === self && (!game || game.status === 'live' || game.status === 'pre')) {
      const sec = game && game.status === 'pre' ? 60 : settings.refresh;
      // 画面が非表示の間は取得しない (表示に戻ったら visibilitychange で更新)
      timer = setTimeout(() => { if (!document.hidden) load(false); }, sec * 1000);
    }
  }
  render();
  load(false);
}

function backHref() {
  const p = new URLSearchParams();
  if (sessionDate) p.set('d', sessionDate);
  if (sessionFilter) p.set('f', sessionFilter);
  const s = p.toString();
  return '#/' + (s ? '?' + s : '');
}

const sourceName = (s) => ({ yahoo: 'スポーツナビ', 'npb.jp': 'NPB.jp', mlb: 'MLB.com' }[s] || s);

function linescore(g) {
  if (!g) return '';
  const inns = g.linescore && g.linescore.innings && g.linescore.innings.length
    ? g.linescore.innings
    : Array.from({ length: 9 }, (_, i) => ({ num: i + 1, away: null, home: null }));
  const cur = g.current;
  const curCell = (num, side) => cur && cur.inning === num && ((cur.half === 'top' && side === 'away') || (cur.half === 'bottom' && side === 'home'));
  const val = (v) => (v === null || v === undefined ? '' : v);
  const row = (t, side) => `
    <tr>
      <th class="tm" style="--tc:${esc(t.color || '#555')}">${esc(t.short || t.name || '')}</th>
      ${inns.map((i) => `<td class="${curCell(i.num, side) ? 'cur' : ''}">${val(i[side])}</td>`).join('')}
      <td class="tot">${val(t.score)}</td><td class="tot">${val(t.hits)}</td><td class="tot">${val(t.errors)}</td>
    </tr>`;
  return `
    <table class="ls ${inns.length > 9 ? 'extra' : ''}">
      <thead><tr><th></th>${inns.map((i) => `<th>${i.num}</th>`).join('')}<th>計</th><th>安</th><th>失</th></tr></thead>
      <tbody>${row(g.away, 'away')}${row(g.home, 'home')}</tbody>
    </table>`;
}

function sectionH(t) { return `<h3 class="bar">${esc(t)}</h3>`; }

// ---------- トップ ----------
function topTab(g) {
  let h = '';
  const status = g.status === 'pre' ? `試合前 ${g.startTime || ''}` : g.statusText;
  h += `<div class="status-line st-${g.status}">${esc(status)}${g.series ? `<span class="series-sm">${esc(g.series)}</span>` : ''}</div>`;

  if (g.status === 'pre' && g.probables && (g.probables.away || g.probables.home)) {
    h += sectionH('予告先発');
    h += `<div class="kv">${['home', 'away'].map((k) => g.probables[k] ? `
      <div class="kvr"><span class="k" style="--tc:${esc(g[k].color)}">${esc(g[k].short)}</span><span class="v">${esc(g.probables[k].name)} <small>${esc(g.probables[k].info || '')}</small></span></div>` : '').join('')}</div>`;
  }
  if (g.notes && g.notes.length && g.status === 'pre') {
    h += sectionH('情報');
    h += `<div class="kv">${g.notes.map((n) => `<div class="kvr"><span class="v">${esc(n)}</span></div>`).join('')}</div>`;
  }

  const d = g.decisions || {};
  if (d.win || d.loss || d.save) {
    h += sectionH('責任投手');
    h += `<div class="kv">
      ${[['win', '勝', 'c-win'], ['loss', '敗', 'c-loss'], ['save', 'S', 'c-save']].filter(([k]) => d[k]).map(([k, l, c]) => `
        <div class="kvr"><span class="k ${c}">${l}</span><span class="v">${esc(d[k].name)}${d[k].record ? `<small>(${esc(d[k].record)})</small>` : ''}</span></div>`).join('')}
    </div>`;
  }

  if (g.status !== 'pre') {
    h += sectionH('本塁打');
    h += `<div class="kv">${['away', 'home'].map((side) => {
      const list = (g.homeRuns || []).filter((x) => x.side === side);
      return `<div class="kvr"><span class="k" style="--tc:${esc(g[side].color)}">${esc(g[side].short)}</span><span class="v">${list.map((x) => `<div class="${x.jp ? 'jp' : ''}">${esc(x.name)} ${x.number ? `${x.number}号` : ''}<small>${x.detail ? `(${esc(x.detail)})` : ''}</small></div>`).join('')}</span></div>`;
    }).join('')}
    ${(g.homeRuns || []).filter((x) => !x.side).map((x) => `<div class="kvr"><span class="v">${esc(x.name)} ${x.number}号 <small>${esc(x.detail)}</small></span></div>`).join('')}
    </div>`;
  }

  if (g.summary) {
    h += sectionH('戦評');
    h += `<p class="summary">${esc(g.summary).replace(/\n/g, '<br>')}</p>`;
  }

  // 得点経過 (経過データから得点シーンだけ抜き出す)
  const scoring = [];
  for (const half of g.plays || []) {
    for (const ab of half.atBats) {
      const ev = ab.events.filter((e) => e.scoring);
      if (ab.scoring || ev.length) {
        const res = ab.events.find((e) => e.result);
        scoring.push({ half, ab, text: res ? res.text : ev.map((e) => e.text).join(' / '), desc: res ? res.desc : '', score: res && res.score });
      }
    }
    for (const e of half.events.filter((x) => x.scoring)) scoring.push({ half, ab: null, text: e.text });
  }
  if (scoring.length) {
    h += sectionH('得点経過');
    h += `<div class="scoring">${scoring.map((s) => `
      <div class="sr"><span class="inn">${s.half.half === 'pre' ? '' : `${s.half.inning}回${s.half.half === 'top' ? '表' : '裏'}`}</span>
      <span class="sv">${s.ab ? `<b>${esc(s.ab.batter)}</b> ` : ''}${esc(s.text)}${s.score ? ` <em>${esc(s.score)}</em>` : ''}${s.desc ? `<small>${esc(s.desc)}</small>` : ''}</span></div>`).join('')}</div>`;
  }

  const info = [g.venue && `球場: ${g.venue}`, g.weather && `天気: ${g.weather}`, g.away.record && `${g.away.name} ${g.away.record}`, g.home.record && `${g.home.name} ${g.home.record}`].filter(Boolean);
  if (info.length) {
    h += sectionH('試合情報');
    h += `<div class="kv">${info.map((x) => `<div class="kvr"><span class="v">${esc(x)}</span></div>`).join('')}</div>`;
  }
  return h;
}

// ---------- 速報 ----------
function allAtBats(g) {
  const out = [];
  (g.plays || []).forEach((half, hi) => half.atBats.forEach((ab, ai) => out.push({ key: `${hi}-${ai}`, half, ab })));
  return out;
}

function liveTab(g, ui) {
  if (g.status === 'pre') return `<p class="empty">試合開始前です${g.startTime ? `（${esc(g.startTime)} 開始予定）` : ''}</p>`;
  const abs = allAtBats(g);
  let cur = g.current;
  let picked = null;
  if (ui.liveAb) picked = abs.find((x) => x.key === ui.liveAb);
  if (!cur && !picked && abs.length) picked = abs[abs.length - 1];

  let h = `<div class="status-line st-${g.status}">${esc(picked && !g.current ? '試合終了' : g.statusText)}</div>`;
  if (picked && (ui.liveAb || !cur)) {
    const { half, ab } = picked;
    const idx = abs.indexOf(picked);
    h += `<div class="abnav">
      <button ${idx <= 0 ? 'disabled' : ''} data-liveab="${idx > 0 ? abs[idx - 1].key : ''}">‹ 前の打席</button>
      <span>${half.inning}回${half.half === 'top' ? '表' : '裏'}</span>
      ${g.current ? `<button data-liveab="now">現在へ</button>` : ''}
      <button ${idx >= abs.length - 1 ? 'disabled' : ''} data-liveab="${idx < abs.length - 1 ? abs[idx + 1].key : ''}">次の打席 ›</button>
    </div>`;
    const last = [...ab.pitches || []].pop();
    h += bso(last ? last.balls : null, last ? last.strikes : null, null);
    h += `<div class="matchup">
      <div class="pp"><div class="lbl">打者</div><div class="nm ${hasJa(ab.batter) && g.league === 'MLB' ? 'jp' : ''}">${ab.order ? ab.order + '番 ' : ''}${esc(ab.batter)}</div><div class="sit">${esc(ab.situation || '')}</div></div>
      <div class="pp"><div class="lbl">投手</div><div class="nm ${hasJa(ab.pitcher) && g.league === 'MLB' ? 'jp' : ''}">${esc(ab.pitcher || '')}</div></div>
    </div>`;
    const res = ab.events.find((e) => e.result);
    if (res || ab.result) h += `<div class="lastplay ${ab.scoring ? 'scoring' : ''}"><b>${esc(res ? res.text : ab.result)}</b>${res && res.desc ? `<small>${esc(res.desc)}</small>` : ''}${res && res.hit ? `<small>${esc(res.hit)}</small>` : ''}</div>`;
    h += pitchesBlock(ab.pitches || [], ab.events);
    return h;
  }
  if (!cur) return h + '<p class="empty">速報データがありません</p>';

  h += `<div class="abnav">${abs.length ? `<button data-liveab="${abs[abs.length - 1].key}">‹ 直前の打席</button>` : ''}<span></span></div>`;
  h += bso(cur.balls, cur.strikes, cur.outs);
  h += field(cur);
  const person = (p, lbl) => p ? `<div class="pp"><div class="lbl">${lbl}${p.hand ? ` <small>${esc(p.hand)}</small>` : ''}</div><div class="nm ${p.jp ? 'jp' : ''}">${esc(p.name)}</div>${(p.info || []).map((i) => `<div class="inf">${esc(i)}</div>`).join('')}</div>` : `<div class="pp"><div class="lbl">${lbl}</div><div class="nm">-</div></div>`;
  h += `<div class="matchup">${person(cur.batter, '打者')}${person(cur.pitcher, '投手')}</div>`;
  if (cur.onDeck) h += `<p class="ondeck">次打者: ${esc(cur.onDeck)}</p>`;
  h += pitchesBlock(cur.pitches || [], null);
  if (cur.lastPlay) h += `<div class="lastplay"><span class="lbl">直前のプレー</span><small>${esc(cur.lastPlay)}</small></div>`;
  return h;
}

function bso(b, s, o) {
  const dots = (n, max, cls) => Array.from({ length: max }, (_, i) => `<i class="${n !== null && n !== undefined && i < n ? cls : ''}"></i>`).join('');
  return `<div class="bso">
    <span><b>B</b>${dots(b, 3, 'g')}</span>
    <span><b>S</b>${dots(s, 2, 'y')}</span>
    ${o === null ? '' : `<span><b>O</b>${dots(o, 2, 'r')}</span>`}
  </div>`;
}

function field(cur) {
  const r = cur.runners || {};
  const base = (x, y, on, name, anchor) => `
    <rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" class="base ${on ? 'on' : ''}"/>
    ${on && typeof name === 'string' ? `<text x="${x + (anchor === 'start' ? 12 : anchor === 'end' ? -12 : 0)}" y="${y + (anchor === 'middle' ? -12 : 4)}" text-anchor="${anchor}" class="rn">${esc(shortName(name))}</text>` : ''}`;
  const d = cur.defense || {};
  const POS = { pitcher: [150, 150], catcher: [150, 222], first: [222, 132], second: [188, 98], shortstop: [112, 98], third: [78, 132], left: [62, 62], center: [150, 34], right: [238, 62] };
  const def = Object.entries(d).map(([k, n]) => POS[k] ? `<text x="${POS[k][0]}" y="${POS[k][1]}" text-anchor="middle" class="df">${esc(shortName(n))}</text>` : '').join('');
  return `
  <div class="field">
    <svg viewBox="0 0 300 230" role="img" aria-label="走者状況">
      <path d="M150 220 L8 82 Q150 -40 292 82 Z" class="grass"/>
      <path d="M150 214 L60 128 Q150 40 240 128 Z" class="dirt"/>
      <path d="M150 196 L200 146 L150 96 L100 146 Z" class="infield"/>
      <circle cx="150" cy="146" r="9" class="mound"/>
      ${base(200, 146, r.first, r.first, 'start')}
      ${base(150, 96, r.second, r.second, 'middle')}
      ${base(100, 146, r.third, r.third, 'end')}
      <path d="M143 196 L157 196 L157 203 L150 209 L143 203 Z" class="home"/>
      ${def}
    </svg>
  </div>`;
}

function shortName(n) {
  if (!n) return '';
  if (hasJa(n)) return n.split(' ')[0];
  const p = n.split(' ');
  return p.length > 1 ? p.slice(1).join(' ') : n;
}

function pitchesBlock(pitches, events) {
  if (!pitches.length) {
    const evs = (events || []).filter((e) => !e.result);
    if (!evs.length) return '';
    return `<div class="plist">${evs.map((e) => `<div class="pr"><span class="pn">${e.pitch ?? ''}</span><span>${esc(e.text)}</span></div>`).join('')}</div>`;
  }
  const hasLoc = pitches.some((p) => p.px !== null && p.px !== undefined);
  const rows = pitches.map((p, i) => `
    <tr><td><span class="pn k-${p.kind || 'other'}">${p.num ?? i + 1}</span></td>
    <td>${esc(p.type || '')}</td><td class="num">${p.speed ? esc(p.speed) + '<small>km/h</small>' : ''}</td><td>${esc(p.call || p.result || '')}</td></tr>`).join('');
  return `<div class="pitches ${hasLoc ? 'with-zone' : ''}">
    ${hasLoc ? zone(pitches) : ''}
    <table class="ptable"><thead><tr><th>#</th><th>球種</th><th>球速</th><th>結果</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

function zone(pitches) {
  // 捕手目線。単位はフィート (ホームベース幅 17 インチ ≒ 1.417ft)
  const W = 150, H = 180;
  const x = (px) => W / 2 + px * 42;
  const top = avg(pitches.map((p) => p.szTop)) || 3.4;
  const bot = avg(pitches.map((p) => p.szBot)) || 1.6;
  const y = (pz) => H - 14 - (pz - 0.5) * 38;
  const zx = x(-0.708), zw = x(0.708) - zx, zy = y(top), zh = y(bot) - zy;
  const grid = [1, 2].map((k) => `<line x1="${zx + (zw * k) / 3}" y1="${zy}" x2="${zx + (zw * k) / 3}" y2="${zy + zh}"/><line x1="${zx}" y1="${zy + (zh * k) / 3}" x2="${zx + zw}" y2="${zy + (zh * k) / 3}"/>`).join('');
  const dots = pitches.filter((p) => p.px !== null && p.px !== undefined).map((p, i) => {
    const cx = Math.max(8, Math.min(W - 8, x(p.px)));
    const cy = Math.max(8, Math.min(H - 8, y(p.pz)));
    return `<g class="k-${p.kind}"><circle cx="${cx}" cy="${cy}" r="8"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle">${p.num ?? i + 1}</text></g>`;
  }).join('');
  return `<svg class="zone" viewBox="0 0 ${W} ${H}" role="img" aria-label="配球">
    <rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" class="sz"/>
    <g class="grid">${grid}</g>
    <path d="M${x(-0.708)} ${H - 6} L${x(0.708)} ${H - 6}" class="plate"/>
    ${dots}
  </svg>`;
}
const avg = (a) => { const v = a.filter((n) => typeof n === 'number'); return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null; };

// ---------- 経過 ----------
function playsTab(g, ui) {
  const halves = g.plays || [];
  if (!halves.length) return '<p class="empty">経過はまだありません</p>';
  const newestFirst = ui.order ? ui.order === 'new' : g.status === 'live';
  const list = halves.map((h, i) => ({ h, i }));
  if (newestFirst) list.reverse();
  let out = `<div class="order"><button class="${newestFirst ? '' : 'on'}" data-order="old">古い順</button><button class="${newestFirst ? 'on' : ''}" data-order="new">新しい順</button></div>`;
  for (const { h, i } of list) {
    const bat = h.half === 'top' ? g.away : h.half === 'bottom' ? g.home : { color: '#555' };
    const label = /攻撃/.test(h.label) || h.half === 'pre' ? h.label : `${h.inning}回${h.half === 'top' ? '表' : '裏'} ${bat.name}の攻撃`;
    out += `<h3 class="inn-h" style="--tc:${esc(bat.color || '#555')}">${esc(label)}</h3>`;
    if (h.events.length) out += h.events.map((e) => `<div class="ev ${e.scoring ? 'scoring' : ''} ${e.change ? 'chg' : ''}">${e.pitch ? `<span class="pn">${e.pitch}</span>` : ''}${esc(e.text)}</div>`).join('');
    const abs = h.atBats.map((ab, ai) => ({ ab, ai }));
    if (newestFirst) abs.reverse();
    for (const { ab, ai } of abs) {
      const key = `${i}-${ai}`;
      const open = ui.expanded.has(key);
      const res = ab.events.find((e) => e.result);
      const inProgress = !res && !ab.result && g.status === 'live' && ab === h.atBats[h.atBats.length - 1] && i === halves.length - 1;
      const lastEv = ab.events.length ? ab.events[ab.events.length - 1].text : '';
      const resText = res ? res.text : inProgress ? `打席中${lastEv ? ': ' + lastEv : ''}` : lastEv;
      const others = ab.events.filter((e) => e !== res && (res || e !== ab.events[ab.events.length - 1]));
      out += `
        <div class="ab ${ab.scoring || (res && res.scoring) ? 'scoring' : ''}">
          <div class="abh" data-ab="${key}">
            <span class="abn">${ab.order ? ab.order + '番' : ''}</span>
            <span class="abb ${g.league === 'MLB' && hasJa(ab.batter) ? 'jp' : ''}">${esc(ab.batter)}</span>
            <span class="abs">${esc(ab.situation || '')}</span>
            ${others.length || (ab.pitches && ab.pitches.length) ? `<span class="caret ${open ? 'open' : ''}">▾</span>` : ''}
          </div>
          ${resText ? `<div class="abr">${esc(resText)}${res && res.score ? ` <em>${esc(res.score)}</em>` : ''}</div>` : ''}
          ${open ? `<div class="abd">
            ${others.map((e) => `<div class="ev ${e.change ? 'chg' : ''} ${e.scoring ? 'scoring' : ''}">${e.pitch ? `<span class="pn k-${e.kind || 'other'}">${e.pitch}</span>` : ''}${esc(e.text)}</div>`).join('')}
            ${res && res.desc ? `<div class="desc">${esc(res.desc)}</div>` : ''}
            ${res && res.hit ? `<div class="desc">${esc(res.hit)}</div>` : ''}
            ${ab.pitches && ab.pitches.some((p) => p.px !== null && p.px !== undefined) ? `<div class="zone-wrap">${zone(ab.pitches)}</div>` : ''}
          </div>` : ''}
        </div>`;
    }
  }
  return out;
}

// ---------- 成績 ----------
function boxTab(g, ui) {
  const kind = ui.boxTab === 'pit' ? 'pitching' : 'batting';
  let out = `<div class="subtabs"><button class="${kind === 'batting' ? 'on' : ''}" data-boxtab="bat">打者成績</button><button class="${kind === 'pitching' ? 'on' : ''}" data-boxtab="pit">投手成績</button></div>`;
  let any = false;
  for (const side of ['away', 'home']) {
    const t = g[side];
    const tables = (g.box && g.box[side] && g.box[side][kind]) || [];
    if (!tables.length) continue;
    any = true;
    out += `<h3 class="team-h" style="--tc:${esc(t.color || '#555')}">${esc(t.name)}</h3>`;
    for (const tb of tables) out += statTable(tb, g.league);
  }
  if (!any) out += '<p class="empty">成績はまだありません</p>';
  return out;
}

function statTable(tb, league) {
  const nameIdx = tb.headers.findIndex((h) => /選手|名前|打者|投手/.test(h));
  const ni = nameIdx >= 0 ? nameIdx : 1;
  return `<div class="tscroll"><table class="stat">
    <thead><tr>${tb.headers.map((h, i) => `<th class="${i === ni ? 'nm' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${tb.rows.map((r) => {
      const total = r.some((c) => /^(合計|計|チーム計)$/.test(c));
      return `<tr class="${total ? 'total' : ''}">${r.map((c, i) => `<td class="${i === ni ? 'nm' : ''} ${i === ni && league === 'MLB' && hasJa(c) ? 'jp' : ''} ${/^(勝|敗|S|H)$/.test(c) && i === 0 ? 'dec dec-' + c : ''}">${esc(c)}</td>`).join('')}</tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// ================= 順位表 =================

function standingsView(lg) {
  const self = { name: 'standings', refresh: load };
  view = self;
  let data = { npb: null, mlb: null, err: null };
  const render = () => {
    if (view !== self) return;
    let body = '';
    if (lg === 'MLB') {
      if (data.mlb) body = data.mlb.map((d) => `<h3 class="bar">${esc(d.name)}</h3>${standTable(d, 'MLB')}`).join('');
    } else if (data.npb) {
      const t = data.npb[lg];
      body = t ? standTable(t, 'NPB') : '<p class="empty">順位表を取得できませんでした</p>';
    }
    $app.innerHTML = `
      <header class="top"><h1 class="ttl">順位表</h1>
        <div class="chips">${[['C', 'セ・リーグ'], ['P', 'パ・リーグ'], ['MLB', 'MLB']].map(([k, l]) => `<a class="chip ${k === lg ? 'on' : ''}" href="#/standings?lg=${k}">${l}</a>`).join('')}</div>
      </header>
      <main class="list">${data.err ? `<p class="err">${esc(data.err)}</p>` : ''}${body || (data.err ? '' : '<p class="loading">読み込み中…</p>')}</main>`;
  };
  async function load() {
    try {
      if (lg === 'MLB') data.mlb = await api('/mlb/standings');
      else data.npb = await api('/npb/standings');
      data.err = null;
    } catch (e) { data.err = e.message; }
    render();
  }
  render();
  load();
}

function standTable(t, league) {
  const teamIdx = t.headers.findIndex((h) => /チーム|球団/.test(h));
  return `<div class="tscroll"><table class="stat stand">
    <thead><tr>${t.headers.map((h, i) => `<th class="${i === teamIdx ? 'nm' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr class="${isFav(league, r.team) ? 'fav' : ''}">${r.cells.map((c, i) => i === teamIdx
      ? `<td class="nm"><span class="dot" style="background:${esc(r.team.color)}"></span>${esc(c)}${r.clinched ? ` <small class="cl">${esc(r.clinched)}</small>` : ''}</td>`
      : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ================= 設定 =================

function settingsView() {
  view = { name: 'settings' };
  const chip = (league, t) => {
    const key = league === 'MLB' ? `mlb:${t.id}` : `npb:${t.code}`;
    const on = settings.favorites.includes(key);
    return `<button class="fchip ${on ? 'on' : ''}" data-fav="${key}"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</button>`;
  };
  const render = () => {
    $app.innerHTML = `
      <header class="top"><h1 class="ttl">設定</h1></header>
      <main class="list settings">
        <h3 class="bar">お気に入りチーム</h3>
        <p class="hint">選んだチームの試合は一覧の一番上に表示されます</p>
        <div class="fgrid"><div class="fl">セ・リーグ</div>${NPB_TEAM_LIST.filter((t) => t.league === 'C').map((t) => chip('NPB', t)).join('')}</div>
        <div class="fgrid"><div class="fl">パ・リーグ</div>${NPB_TEAM_LIST.filter((t) => t.league === 'P').map((t) => chip('NPB', t)).join('')}</div>
        <div class="fgrid"><div class="fl">MLB</div>${MLB_TEAM_LIST.map((t) => chip('MLB', t)).join('')}</div>

        <h3 class="bar">一覧に表示するリーグ</h3>
        <div class="toggles">
          ${[['C', 'セ・リーグ'], ['P', 'パ・リーグ'], ['MLB', 'MLB']].map(([k, l]) => `<label><input type="checkbox" data-lg="${k}" ${settings.leagues[k] ? 'checked' : ''}> ${l}</label>`).join('')}
        </div>

        <h3 class="bar">自動更新の間隔 (試合中)</h3>
        <div class="toggles">
          ${[10, 15, 30, 60].map((s) => `<label><input type="radio" name="rf" value="${s}" ${settings.refresh === s ? 'checked' : ''}> ${s}秒</label>`).join('')}
        </div>

        <h3 class="bar">このアプリについて</h3>
        <p class="hint">NPB: スポーツナビ / NPB.jp、MLB: MLB公式 Stats API のデータを表示しています。個人利用のためのアプリです。</p>
        <p class="hint">ホーム画面に追加: Safari の共有ボタン →「ホーム画面に追加」</p>
      </main>`;
    $app.querySelectorAll('[data-fav]').forEach((b) => b.onclick = () => {
      const k = b.getAttribute('data-fav');
      settings.favorites = settings.favorites.includes(k) ? settings.favorites.filter((x) => x !== k) : [...settings.favorites, k];
      saveSettings();
      render();
    });
    $app.querySelectorAll('[data-lg]').forEach((c) => c.onchange = () => { settings.leagues[c.getAttribute('data-lg')] = c.checked; saveSettings(); });
    $app.querySelectorAll('input[name=rf]').forEach((c) => c.onchange = () => { settings.refresh = Number(c.value); saveSettings(); });
  };
  render();
}

// ---------------- 起動 ----------------
route();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
