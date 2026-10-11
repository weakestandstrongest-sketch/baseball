// 個人成績 (リーダーボード / 詳しい一覧)
import { $app, api, esc, badge, errorBox, skeleton, emptyState, icon, hasJa, isFav } from './util.js';
import { state } from './state.js';

const LEAGUES = [['C', 'セ・リーグ'], ['P', 'パ・リーグ'], ['IL', '交流戦'], ['OP', 'オープン戦'], ['MLB', 'MLB']];
const MLB_LG = [['AL', 'ア・リーグ'], ['NL', 'ナ・リーグ']];
const cache = { npb: {}, mlb: {} };

export function statsView(q) {
  let lg = q.get('lg') || 'C';
  const isMLB = ['MLB', 'AL', 'NL'].includes(lg);
  if (lg === 'MLB') lg = 'AL';
  const g = q.get('g') === 'pitching' ? 'pitching' : 'batting';
  const href = (l, gg = g) => `#/stats?lg=${l}&g=${gg}`;
  const self = { name: 'stats', refresh: () => load() };
  state.view = self;
  let error = null;

  const render = () => {
    if (state.view !== self) return;
    const data = isMLB ? cache.mlb[lg] : cache.npb[lg];
    const loaded = isMLB ? !!cache.mlb[lg] : lg in cache.npb;
    let body = '';
    if (data) {
      const boards = data[g] || [];
      body = boards.length ? `<div class="boards">${boards.map((b) => boardCard(b, isMLB ? 'MLB' : 'NPB')).join('')}</div>` : emptyState('成績データがありません', 'シーズン前や開催前の場合は表示されません');
    } else if (loaded) body = emptyState('成績データがありません', 'シーズン前や開催前の場合は表示されません');
    else if (!error) body = `<div class="boards">${skeleton(4, 'sk-board')}</div>`;
    $app.innerHTML = `
      <header class="lt"><div class="lt-row"><h1>個人成績</h1></div></header>
      <div class="sticky-bar">
        <div class="seg seg-scroll">${LEAGUES.map(([k, l]) => `<a class="${(k === 'MLB' ? isMLB : k === lg) ? 'on' : ''}" href="${href(k)}">${l}</a>`).join('')}</div>
        <div class="sub-row">
          ${isMLB ? `<div class="seg seg-sm">${MLB_LG.map(([k, l]) => `<a class="${k === lg ? 'on' : ''}" href="${href(k)}">${l}</a>`).join('')}</div>` : ''}
          <div class="seg seg-sm grow"><a class="${g === 'batting' ? 'on' : ''}" href="${href(lg, 'batting')}">打者</a><a class="${g === 'pitching' ? 'on' : ''}" href="${href(lg, 'pitching')}">投手</a></div>
        </div>
      </div>
      <main class="list">${error ? errorBox(error) : ''}${body}</main>`;
  };

  async function load() {
    try {
      if (isMLB) cache.mlb[lg] = await api(`/mlb/stats?lg=${lg}`);
      else cache.npb[lg] = (await api(`/npb/stats?lg=${lg}`))[lg] || null;
      error = null;
    } catch (e) { error = e.message; }
    render();
  }
  render();
  load();
}

function moreHref(b) {
  if (!b.more) return null;
  const m = /^mlb:(\w+):(\w+):(\w+)$/.exec(b.more);
  if (m) return `#/stats/list?src=mlb&lg=${m[1]}&group=${m[2]}&sort=${m[3]}`;
  return `#/stats/list?src=npb&url=${encodeURIComponent(b.more)}`;
}

function boardCard(b, league) {
  const more = moreHref(b);
  const [first, ...rest] = b.rows;
  return `<section class="card board">
    <h3 class="board-t">${esc(b.title)}</h3>
    ${first ? `<div class="board-top">
      <span class="medal">1</span>
      <div class="bt-main"><b class="${first.jp || (league === 'MLB' && hasJa(first.name)) ? 'jp' : ''}">${esc(first.name)}</b><span>${badge(first.team, 'xs')}${esc(first.team.name || '')}</span></div>
      <span class="bt-val">${esc(first.value)}</span>
    </div>` : ''}
    ${rest.map((r) => `<div class="board-row ${isFav(league, r.team) ? 'fav' : ''}">
      <span class="br-rank">${esc(r.rank)}</span>${badge(r.team, 'xs')}
      <span class="br-name ${r.jp || (league === 'MLB' && hasJa(r.name)) ? 'jp' : ''}">${esc(r.name)}</span>
      <span class="br-val">${esc(r.value)}</span></div>`).join('')}
    ${more ? `<a class="board-more" href="${more}">${esc(b.title)}の詳しい成績一覧${icon('next', 15)}</a>` : ''}
  </section>`;
}

// ---------------- 詳しい一覧 ----------------

export function statsListView(q) {
  const src = q.get('src');
  const self = { name: 'statslist', refresh: () => load() };
  state.view = self;
  let data = null;
  let error = null;
  const sortState = { col: null, desc: true }; // NPB は手元で並べ替え

  const path = src === 'mlb'
    ? `/mlb/stats?lg=${q.get('lg')}&group=${q.get('group')}&sort=${q.get('sort') || ''}`
    : `/npb/stats?list=${encodeURIComponent(q.get('url') || '')}`;

  const render = () => {
    if (state.view !== self) return;
    let body = '';
    if (data && data.rows && data.rows.length) body = listTable(data, src, q, sortState);
    else if (data) body = emptyState('成績データがありません');
    else if (!error) body = skeleton(1, 'sk-table');
    $app.innerHTML = `
      <header class="lt"><div class="lt-row">
        <button class="icon-btn" id="back" aria-label="戻る">${icon('back', 20)}</button>
        <h1 class="h-sm">${esc((data && data.title) || '成績一覧')}</h1><span></span>
      </div>
      <p class="hint">${icon('sort', 13)} 見出しをタップすると並べ替えできます</p></header>
      <main class="list">${error ? errorBox(error) : ''}${body}</main>`;
    document.getElementById('back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/stats'));
    $app.querySelectorAll('[data-sortcol]').forEach((th) => th.addEventListener('click', () => {
      const i = Number(th.dataset.sortcol);
      if (src === 'mlb' && data.keys && data.keys[i]) {
        const p = new URLSearchParams(q);
        p.set('sort', data.keys[i]);
        location.replace('#/stats/list?' + p.toString());
        return;
      }
      sortState.desc = sortState.col === i ? !sortState.desc : true;
      sortState.col = i;
      render();
    }));
  };

  async function load() {
    try { data = await api(path); error = null; } catch (e) { error = e.message; }
    render();
  }
  render();
  load();
}

const num = (s) => {
  const v = parseFloat(String(s).replace(/[^\d.\-]/g, ''));
  return Number.isNaN(v) ? -Infinity : v;
};

function listTable(d, src, q, sortState) {
  let rows = d.rows.slice();
  let sorted = src === 'mlb' ? d.keys.indexOf(d.sort) : sortState.col;
  if (src !== 'mlb' && sortState.col !== null) {
    const i = sortState.col;
    rows.sort((a, b) => (sortState.desc ? num(b.cells[i]) - num(a.cells[i]) : num(a.cells[i]) - num(b.cells[i])));
  }
  const league = src === 'mlb' ? 'MLB' : 'NPB';
  return `<div class="card tcard"><div class="tscroll"><table class="stat slist">
    <thead><tr>${d.headers.map((h, i) => {
      const sortable = i !== d.nameCol && i !== d.teamCol && (src !== 'mlb' || (d.keys && d.keys[i]));
      return `<th class="${i === d.nameCol ? 'nm' : ''} ${i === sorted ? 'sorted' : ''}" ${sortable ? `data-sortcol="${i}"` : ''}>${esc(h)}</th>`;
    }).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr class="${isFav(league, r.team) ? 'fav' : ''}">${r.cells.map((c, i) => {
      if (i === d.nameCol) return `<td class="nm ${r.jp || (src === 'mlb' && hasJa(c)) ? 'jp' : ''}">${esc(c)}</td>`;
      if (i === d.teamCol) return `<td class="tm-cell">${badge(r.team, 'xs')}</td>`;
      return `<td class="${i === sorted ? 'sorted' : ''}">${esc(c)}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table></div></div>`;
}
