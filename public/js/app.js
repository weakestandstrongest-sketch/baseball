// 野球速報 — 自分専用の広告なし速報アプリ (PWA)
import { $app, icon } from './util.js';
import { state, stopTimer } from './state.js';
import { gamesView } from './games.js';
import { gameView } from './game.js';
import { calendarView } from './calendar.js';
import { standingsView } from './standings.js';
import { settingsView } from './settings.js';
import { statsView, statsListView } from './stats.js';

const TABS = [
  ['games', '#/', '試合', 'ball'],
  ['calendar', '#/calendar', 'カレンダー', 'calendar'],
  ['standings', '#/standings', '順位', 'trophy'],
  ['stats', '#/stats', '成績', 'chart'],
  ['settings', '#/settings', '設定', 'gear'],
];

const tabbar = document.getElementById('tabbar');
tabbar.innerHTML = TABS.map(([k, href, label, ic]) => `<a href="${href}" data-nav="${k}">${icon(ic, 25)}<span>${label}</span></a>`).join('');

let lastPath = null;
const pathOf = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];

function route() {
  stopTimer();
  // 同じ画面のまま日付や絞り込みだけ変わったときは、画面全体を出し直すアニメーションをしない（がくっと動かないように）
  const samePage = pathOf() === lastPath;
  lastPath = pathOf();
  if (state.view && state.view.cleanup) state.view.cleanup();
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = hash.split('?');
  const q = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const nav = parts[0] === 'game' ? null : parts[0] || 'games';
  tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  document.body.classList.toggle('in-game', parts[0] === 'game');
  if (!samePage) {
    $app.classList.remove('enter');
    void $app.offsetWidth; // アニメーションを毎回やり直す
    $app.classList.add('enter');
  }
  if (parts[0] === 'game') return gameView(parts[1], decodeURIComponent(parts[2] || ''), parts[3] || 'top');
  if (parts[0] === 'calendar') return calendarView(q);
  if (parts[0] === 'standings') return standingsView(q);
  if (parts[0] === 'stats') return parts[1] === 'list' ? statsListView(q) : statsView(q);
  if (parts[0] === 'settings') return settingsView();
  return gamesView(q);
}

window.addEventListener('hashchange', () => {
  if (pathOf() !== lastPath) window.scrollTo(0, 0);
  else {
    // 試合一覧で別の日を押したとき：日付の帯は上に貼りついたまま、一覧だけ先頭から見せる
    const head = document.querySelector('.lt');
    if (head && window.scrollY > head.offsetHeight) window.scrollTo(0, head.offsetHeight);
  }
  route();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.view && state.view.refresh) state.view.refresh();
});

route();
// ひび手帳の中で開かれたときは、開けたことを知らせる（ひび手帳はそれまで「開いています…」を出している）
if (window.parent !== window) { try { window.parent.postMessage({ type: 'baseball:ready' }, '*'); } catch (e) { /* 親がいない */ } }
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
