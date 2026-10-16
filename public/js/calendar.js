// チーム別カレンダー (月間の日程と勝敗)
import { $app, api, esc, badge, errorBox, icon, jstToday, addDays, addMonths, settings, saveSettings } from './util.js';
import { state } from './state.js';
import { NPB_TEAM_LIST, MLB_TEAM_LIST } from './teams.js';

const HEAD = ['月', '火', '水', '木', '金', '土', '日'];
const MARK = { win: '○', loss: '×', draw: '△' };

function defaultTeam() {
  if (settings.calTeam) return settings.calTeam;
  const fav = settings.favorites[0];
  return fav || 'npb:g';
}

export function calendarView(q) {
  const today = jstToday();
  const findTeam = (k) => {
    const [l, c] = String(k).split(':');
    return l === 'mlb' ? MLB_TEAM_LIST.find((t) => String(t.id) === c) : l === 'npb' ? NPB_TEAM_LIST.find((t) => t.code === c) : null;
  };
  // URL の値がおかしいときは、いつものチーム・今月で表示する（真っ白にしない・おかしな値を保存しない）
  let key = q.get('t') || defaultTeam();
  if (!findTeam(key)) key = findTeam(settings.calTeam) ? settings.calTeam : 'npb:g';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get('m') || '') ? q.get('m') : today.slice(0, 7);
  const [lg, code] = key.split(':');
  const isMLB = lg === 'mlb';
  const team = findTeam(key);
  if (key !== settings.calTeam) { settings.calTeam = key; saveSettings(); }
  const href = (t, m) => `#/calendar?t=${t}&m=${m}`;
  const self = { name: 'calendar', refresh: () => load() };
  state.view = self;
  let data = null;
  let error = null;

  const render = () => {
    if (state.view !== self) return;
    const games = (data && data.games) || [];
    const byDate = new Map();
    for (const g of games) { if (!byDate.has(g.date)) byDate.set(g.date, []); byDate.get(g.date).push(g); }
    const rec = { win: 0, loss: 0, draw: 0 };
    games.forEach((g) => { if (rec[g.result] !== undefined) rec[g.result]++; });

    // 月曜始まりのグリッド
    const first = `${month}-01`;
    const offset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
    while (cells.length % 7) cells.push(null);

    const cell = (d) => {
      if (!d) return '<div class="cc empty"></div>';
      const w = (new Date(d + 'T00:00:00Z').getUTCDay());
      const list = byDate.get(d) || [];
      const home = list.some((g) => g.side === 'home');
      const inner = list.map((g) => {
        const opp = g.side === 'home' ? g.away : g.home;
        const pair = isMLB ? `${g.side === 'home' ? 'vs' : '@'}${opp.short}` : `${g.home.short}-${g.away.short}`;
        let res;
        if (g.result === 'postponed') res = '<span class="cr off">中止</span>';
        else if (g.result) res = `<span class="cr ${g.result}">${MARK[g.result]}</span><span class="cs">${g[g.side].score}-${opp.score}</span>`;
        else if (g.status === 'live') res = '<span class="cr live">試合中</span>';
        else res = `<span class="ct">${esc(g.startTime || '')}</span>`;
        return `<div class="cg">${esc(pair)}</div>${res}`;
      }).join('');
      const g0 = list[0];
      const gameHref = (g) => `#/game/${isMLB ? 'mlb' : 'npb'}/${encodeURIComponent(g.id)}`;
      // ダブルヘッダーは試合ごとに押せるようにする
      if (list.length > 1) {
        const cls2 = ['cc', d === today ? 'today' : '', w === 6 ? 'sat' : '', w === 0 ? 'sun' : '', 'has', 'dh'].join(' ');
        const parts = inner.split('<div class="cg">').filter(Boolean).map((x, k) => `<a class="cc-g" href="${gameHref(list[k])}"><div class="cg">${x}</a>`);
        return `<div class="${cls2}"><span class="cd ${home ? 'home' : ''}">${Number(d.slice(8))}</span>${parts.join('')}</div>`;
      }
      const link = g0 ? gameHref(g0) : null;
      const cls = ['cc', d === today ? 'today' : '', w === 6 ? 'sat' : '', w === 0 ? 'sun' : '', list.length ? 'has' : ''].join(' ');
      return `<${link ? `a href="${link}"` : 'div'} class="${cls}">
        <span class="cd ${home ? 'home' : ''}">${Number(d.slice(8))}</span>${inner}</${link ? 'a' : 'div'}>`;
    };

    const [yy, mm] = month.split('-');
    $app.innerHTML = `
      <header class="lt">
        <div class="lt-row"><h1>カレンダー</h1>
          <div class="seg seg-sm">
            <a class="${isMLB ? '' : 'on'}" href="${href(settings.favorites.find((f) => f.startsWith('npb:')) || 'npb:g', month)}">NPB</a>
            <a class="${isMLB ? 'on' : ''}" href="${href(settings.favorites.find((f) => f.startsWith('mlb:')) || 'mlb:119', month)}">MLB</a>
          </div>
        </div>
      </header>
      <div class="team-pick ${isMLB ? 'mlb' : ''}">
        ${(isMLB ? MLB_TEAM_LIST : NPB_TEAM_LIST).map((t) => {
          const k = isMLB ? `mlb:${t.id}` : `npb:${t.code}`;
          return `<a class="tp ${k === key ? 'on' : ''}" href="${href(k, month)}" style="--c:${esc(t.color)}" aria-label="${esc(t.name)}">${badge(t, 'md')}<span>${esc(t.name)}</span></a>`;
        }).join('')}
      </div>
      <main class="list">
        <div class="card cal-card">
          <div class="cal-head">
            <a class="icon-btn" href="${href(key, addMonths(month, -1))}" aria-label="前の月">${icon('back', 20)}</a>
            <div class="cal-title"><b>${yy}年${Number(mm)}月</b>${team ? `<span>${badge(team, 'xs')}${esc(team.name)}</span>` : ''}</div>
            <a class="icon-btn" href="${href(key, addMonths(month, 1))}" aria-label="次の月">${icon('next', 20)}</a>
          </div>
          ${games.length ? `<div class="cal-rec"><span class="w">${rec.win}勝</span><span class="l">${rec.loss}敗</span><span class="d">${rec.draw}分</span><span class="muted">全${games.length}試合</span></div>` : ''}
          <div class="cal-grid" style="--home:${esc(team ? team.color : '#ffb547')}">
            ${HEAD.map((h, i) => `<div class="ch ${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${h}</div>`).join('')}
            ${cells.map(cell).join('')}
          </div>
          <div class="cal-legend"><span><i class="home-bar" style="background:${esc(team ? team.color : '#888')}"></i>ホーム</span><span>○ 勝ち</span><span>× 負け</span><span>△ 引き分け</span></div>
        </div>
        ${error ? errorBox(error) : ''}
        ${!data && !error ? '<p class="hint center">読み込み中…</p>' : ''}
        ${data && !games.length ? `<p class="hint center">この月の試合はありません</p>` : ''}
      </main>`;
    const on = $app.querySelector('.tp.on');
    if (on) on.parentElement.scrollLeft = on.offsetLeft - on.parentElement.clientWidth / 2 + on.clientWidth / 2;
  };

  async function load() {
    try {
      data = await api(`/${isMLB ? 'mlb' : 'npb'}/calendar?team=${code}&month=${month}`);
      error = null;
    } catch (e) { error = e.message; }
    render();
  }
  render();
  load();
}
