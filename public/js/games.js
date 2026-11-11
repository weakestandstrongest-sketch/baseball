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
  const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
  const date = [q.get('d'), state.listDate].find(okDate) || today; // おかしな日付の URL でも真っ白にしない
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
    // 表紙：試合中の試合（なければ終わった試合、なければ最初の試合）をいちばん大きく
    const ordered = GROUPS.flatMap((grp) => sections.get(grp.key) || []);
    const cover = ordered.find((g) => g.status === 'live') || ordered.find((g) => g.status === 'final') || ordered[0];
    if (cover) body += coverStory(cover);
    let sn = 0;
    for (const grp of GROUPS) {
      const list = (sections.get(grp.key) || []).filter((g) => g !== cover);
      if (!list.length) continue;
      sn++;
      body += `<section class="sec"><h2 class="sec-title"><span class="sec-no">${ROMAN[sn] || sn}.</span>${grp.key === 'fav' ? icon('star', 13) : ''}${esc(grp.label)}<span class="cnt">${list.length}</span></h2>
        <div class="cards">${list.map((g, i) => gameCard(g, i)).join('')}</div></section>`;
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
      <header class="lt mag-head">
        <div class="mast"><span>Vol. ${Number(date.slice(5, 7))} — No. ${Number(date.slice(8))}</span><span>${EN_WD[dow(date)]} · ${EN_MON[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}</span></div>
        <div class="lt-row">
          <h1 class="logo">Base<i>ball.</i></h1>
          <div class="lt-act">
            ${liveCount ? `<span class="live-cnt"><i class="dot"></i>${liveCount} Live</span>` : ''}
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
        // 中央へ動いている途中だったときだけ続きを動かす（自分で帯をスクロールしていたら、自動更新で戻さない）
        if (keepDays.dataset.centering && Math.abs(keepDays.scrollLeft - center) > 1) keepDays.scrollTo({ left: center, behavior: 'smooth' });
      }
    } else {
      const days = document.getElementById('days');
      const on = document.getElementById('day-on');
      if (days && on) {
        const center = on.offsetLeft - days.clientWidth / 2 + on.clientWidth / 2;
        days.style.scrollBehavior = 'auto';
        days.scrollLeft = fromX === null ? center : on.offsetLeft - fromX; // まず押した日を元の位置に置く
        days.style.scrollBehavior = '';
        if (fromX !== null) {
          days.dataset.centering = '1';
          requestAnimationFrame(() => days.scrollTo({ left: center, behavior: 'smooth' }));
          setTimeout(() => { delete days.dataset.centering; }, 900);
        }
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

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const roman = (n) => (ROMAN[n] || String(n)).toLowerCase();
const EN_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const gameHref = (g) => `#/game/${g.league === 'MLB' ? 'mlb' : 'npb'}/${encodeURIComponent(g.id)}`;
const sc = (t) => (t.score === null || t.score === undefined ? '–' : t.score);

// 表紙の試合：大きな数字ふたつと縦書きのチーム名、下に短い記事
function coverStory(g) {
  const done = g.status === 'final', live = g.status === 'live', pre = !done && !live;
  const kicker = live ? `<span class="cv-live"><i class="dot"></i>Live — ${esc(g.statusText || '')}</span>` : done ? 'The Final Out.' : g.status === 'postponed' ? 'Postponed.' : 'Tonight.';
  const lead = [g.series || '', g.venue ? `${g.venue}${pre ? `、${g.startTime || ''}開始` : ''}` : ''].filter(Boolean).join('。');
  const notes = (g.notes || []).map((n) => esc(n)).join('　');
  const win = (t, o) => done && t.score > o.score;
  return `
  <a class="cover ${g.status}" href="${gameHref(g)}">
    <div class="cv-art${pre ? ' pre' : ''}">
      ${pre ? `<span class="cv-time">${esc(g.startTime || 'vs')}</span>` : `<span class="cv-n a ${win(g.away, g.home) ? 'w' : ''}">${sc(g.away)}</span><span class="cv-n h ${win(g.home, g.away) ? 'w' : ''}">${sc(g.home)}</span>`}
      <span class="cv-v a">${esc(g.away.name)}</span>
      <span class="cv-v h">${esc(g.home.name)}</span>
    </div>
    <p class="cv-cap"><b>${kicker}</b>${esc(lead)}${lead ? '。' : ''}${notes ? `<span class="cv-notes">${notes}</span>` : ''}</p>
  </a>`;
}

// 目次のような1行：番号・対戦・点数
export function gameCard(g, i = 0) {
  const done = g.status === 'final', live = g.status === 'live';
  const showScore = live || done;
  const nm = (t, o) => `<span class="${done && t.score < o.score ? 'lose' : ''}">${esc(t.name)}${isFav(g.league, t) ? `<i class="fav-ic">${icon('star', 10)}</i>` : ''}</span>`;
  const tag = g.series || '';
  const sub = [live ? `<em class="t-live"><i class="dot"></i>${esc(g.statusText || 'Live')}</em>` : '', esc(tag || g.venue || ''), g.status === 'pre' && (g.notes || []).length ? (g.notes || []).map(noteHtml).join(' ') : '', g.seriesResult ? esc(g.seriesResult) : '']
    .filter(Boolean).join('<span class="t-sep">·</span>');
  return `
  <a class="gc toc ${g.status}" href="${gameHref(g)}">
    <span class="t-n">${roman(i + 1)}.</span>
    <span class="t-m"><span class="t-tm">${nm(g.away, g.home)}<span class="t-dash">—</span>${nm(g.home, g.away)}</span>${sub ? `<span class="t-sub">${sub}</span>` : ''}</span>
    <span class="t-s">${showScore ? `${sc(g.away)}<span>–</span>${sc(g.home)}` : g.status === 'postponed' ? '<small>中止</small>' : esc(g.startTime || '--:--')}</span>
  </a>`;
}

function noteHtml(n) {
  const m = /^(勝|敗|S|予告先発)\s*(.*)$/.exec(n);
  if (!m) return esc(n);
  const cls = { 勝: 'w', 敗: 'l', S: 's', 予告先発: 'p' }[m[1]];
  return `<em class="nt nt-${cls}">${m[1] === '予告先発' ? '予告' : m[1]}</em>${esc(m[2])}`;
}
