// 順位表 (セ・パ・交流戦・オープン戦 / MLB 地区・ワイルドカード)
import { $app, api, esc, badge, errorBox, skeleton, emptyState, isFav } from './util.js';
import { state } from './state.js';

const NPB_TABS = [['C', 'セ・リーグ'], ['P', 'パ・リーグ'], ['IL', '交流戦'], ['OP', 'オープン戦']];
const MLB_TABS = [['AL', 'ア・リーグ'], ['NL', 'ナ・リーグ'], ['WC', 'ワイルドカード']];
const cache = { npb: null, mlb: null };

export function standingsView(q) {
  const tab = q.get('lg') || 'C';
  const detail = q.get('v') === 'detail';
  const isMLB = ['MLB', 'AL', 'NL', 'WC'].includes(tab);
  const sub = tab === 'MLB' ? 'AL' : tab;
  const self = { name: 'standings', refresh: () => load() };
  state.view = self;
  let error = null;

  const render = () => {
    if (state.view !== self) return;
    let body = '';
    if (isMLB) {
      const d = cache.mlb;
      const view = (t) => (detail && t.detailHeaders ? { ...t, headers: t.detailHeaders, rows: t.rows.map((r) => ({ ...r, cells: r.detail })) } : t);
      if (d) body = (d[sub] || []).map((t) => `<h3 class="sec-title">${esc(t.name)}</h3>${standTable(view(t), 'MLB')}`).join('') || emptyState('データがありません');
    } else if (cache.npb) {
      const t = cache.npb[tab];
      body = t && t.tables.length
        ? t.tables.map((x, i) => `<h3 class="sec-title">${esc(i === 0 ? NPB_TABS.find(([k]) => k === tab)[1] : x.title)}</h3>${x.kind === 'matrix' ? matrixTable(x) : standTable(x, 'NPB')}`).join('')
        : emptyState('順位表を取得できませんでした', 'シーズン前や開催前の場合は表示されません');
    }
    if (!body && !error) body = `<div class="sk sk-title"></div>${skeleton(1, 'sk-table')}`;
    $app.innerHTML = `
      <header class="lt"><div class="lt-row"><h1>順位表</h1></div></header>
      <div class="sticky-bar">
        <div class="seg seg-scroll">
          ${NPB_TABS.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" href="#/standings?lg=${k}">${l}</a>`).join('')}
          <a class="${isMLB ? 'on' : ''}" href="#/standings?lg=AL">MLB</a>
        </div>
        ${isMLB ? `<div class="sub-row">
          <div class="seg seg-sm grow">${MLB_TABS.map(([k, l]) => `<a class="${k === sub ? 'on' : ''}" href="#/standings?lg=${k}${detail ? '&v=detail' : ''}">${l}</a>`).join('')}</div>
          <div class="seg seg-sm"><a class="${detail ? '' : 'on'}" href="#/standings?lg=${sub}">基本</a><a class="${detail ? 'on' : ''}" href="#/standings?lg=${sub}&v=detail">詳細</a></div>
        </div>` : ''}
      </div>
      <main class="list">${error ? errorBox(error) : ''}${body}</main>`;
  };

  async function load() {
    try {
      if (isMLB) cache.mlb = await api('/mlb/standings');
      else cache.npb = await api('/npb/standings');
      error = null;
    } catch (e) { error = e.message; }
    render();
  }
  render();
  load();
}

function standTable(t, league) {
  const tc = t.teamCol ?? t.headers.findIndex((h) => /チーム|球団/.test(h));
  return `<div class="card tcard"><div class="tscroll"><table class="stat stand">
    <thead><tr>${t.headers.map((h, i) => `<th class="${i === tc ? 'nm' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r, ri) => `<tr class="${isFav(league, r.team) ? 'fav' : ''}">${r.cells.map((c, i) => {
      if (i === tc) return `<td class="nm"><span class="tn">${badge(r.team, 'xs')}${esc(c)}</span>${r.clinched ? `<small class="cl">${esc(r.clinched)}</small>` : ''}</td>`;
      if (i === 0 && i !== tc) return `<td class="rank ${ri < 3 ? 'top' : ''}">${esc(c)}</td>`;
      return `<td>${esc(c)}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table></div></div>`;
}

function matrixTable(t) {
  return `<div class="card tcard"><div class="tscroll"><table class="stat matrix">
    <thead><tr>${t.headers.map((h, i) => `<th class="${i === 0 ? 'nm' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${r.cells.map((c, i) => i === 0
      ? `<td class="nm"><span class="tn">${badge(r.team, 'xs')}${esc(c)}</span></td>`
      : matrixCell(c)).join('')}</tr>`).join('')}</tbody>
  </table></div></div>`;
}

// 「16 - 8 (1)」→ 勝-敗 と (引分) に分け、勝ち越しは色付け
function matrixCell(c) {
  const m = /^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?\s*(?:\((\d+)\))?$/.exec(c || '');
  if (!m) return `<td class="${c === '-' || c === '' ? 'self' : ''}">${esc(c)}</td>`;
  const w = Number(m[1]);
  const l = Number(m[2]);
  const d = m[4] ?? m[3];
  return `<td class="mx ${w > l ? 'up' : w < l ? 'down' : ''}"><b>${w}-${l}</b>${d !== undefined ? `<small>(${d})</small>` : ''}</td>`;
}
