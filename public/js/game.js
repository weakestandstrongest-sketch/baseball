// 試合詳細 (トップ / 速報 / 経過 / 成績)
import { $app, api, esc, hasJa, badge, statusPill, skeleton, errorBox, icon, fmtDate, settings, sourceName } from './util.js';
import { state, stopTimer, schedule } from './state.js';

const TABS = [['top', 'トップ'], ['live', '速報'], ['plays', '経過'], ['box', '成績']];

export function gameView(lg, id, tab) {
  const card = state.cardCache.get((lg === 'mlb' ? 'MLB' : 'NPB') + ':' + id);
  const ui = { boxTab: 'bat', boxSide: null, expanded: new Set(), order: null, liveAb: null };
  let game = null;
  let error = null;
  let updated = null;
  const self = { name: 'game', refresh: () => load(true) };
  state.view = self;
  const base = `#/game/${lg}/${encodeURIComponent(id)}`;

  const render = () => {
    if (state.view !== self) return;
    const y = window.scrollY;
    const g = game || card;
    let content = '';
    const missing = game && game.parts && !partsFor(lg, tab).every((p) => game.parts.includes(p));
    if (!game) content = error ? errorBox(error) + (card ? `<p class="hint center"><a href="#/?d=${card.date}">この日の試合一覧へ</a></p>` : '') : skeleton(3, 'sk-block');
    else if (missing && !error) content = skeleton(3, 'sk-block');
    else if (tab === 'top') content = topTab(game);
    else if (tab === 'live') content = liveTab(game, ui);
    else if (tab === 'plays') content = playsTab(game, ui);
    else if (tab === 'box') content = boxTab(game, ui);
    $app.innerHTML = `
      <header class="gnav">
        <a class="icon-btn glass" href="${backHref()}" aria-label="戻る">${icon('back', 20)}</a>
        <div class="gnav-t"></div>
        <button class="icon-btn glass" id="reload" aria-label="更新">${icon('refresh', 19)}</button>
      </header>
      ${g ? hero(g) : '<div class="hero"><div class="sk sk-hero"></div></div>'}
      <nav class="tabs" id="tabs">
        <a class="icon-btn mini" href="${backHref()}" aria-label="戻る">${icon('back', 18)}</a>
        <div class="seg">${TABS.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" href="${base}/${k}" data-tab="${k}">${l}</a>`).join('')}</div>
        <button class="icon-btn mini" data-reload aria-label="更新">${icon('refresh', 17)}</button>
      </nav>
      ${g ? `<div class="card ls-card">${linescore(g)}</div>` : ''}
      <main class="gbody">
        ${game && error ? errorBox('更新に失敗しました: ' + error) : ''}
        ${content}
        ${game ? `<p class="foot">${updated ? `${updated} 更新 · ` : ''}<a href="${esc(game.url)}" target="_blank" rel="noopener">データ: ${esc(sourceName(game.source))}</a></p>` : ''}
      </main>`;
    window.scrollTo(0, y);
    bind();
    onScroll();
  };

  // タブが上に張り付いたら、戻る/更新ボタンをタブの左右に出す
  const onScroll = () => {
    const tabs = document.getElementById('tabs');
    if (tabs) tabs.classList.toggle('stuck', tabs.getBoundingClientRect().top <= 0.5 && window.scrollY > 10);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  self.cleanup = () => window.removeEventListener('scroll', onScroll);

  const bind = () => {
    document.getElementById('reload').onclick = () => load(true);
    $app.querySelector('[data-reload]').onclick = () => load(true);
    $app.querySelectorAll('[data-tab]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      history.replaceState(null, '', a.getAttribute('href'));
      tab = a.dataset.tab;
      // NPB はタブに必要なページだけ読むので、足りなければ読み直す
      if (game && game.parts && !partsFor(lg, tab).every((p) => game.parts.includes(p))) load(false);
      const tabsTop = document.getElementById('tabs').offsetTop;
      render();
      if (window.scrollY > tabsTop) window.scrollTo(0, tabsTop);
    }));
    $app.querySelectorAll('[data-ab]').forEach((el) => el.addEventListener('click', () => {
      const k = el.dataset.ab;
      ui.expanded.has(k) ? ui.expanded.delete(k) : ui.expanded.add(k);
      render();
    }));
    $app.querySelectorAll('[data-boxtab]').forEach((el) => el.addEventListener('click', () => { ui.boxTab = el.dataset.boxtab; render(); }));
    $app.querySelectorAll('[data-boxside]').forEach((el) => el.addEventListener('click', () => { ui.boxSide = el.dataset.boxside; render(); }));
    $app.querySelectorAll('[data-order]').forEach((el) => el.addEventListener('click', () => { ui.order = el.dataset.order; render(); }));
    $app.querySelectorAll('[data-liveab]').forEach((el) => el.addEventListener('click', () => {
      ui.liveAb = el.dataset.liveab === 'now' ? null : el.dataset.liveab;
      render();
    }));
  };

  async function load(manual) {
    stopTimer();
    if (manual) $app.querySelectorAll('#reload, [data-reload]').forEach((b) => b.classList.add('spin'));
    try {
      const parts = partsFor(lg, tab);
      const prev = game;
      game = await api(`/${lg}/game?id=${encodeURIComponent(id)}${lg === 'npb' ? `&parts=${parts.join(',')}` : ''}`);
      // 前に読んだ成績・経過は、今回読んでいなければ引き継ぐ
      if (prev && game.parts) {
        if (!game.parts.includes('box') && prev.parts && prev.parts.includes('box')) { game.box = prev.box; game.parts.push('box'); }
        if (!game.parts.includes('plays') && prev.parts && prev.parts.includes('plays')) { game.plays = prev.plays; game.parts.push('plays'); }
      }
      if (card) for (const k of ['date', 'startTime', 'venue', 'series']) if (!game[k] && card[k]) game[k] = card[k];
      error = null;
      updated = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      error = e.message;
    }
    render();
    if (state.view === self && (!game || game.status === 'live' || game.status === 'pre')) {
      schedule(() => load(false), game && game.status === 'pre' ? 60 : settings.refresh);
    }
  }
  render();
  load(false);
}

function partsFor(lg, tab) {
  if (lg !== 'npb') return [];
  if (tab === 'box') return ['box'];
  if (tab === 'plays' || tab === 'live') return ['plays'];
  return [];
}

const condClass = (c) => ({ 絶好調: 'best', 好調: 'good', 普通: 'ok', 不調: 'bad', 絶不調: 'worst' }[c] || 'ok');

function backHref() {
  const p = new URLSearchParams();
  if (state.listDate) p.set('d', state.listDate);
  if (state.listFilter) p.set('f', state.listFilter);
  const s = p.toString();
  return '#/' + (s ? '?' + s : '');
}

function hero(g) {
  const done = g.status === 'final';
  const score = (t) => (t.score === null || t.score === undefined ? '' : t.score);
  const side = (t, other, cls) => `
    <div class="hero-team ${cls} ${done && t.score < other.score ? 'lose' : ''}">
      ${badge(t, 'xl')}
      <div class="hero-nm">${esc(t.name)}</div>
      ${t.record ? `<div class="hero-rec">${esc(t.record)}</div>` : ''}
    </div>`;
  const showScore = g.status === 'live' || done;
  return `
  <section class="hero" style="--ca:${esc(g.away.color || '#444')};--ch:${esc(g.home.color || '#444')}">
    ${g.series ? `<div class="hero-series">${esc(g.series)}</div>` : ''}
    <div class="hero-main">
      ${side(g.away, g.home, 'away')}
      <div class="hero-mid">
        ${showScore ? `<div class="hero-score"><b class="${done && g.away.score > g.home.score ? 'w' : ''}">${score(g.away)}</b><span>-</span><b class="${done && g.home.score > g.away.score ? 'w' : ''}">${score(g.home)}</b></div>` : `<div class="hero-vs">${esc(g.startTime || 'vs')}</div>`}
        ${statusPill(g, { big: true })}
      </div>
      ${side(g.home, g.away, 'home')}
    </div>
    <div class="hero-meta">${icon('stadium', 14)}${esc([fmtDate(g.date), g.startTime, g.venue].filter(Boolean).join(' · '))}</div>
  </section>`;
}

function linescore(g) {
  const inns = g.linescore && g.linescore.innings && g.linescore.innings.length
    ? g.linescore.innings
    : Array.from({ length: 9 }, (_, i) => ({ num: i + 1, away: null, home: null }));
  const cur = g.current;
  const isCur = (num, side) => cur && cur.inning === num && ((cur.half === 'top' && side === 'away') || (cur.half === 'bottom' && side === 'home'));
  const val = (v) => (v === null || v === undefined ? '' : v);
  const row = (t, side) => `
    <tr>
      <th class="tm"><span class="tm-bar" style="background:${esc(t.color || '#555')}"></span>${esc(t.short || t.name || '')}</th>
      ${inns.map((i) => `<td class="${isCur(i.num, side) ? 'cur' : ''} ${Number(i[side]) > 0 ? 'pts' : ''}">${val(i[side])}</td>`).join('')}
      <td class="r">${val(t.score)}</td><td class="h">${val(t.hits)}</td><td class="h">${val(t.errors)}</td>
    </tr>`;
  return `<div class="ls-scroll"><table class="ls">
    <thead><tr><th></th>${inns.map((i) => `<th>${i.num}</th>`).join('')}<th class="r">計</th><th class="h">安</th><th class="h">失</th></tr></thead>
    <tbody>${row(g.away, 'away')}${row(g.home, 'home')}</tbody>
  </table></div>`;
}

const secTitle = (t, extra = '') => `<h3 class="sec-title">${esc(t)}${extra}</h3>`;

// ---------- トップ ----------
function topTab(g) {
  let h = '';
  if (g.status === 'pre' && g.probables && (g.probables.away || g.probables.home)) {
    h += secTitle('予告先発');
    h += `<div class="card vs-card">${['away', 'home'].map((k) => `
      <div class="vs-side">${badge(g[k], 'sm')}<div><b>${esc(g.probables[k]?.name || '未定')}</b><small>${esc(g.probables[k]?.info || '')}</small></div></div>`).join('<div class="vs-x">vs</div>')}</div>`;
  }
  if (g.notes && g.notes.length && g.status === 'pre') {
    h += secTitle('情報');
    h += `<div class="card list-card">${g.notes.map((n) => `<div class="li">${esc(n)}</div>`).join('')}</div>`;
  }

  const d = g.decisions || {};
  if (d.win || d.loss || d.save) {
    h += secTitle('責任投手');
    h += `<div class="card list-card">${[['win', '勝', 'w'], ['loss', '敗', 'l'], ['save', 'S', 's']].filter(([k]) => d[k]).map(([k, l, c]) => `
      <div class="li dec"><span class="dec-k dec-${c}">${l}</span><b class="${hasJa(d[k].name) && g.league === 'MLB' ? 'jp' : ''}">${esc(d[k].name)}</b><small>${esc(d[k].record ? `${d[k].record}` : '')}</small></div>`).join('')}</div>`;
  }

  if (g.status !== 'pre') {
    h += secTitle('本塁打');
    const hr = (side) => (g.homeRuns || []).filter((x) => x.side === side);
    h += `<div class="card list-card">${['away', 'home'].map((side) => `
      <div class="li hr-row">${badge(g[side], 'sm')}<div class="hr-list">${hr(side).length ? hr(side).map((x) => `
        <div><b class="${x.jp ? 'jp' : ''}">${esc(x.name)}</b>${x.number ? `<span class="hr-n">${x.number}号</span>` : ''}<small>${esc(x.detail || '')}</small></div>`).join('') : '<span class="muted">なし</span>'}</div></div>`).join('')}
      ${(g.homeRuns || []).filter((x) => !x.side).map((x) => `<div class="li"><b>${esc(x.name)}</b> ${x.number}号 <small>${esc(x.detail)}</small></div>`).join('')}
    </div>`;
  }

  if (g.summary) {
    h += secTitle('戦評');
    h += `<div class="card text-card">${esc(g.summary).replace(/\n/g, '<br>')}</div>`;
  }

  // スコアプレー (スポーツナビの得点シーン一覧があればそれを使う)
  if (g.scoringPlays && g.scoringPlays.length) {
    h += secTitle('スコアプレー');
    h += `<div class="card list-card timeline">${g.scoringPlays.map((p) => {
      const t = p.side === 'home' ? g.home : g.away;
      const sc = /([^\s\d]{1,3}) (\d+)-(\d+) ([^\s\d]{1,3})/.exec(p.text);
      return `<div class="li tl"><span class="tl-inn" style="--c:${esc(t.color)}">${esc(p.inning)}</span>
        <div class="tl-body"><b>${esc(p.player)}</b>${p.situation ? `<small>${esc(p.situation)}</small>` : ''}<span>${esc(sc ? p.text.slice(0, sc.index).trim() : p.text)}</span></div>
        ${sc ? `<span class="tl-score">${esc(`${sc[1]} ${sc[2]}-${sc[3]} ${sc[4]}`)}</span>` : ''}</div>`;
    }).join('')}</div>`;
  }

  if (g.batteries && g.batteries.length) {
    h += secTitle('バッテリー');
    h += `<div class="card list-card">${g.batteries.map((b) => `<div class="li hr-row">${badge(b.side ? g[b.side] : { short: b.team.slice(0, 1), color: '#555' }, 'sm')}<span class="bt-text">${esc(b.text)}</span></div>`).join('')}</div>`;
  }

  for (const hl of g.highlights || []) {
    h += secTitle(hl.title);
    h += `<div class="card list-card">${hl.lead ? `<div class="li"><b class="hl-lead">${esc(hl.lead)}</b></div>` : ''}${hl.rows.map(([k, v]) => `<div class="li kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
  }

  if (g.lineups && (g.lineups.home.length || g.lineups.away.length)) {
    h += secTitle('スターティングメンバー');
    const col = (side) => `<div class="lu-col"><div class="lu-head">${badge(g[side], 'xs')}${esc(g[side].name)}</div>${g.lineups[side].map((p) => `
      <div class="lu-row"><span class="lu-o">${p.order === 'P' ? '先' : esc(p.order)}</span><span class="lu-p">${esc(p.pos)}</span><span class="lu-n">${esc(p.name)}</span>${p.cond ? `<span class="lu-c c-${condClass(p.cond)}">${esc(p.cond)}</span>` : ''}</div>`).join('')}</div>`;
    h += `<div class="card lineups">${col('away')}${col('home')}</div>`;
  }

  const scoring = [];
  for (const half of (g.scoringPlays && g.scoringPlays.length) ? [] : g.plays || []) {
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
    h += secTitle('得点経過');
    h += `<div class="card list-card timeline">${scoring.map((s) => {
      const t = s.half.half === 'top' ? g.away : g.home;
      return `<div class="li tl"><span class="tl-inn" style="--c:${esc(t.color)}">${s.half.inning}回${s.half.half === 'top' ? '表' : '裏'}</span>
        <div class="tl-body">${s.ab ? `<b class="${g.league === 'MLB' && hasJa(s.ab.batter) ? 'jp' : ''}">${esc(s.ab.batter)}</b>` : ''}<span>${esc(s.text)}</span>${s.desc ? `<small>${esc(s.desc)}</small>` : ''}</div>
        ${s.score ? `<span class="tl-score">${esc(s.score)}</span>` : ''}</div>`;
    }).join('')}</div>`;
  }

  const info = [['球場', g.venue], ['天気', g.weather], ['開始', g.startTime], ...(g.info || []), [g.away.name, g.away.record], [g.home.name, g.home.record]].filter(([, v]) => v);
  if (info.length) {
    h += secTitle('試合情報');
    h += `<div class="card list-card">${info.map(([k, v]) => `<div class="li kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
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
  if (g.status === 'pre') return `<div class="card center-card">${icon('clock', 30)}<p>試合開始前です</p>${g.startTime ? `<small>${esc(g.startTime)} 開始予定</small>` : ''}</div>`;
  const abs = allAtBats(g);
  const cur = g.current;
  let picked = ui.liveAb ? abs.find((x) => x.key === ui.liveAb) : null;
  if (!cur && !picked && abs.length) picked = abs[abs.length - 1];

  if (picked) {
    const { half, ab } = picked;
    const idx = abs.indexOf(picked);
    const last = [...(ab.pitches || [])].pop();
    const res = ab.events.find((e) => e.result);
    let h = `<div class="abnav">
      <button ${idx <= 0 ? 'disabled' : ''} data-liveab="${idx > 0 ? abs[idx - 1].key : ''}">${icon('back', 16)}前</button>
      <span>${half.inning}回${half.half === 'top' ? '表' : '裏'} · ${idx + 1}/${abs.length}打席</span>
      ${cur ? '<button class="now" data-liveab="now">現在</button>' : ''}
      <button ${idx >= abs.length - 1 ? 'disabled' : ''} data-liveab="${idx < abs.length - 1 ? abs[idx + 1].key : ''}">次${icon('next', 16)}</button>
    </div>`;
    if (last) h += `<div class="card sit-card">${bso(last.balls, last.strikes, null)}</div>`;
    h += `<div class="card mu">
      <div class="mu-p"><span class="mu-l">打者</span><b class="${g.league === 'MLB' && hasJa(ab.batter) ? 'jp' : ''}">${ab.order ? `<em>${ab.order}</em>` : ''}${esc(ab.batter)}</b><small>${esc(ab.situation || '')}</small></div>
      <div class="mu-p"><span class="mu-l">投手</span><b class="${g.league === 'MLB' && hasJa(ab.pitcher) ? 'jp' : ''}">${esc(ab.pitcher || '-')}</b></div>
    </div>`;
    if (res || ab.result) h += `<div class="card result-card ${ab.scoring ? 'scoring' : ''}"><b>${esc(res ? res.text : ab.result)}</b>${res && res.desc ? `<small>${esc(res.desc)}</small>` : ''}${res && res.hit ? `<small class="hitinfo">${esc(res.hit)}</small>` : ''}</div>`;
    h += pitchesBlock(ab.pitches || [], ab.events);
    return h;
  }
  if (!cur) return `<div class="card center-card"><p>速報データがありません</p></div>`;

  let h = '';
  if (abs.length) h += `<div class="abnav"><button data-liveab="${abs[abs.length - 1].key}">${icon('back', 16)}直前の打席</button><span class="live-now"><i class="dot"></i>LIVE</span></div>`;
  h += `<div class="card sit-card"><div class="sit-inn">${esc(g.statusText)}</div>${bso(cur.balls, cur.strikes, cur.outs)}</div>`;
  h += `<div class="card field-card">${field(cur)}</div>`;
  const person = (p, lbl) => `<div class="mu-p"><span class="mu-l">${lbl}${p && p.hand ? ` · ${esc(p.hand)}` : ''}</span><b class="${p && p.jp ? 'jp' : ''}">${esc(p ? p.name : '-')}</b>${((p && p.info) || []).map((i) => `<small>${esc(i)}</small>`).join('')}</div>`;
  h += `<div class="card mu">${person(cur.batter, '打者')}${person(cur.pitcher, '投手')}</div>`;
  if (cur.onDeck) h += `<p class="hint">次打者 <b>${esc(cur.onDeck)}</b></p>`;
  h += pitchesBlock(cur.pitches || [], null);
  if (cur.lastPlay) h += secTitle('直前のプレー') + `<div class="card text-card small">${esc(cur.lastPlay)}</div>`;
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

function shortName(n) {
  if (!n || typeof n !== 'string') return '';
  if (hasJa(n)) return n.split(' ')[0];
  const p = n.split(' ');
  return p.length > 1 ? p.slice(1).join(' ') : n;
}

function field(cur) {
  const r = cur.runners || {};
  const base = (x, y, on) => `
    <g class="base ${on ? 'on' : ''}">
      ${on ? `<circle cx="${x}" cy="${y}" r="15" class="glow"/>` : ''}
      <rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2.5" transform="rotate(45 ${x} ${y})"/>
    </g>`;
  const runner = (x, y, name, anchor) => {
    if (!name) return '';
    const t = typeof name === 'string' ? shortName(name) : '走者';
    const w = Math.max(34, [...t].reduce((s, c) => s + (/[\x00-\x7f]/.test(c) ? 6.4 : 11), 0) + 14);
    const rx = anchor === 'start' ? x + 14 : anchor === 'end' ? x - 14 - w : x - w / 2;
    const ry = anchor === 'middle' ? y - 36 : y - 10;
    return `<g class="runner"><rect x="${rx}" y="${ry}" width="${w}" height="20" rx="10"/><text x="${rx + w / 2}" y="${ry + 14}" text-anchor="middle">${esc(t)}</text></g>`;
  };
  const d = cur.defense || {};
  const POS = { pitcher: [160, 160], catcher: [160, 246], first: [236, 140], second: [200, 104], shortstop: [120, 104], third: [84, 140], left: [66, 68], center: [160, 40], right: [254, 68] };
  const def = Object.entries(d).map(([k, n]) => (POS[k] ? `<text x="${POS[k][0]}" y="${POS[k][1]}" text-anchor="middle" class="df">${esc(shortName(n))}</text>` : '')).join('');
  return `
  <svg class="field" viewBox="0 0 320 256" role="img" aria-label="走者状況">
    <defs>
      <pattern id="mow" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="11" height="22" fill="#3d8a3f"/><rect x="11" width="11" height="22" fill="#367d38"/>
      </pattern>
      <radialGradient id="dirt" cx="50%" cy="80%" r="70%"><stop offset="0" stop-color="#c9a171"/><stop offset="1" stop-color="#a87f52"/></radialGradient>
    </defs>
    <path d="M160 250 L6 96 Q160 -36 314 96 Z" fill="#2c6b2f"/>
    <path d="M160 242 L18 100 Q160 -18 302 100 Z" fill="url(#mow)"/>
    <path d="M160 236 L64 140 Q160 46 256 140 Z" fill="url(#dirt)"/>
    <path d="M160 214 L214 160 L160 106 L106 160 Z" fill="url(#mow)"/>
    <path d="M160 214 L18 72 M160 214 L302 72" class="chalk"/>
    <circle cx="160" cy="160" r="10" fill="url(#dirt)"/>
    <rect x="155" y="157" width="10" height="3" fill="#eee"/>
    ${base(214, 160, r.first)}${base(160, 106, r.second)}${base(106, 160, r.third)}
    <path d="M152 212 L168 212 L168 219 L160 226 L152 219 Z" fill="#f4f4f4"/>
    ${def}
    ${runner(214, 160, r.first, 'start')}${runner(160, 106, r.second, 'middle')}${runner(106, 160, r.third, 'end')}
  </svg>`;
}

function pitchesBlock(pitches, events) {
  if (!pitches.length) {
    const evs = (events || []).filter((e) => !e.result);
    if (!evs.length) return '';
    return secTitle('投球') + `<div class="card list-card">${evs.map((e) => `<div class="li pr">${e.pitch ? `<span class="pn">${e.pitch}</span>` : ''}<span>${esc(e.text)}</span></div>`).join('')}</div>`;
  }
  const hasLoc = pitches.some((p) => p.px !== null && p.px !== undefined);
  const kindOf = (p) => p.kind || (/ボール/.test(p.result || p.call || '') ? 'ball' : /ファウル|空振|見逃|ストライク/.test(p.result || p.call || '') ? 'strike' : /打|ゴロ|フライ|安|インプレー/.test(p.result || p.call || '') ? 'inplay' : 'other');
  const rows = pitches.map((p, i) => `
    <div class="pt-row"><span class="pn k-${kindOf(p)}">${p.num ?? i + 1}</span>
      <span class="pt-main"><b>${esc(p.type || '-')}</b><small>${esc(p.call || p.result || '')}</small></span>
      <span class="pt-speed">${p.speed ? `${esc(p.speed)}<small>km/h</small>` : ''}</span></div>`).join('');
  return secTitle('配球', `<span class="legend"><i class="k-ball"></i>ボール<i class="k-strike"></i>ストライク<i class="k-inplay"></i>インプレー</span>`) +
    `<div class="card pitches ${hasLoc ? 'with-zone' : ''}">${hasLoc ? zone(pitches) : ''}<div class="pt-list">${rows}</div></div>`;
}

const avg = (a) => { const v = a.filter((n) => typeof n === 'number'); return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null; };

function zone(pitches, cls = '') {
  // 捕手目線 (単位: フィート / ホームベース幅 17 インチ ≒ 1.417ft)
  const W = 150, H = 184;
  const x = (px) => W / 2 + px * 40;
  const top = avg(pitches.map((p) => p.szTop)) || 3.4;
  const bot = avg(pitches.map((p) => p.szBot)) || 1.6;
  const y = (pz) => H - 18 - (pz - 0.5) * 36;
  const zx = x(-0.708), zw = x(0.708) - zx, zy = y(top), zh = y(bot) - zy;
  const grid = [1, 2].map((k) => `<line x1="${zx + (zw * k) / 3}" y1="${zy}" x2="${zx + (zw * k) / 3}" y2="${zy + zh}"/><line x1="${zx}" y1="${zy + (zh * k) / 3}" x2="${zx + zw}" y2="${zy + (zh * k) / 3}"/>`).join('');
  const dots = pitches.filter((p) => p.px !== null && p.px !== undefined).map((p, i) => {
    const cx = Math.max(9, Math.min(W - 9, x(p.px)));
    const cy = Math.max(9, Math.min(H - 9, y(p.pz)));
    return `<g class="k-${p.kind}"><circle cx="${cx}" cy="${cy}" r="8.5"/><text x="${cx}" y="${cy + 3.6}" text-anchor="middle">${p.num ?? i + 1}</text></g>`;
  }).join('');
  return `<svg class="zone ${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="配球">
    <rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" rx="3" class="sz"/>
    <g class="grid">${grid}</g>
    <path d="M${x(-0.708)} ${H - 7} L${x(0.708)} ${H - 7} L${x(0.708)} ${H - 4} L${W / 2} ${H - 1} L${x(-0.708)} ${H - 4} Z" class="plate"/>
    ${dots}
  </svg>`;
}

// ---------- 経過 ----------
function playsTab(g, ui) {
  const halves = g.plays || [];
  if (!halves.length) return `<div class="card center-card"><p>経過はまだありません</p></div>`;
  const newestFirst = ui.order ? ui.order === 'new' : g.status === 'live';
  const list = halves.map((h, i) => ({ h, i }));
  if (newestFirst) list.reverse();
  let out = `<div class="row-end"><div class="seg seg-sm"><button class="${newestFirst ? '' : 'on'}" data-order="old">古い順</button><button class="${newestFirst ? 'on' : ''}" data-order="new">新しい順</button></div></div>`;
  for (const { h, i } of list) {
    const bat = h.half === 'top' ? g.away : h.half === 'bottom' ? g.home : null;
    const label = h.half === 'pre' ? h.label : `${h.inning}回${h.half === 'top' ? '表' : '裏'}`;
    const runs = h.atBats.filter((ab) => ab.scoring || ab.events.some((e) => e.scoring)).length;
    out += `<section class="inning">
      <h3 class="inn-h">${bat ? badge(bat, 'sm') : ''}<b>${esc(label)}</b>${bat ? `<span>${esc(bat.name)}の攻撃</span>` : ''}${runs ? `<em class="inn-runs">得点</em>` : ''}</h3>
      <div class="card list-card">`;
    if (h.events.length) out += h.events.map((e) => `<div class="li ev ${e.scoring ? 'scoring' : ''} ${e.change ? 'chg' : ''}">${esc(e.text)}</div>`).join('');
    const abs = h.atBats.map((ab, ai) => ({ ab, ai }));
    if (newestFirst) abs.reverse();
    for (const { ab, ai } of abs) {
      const key = `${i}-${ai}`;
      const open = ui.expanded.has(key);
      const res = ab.events.find((e) => e.result);
      const inProgress = !res && !ab.result && g.status === 'live' && ai === h.atBats.length - 1 && i === halves.length - 1;
      const lastEv = ab.events.length ? ab.events[ab.events.length - 1].text : '';
      const resText = res ? res.text : inProgress ? `打席中${lastEv ? ' — ' + lastEv : ''}` : lastEv;
      const others = ab.events.filter((e) => e !== res && (res || inProgress || e !== ab.events[ab.events.length - 1]));
      const scoring = ab.scoring || (res && res.scoring) || ab.events.some((e) => e.scoring);
      const canOpen = others.length || (ab.pitches && ab.pitches.length);
      out += `
        <div class="ab ${scoring ? 'scoring' : ''} ${inProgress ? 'now' : ''}">
          <div class="ab-h" ${canOpen ? `data-ab="${key}"` : ''}>
            <span class="ab-o">${ab.order || ''}</span>
            <div class="ab-main">
              <div class="ab-top"><b class="${g.league === 'MLB' && hasJa(ab.batter) ? 'jp' : ''}">${esc(ab.batter)}</b><small>${esc(ab.situation || '')}</small></div>
              ${resText ? `<div class="ab-res">${esc(resText)}${res && res.score ? `<span class="tl-score">${esc(res.score)}</span>` : ''}</div>` : ''}
            </div>
            ${canOpen ? `<span class="caret ${open ? 'open' : ''}">${icon('chevron', 18)}</span>` : ''}
          </div>
          ${open ? `<div class="ab-d">
            ${ab.pitches && ab.pitches.some((p) => p.px !== null && p.px !== undefined) ? `<div class="ab-zone">${zone(ab.pitches, 'sm')}</div>` : ''}
            <div class="ab-evs">
              ${others.map((e) => `<div class="ev ${e.change ? 'chg' : ''} ${e.scoring ? 'scoring' : ''}">${e.pitch ? `<span class="pn k-${e.kind || 'other'}">${e.pitch}</span>` : ''}<span>${esc(e.text)}</span></div>`).join('')}
              ${res && res.desc ? `<div class="desc">${esc(res.desc)}</div>` : ''}
              ${res && res.hit ? `<div class="desc">${esc(res.hit)}</div>` : ''}
            </div>
          </div>` : ''}
        </div>`;
    }
    out += '</div></section>';
  }
  return out;
}

// ---------- 成績 ----------
function boxTab(g, ui) {
  const kind = ui.boxTab === 'pit' ? 'pitching' : 'batting';
  const sides = ['away', 'home'].filter((s) => g.box && g.box[s] && g.box[s][kind] && g.box[s][kind].length);
  const side = ui.boxSide && sides.includes(ui.boxSide) ? ui.boxSide : sides[0];
  let out = `<div class="box-ctl">
    <div class="seg"><button class="${kind === 'batting' ? 'on' : ''}" data-boxtab="bat">打者成績</button><button class="${kind === 'pitching' ? 'on' : ''}" data-boxtab="pit">投手成績</button></div>
    ${sides.length ? `<div class="seg team-seg">${['away', 'home'].map((s) => `<button class="${s === side ? 'on' : ''}" data-boxside="${s}" ${sides.includes(s) ? '' : 'disabled'} style="--c:${esc(g[s].color)}">${badge(g[s], 'xs')}${esc(g[s].name)}</button>`).join('')}</div>` : ''}
  </div>`;
  if (!side) return out + `<div class="card center-card"><p>成績はまだありません</p></div>`;
  for (const tb of g.box[side][kind]) {
    if (tb.headers.some((h) => /^\d{1,2}回?$/.test(h))) out += `<p class="hint scroll-hint">横にスクロールすると各打席の結果が見られます ${icon('next', 13)}</p>`;
    out += statTable(tb, g.league, kind);
  }
  return out;
}

const HIT_RE = /^.?(安|二|三|本|2|3)$/;

function statTable(tb, league, kind) {
  const ni = Math.max(0, tb.headers.findIndex((h) => /選手|名前|打者|投手/.test(h)));
  const posI = kind === 'batting' && ni > 0 ? ni - 1 : -1;
  const innCol = (h) => /^\d{1,2}回?$/.test(h);
  return `<div class="card tcard"><div class="tscroll"><table class="stat">
    <thead><tr>${tb.headers.map((h, i) => `<th class="${i === ni ? 'nm' : ''} ${i === posI ? 'pos' : ''} ${innCol(h) ? 'inn' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${tb.rows.map((r) => {
      const total = r.some((c) => /^(合計|計|チーム計)$/.test(c));
      const sub = posI >= 0 && r[posI] && !/^\(/.test(r[posI]);
      return `<tr class="${total ? 'total' : ''} ${sub ? 'sub' : ''}">${r.map((c, i) => {
        const cls = [];
        if (i === ni) cls.push('nm');
        if (i === posI) cls.push('pos');
        if (i === ni && league === 'MLB' && hasJa(c)) cls.push('jp');
        if (innCol(tb.headers[i] || '')) { cls.push('inn'); if (HIT_RE.test(c)) cls.push(/本$/.test(c) ? 'hr' : 'hit'); }
        if (i === 0 && kind === 'pitching' && /^(勝|敗|S|H)$/.test(c)) cls.push('dec', 'dec-' + ({ 勝: 'w', 敗: 'l', S: 's', H: 's' }[c]));
        return `<td class="${cls.join(' ')}">${esc(c)}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
}
