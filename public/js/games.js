// 試合一覧
import { $app, api, esc, badge, statusPill, skeleton, emptyState, errorBox, icon, jstToday, addDays, dow, WD, fmtDate, settings, isFav } from './util.js';
import { state, schedule } from './state.js';
import { openDatePicker } from './picker.js';

const GROUPS = [
  { key: 'fav', label: 'お気に入り' },
  { key: 'JS', label: '日本シリーズ' },
  { key: 'CS', label: 'クライマックスシリーズ' },
  { key: 'C', label: 'セ・リーグ' },
  { key: 'P', label: 'パ・リーグ' },
  { key: 'IL', label: '交流戦' },
  { key: 'other', label: 'NPB' },
  { key: 'PS', label: 'MLB ポストシーズン' },
  { key: 'AL', label: 'MLB ア・リーグ' },
  { key: 'NL', label: 'MLB ナ・リーグ' },
  { key: 'MLB', label: 'MLB' },
];
const FILTERS = [['all', 'すべて'], ['C', 'セ・リーグ'], ['P', 'パ・リーグ'], ['MLB', 'MLB'], ['fav', '★']];

export function gamesView(q) {
  const today = jstToday();
  const date = q.get('d') || state.listDate || today;
  const filter = q.get('f') || state.listFilter || 'all';
  state.listDate = date === today ? null : date;
  state.listFilter = filter === 'all' ? null : filter;
  const data = { npb: null, mlb: null, npbErr: null, mlbErr: null };
  const href = (d, f) => `#/?d=${d}&f=${f}`;
  const self = { name: 'games', refresh: () => load() };
  let firstRender = true;
  state.view = self;

  const strip = () => {
    const days = [];
    for (let i = -7; i <= 7; i++) days.push(addDays(date, i));
    return days.map((d) => {
      const w = dow(d);
      return `<a class="day ${d === date ? 'on' : ''} ${d === today ? 'today' : ''} ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}" href="${href(d, filter)}" data-d="${d}" ${d === date ? 'id="day-on"' : ''}>
        <span class="dw">${WD[w]}</span><span class="dd">${Number(d.slice(8))}</span></a>`;
    }).join('');
  };

  const render = () => {
    if (state.view !== self) return;
    const all = [...(data.npb || []), ...(data.mlb || [])];
    const loading = (data.npb === null && !data.npbErr) || (data.mlb === null && !data.mlbErr);
    const sections = new Map();
    let liveCount = 0;
    for (const g of all) {
      state.cardCache.set(g.league + ':' + g.id, g);
      if (g.status === 'live') liveCount++;
      const fav = isFav(g.league, g.home) || isFav(g.league, g.away);
      const npbLg = (lg) => g.league === 'NPB' && (g.home.league === lg || g.away.league === lg);
      if (filter === 'fav' && !fav) continue;
      if (filter === 'C' && !npbLg('C')) continue;
      if (filter === 'P' && !npbLg('P')) continue;
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
      body += `<section class="sec"><h2 class="sec-title">${grp.key === 'fav' ? icon('star', 14) : ''}${esc(grp.label)}<span class="cnt">${list.length}</span></h2>
        <div class="cards">${list.map(gameCard).join('')}</div></section>`;
    }
    if (!body && !loading) body = emptyState('この日の試合はありません', fmtDate(date));
    if (!body && loading) body = `<section class="sec"><div class="sk sk-title"></div><div class="cards">${skeleton(4)}</div></section>`;
    const errs = [data.npbErr && `NPB: ${data.npbErr}`, data.mlbErr && `MLB: ${data.mlbErr}`].filter(Boolean);

    // 日付の帯：同じ日の描き直し（試合データが届いたときなど）では今の帯をそのまま使い、スクロールし直さない。
    // 別の日を押したときは、押した日が今の位置から中央へ 1 回だけ動くようにする
    const oldDays = document.getElementById('days');
    const keepDays = oldDays && oldDays.dataset.date === date && oldDays.dataset.filter === filter ? oldDays : null;
    const keepX = keepDays ? keepDays.scrollLeft : 0;
    const tapped = !keepDays && oldDays && oldDays.querySelector(`[data-d="${date}"]`);
    const fromX = tapped ? tapped.getBoundingClientRect().left - oldDays.getBoundingClientRect().left : null;

    $app.innerHTML = `
      <header class="lt">
        <div class="lt-row">
          <h1>試合</h1>
          <div class="lt-act">
            ${liveCount ? `<span class="live-cnt"><i class="dot"></i>${liveCount}試合 速報中</span>` : ''}
            <button class="icon-btn" id="pick" aria-label="日付を選ぶ">${icon('calendar', 20)}</button>
          </div>
        </div>
        <div class="lt-sub">${esc(fmtDate(date, { year: true }))}${date === today ? '<span class="today-tag">今日</span>' : `<a class="today-link" href="${href(today, filter)}">今日に戻る</a>`}</div>
      </header>
      <div class="sticky-bar">
        <nav class="days" id="days" data-date="${date}" data-filter="${filter}">${strip()}</nav>
        <div class="seg seg-scroll">${FILTERS.map(([k, l]) => `<a class="${k === filter ? 'on' : ''}" href="${href(date, k)}">${l}</a>`).join('')}</div>
      </div>
      <main class="list${firstRender ? ' list-in' : ''}">
        ${errs.map(errorBox).join('')}
        ${body}
      </main>`;
    firstRender = false;
    if (keepDays) {
      // 付け直すとスクロール位置が 0 に戻るので、今の位置に戻して（中央へ動いている途中なら）続きを動かす
      const x = keepX, on = keepDays.querySelector('.day.on');
      document.getElementById('days').replaceWith(keepDays);
      keepDays.style.scrollBehavior = 'auto';
      keepDays.scrollLeft = x;
      keepDays.style.scrollBehavior = '';
      if (on) {
        const center = on.offsetLeft - keepDays.clientWidth / 2 + on.clientWidth / 2;
        if (Math.abs(keepDays.scrollLeft - center) > 1) keepDays.scrollTo({ left: center, behavior: 'smooth' });
      }
    } else {
      const days = document.getElementById('days');
      const on = document.getElementById('day-on');
      if (days && on) {
        const center = on.offsetLeft - days.clientWidth / 2 + on.clientWidth / 2;
        days.style.scrollBehavior = 'auto';
        days.scrollLeft = fromX === null ? center : on.offsetLeft - fromX; // まず押した日を元の位置に置く
        days.style.scrollBehavior = '';
        if (fromX !== null) requestAnimationFrame(() => days.scrollTo({ left: center, behavior: 'smooth' }));
      }
    }
    document.getElementById('pick').onclick = () => openDatePicker(date, (d) => { location.hash = href(d, filter); });
  };

  async function load() {
    const [npb, mlb] = await Promise.allSettled([api(`/npb/schedule?date=${date}`), api(`/mlb/schedule?date=${date}`)]);
    if (npb.status === 'fulfilled') { data.npb = npb.value.games || []; data.npbErr = null; } else data.npbErr = npb.reason.message;
    if (mlb.status === 'fulfilled') { data.mlb = mlb.value.games || []; data.mlbErr = null; } else data.mlbErr = mlb.reason.message;
    if (state.view !== self) return;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if ([...(data.npb || []), ...(data.mlb || [])].some((g) => g.status === 'live')) schedule(load, Math.max(settings.refresh, 15));
  }
  render();
  load();
}

export function gameCard(g) {
  const lg = g.league === 'MLB' ? 'mlb' : 'npb';
  const done = g.status === 'final';
  const showScore = g.status === 'live' || done;
  const row = (t, other) => {
    const win = done && t.score > other.score;
    const lose = done && t.score < other.score;
    return `<div class="gc-team ${win ? 'win' : ''} ${lose ? 'lose' : ''}">
      ${badge(t)}
      <span class="nm">${esc(t.name)}${isFav(g.league, t) ? `<i class="fav-ic">${icon('star', 12)}</i>` : ''}</span>
      ${t.record ? `<span class="rec">${esc(t.record)}</span>` : ''}
      ${showScore ? `<b class="sc">${t.score ?? ''}</b>` : ''}
      ${win ? '<i class="win-mark"></i>' : ''}
    </div>`;
  };
  const tag = g.series || (g.leagueGroup === 'CS' ? 'CS' : g.leagueGroup === 'JS' ? '日本シリーズ' : '');
  return `
  <a class="gc ${g.status}" href="#/game/${lg}/${encodeURIComponent(g.id)}">
    <div class="gc-head">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : `<span class="venue">${icon('stadium', 13)}${esc(g.venue || '')}</span>`}
      ${statusPill(g)}
    </div>
    <div class="gc-body">
      <div class="gc-teams">${row(g.away, g.home)}${row(g.home, g.away)}</div>
      ${g.status === 'live' && g.outs !== null && g.outs !== undefined ? `<div class="gc-outs"><span>${'<i class="on"></i>'.repeat(g.outs)}${'<i></i>'.repeat(Math.max(0, 2 - g.outs))}</span><small>アウト</small></div>` : ''}
      ${g.status === 'pre' ? `<div class="gc-time"><b>${esc(g.startTime || '--:--')}</b><small>開始</small></div>` : ''}
    </div>
    ${(g.notes && g.notes.length) || (tag && g.venue) || g.seriesResult ? `<div class="gc-foot">
      ${tag && g.venue ? `<span>${esc(g.venue)}</span>` : ''}
      ${g.seriesResult ? `<span>${esc(g.seriesResult)}</span>` : ''}
      ${(g.notes || []).map((n) => `<span>${noteHtml(n)}</span>`).join('')}
    </div>` : ''}
  </a>`;
}

function noteHtml(n) {
  const m = /^(勝|敗|S|予告先発)\s*(.*)$/.exec(n);
  if (!m) return esc(n);
  const cls = { 勝: 'w', 敗: 'l', S: 's', 予告先発: 'p' }[m[1]];
  return `<em class="nt nt-${cls}">${m[1] === '予告先発' ? '予告' : m[1]}</em>${esc(m[2])}`;
}
